import { describe, expect, it, vi } from 'vitest';
import type { WordEntry } from '../../src/lib/lookup/types';
import { createRefusals, handleRequest, type HandlerDeps } from './handler';
import { consume, refund, type CounterStorage } from './quota';

const ENTRY: WordEntry = {
  lemma: 'bank',
  phonetic: null,
  senses: [{ meaning: 'm', example: 'e', translation: 't' }],
};
const INSTALL = '00000000-0000-4000-8000-000000000001';
const NOW = Date.UTC(2026, 10, 7, 12);

function memoryCounters(): CounterStorage & { map: Map<string, number> } {
  const map = new Map<string, number>();
  return {
    map,
    get: (key) => Promise.resolve(map.get(key)),
    put: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => Promise.resolve(map.delete(key)),
    list: () => Promise.resolve(new Map(map)),
  };
}

function setup(overrides: Partial<HandlerDeps['config']> = {}) {
  const subjects = new Map<
    string,
    CounterStorage & { map: Map<string, number> }
  >();
  const counters = (subject: string) => {
    const existing = subjects.get(subject);
    if (existing) return existing;
    const created = memoryCounters();
    subjects.set(subject, created);
    return created;
  };
  const lookUp = vi.fn(() => Promise.resolve<WordEntry | null>(ENTRY));
  const stored = new Map<string, WordEntry>();
  const explain = vi.fn(() => Promise.resolve('River sides.'));
  const explained = new Map<string, string>();
  const deps: HandlerDeps = {
    config: {
      abuseLimit: 2,
      globalLimit: 100,
      explainLimit: 2,
      ...overrides,
    },
    lookup: { lookUp },
    quota: {
      consume: (subject, day, limit) => consume(counters(subject), day, limit),
      refund: (subject, day) => refund(counters(subject), day),
      used: (subject, day) =>
        Promise.resolve(counters(subject).map.get(day) ?? 0),
    },
    cache: {
      get: (key) => Promise.resolve(stored.get(key)),
      put: (key, entry) => {
        stored.set(key, entry);
        return Promise.resolve();
      },
    },
    verifyUser: (token) => Promise.resolve(token === 'good' ? 'user-1' : null),
    hash: (text) => Promise.resolve(`hash-${text}`),
    explain,
    explanations: {
      get: (key) => Promise.resolve(explained.get(key)),
      put: (key, text) => {
        explained.set(key, text);
        return Promise.resolve();
      },
    },
    now: () => NOW,
    refusals: createRefusals(),
    defer: (work) => {
      void work;
    },
  };
  return { deps, lookUp, counters, stored, explain };
}

let words = 0;
const request = (
  options: {
    word?: string;
    token?: string;
    install?: string | null;
    ip?: string;
    body?: unknown;
    method?: string;
    origin?: string;
    path?: string;
  } = {},
) => {
  words += 1;
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.install !== null) {
    headers.set('x-install-id', options.install ?? INSTALL);
  }
  headers.set('cf-connecting-ip', options.ip ?? '1.2.3.4');
  if (options.origin) headers.set('origin', options.origin);
  const method = options.method ?? 'POST';
  return new Request(`https://api.test${options.path ?? '/v1/lookup'}`, {
    method,
    headers,
    ...(method === 'POST'
      ? {
          body: JSON.stringify(
            options.body ?? {
              word: options.word ?? `word${String(words)}`,
              source: 'en',
              target: 'zh-TW',
            },
          ),
        }
      : {}),
  });
};

