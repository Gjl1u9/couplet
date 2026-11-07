import { describe, expect, it } from 'vitest';
import { tokenizeCaption } from './tokenize';

const words = (text: string, language: string | null) =>
  tokenizeCaption(text, language)
    .filter((part) => part.isToken)
    .map((part) => part.text);

describe('tokenizeCaption', () => {
  it('keeps hyphens and apostrophes inside a word', () => {
    expect(words("Navier-Stokes don't move", 'en')).toEqual([
      'Navier-Stokes',
      "don't",
      'move',
    ]);
  });

  it('separates surrounding punctuation', () => {
    expect(words('"Hello," (she) said...', 'en')).toEqual([
      'Hello',
      'she',
      'said',
    ]);
  });

  it('skips parts with no letters', () => {
    expect(words('>> -- wow', 'en')).toEqual(['wow']);
  });

  it('keeps Korean words on spaces', () => {
    expect(words('저는 학교에 갔습니다', 'ko')).toEqual([
      '저는',
      '학교에',
      '갔습니다',
    ]);
  });

  it('segments languages written without spaces', () => {
    expect(words('毎朝走る', 'ja').length).toBeGreaterThan(1);
    expect(words('研究方程式', 'zh-Hant').length).toBeGreaterThan(1);
  });

  it.each([
    ['The "Navier-Stokes" equations.\nmove', 'en'],
    ['毎朝走るのが習慣です。', 'ja'],
    ['  spaced   out  ', null],
  ])('always joins back into the original text: %s', (text, language) => {
    expect(
      tokenizeCaption(text, language)
        .map((part) => part.text)
        .join(''),
    ).toBe(text);
  });
});
