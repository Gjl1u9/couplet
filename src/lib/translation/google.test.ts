import { describe, expect, it, vi } from 'vitest';
import {
  createGoogleTranslate,
  parseGoogleResponse,
  TranslationHttpError,
} from './google';

const pair = { source: 'en', target: 'zh-TW' };
const signal = new AbortController().signal;

describe('parseGoogleResponse', () => {
  it('支援真實的兩種格式', () => {
    expect(parseGoogleResponse(['好的。', '你好'])).toEqual(['好的。', '你好']);
    expect(
      parseGoogleResponse([
        ['你好', 'en'],
        ['好的。', 'en'],
      ]),
    ).toEqual(['你好', '好的。']);
  });

  it.each([[null], [{}], ['x'], [[1]], [[[1, 'en']]]])(
    '格式錯誤時丟錯：%j',
    (body) => {
      expect(() => parseGoogleResponse(body)).toThrow();
    },
  );
});

describe('createGoogleTranslate', () => {
  const respond = (body: unknown, init?: ResponseInit) =>
    vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(body), init)),
    );

  it('用 POST 送出每一句，語言放在網址，字幕文字不放在網址', async () => {
    const fetchFn = respond(['甲', '乙']);
    await expect(
      createGoogleTranslate(pair, fetchFn)(['a & b', 'c'], signal),
    ).resolves.toEqual(['甲', '乙']);

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    const parsed = new URL((url as URL).href);
    expect(parsed.host).toBe('translate.googleapis.com');
    expect(parsed.pathname).toBe('/translate_a/t');
    expect(parsed.searchParams.get('client')).toBe('gtx');
    expect(parsed.searchParams.get('sl')).toBe('en');
    expect(parsed.searchParams.get('tl')).toBe('zh-TW');
    expect(parsed.searchParams.get('format')).toBe('text');
    expect(parsed.searchParams.has('q')).toBe(false);
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBe(signal);
    expect((init?.body as URLSearchParams).getAll('q')).toEqual(['a & b', 'c']);
  });

  it('HTTP 錯誤會丟出帶狀態碼的錯誤', async () => {
    const translate = createGoogleTranslate(pair, respond({}, { status: 429 }));
    const error: unknown = await translate(['a'], signal).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TranslationHttpError);
    expect((error as TranslationHttpError).status).toBe(429);
  });
});
