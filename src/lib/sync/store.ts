import type { ReviewEventDoc, WordDoc } from './doc';
import type { Stamp } from './stamp';

export interface StoredWord {
  readonly doc: WordDoc;
  /** The cloud's version this copy is built on; 0 when it has never been stored there. */
  readonly rev: number;
}

export type OutboxKey = `word:${string}` | `event:${string}`;

/** One atomic change, so data and its outbox entry can never be separated. */
export interface StoreCommit {
  readonly words?: readonly StoredWord[];
  readonly events?: readonly ReviewEventDoc[];
  readonly removeEvents?: readonly string[];
  readonly queue?: readonly (readonly [OutboxKey, Stamp])[];
  readonly unqueue?: readonly OutboxKey[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface SyncStore {
  allWords: () => Promise<readonly StoredWord[]>;
  getWord: (id: string) => Promise<StoredWord | null>;
  allEvents: () => Promise<readonly ReviewEventDoc[]>;
  getEvent: (id: string) => Promise<ReviewEventDoc | null>;
  outbox: () => Promise<ReadonlyMap<OutboxKey, Stamp>>;
  getMeta: <T>(key: string) => Promise<T | null>;
  commit: (change: StoreCommit) => Promise<void>;
  close: () => void;
}

/** One writer at a time, so sync and user writes cannot overwrite each other. */
export type WriteQueue = <T>(work: () => Promise<T>) => Promise<T>;

export function createWriteQueue(): WriteQueue {
  let last: Promise<unknown> = Promise.resolve();
  return (work) => {
    const run = last.then(work);
    last = run.catch(() => undefined);
    return run;
  };
}

export function createMemoryStore(): SyncStore {
  const words = new Map<string, StoredWord>();
  const events = new Map<string, ReviewEventDoc>();
  const queued = new Map<OutboxKey, Stamp>();
  const meta = new Map<string, unknown>();
  return {
    allWords: () => Promise.resolve([...words.values()]),
    getWord: (id) => Promise.resolve(words.get(id) ?? null),
    allEvents: () => Promise.resolve([...events.values()]),
    getEvent: (id) => Promise.resolve(events.get(id) ?? null),
    outbox: () => Promise.resolve(new Map(queued)),
    getMeta: <T>(key: string) =>
      Promise.resolve((meta.get(key) as T | undefined) ?? null),
    commit(change) {
      for (const word of change.words ?? []) words.set(word.doc.id, word);
      for (const event of change.events ?? []) events.set(event.id, event);
      for (const id of change.removeEvents ?? []) events.delete(id);
      for (const [key, stamp] of change.queue ?? []) queued.set(key, stamp);
      for (const key of change.unqueue ?? []) queued.delete(key);
      for (const [key, value] of Object.entries(change.meta ?? {})) {
        meta.set(key, value);
      }
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

const WORDS = 'words';
const EVENTS = 'events';
const OUTBOX = 'outbox';
const META = 'meta';

const asPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });

/** Each user has their own database, so accounts on one browser never mix. */
export async function openIndexedDbStore(userId: string): Promise<SyncStore> {
  const request = indexedDB.open(`couplet-${userId}`, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore(WORDS, { keyPath: 'doc.id' });
    db.createObjectStore(EVENTS, { keyPath: 'id' });
    db.createObjectStore(OUTBOX);
    db.createObjectStore(META);
  };
  const db = await asPromise(request);

  const read = <T>(
    name: string,
    get: (store: IDBObjectStore) => IDBRequest<T>,
  ) => asPromise(get(db.transaction(name).objectStore(name)));

  return {
    allWords: () =>
      read<StoredWord[]>(
        WORDS,
        (store) => store.getAll() as IDBRequest<StoredWord[]>,
      ),
    getWord: async (id) =>
      (await read<StoredWord | undefined>(
        WORDS,
        (store) => store.get(id) as IDBRequest<StoredWord | undefined>,
      )) ?? null,
    allEvents: () =>
      read<ReviewEventDoc[]>(
        EVENTS,
        (store) => store.getAll() as IDBRequest<ReviewEventDoc[]>,
      ),
    getEvent: async (id) =>
      (await read<ReviewEventDoc | undefined>(
        EVENTS,
        (store) => store.get(id) as IDBRequest<ReviewEventDoc | undefined>,
      )) ?? null,
    outbox: async () => {
      const transaction = db.transaction(OUTBOX);
      const store = transaction.objectStore(OUTBOX);
      const [keys, values] = await Promise.all([
        asPromise(store.getAllKeys()),
        asPromise(store.getAll() as IDBRequest<Stamp[]>),
      ]);
      return new Map(
        keys.map((key, at) => [key as OutboxKey, values[at] as Stamp]),
      );
    },
    getMeta: async <T>(key: string) =>
      (await read<T | undefined>(
        META,
        (store) => store.get(key) as IDBRequest<T | undefined>,
      )) ?? null,
    commit: (change) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [WORDS, EVENTS, OUTBOX, META],
          'readwrite',
        );
        transaction.oncomplete = () => {
          resolve();
        };
        const fail = () => {
          reject(transaction.error ?? new Error('IndexedDB write failed'));
        };
        transaction.onerror = fail;
        transaction.onabort = fail;
        const words = transaction.objectStore(WORDS);
        const events = transaction.objectStore(EVENTS);
        const outbox = transaction.objectStore(OUTBOX);
        const meta = transaction.objectStore(META);
        for (const word of change.words ?? []) words.put(word);
        for (const event of change.events ?? []) events.put(event);
        for (const id of change.removeEvents ?? []) events.delete(id);
        for (const [key, stamp] of change.queue ?? []) outbox.put(stamp, key);
        for (const key of change.unqueue ?? []) outbox.delete(key);
        for (const [key, value] of Object.entries(change.meta ?? {})) {
          meta.put(value, key);
        }
      }),
    close: () => {
      db.close();
    },
  };
}
