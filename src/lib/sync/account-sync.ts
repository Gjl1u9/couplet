import type { Vocabulary } from '../vocabulary/vocabulary';
import { createVocabulary } from '../vocabulary/vocabulary';
import { mergeDocs } from './doc';
import {
  createSyncEngine,
  type SyncEngine,
  type SyncRemote,
  type SyncState,
} from './engine';
import { parseLegacy } from './legacy';
import { createStampClock, type Stamp } from './stamp';
import {
  createWriteQueue,
  type OutboxKey,
  type SyncStore,
  type WriteQueue,
} from './store';

export type ReadyResult = 'ready' | 'failed' | 'signed-out';

export interface SyncStatus {
  readonly state: SyncState | 'signed-out';
  /** Why the last cycle failed, in the words of whatever failed. */
  readonly lastError?: string | null;
  /** Changes not yet in the cloud. */
  readonly pending: number;
  readonly lastSyncAt: number | null;
}

export interface LegacySource {
  read: () => Promise<{ words: unknown; log: unknown }>;
  remove: () => Promise<void>;
}

export interface AccountSyncOptions {
  readonly userId: () => Promise<string | null>;
  readonly openStore: (userId: string) => Promise<SyncStore>;
  readonly remote: SyncRemote;
  readonly deviceId: () => Promise<string>;
  readonly legacy: LegacySource;
  /** Local words changed, so screens and subtitle marks should refresh. */
  readonly notify: () => void;
  readonly onStatus: (status: SyncStatus) => void;
  readonly onError?: (error: unknown) => void;
  readonly newId?: () => string;
  readonly now?: () => number;
}

export interface AccountSync {
  readonly vocabulary: Vocabulary;
  /** Resolves when the screen may render, per "Signing in" in docs/SYNC.md. */
  ready: () => Promise<ReadyResult>;
  /** Syncs after a short wait, so a burst of writes shares one cycle. */
  schedule: () => void;
  /** Syncs now, if signed in. */
  syncNow: () => Promise<void>;
  /** After sign-in: opens the user's database and starts pulling. */
  signedIn: () => Promise<void>;
  /** Before sign-out: gives unsent changes a last chance. */
  signingOut: () => Promise<void>;
  /** After sign-out: closes the database and keeps it on the device. */
  signedOut: () => void;
}

interface Account {
  readonly userId: string;
  readonly store: SyncStore;
  readonly queue: WriteQueue;
  readonly vocabulary: Vocabulary;
  readonly engine: SyncEngine;
}

const WRITE_DELAY_MS = 2000;
const RETURNING_WAIT_MS = 3000;
const SIGN_OUT_WAIT_MS = 5000;
const BACKOFF_MS = [30_000, 120_000, 600_000];

const within = <T>(work: Promise<T>, ms: number, fallback: T) =>
  Promise.race([
    work,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        resolve(fallback);
      }, ms);
    }),
  ]);

/** Moves words from before sync into the first account signed in here. */
async function claimLegacy(
  store: SyncStore,
  queue: WriteQueue,
  legacy: LegacySource,
  stamp: () => Stamp,
) {
  const { words, log } = await legacy.read();
  if (words === undefined && log === undefined) return;
  const { docs, events } = parseLegacy(words, log);
  await queue(async () => {
    const stored = await Promise.all(
      docs.map(async (doc) => {
        const local = await store.getWord(doc.id);
        return {
          doc: mergeDocs(local?.doc ?? null, doc),
          rev: local?.rev ?? 0,
        };
      }),
    );
    await store.commit({
      words: stored,
      events,
      queue: [
        ...docs.map((doc): [OutboxKey, Stamp] => [`word:${doc.id}`, stamp()]),
        ...events.map((event): [OutboxKey, Stamp] => [
          `event:${event.id}`,
          stamp(),
        ]),
      ],
    });
  });
  await legacy.remove();
}

