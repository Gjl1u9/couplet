import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { ReviewEventDoc, WordDoc } from './doc';
import {
  createMemoryStore,
  createWriteQueue,
  openIndexedDbStore,
  type SyncStore,
} from './store';

const doc = (id: string): WordDoc => ({
  schema: 3,
  id,
  deleted: null,
  lives: {},
});
const event = (id: string) =>
  ({
    id,
    wordId: 'en:bank',
    wordBirth: 'b',
    at: 1,
    grade: 'good',
  }) as ReviewEventDoc;

let users = 0;
describe.each<[string, () => Promise<SyncStore>]>([
  ['memory', () => Promise.resolve(createMemoryStore())],
  [
    'IndexedDB',
    () => {
      users += 1;
      return openIndexedDbStore(`user-${String(users)}`);
    },
  ],
])('%s store', (_name, open) => {
  it('commits words, events, the outbox, and meta together', async () => {
    const store = await open();
    await store.commit({
      words: [{ doc: doc('en:bank'), rev: 2 }],
      events: [event('e1')],
      queue: [
        ['word:en:bank', 's1'],
        ['event:e1', 's2'],
      ],
      meta: { cursor: 'c' },
    });
    await expect(store.getWord('en:bank')).resolves.toMatchObject({ rev: 2 });
    await expect(store.getWord('en:none')).resolves.toBeNull();
    await expect(store.allWords()).resolves.toHaveLength(1);
    await expect(store.getEvent('e1')).resolves.toMatchObject({ id: 'e1' });
    await expect(store.allEvents()).resolves.toHaveLength(1);
    await expect(store.getMeta('cursor')).resolves.toBe('c');
    await expect(store.getMeta('none')).resolves.toBeNull();
    expect([...(await store.outbox())]).toEqual(
      expect.arrayContaining([
        ['word:en:bank', 's1'],
        ['event:e1', 's2'],
      ]),
    );
    store.close();
  });

  it('removes events and outbox entries', async () => {
    const store = await open();
    await store.commit({ events: [event('e1')], queue: [['event:e1', 's']] });
    await store.commit({ removeEvents: ['e1'], unqueue: ['event:e1'] });
    await expect(store.allEvents()).resolves.toEqual([]);
    expect((await store.outbox()).size).toBe(0);
    store.close();
  });
});

describe('openIndexedDbStore', () => {
  it('keeps each user apart', async () => {
    const a = await openIndexedDbStore('alice');
    const b = await openIndexedDbStore('bob');
    await a.commit({ words: [{ doc: doc('en:bank'), rev: 0 }] });
    await expect(b.allWords()).resolves.toEqual([]);
    a.close();
    b.close();
  });

  it('keeps data after closing', async () => {
    const first = await openIndexedDbStore('carol');
    await first.commit({ words: [{ doc: doc('en:bank'), rev: 1 }] });
    first.close();
    const second = await openIndexedDbStore('carol');
    await expect(second.allWords()).resolves.toHaveLength(1);
    second.close();
  });
});

describe('createWriteQueue', () => {
  it('runs in order and survives a failure', async () => {
    const queue = createWriteQueue();
    const seen: number[] = [];
    const first = queue(async () => {
      await Promise.resolve();
      seen.push(1);
    });
    const failed = queue(() => Promise.reject(new Error('Nope')));
    const third = queue(() => {
      seen.push(3);
      return Promise.resolve();
    });
    await first;
    await expect(failed).rejects.toThrow('Nope');
    await third;
    expect(seen).toEqual([1, 3]);
  });
});
