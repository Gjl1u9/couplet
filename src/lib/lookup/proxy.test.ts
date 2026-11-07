import { describe, expect, it, vi } from 'vitest';
import { createProxyLookup, LOOKUP_BUSY, lookupFailure } from './proxy';

const ENTRY = {
  lemma: 'bank',
  phonetic: null,
  senses: [{ meaning: 'm', example: 'e', translation: 't' }],
};
const LANGUAGES = { source: 'en', target: 'zh-TW' };
const signal = new AbortController().signal;

function setup(
  status: number,
  body: unknown,
  token: () => Promise<string | null> = () => Promise.resolve(null),
) {
  const fetchFn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  const lookup = createProxyLookup({
    accessToken: token,
    installId: () => Promise.resolve('install-1'),
    fetchFn,
    endpoint: 'https://api.test/v1/lookup',
  });
  return { lookup, fetchFn };
}

describe('createProxyLookup', () => {
  it('sends only the word and languages, with an install ID', async () => {
    const { lookup, fetchFn } = setup(200, { entry: ENTRY });
    await expect(lookup.lookUp('banks', LANGUAGES, signal)).resolves.toEqual(
      ENTRY,
    );
    const init = fetchFn.mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({
      word: 'banks',
      source: 'en',
      target: 'zh-TW',
    });
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      'x-install-id': 'install-1',
    });
  });

  it('adds the account when signed in', async () => {
    const { lookup, fetchFn } = setup(200, { entry: ENTRY }, () =>
      Promise.resolve('token'),
    );
    await lookup.lookUp('banks', LANGUAGES, signal);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer token',
    });
  });

  it('still looks up when the session cannot be read', async () => {
    const { lookup } = setup(200, { entry: ENTRY }, () =>
      Promise.reject(new Error('Nope')),
    );
    await expect(lookup.lookUp('banks', LANGUAGES, signal)).resolves.toEqual(
      ENTRY,
    );
  });

  it('passes on "nothing to translate"', async () => {
    const { lookup } = setup(200, { entry: null });
    await expect(lookup.lookUp('a', LANGUAGES, signal)).resolves.toBeNull();
  });

  it.each([
    [503, { error: 'service_busy' }, LOOKUP_BUSY],
    [502, { error: 'lookup_failed' }, '502'],
    [200, { entry: { nope: true } }, '格式錯誤'],
  ])('reports %i %j', async (status, body, message) => {
    const { lookup } = setup(status, body);
    await expect(lookup.lookUp('a', LANGUAGES, signal)).rejects.toThrow(
      message,
    );
  });
});

describe('lookupFailure', () => {
  it('offers another try only when it can help', () => {
    expect(lookupFailure(`Error: ${LOOKUP_BUSY}`)).toEqual({
      text: 'Lookups are busy right now. Try again later.',
      canRetry: false,
    });
    expect(lookupFailure(new Error('Down'))).toEqual({
      text: "Couldn't reach the dictionary",
      canRetry: true,
    });
  });
});
