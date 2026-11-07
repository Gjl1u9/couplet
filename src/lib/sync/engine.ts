import {
  canonical,
  coveredByDeletion,
  DOC_SCHEMA,
  mergeDocs,
  mergeEvents,
  parseDoc,
  parseEvent,
  type ReviewEventDoc,
  type WordDoc,
} from './doc';
import type { StampClock } from './stamp';
import type { OutboxKey, SyncStore, WriteQueue } from './store';

export interface RemoteWord {
  readonly word_id: string;
  readonly doc: unknown;
  readonly rev: number;
  readonly server_updated_at: string;
}

export interface RemoteEvent {
  readonly id: string;
  readonly doc: unknown;
  readonly undone: boolean;
  readonly server_updated_at: string;
}

export type PushWordResult =
  | {
      readonly word_id: string;
      readonly status: 'stored';
      readonly rev: number;
    }
  | {
      readonly word_id: string;
      readonly status: 'conflict';
      readonly rev: number;
      readonly doc: unknown;
    }
  | { readonly word_id: string; readonly status: 'rejected' };

export interface PushWordItem {
  readonly word_id: string;
  readonly doc: WordDoc;
  readonly base_rev: number;
}

export interface PushEventItem {
  readonly id: string;
  readonly word_id: string;
  readonly word_birth: string;
  readonly doc: ReviewEventDoc;
  readonly undone: boolean;
}

/** The cloud. All of it is scoped to the signed-in user by Row Level Security. */
export interface SyncRemote {
  now: () => Promise<number>;
  pullWords: (
    since: string | null,
    limit: number,
  ) => Promise<readonly RemoteWord[]>;
  pullEvents: (
    since: string | null,
    limit: number,
  ) => Promise<readonly RemoteEvent[]>;
  pushWords: (
    items: readonly PushWordItem[],
  ) => Promise<readonly PushWordResult[]>;
  /** Resolves with the IDs the server refused. */
  pushEvents: (items: readonly PushEventItem[]) => Promise<readonly string[]>;
}

export type SyncState =
  'syncing' | 'synced' | 'offline' | 'partial' | 'update-needed';

export interface SyncResult {
  readonly state: Exclude<SyncState, 'syncing'>;
  readonly pending: number;
}

export interface SyncEngineOptions {
  readonly store: SyncStore;
  readonly queue: WriteQueue;
  readonly clock: StampClock;
  readonly remote: SyncRemote;
  readonly now?: () => number;
  readonly pageSize?: number;
  /** Local data changed because of the cloud, so screens should refresh. */
  readonly onChange?: () => void;
  readonly onState?: (state: SyncState) => void;
  readonly onError?: (error: unknown) => void;
}

export interface SyncEngine {
  /** Runs one cycle. A call during a cycle runs one more after it. */
  cycle: () => Promise<SyncResult>;
  /** Whether a full pull has ever finished for this user on this device. */
  hasPulled: () => Promise<boolean>;
}

const OVERLAP_MS = 5 * 60 * 1000;
const PUSH_WORD_BATCH = 100;
const PUSH_EVENT_BATCH = 500;
const CONFLICT_ROUNDS = 5;

class UpdateNeeded extends Error {}

const wordKey = (id: string): OutboxKey => `word:${id}`;
const eventKey = (id: string): OutboxKey => `event:${id}`;

