import { describe, expect, it } from 'vitest';
import { isTranslateRequest } from './messages';

const languages = { source: 'en', target: 'zh-TW' };

describe('isTranslateRequest', () => {
  it('接受正確的請求', () => {
    expect(
      isTranslateRequest({ type: 'translate', languages, texts: ['a'] }),
    ).toBe(true);
  });

  it.each([
    [null],
    [{ type: 'other', languages, texts: [] }],
    [{ type: 'translate', texts: [] }],
    [{ type: 'translate', languages: { source: 'en' }, texts: [] }],
    [{ type: 'translate', languages, texts: 'a' }],
    [{ type: 'translate', languages, texts: [1] }],
  ])('拒絕：%j', (value) => {
    expect(isTranslateRequest(value)).toBe(false);
  });
});
