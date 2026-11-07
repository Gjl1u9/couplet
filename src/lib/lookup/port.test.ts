import { describe, expect, it, vi } from 'vitest';
import type { PortLike } from '../translation/port';
import { createCachedLookup, createPortLookup, servePortLookup } from './port';
import type { LookupService, WordEntry } from './types';

const LANGUAGES = { source: 'en', target: 'zh-TW' };
const ENTRY: WordEntry = {
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [{ meaning: '河岸', example: 'A bank.', translation: '一處河岸。' }],
};
const signal = new AbortController().signal;

/** Two connected ends, like a real runtime port. */
function portPair(): [PortLike, PortLike] {
  const make = () => ({
    messages: [] as ((message: unknown) => void)[],
    disconnects: [] as (() => void)[],
  });
  const a = make();
  const b = make();
  const end = (
    self: ReturnType<typeof make>,
    other: ReturnType<typeof make>,
  ) => ({
    postMessage: (message: unknown) => {
      for (const listener of other.messages) listener(message);
    },
    disconnect: () => {
      for (const listener of other.disconnects) listener();
    },
    onMessage: {
      addListener: (listener: (message: unknown) => void) => {
        self.messages.push(listener);
      },
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        self.disconnects.push(listener);
      },
    },
  });
  return [end(a, b), end(b, a)];
}

const connectTo = (service: LookupService) => () => {
  const [client, server] = portPair();
  servePortLookup(server, service);
  return client;
};

const stub = (lookUp: LookupService['lookUp']): LookupService => ({ lookUp });
const found = () => Promise.resolve(ENTRY);

describe('port lookup', () => {
  it('routes the request to the service', async () => {
    const lookUp = vi.fn(found);
    const lookup = createPortLookup(connectTo(stub(lookUp)));
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).resolves.toEqual(
      ENTRY,
    );
    expect(lookUp).toHaveBeenCalledWith(
      'bank',
      LANGUAGES,
      expect.any(AbortSignal),
    );
  });

  it('passes a null result through', async () => {
    const lookup = createPortLookup(
      connectTo(stub(() => Promise.resolve(null))),
    );
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).resolves.toBeNull();
  });

  it('rejects with the reason the service failed', async () => {
    const lookup = createPortLookup(
      connectTo(stub(() => Promise.reject(new Error('nope')))),
    );
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).rejects.toThrow(
      'nope',
    );
  });

  it('rejects a malformed entry', async () => {
    const [client, server] = portPair();
    server.onMessage.addListener(() => {
      server.postMessage({ ok: true, value: { lemma: 'bank' } });
    });
    await expect(
      createPortLookup(() => client).lookUp('bank', LANGUAGES, signal),
    ).rejects.toThrow('查字回應格式錯誤');
  });

  it('answers a malformed request with an error', () => {
    const [client, server] = portPair();
    servePortLookup(server, stub(found));
    const onMessage = vi.fn();
    client.onMessage.addListener(onMessage);
    client.postMessage({ languages: LANGUAGES });
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it('cancels the request on the other side when aborted', async () => {
    let serverSignal: AbortSignal | null = null;
    const lookup = createPortLookup(
      connectTo(
        stub((_word, _languages, aborted) => {
          serverSignal = aborted;
          return new Promise(() => undefined);
        }),
      ),
    );
    const controller = new AbortController();
    const result = lookup.lookUp('bank', LANGUAGES, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow();
    expect((serverSignal as AbortSignal | null)?.aborted).toBe(true);
  });
});

describe('createCachedLookup', () => {
  it('shares in-flight and finished requests for the same word', async () => {
    const lookUp = vi.fn(found);
    const lookup = createCachedLookup(stub(lookUp));
    await Promise.all([
      lookup.lookUp('bank', LANGUAGES, signal),
      lookup.lookUp('bank', LANGUAGES, signal),
    ]);
    await lookup.lookUp('bank', LANGUAGES, signal);
    expect(lookUp).toHaveBeenCalledTimes(1);
  });

  it('separates words and languages', async () => {
    const lookUp = vi.fn(found);
    const lookup = createCachedLookup(stub(lookUp));
    await lookup.lookUp('bank', LANGUAGES, signal);
    await lookup.lookUp('banks', LANGUAGES, signal);
    await lookup.lookUp('bank', { ...LANGUAGES, target: 'ja' }, signal);
    expect(lookUp).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures', async () => {
    const lookUp = vi
      .fn<LookupService['lookUp']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ENTRY);
    const lookup = createCachedLookup(stub(lookUp));
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).rejects.toThrow();
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).resolves.toEqual(
      ENTRY,
    );
  });

  it('evicts the least recently used entry', async () => {
    const lookUp = vi.fn(found);
    const lookup = createCachedLookup(stub(lookUp), 2);
    for (const word of ['a', 'b', 'a', 'c', 'a']) {
      await lookup.lookUp(word, LANGUAGES, signal);
    }
    expect(lookUp).toHaveBeenCalledTimes(3);
    await lookup.lookUp('b', LANGUAGES, signal);
    expect(lookUp).toHaveBeenCalledTimes(4);
  });

  it('keeps a request running after the panel moves on', async () => {
    const lookUp = vi.fn<LookupService['lookUp']>(found);
    const lookup = createCachedLookup(stub(lookUp));
    const controller = new AbortController();
    const result = lookup.lookUp('bank', LANGUAGES, controller.signal);
    controller.abort();
    await expect(result).resolves.toEqual(ENTRY);
    expect(lookUp.mock.calls[0]?.[2].aborted).toBe(false);
  });
});