/** Connects the signed-in account to its local database and the sync engine. */
export function createAccountSync(options: AccountSyncOptions): AccountSync {
  let account: Account | null = null;
  let opening: Promise<Account> | null = null;
  let openingFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let lastStatus: SyncStatus = {
    state: 'signed-out',
    pending: 0,
    lastSyncAt: null,
  };

  const publish = (status: Partial<SyncStatus>) => {
    lastStatus = { ...lastStatus, ...status };
    options.onStatus(lastStatus);
  };

  const close = () => {
    clearTimeout(timer);
    account?.store.close();
    account = null;
  };

  const open = async (userId: string): Promise<Account> => {
    const store = await options.openStore(userId);
    const queue = createWriteQueue();
    const clock = createStampClock(await options.deviceId(), options.now);
    clock.observe(await store.getMeta<Stamp>('stamp'));
    // Old words stay where they are and move on the next try. Sync must not wait for them.
    await claimLegacy(store, queue, options.legacy, () => clock.next()).catch(
      (error: unknown) => {
        options.onError?.(error);
      },
    );
    const vocabulary = createVocabulary({
      store,
      queue,
      clock,
      ...(options.newId ? { newId: options.newId } : {}),
      onWrite: () => {
        options.notify();
        schedule();
      },
    });
    const engine = createSyncEngine({
      store,
      queue,
      clock,
      remote: options.remote,
      ...(options.now ? { now: options.now } : {}),
      onChange: options.notify,
      onError: (error) => {
        publish({ lastError: String(error) });
        options.onError?.(error);
      },
      onState: (state) => {
        publish(state === 'synced' ? { state, lastError: null } : { state });
      },
    });
    publish({ lastSyncAt: await store.getMeta<number>('lastSyncAt') });
    return { userId, store, queue, vocabulary, engine };
  };

  const active = async (): Promise<Account | null> => {
    const userId = await options.userId();
    if (account && account.userId !== userId) close();
    if (!userId) {
      if (lastStatus.state !== 'signed-out') publish({ state: 'signed-out' });
      return null;
    }
    if (account) return account;
    if (!opening || openingFor !== userId) {
      openingFor = userId;
      opening = open(userId).then(
        (opened) => {
          account = opened;
          opening = null;
          return opened;
        },
        (error: unknown) => {
          opening = null;
          throw error;
        },
      );
    }
    return opening;
  };

  const runCycle = async (current: Account) => {
    const result = await current.engine.cycle();
    publish({
      pending: result.pending,
      lastSyncAt: await current.store.getMeta<number>('lastSyncAt'),
    });
    if (result.state === 'offline') {
      const delay = BACKOFF_MS[failures];
      failures += 1;
      // Past the last step, the five-minute alarm takes over.
      if (delay !== undefined) later(delay);
    } else {
      failures = 0;
    }
    return result;
  };

  const syncNow = async () => {
    const current = await active();
    if (current) await runCycle(current);
  };

  const later = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void syncNow();
    }, delay);
  };

  const schedule = () => {
    failures = 0;
    later(WRITE_DELAY_MS);
  };

  /** Runs one vocabulary call, or answers as an empty list when signed out. */
  const withWords = async <T>(
    work: (vocabulary: Vocabulary) => Promise<T>,
    signedOut: T,
  ) => {
    const current = await active();
    return current ? work(current.vocabulary) : signedOut;
  };

  const vocabulary: Vocabulary = {
    list: () => withWords((words) => words.list(), []),
    reviewLog: () => withWords((words) => words.reviewLog(), []),
    has: (lemma, source) =>
      withWords((words) => words.has(lemma, source), false),
    save: async (input, now) => {
      const current = await active();
      if (!current) throw new Error('Not signed in');
      return current.vocabulary.save(input, now);
    },
    addEncounter: (input, now) =>
      withWords((words) => words.addEncounter(input, now), null),
    setTranslation: (wordId, encounterId, translation) =>
      withWords(
        (words) => words.setTranslation(wordId, encounterId, translation),
        undefined,
      ),
    grade: (wordId, encounterId, grade, now) =>
      withWords((words) => words.grade(wordId, encounterId, grade, now), null),
    retire: (wordId, now) =>
      withWords((words) => words.retire(wordId, now), null),
    restore: (wordId, now) =>
      withWords((words) => words.restore(wordId, now), null),
    revert: (word, removeEventAt, expectedStamp) =>
      withWords(
        (words) => words.revert(word, removeEventAt, expectedStamp),
        'changed',
      ),
    remove: (wordId) => withWords((words) => words.remove(wordId), undefined),
    removeByLemma: (lemma, source) =>
      withWords((words) => words.removeByLemma(lemma, source), undefined),
  };

  return {
    vocabulary,
    ready: async () => {
      const current = await active();
      if (!current) return 'signed-out';
      if (await current.engine.hasPulled()) {
        // A slow network must not lock anyone out of the words on this device.
        await within(
          runCycle(current).then(() => undefined),
          RETURNING_WAIT_MS,
          undefined,
        );
        return 'ready';
      }
      const result = await runCycle(current);
      if (await current.engine.hasPulled()) return 'ready';
      return result.state === 'update-needed' ? 'ready' : 'failed';
    },
    schedule,
    syncNow,
    signedIn: async () => {
      const current = await active();
      options.notify();
      if (current) void runCycle(current);
    },
    signingOut: async () => {
      if (account) {
        const current = account;
        await within(
          runCycle(current).then(() => undefined),
          SIGN_OUT_WAIT_MS,
          undefined,
        );
        publish({ pending: (await current.store.outbox()).size });
      }
    },
    signedOut: () => {
      close();
      publish({ state: 'signed-out' });
      options.notify();
    },
  };
}
