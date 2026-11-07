import { describe, expect, it, vi } from 'vitest';
import type { EncounterInput } from '../vocabulary/vocabulary';
import { createAccountSync, type AccountSyncOptions } from './account-sync';
import type { SyncRemote } from './engine';
import { createMemoryRemote } from './memory-remote';
import { createMemoryStore, type SyncStore } from './store';

const input = (lemma: string): EncounterInput => ({
  entry: {
    lemma,
    phonetic: null,
    senses: [{ meaning: 'm', example: 'e', translation: 't' }],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [{ original: 'line', startMs: 0 }],
  currentCue: 0,
  form: lemma,
  formOffset: 0,
  origin: null,
});

function setup(overrides: Partial<AccountSyncOptions> = {}) {
  const stores = new Map<string, SyncStore>();
  let user: string | null = 'alice';
  const memory = createMemoryRemote();
  const legacy = {
    read: vi.fn<() => Promise<{ words: unknown; log: unknown }>>(() =>
      Promise.resolve({ words: undefined, log: undefined }),
    ),
    remove: vi.fn(() => Promise.resolve()),
  };
  const notify = vi.fn();
  const onStatus = vi.fn();
  const sync = createAccountSync({
    userId: () => Promise.resolve(user),
    openStore: (id) => {
      const store = stores.get(id) ?? createMemoryStore();
      stores.set(id, store);
      return Promise.resolve(store);
    },
    remote: memory.remote,
    deviceId: () => Promise.resolve('device'),
    legacy,
    notify,
    onStatus,
    ...overrides,
  });
  return {
    sync,
    memory,
    legacy,
    notify,
    onStatus,
    stores,
    setUser: (next: string | null) => {
      user = next;
    },
  };
}

describe('createAccountSync', () => {
  it('answers as empty while signed out, and refuses to save', async () => {
    const { sync, setUser } = setup();
    setUser(null);
    await expect(sync.vocabulary.list()).resolves.toEqual([]);
    await expect(sync.vocabulary.reviewLog()).resolves.toEqual([]);
    await expect(sync.vocabulary.has('bank', 'en')).resolves.toBe(false);
    await expect(sync.vocabulary.save(input('bank'), 1)).rejects.toThrow(
      'Not signed in',
    );
    await expect(sync.ready()).resolves.toBe('signed-out');
  });

  it('keeps each account apart', async () => {
    const { sync, setUser } = setup();
    await sync.vocabulary.save(input('bank'), 1);
    setUser('bob');
    await expect(sync.vocabulary.list()).resolves.toEqual([]);
    setUser('alice');
    await expect(sync.vocabulary.list()).resolves.toHaveLength(1);
  });

  it('waits for the first pull, and says when it failed', async () => {
    const memory = createMemoryRemote();
    const failing: SyncRemote = {
      ...memory.remote,
      now: () => Promise.reject(new Error('Offline')),
    };
    const { sync } = setup({ remote: failing });
    await expect(sync.ready()).resolves.toBe('failed');
  });

  it('is ready once the first pull has finished', async () => {
    const { sync } = setup();
    await expect(sync.ready()).resolves.toBe('ready');
  });

  it('does not make a returning user wait for a slow network', async () => {
    vi.useFakeTimers();
    try {
      const memory = createMemoryRemote();
      let slow = false;
      const remote: SyncRemote = {
        ...memory.remote,
        now: () => (slow ? new Promise(() => undefined) : memory.remote.now()),
      };
      const { sync } = setup({ remote });
      await sync.ready();
      slow = true;
      let done = false;
      const ready = sync.ready().then((result) => {
        done = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(2900);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await expect(ready).resolves.toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves words from before sync into the first account, once', async () => {
    const words = [
      {
        lemma: 'bank',
        phonetic: null,
        senses: [{ meaning: 'm', example: 'e', translation: 't' }],
        source: 'en',
        target: 'zh-TW',
        sentence: 'old',
        savedAt: 9,
      },
    ];
    const { sync, legacy, memory } = setup();
    legacy.read.mockResolvedValueOnce({ words, log: [] });
    await expect(sync.vocabulary.list()).resolves.toHaveLength(1);
    expect(legacy.remove).toHaveBeenCalledOnce();
    await sync.syncNow();
    expect(memory.words.has('en:bank')).toBe(true);
  });

  it('keeps legacy words if moving them fails, and syncs anyway', async () => {
    const words = [
      {
        lemma: 'bank',
        phonetic: null,
        senses: [{ meaning: 'm', example: 'e', translation: 't' }],
        source: 'en',
        target: 'zh-TW',
        sentence: 'old',
        savedAt: 9,
      },
    ];
    const onError = vi.fn();
    const { sync, legacy } = setup({ onError });
    legacy.read.mockResolvedValue({ words, log: [] });
    legacy.remove.mockRejectedValueOnce(new Error('Full'));
    await expect(sync.vocabulary.list()).resolves.toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(legacy.remove).toHaveBeenCalledOnce();
  });

  it('syncs shortly after a write, in one cycle for a burst', async () => {
    vi.useFakeTimers();
    try {
      const { sync, memory, notify } = setup();
      const now = vi.spyOn(memory.remote, 'now');
      await sync.vocabulary.save(input('bank'), 1);
      await sync.vocabulary.save(input('send'), 2);
      expect(notify).toHaveBeenCalled();
      expect(now).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2100);
      expect(now).toHaveBeenCalledTimes(1);
      expect(memory.words.size).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports unsent changes on sign-out, and sends them on return', async () => {
    const memory = createMemoryRemote();
    let online = false;
    const remote: SyncRemote = {
      ...memory.remote,
      now: () =>
        online ? memory.remote.now() : Promise.reject(new Error('Offline')),
    };
    const { sync, onStatus, setUser } = setup({ remote });
    await sync.vocabulary.save(input('bank'), 1);
    await sync.signingOut();
    setUser(null);
    sync.signedOut();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'signed-out', pending: 1 }),
    );
    online = true;
    setUser('alice');
    await sync.signedIn();
    await vi.waitFor(() => {
      expect(memory.words.has('en:bank')).toBe(true);
    });
  });

  it('publishes why a cycle failed, and clears it after', async () => {
    const memory = createMemoryRemote();
    let online = false;
    const remote: SyncRemote = {
      ...memory.remote,
      now: () =>
        online ? memory.remote.now() : Promise.reject(new Error('Nope')),
    };
    const { sync, onStatus } = setup({ remote });
    await sync.syncNow();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'offline', lastError: 'Error: Nope' }),
    );
    online = true;
    await sync.syncNow();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'synced', lastError: null }),
    );
  });

  it('publishes each state', async () => {
    const { sync, onStatus } = setup();
    await sync.syncNow();
    const states = onStatus.mock.calls.map(
      ([status]) => (status as { state: string }).state,
    );
    expect(states).toEqual(expect.arrayContaining(['syncing', 'synced']));
  });
});