const overlapped = (cursor: string | null) =>
  cursor === null
    ? null
    : new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { store, queue, clock, remote } = options;
  const pageSize = options.pageSize ?? 500;
  const deviceNow = options.now ?? Date.now;

  const observeDoc = (doc: WordDoc) => {
    clock.observe(doc.deleted);
    for (const life of Object.values(doc.lives)) {
      clock.observe(life.birth);
      clock.observe(life.entry.stamp);
      clock.observe(life.review.stamp);
    }
  };

  /** Merges one cloud copy, returning what the local database must store. */
  const applyWords = (
    rows: readonly { doc: WordDoc; rev: number }[],
  ): Promise<boolean> =>
    queue(async () => {
      let changed = false;
      const events = await store.allEvents();
      for (const row of rows) {
        observeDoc(row.doc);
        const local = await store.getWord(row.doc.id);
        const merged = mergeDocs(local?.doc ?? null, row.doc);
        const differsFromCloud = canonical(merged) !== canonical(row.doc);
        if (!local || canonical(local.doc) !== canonical(merged))
          changed = true;
        const covered = events.filter(
          (event) =>
            event.wordId === merged.id && coveredByDeletion(event, merged),
        );
        await store.commit({
          words: [{ doc: merged, rev: row.rev }],
          removeEvents: covered.map((event) => event.id),
          unqueue: [
            ...covered.map((event) => eventKey(event.id)),
            ...(differsFromCloud ? [] : [wordKey(merged.id)]),
          ],
          queue: differsFromCloud ? [[wordKey(merged.id), clock.next()]] : [],
          meta: { stamp: clock.latest() },
        });
      }
      return changed;
    });

  const pullWords = async () => {
    let cursor = await store.getMeta<string>('wordsCursor');
    let since = overlapped(cursor);
    let limit = pageSize;
    let changed = false;
    for (;;) {
      const rows = await remote.pullWords(since, limit);
      const docs: { doc: WordDoc; rev: number }[] = [];
      for (const row of rows) {
        const schema = (row.doc as { schema?: unknown } | null)?.schema;
        if (typeof schema === 'number' && schema > DOC_SCHEMA) {
          throw new UpdateNeeded();
        }
        const doc = parseDoc(row.doc);
        if (doc) docs.push({ doc, rev: row.rev });
      }
      if (await applyWords(docs)) changed = true;
      const last = rows.at(-1)?.server_updated_at ?? null;
      if (last !== null) cursor = last;
      if (rows.length < limit) break;
      // A full page of one timestamp would repeat forever, so widen the page instead.
      if (last === since) limit *= 2;
      since = last;
    }
    // Saved last: a crash repeats the pull, which changes nothing.
    await store.commit({ meta: { wordsCursor: cursor } });
    return changed;
  };

  const pullEvents = async () => {
    let cursor = await store.getMeta<string>('eventsCursor');
    let since = overlapped(cursor);
    let limit = pageSize;
    let changed = false;
    for (;;) {
      const rows = await remote.pullEvents(since, limit);
      const pageChanged = await queue(async () => {
        let any = false;
        for (const row of rows) {
          const parsed = parseEvent(row.doc);
          if (!parsed) continue;
          const incoming = { ...parsed, undone: row.undone };
          const word = await store.getWord(incoming.wordId);
          if (coveredByDeletion(incoming, word?.doc)) {
            await store.commit({
              removeEvents: [incoming.id],
              unqueue: [eventKey(incoming.id)],
            });
            continue;
          }
          const local = await store.getEvent(incoming.id);
          const merged = mergeEvents(local, incoming);
          if (!local || local.undone !== merged.undone) any = true;
          const differs = merged.undone !== incoming.undone;
          await store.commit({
            events: [merged],
            queue: differs ? [[eventKey(merged.id), clock.next()]] : [],
            unqueue: differs ? [] : [eventKey(merged.id)],
          });
        }
        return any;
      });
      if (pageChanged) changed = true;
      const last = rows.at(-1)?.server_updated_at ?? null;
      if (last !== null) cursor = last;
      if (rows.length < limit) break;
      if (last === since) limit *= 2;
      since = last;
    }
    await store.commit({ meta: { eventsCursor: cursor } });
    return changed;
  };

  /** Sends what is queued. Returns whether every queued word was accepted. */
  const pushWords = async (): Promise<boolean> => {
    const rejected = new Set<string>();
    for (let round = 0; round < CONFLICT_ROUNDS; round += 1) {
      const outbox = [...(await store.outbox())].filter(
        ([key]) =>
          key.startsWith('word:') && !rejected.has(key.slice('word:'.length)),
      );
      if (outbox.length === 0) return rejected.size === 0;
      for (let at = 0; at < outbox.length; at += PUSH_WORD_BATCH) {
        const batch = outbox.slice(at, at + PUSH_WORD_BATCH);
        const items: PushWordItem[] = [];
        const versions = new Map<string, string>();
        for (const [key, version] of batch) {
          const id = key.slice('word:'.length);
          const stored = await store.getWord(id);
          if (!stored) continue;
          items.push({ word_id: id, doc: stored.doc, base_rev: stored.rev });
          versions.set(id, version);
        }
        if (items.length === 0) continue;
        const results = await remote.pushWords(items);
        await queue(async () => {
          for (const result of results) {
            const id = result.word_id;
            if (result.status === 'rejected') {
              rejected.add(id);
              continue;
            }
            const local = await store.getWord(id);
            if (!local) continue;
            if (result.status === 'stored') {
              // A write that arrived during the push keeps its newer outbox entry.
              const current = (await store.outbox()).get(wordKey(id));
              await store.commit({
                words: [{ doc: local.doc, rev: result.rev }],
                unqueue: current === versions.get(id) ? [wordKey(id)] : [],
              });
              continue;
            }
            const doc = parseDoc(result.doc);
            if (!doc) {
              await store.commit({
                words: [{ doc: local.doc, rev: result.rev }],
              });
              continue;
            }
            observeDoc(doc);
            const merged = mergeDocs(local.doc, doc);
            await store.commit({
              words: [{ doc: merged, rev: result.rev }],
              queue: [[wordKey(id), clock.next()]],
              meta: { stamp: clock.latest() },
            });
          }
        });
      }
    }
    return rejected.size === 0;
  };

  const pushEvents = async (): Promise<boolean> => {
    const outbox = [...(await store.outbox())].filter(([key]) =>
      key.startsWith('event:'),
    );
    let accepted = true;
    for (let at = 0; at < outbox.length; at += PUSH_EVENT_BATCH) {
      const batch = outbox.slice(at, at + PUSH_EVENT_BATCH);
      const items: PushEventItem[] = [];
      const versions = new Map<string, string>();
      const gone: OutboxKey[] = [];
      for (const [key, version] of batch) {
        const id = key.slice('event:'.length);
        const event = await store.getEvent(id);
        if (!event) {
          gone.push(key);
          continue;
        }
        items.push({
          id,
          word_id: event.wordId,
          word_birth: event.wordBirth,
          doc: event,
          undone: event.undone,
        });
        versions.set(id, version);
      }
      if (gone.length > 0) await store.commit({ unqueue: gone });
      if (items.length === 0) continue;
      const refused = new Set(await remote.pushEvents(items));
      if (refused.size > 0) accepted = false;
      await queue(async () => {
        const current = await store.outbox();
        await store.commit({
          unqueue: items
            .filter(
              (item) =>
                !refused.has(item.id) &&
                current.get(eventKey(item.id)) === versions.get(item.id),
            )
            .map((item) => eventKey(item.id)),
        });
      });
    }
    return accepted;
  };

  const run = async (): Promise<SyncResult> => {
    options.onState?.('syncing');
    let state: SyncResult['state'];
    try {
      clock.setOffset((await remote.now()) - deviceNow());
      const words = await pullWords();
      const events = await pullEvents();
      await store.commit({ meta: { pulled: true } });
      if (words || events) options.onChange?.();
      const wordsOk = await pushWords();
      const eventsOk = await pushEvents();
      await store.commit({ meta: { lastSyncAt: deviceNow() } });
      state = wordsOk && eventsOk ? 'synced' : 'partial';
    } catch (error) {
      state = error instanceof UpdateNeeded ? 'update-needed' : 'offline';
      options.onError?.(error);
    }
    options.onState?.(state);
    return { state, pending: (await store.outbox()).size };
  };

  let running: Promise<SyncResult> | null = null;
  let again = false;
  const cycle = (): Promise<SyncResult> => {
    if (running) {
      again = true;
      return running;
    }
    const current = run().then(async (result) => {
      running = null;
      if (!again) return result;
      again = false;
      return cycle();
    });
    running = current;
    return current;
  };

  return {
    cycle,
    hasPulled: async () => (await store.getMeta<boolean>('pulled')) === true,
  };
}