describe('handleRequest', () => {
  it('looks up a word for an anonymous install', async () => {
    const { deps } = setup();
    const response = await handleRequest(request(), deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: ENTRY });
  });

  it('never asks for an account, but needs some identity', async () => {
    const { deps } = setup();
    const response = await handleRequest(request({ install: null }), deps);
    expect(response.status).toBe(400);
  });

  it('reads as busy at the abuse ceiling, so nobody is told to ration', async () => {
    const { deps, lookUp } = setup();
    await handleRequest(request(), deps);
    await handleRequest(request(), deps);
    const response = await handleRequest(request(), deps);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'service_busy',
      resetAt: '2026-11-08T00:00:00.000Z',
    });
    // The model started early for the refused one, and was stopped.
    expect(lookUp).toHaveBeenCalledTimes(3);
    const stopped = lookUp.mock.calls[2] as unknown as [
      string,
      unknown,
      AbortSignal,
    ];
    expect(stopped[2].aborted).toBe(true);
    // Once refused, the same source no longer reaches the model at all.
    await handleRequest(request(), deps);
    expect(lookUp).toHaveBeenCalledTimes(3);
  });

  it('says where the time went', async () => {
    const { deps, counters } = setup();
    const response = await handleRequest(request(), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get('server-timing')).toMatch(/quota;dur=/);
    expect(counters('global').map.get('2026-11-07')).toBe(1);
  });

  it('holds an account to the same ceiling', async () => {
    const { deps } = setup();
    await handleRequest(request({ token: 'good' }), deps);
    await handleRequest(request({ token: 'good' }), deps);
    const response = await handleRequest(request({ token: 'good' }), deps);
    expect(response.status).toBe(503);
  });

  it('treats a bad token as no account', async () => {
    const { deps, counters } = setup();
    const response = await handleRequest(request({ token: 'forged' }), deps);
    expect(response.status).toBe(200);
    expect(counters(`install:${INSTALL}`).map.size).toBe(1);
    expect(counters('user:user-1').map.size).toBe(0);
  });

  it('counts anonymous lookups by network too, so reinstalling does not help', async () => {
    const { deps, counters } = setup();
    const installs = ['a', 'b', 'c'].map((n) => `${INSTALL.slice(0, -1)}${n}`);
    await handleRequest(request({ install: installs[0] as string }), deps);
    await handleRequest(request({ install: installs[1] as string }), deps);
    const third = await handleRequest(
      request({ install: installs[2] as string }),
      deps,
    );
    expect(third.status).toBe(503);
    // The refused install keeps its allowance.
    expect(
      counters(`install:${installs[2] as string}`).map.get('2026-11-07'),
    ).toBe(0);
  });

  it('does not count accounts by network, which people may share', async () => {
    const { deps, counters } = setup();
    await handleRequest(request({ token: 'good' }), deps);
    expect(counters('ip:hash-1.2.3.4').map.size).toBe(0);
  });

  it('caps the whole service per day, and gives the rest back', async () => {
    const { deps, counters } = setup({ globalLimit: 1 });
    await handleRequest(request({ token: 'good' }), deps);
    const response = await handleRequest(request({ token: 'good' }), deps);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'service_busy',
    });
    expect(counters('user:user-1').map.get('2026-11-07')).toBe(1);
  });

  it('charges nothing for a failed lookup', async () => {
    const { deps, lookUp, counters } = setup();
    lookUp.mockRejectedValueOnce(new Error('Down'));
    const response = await handleRequest(request(), deps);
    expect(response.status).toBe(502);
    expect(counters(`install:${INSTALL}`).map.get('2026-11-07')).toBe(0);
    expect(counters('global').map.get('2026-11-07')).toBe(0);
  });

  it('serves a repeated word from cache, without charging or paying', async () => {
    const { deps, lookUp, counters } = setup();
    await handleRequest(request({ word: 'Bank' }), deps);
    const response = await handleRequest(request({ word: 'bank' }), deps);
    await expect(response.json()).resolves.toEqual({ entry: ENTRY });
    expect(lookUp).toHaveBeenCalledTimes(1);
    expect(counters(`install:${INSTALL}`).map.get('2026-11-07')).toBe(1);
  });

  it('keeps languages apart in the cache', async () => {
    const { deps, lookUp } = setup();
    await handleRequest(
      request({ body: { word: 'bank', source: 'en', target: 'zh-TW' } }),
      deps,
    );
    await handleRequest(
      request({ body: { word: 'bank', source: 'en', target: 'ja' } }),
      deps,
    );
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it('answers without charging when both languages match', async () => {
    const { deps, lookUp } = setup();
    const response = await handleRequest(
      request({ body: { word: 'bank', source: 'en', target: 'en-US' } }),
      deps,
    );
    await expect(response.json()).resolves.toEqual({ entry: null });
    expect(lookUp).not.toHaveBeenCalled();
  });

  it.each([
    ['long text', { word: 'x'.repeat(81), source: 'en', target: 'ja' }],
    ['an empty word', { word: '   ', source: 'en', target: 'ja' }],
    ['a bad language', { word: 'a', source: 'en"; drop', target: 'ja' }],
    ['a wrong type', { word: 1, source: 'en', target: 'ja' }],
    ['a free-form prompt', { messages: [{ role: 'user', content: 'hi' }] }],
  ])(
    'refuses %s, so the proxy only ever looks up words',
    async (_name, body) => {
      const { deps, lookUp } = setup();
      const response = await handleRequest(request({ body }), deps);
      expect(response.status).toBe(400);
      expect(lookUp).not.toHaveBeenCalled();
    },
  );

  it('allows only our origins', async () => {
    const { deps } = setup();
    const ours = await handleRequest(
      request({ origin: 'https://coupletapp.com', method: 'OPTIONS' }),
      deps,
    );
    expect(ours.headers.get('access-control-allow-origin')).toBe(
      'https://coupletapp.com',
    );
    const other = await handleRequest(
      request({ origin: 'https://evil.example', method: 'OPTIONS' }),
      deps,
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('knows only its own route and method', async () => {
    const { deps } = setup();
    const missing = await handleRequest(request({ path: '/other' }), deps);
    expect(missing.status).toBe(404);
    const wrong = await handleRequest(request({ method: 'GET' }), deps);
    expect(wrong.status).toBe(405);
  });
});

describe('explain', () => {
  const USER = '2026-11-07';
  const body = {
    word: 'banks',
    cues: ['We sat by the river.', 'The banks were steep.'],
    current: 1,
    source: 'en',
    target: 'zh-TW',
  };
  const ask = (deps: HandlerDeps, overrides: object = {}, token = 'good') => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token) headers.set('authorization', `Bearer ${token}`);
    return handleRequest(
      new Request('https://api.test/v1/explain', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, ...overrides }),
      }),
      deps,
    );
  };

  it('explains a saved phrase up to the limit, and no longer', async () => {
    const { deps, explain } = setup();
    const phrase = `get rid of ${'x'.repeat(69)}`;
    expect(phrase).toHaveLength(80);
    expect((await ask(deps, { word: phrase })).status).toBe(200);
    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ word: phrase }),
      expect.anything(),
    );
    expect((await ask(deps, { word: `${phrase}x` })).status).toBe(400);
  });

  it('explains for an account, and says what is left today', async () => {
    const { deps, explain } = setup();
    const response = await ask(deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      explanation: 'River sides.',
      remaining: 1,
    });
    expect(explain).toHaveBeenCalledWith(body, expect.anything());
  });

  it.each([[''], ['forged']])('needs a real account (%j)', async (token) => {
    const { deps, explain } = setup();
    const response = await ask(deps, {}, token);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'login_required',
    });
    expect(explain).not.toHaveBeenCalled();
  });

  it('stops at the daily allowance, saying when it returns', async () => {
    const { deps, explain } = setup();
    await ask(deps, { word: 'one' });
    await ask(deps, { word: 'two' });
    const response = await ask(deps, { word: 'three' });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'explain_limit',
      limit: 2,
      resetAt: '2026-11-08T00:00:00.000Z',
    });
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it('charges nothing for an explanation already written', async () => {
    const { deps, explain, counters } = setup();
    await ask(deps);
    const response = await ask(deps);
    await expect(response.json()).resolves.toMatchObject({ remaining: 1 });
    expect(explain).toHaveBeenCalledTimes(1);
    expect(counters('explain:user-1').map.get(USER)).toBe(1);
  });

  it('still answers a repeat after the allowance is used', async () => {
    const { deps } = setup();
    await ask(deps);
    await ask(deps, { word: 'two' });
    const response = await ask(deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remaining: 0 });
  });

  it('charges nothing for a failure', async () => {
    const { deps, explain, counters } = setup();
    explain.mockRejectedValueOnce(new Error('Down'));
    const response = await ask(deps);
    expect(response.status).toBe(502);
    expect(counters('explain:user-1').map.get(USER)).toBe(0);
    expect(counters('global').map.get(USER)).toBe(0);
  });

  it('reads as busy past the service limit, and gives the allowance back', async () => {
    const { deps, counters } = setup({ globalLimit: 0 });
    const response = await ask(deps);
    expect(response.status).toBe(503);
    expect(counters('explain:user-1').map.get(USER)).toBe(0);
  });

  it.each([
    ['no lines', { cues: [] }],
    ['too many lines', { cues: ['a', 'b', 'c', 'd'] }],
    ['a long line', { cues: ['x'.repeat(301)], current: 0 }],
    ['a line out of range', { current: 2 }],
    ['a fractional line', { current: 0.5 }],
    ['a bad language', { target: 'en"; drop' }],
  ])('refuses %s, before spending anything', async (_name, overrides) => {
    const { deps, explain } = setup();
    const response = await ask(deps, overrides);
    expect(response.status).toBe(400);
    expect(explain).not.toHaveBeenCalled();
  });

  it('keeps lookups free of the allowance', async () => {
    const { deps, counters } = setup();
    await handleRequest(request({ token: 'good' }), deps);
    expect(counters('explain:user-1').map.size).toBe(0);
  });
});

describe('quota', () => {
  it('forgets earlier days', async () => {
    const storage = memoryCounters();
    await consume(storage, '2026-11-07', 5);
    await consume(storage, '2026-11-08', 5);
    expect([...storage.map.keys()]).toEqual(['2026-11-08']);
  });

  it('never refunds below zero', async () => {
    const storage = memoryCounters();
    await refund(storage, '2026-11-07');
    expect(storage.map.size).toBe(0);
  });
});
