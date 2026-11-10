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
    expect(words('研究方程式', 'zh-Hant').length).toBeGreaterThan(1);
  });

  it('keeps Japanese verbs whole, with particles as their own words', () => {
    expect(words('昨日は友達と一緒に映画を見に行きました', 'ja')).toEqual([
      '昨日',
      'は',
      '友達',
      'と',
      '一緒',
      'に',
      '映画',
      'を',
      '見',
      'に',
      '行きました',
    ]);
    expect(words('めちゃくちゃ美味しかった', 'ja')).toEqual([
      'めちゃくちゃ',
      '美味しかった',
    ]);
    expect(words('先日友達のご夫婦と', 'ja')).toEqual([
      '先日',
      '友達',
      'の',
      'ご夫婦',
      'と',
    ]);
    expect(words('学校には行かない', 'ja')).toEqual([
      '学校',
      'には',
      '行かない',
    ]);
  });

  it('never cuts inside a Japanese verb', () => {
    expect(words('食べられなかったんですけど', 'ja')).toEqual([
      '食べられなかったんです',
      'けど',
    ]);
    expect(words('建物が多くなってきました', 'ja')).toEqual([
      '建物',
      'が',
      '多く',
      'なってきました',
    ]);
    expect(words('始まって下がっている', 'ja')).toEqual([
      '始まって',
      '下がっている',
    ]);
  });

  it('breaks a long Japanese phrase at its words', () => {
    expect(words('あれ格好っていつも', 'ja')).toEqual([
      'あれ',
      '格好',
      'って',
      'いつも',
    ]);
    expect(words('1年のうち半分が東京', 'ja')).toEqual([
      '1年',
      'の',
      'うち',
      '半分',
      'が',
      '東京',
    ]);
  });

  it('keeps a Japanese noun whole where BudouX breaks it', () => {
    expect(words('東京っていいね', 'ja')).toEqual(['東京', 'って', 'いいね']);
  });

  it('repairs where the word segmenter cuts or joins wrongly', () => {
    expect(words('最高の時間でした', 'ja')).toEqual([
      '最高',
      'の',
      '時間でした',
    ]);
    expect(words('ここに迎えに来て', 'ja')).toContain('ここ');
    expect(words('駐車場に着いて', 'ja')).toEqual(['駐車場', 'に', '着いて']);
    expect(words('理由は２つあります', 'ja')).toEqual([
      '理由',
      'は',
      '２つ',
      'あります',
    ]);
    expect(words('みなさん、こんにちは', 'ja')).toEqual([
      'みなさん',
      'こんにちは',
    ]);
  });

  it('keeps Japanese loanwords whole', () => {
    expect(words('ポッドキャストでドタキャン', 'ja')).toEqual([
      'ポッドキャスト',
      'で',
      'ドタキャン',
    ]);
  });

  it('makes every Japanese letter clickable, but not caption annotations', () => {
    const parts = tokenizeCaption('耳[音楽]に入ってきたなくらいの感じで', 'ja');
    expect(parts.filter((part) => !part.isToken)).toEqual([
      { text: '[音楽]', isToken: false },
    ]);
  });

  it('sets punctuation and spaces apart in Japanese', () => {
    expect(words('「うん」、そう。 じゃあね', 'ja')).not.toContain('、');
    expect(
      tokenizeCaption('うん。 じゃあね', 'ja').filter((part) => !part.isToken),
    ).toEqual([
      { text: '。', isToken: false },
      { text: ' ', isToken: false },
    ]);
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
