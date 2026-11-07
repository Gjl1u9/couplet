import { describe, expect, it, vi } from 'vitest';
import {
  createVocabulary,
  type EncounterInput,
} from '../vocabulary/vocabulary';
import { canonical, viewOf, type WordDoc } from './doc';
import { createSyncEngine, type SyncRemote } from './engine';
import { createMemoryRemote } from './memory-remote';
import { createStampClock } from './stamp';
import { createMemoryStore, createWriteQueue } from './store';

const input = (lemma: string, line = 'line'): EncounterInput => ({
  entry: {
    lemma,
    phonetic: null,
    senses: [{ meaning: 'm', example: 'e', translation: 't' }],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [{ original: line, startMs: 0 }],
  currentCue: 0,
  form: lemma,
  formOffset: 0,
  origin: null,
});

function device(remote: SyncRemote, name = 'A') {
  const store = createMemoryStore();
  const queue = createWriteQueue();
  const clock = createStampClock(name);
  const onChange = vi.fn();
  const engine = createSyncEngine({ store, queue, clock, remote, onChange });
  const vocabulary = createVocabulary({ store, queue, clock });
  return { store, clock, engine, vocabulary, onChange };
}

describe('createSyncEngine', () => {
  it('sends a saved word and its review, then has nothing left', async () => {
    const { remote, words, events } = createMemoryRemote();
    const a = device(remote);
    const { word, encounter } = await a.vocabulary.save(input('bank'), 1);
    await a.vocabulary.grade(word.id, encounter.id, 'good', 2);
    await expect(a.engine.cycle()).resolves.toEqual({
      state: 'synced',
      pending: 0,
    });
    expect(words.get('en:bank')?.rev).toBe(1);
    expect(events.size).toBe(1);
  });

  it('brings words to a new device, and tells screens', async () => {
    const { remote } = createMemoryRemote();
    const a = device(remote, 'A');
    const { word, encounter } = await a.vocabulary.save(input('bank'), 1);
    await a.vocabulary.grade(word.id, encounter.id, 'good', 2);
    await a.engine.cycle();
    const b = device(remote, 'B');
    await expect(b.engine.hasPulled()).resolves.toBe(false);
    await b.engine.cycle();
    await expect(b.engine.hasPulled()).resolves.toBe(true);
    await expect(b.vocabulary.list()).resolves.toHaveLength(1);
    await expect(b.vocabulary.reviewLog()).resolves.toHaveLength(1);
    expect(b.onChange).toHaveBeenCalled();
  });

  it('does not resend after jsonb reorders the keys', async () => {
    const { remote, words } = createMemoryRemote();
    const a = device(remote);
    await a.vocabulary.save(input('bank'), 1);
    await a.engine.cycle();
    const push = vi.spyOn(remote, 'pushWords');
    for (let round = 0; round < 3; round += 1) await a.engine.cycle();
    expect(push).not.toHaveBeenCalled();
    expect(words.get('en:bank')?.rev).toBe(1);
    expect((await a.store.outbox()).size).toBe(0);
  });

  it('keeps changes while offline, and sends them later', async () => {
    const { remote, words } = createMemoryRemote();
    const offline: SyncRemote = {
      ...remote,
      now: () => Promise.reject(new Error('Offline')),
    };
    const a = device(offline);
    await a.vocabulary.save(input('bank'), 1);
    await expect(a.engine.cycle()).resolves.toEqual({
      state: 'offline',
      pending: 1,
    });
    await expect(a.vocabulary.list()).resolves.toHaveLength(1);
    expect(words.size).toBe(0);
    const back = createSyncEngine({
      store: a.store,
      queue: createWriteQueue(),
      clock: a.clock,
      remote,
    });
    await expect(back.cycle()).resolves.toEqual({
      state: 'synced',
      pending: 0,
    });
    expect(words.size).toBe(1);
  });

  it('merges a conflict instead of overwriting either side', async () => {
    const { remote } = createMemoryRemote();
    const a = device(remote, 'A');
    const b = device(remote, 'B');
    await a.vocabulary.save(input('bank', 'one'), 1);
    await b.vocabulary.save(input('bank', 'two'), 2);
    await a.engine.cycle();
    await b.engine.cycle();
    await a.engine.cycle();
    const [word] = await a.vocabulary.list();
    expect(
      word?.encounters.map((item) => item.cues[0]?.original).sort(),
    ).toEqual(['one', 'two']);
    const [other] = await b.vocabulary.list();
    expect(canonical(other?.encounters)).toBe(canonical(word?.encounters));
  });

  it('leaves a write made during a push queued', async () => {
    const memory = createMemoryRemote();
    const hook: { during: (() => Promise<unknown>) | null } = { during: null };
    const remote: SyncRemote = {
      ...memory.remote,
      pushWords: async (items) => {
        const result = await memory.remote.pushWords(items);
        await hook.during?.();
        hook.during = null;
        return result;
      },
    };
    const a = device(remote);
    const { word } = await a.vocabulary.save(input('bank'), 1);
    hook.during = () => a.vocabulary.retire(word.id, 2);
    await a.engine.cycle();
    // The same cycle sends it, because the outbox entry outlived the first push.
    const stored = viewOf(memory.words.get('en:bank')?.doc as WordDoc);
    expect(stored?.review.retired).not.toBeNull();
    expect((await a.store.outbox()).size).toBe(0);
  });

  it('queues a merge whose result the cloud does not have yet', async () => {
    const { remote, words } = createMemoryRemote();
    const a = device(remote, 'A');
    await a.vocabulary.save(input('bank', 'one'), 1);
    await a.engine.cycle();
    const b = device(remote, 'B');
    await b.vocabulary.save(input('bank', 'two'), 2);
    // Nothing queued, as after a crash that lost the outbox entry.
    await b.store.commit({ unqueue: ['word:en:bank'] });
    await b.engine.cycle();
    const stored = viewOf(words.get('en:bank')?.doc as WordDoc);
    expect(stored?.encounters).toHaveLength(2);
  });

  it('stops without overwriting when the cloud is from a newer version', async () => {
    const { remote } = createMemoryRemote();
    const newer: SyncRemote = {
      ...remote,
      pullWords: () =>
        Promise.resolve([
          {
            word_id: 'en:bank',
            doc: { schema: 99, id: 'en:bank' },
            rev: 5,
            server_updated_at: new Date(0).toISOString(),
          },
        ]),
    };
    const push = vi.spyOn(remote, 'pushWords');
    const a = device(newer);
    await a.vocabulary.save(input('send'), 1);
    await expect(a.engine.cycle()).resolves.toMatchObject({
      state: 'update-needed',
    });
    expect(push).not.toHaveBeenCalled();
    await expect(a.store.getWord('en:bank')).resolves.toBeNull();
  });

  it('skips a rejected word and syncs the rest', async () => {
    const memory = createMemoryRemote();
    const remote: SyncRemote = {
      ...memory.remote,
      pushWords: async (items) => [
        ...(await memory.remote.pushWords(
          items.filter((item) => item.word_id !== 'en:big'),
        )),
        ...items
          .filter((item) => item.word_id === 'en:big')
          .map((item) => ({
            word_id: item.word_id,
            status: 'rejected' as const,
          })),
      ],
    };
    const a = device(remote);
    await a.vocabulary.save(input('big'), 1);
    await a.vocabulary.save(input('bank'), 2);
    await expect(a.engine.cycle()).resolves.toEqual({
      state: 'partial',
      pending: 1,
    });
    expect(memory.words.has('en:bank')).toBe(true);
  });

  it('ignores a malformed row', async () => {
    const { remote } = createMemoryRemote();
    const bad: SyncRemote = {
      ...remote,
      pullWords: () =>
        Promise.resolve([
          {
            word_id: 'en:bad',
            doc: { nope: true },
            rev: 1,
            server_updated_at: new Date(0).toISOString(),
          },
        ]),
    };
    const a = device(bad);
    await expect(a.engine.cycle()).resolves.toMatchObject({ state: 'synced' });
    await expect(a.vocabulary.list()).resolves.toEqual([]);
  });

  it('reads every page, and resumes from its cursor with an overlap', async () => {
    const { remote, words } = createMemoryRemote();
    const a = device(remote, 'A');
    for (const lemma of ['a', 'b', 'c', 'd', 'e']) {
      await a.vocabulary.save(input(lemma), 1);
    }
    await a.engine.cycle();
    expect(words.size).toBe(5);
    const store = createMemoryStore();
    const pull = vi.spyOn(remote, 'pullWords');
    const b = createSyncEngine({
      store,
      queue: createWriteQueue(),
      clock: createStampClock('B'),
      remote,
      pageSize: 2,
    });
    await b.cycle();
    await expect(store.allWords()).resolves.toHaveLength(5);
    expect(pull.mock.calls.length).toBeGreaterThan(2);
    pull.mockClear();
    await b.cycle();
    const since = pull.mock.calls[0]?.[0];
    const cursor = await store.getMeta<string>('wordsCursor');
    expect(
      new Date(cursor ?? 0).getTime() - new Date(since ?? 0).getTime(),
    ).toBe(5 * 60 * 1000);
  });

  it('runs one more cycle when asked during one', async () => {
    const { remote } = createMemoryRemote();
    const a = device(remote);
    const now = vi.spyOn(remote, 'now');
    const engineB = createSyncEngine({
      store: a.store,
      queue: createWriteQueue(),
      clock: a.clock,
      remote,
    });
    const first = engineB.cycle();
    const second = engineB.cycle();
    await Promise.all([first, second]);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it('corrects a wrong clock from the server', async () => {
    const { remote } = createMemoryRemote();
    const store = createMemoryStore();
    const clock = createStampClock('A', () => 5);
    const set = vi.spyOn(clock, 'setOffset');
    const engine = createSyncEngine({
      store,
      queue: createWriteQueue(),
      clock,
      remote: { ...remote, now: () => Promise.resolve(105) },
      now: () => 5,
    });
    await engine.cycle();
    expect(set).toHaveBeenCalledWith(100);
  });
});
