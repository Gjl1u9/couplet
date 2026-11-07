import { describe, expect, it, vi } from 'vitest';
import { createDeepSeekLookup, SYSTEM_PROMPT } from './deepseek';

const LANGUAGES = { source: 'en', target: 'zh-TW' };
const signal = new AbortController().signal;
const ENTRY = {
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [
    { meaning: '銀行', example: 'At the bank.', translation: '在銀行。' },
  ],
};

const answering = (content: unknown, init?: ResponseInit) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        init,
      ),
    ),
  );

describe('createDeepSeekLookup', () => {
  it('returns the parsed entry', async () => {
    const lookup = createDeepSeekLookup(
      'key',
      answering(JSON.stringify(ENTRY)),
    );
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).resolves.toEqual(
      ENTRY,
    );
  });

  it('sends only the word and languages after a constant prompt', async () => {
    const fetchFn = answering(JSON.stringify(ENTRY));
    await createDeepSeekLookup('key', fetchFn).lookUp(
      'bank',
      LANGUAGES,
      signal,
    );
    const init = fetchFn.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer key');
    const body = JSON.parse(init?.body as string) as {
      messages: { content: string }[];
      thinking: unknown;
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages.map((message) => message.content)).toEqual([
      SYSTEM_PROMPT,
      '{"word":"bank","source":"en","target":"zh-TW"}',
    ]);
  });

  it('skips the paid request when both languages match', async () => {
    const fetchFn = answering('{}');
    const lookup = createDeepSeekLookup('key', fetchFn);
    await expect(
      lookup.lookUp('bank', { source: 'en', target: 'en-US' }, signal),
    ).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails without a key instead of sending a request', async () => {
    const fetchFn = answering('{}');
    await expect(
      createDeepSeekLookup('', fetchFn).lookUp('bank', LANGUAGES, signal),
    ).rejects.toThrow('還沒設定查字服務');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports an error status', async () => {
    const lookup = createDeepSeekLookup('key', answering('', { status: 402 }));
    await expect(lookup.lookUp('bank', LANGUAGES, signal)).rejects.toThrow(
      '查字服務回應 402',
    );
  });

  it('rejects answers that are cut off or the wrong shape', async () => {
    for (const content of ['{"lemma":"ba', '{"lemma":"bank"}', null]) {
      const lookup = createDeepSeekLookup('key', answering(content));
      await expect(lookup.lookUp('bank', LANGUAGES, signal)).rejects.toThrow(
        '查字回應格式錯誤',
      );
    }
  });
});
