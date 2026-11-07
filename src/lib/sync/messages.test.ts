import { describe, expect, it, vi } from 'vitest';
import {
  answerSyncMessage,
  createSyncClient,
  isSyncMessage,
  type SyncMessage,
} from './messages';

function connect(ready = vi.fn(() => Promise.resolve('ready' as const))) {
  const syncNow = vi.fn(() => Promise.resolve());
  const client = createSyncClient(
    (message: SyncMessage) =>
      new Promise((resolve) => {
        answerSyncMessage(message, { ready, syncNow }, resolve);
      }),
  );
  return { client, syncNow };
}

describe('sync messages', () => {
  it('recognizes its own messages', () => {
    expect(isSyncMessage({ type: 'sync', command: 'ready' })).toBe(true);
    expect(isSyncMessage({ type: 'auth' })).toBe(false);
    expect(isSyncMessage(null)).toBe(false);
  });

  it('carries each command', async () => {
    const { client, syncNow } = connect();
    await expect(client.ready()).resolves.toBe('ready');
    await client.syncNow();
    expect(syncNow).toHaveBeenCalledOnce();
  });

  it('explains an unanswered message', async () => {
    const client = createSyncClient(() => Promise.resolve(undefined));
    await expect(client.ready()).rejects.toThrow('did not answer');
  });

  it('turns a failure into a rejection', async () => {
    const { client } = connect(vi.fn(() => Promise.reject(new Error('Nope'))));
    await expect(client.ready()).rejects.toThrow('Nope');
  });
});
