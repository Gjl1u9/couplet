import { describe, expect, it } from 'vitest';
import {
  meaningsOf,
  phraseEntry,
  phraseLemma,
  splitMeaning,
  toWordEntry,
} from './entry';

describe('saved phrases', () => {
  it('gives every spelling of a phrase one lemma', () => {
    expect(phraseLemma(' Give  Up\n')).toBe('give up');
    expect(phraseLemma('お疲れ様 でした')).toBe('お疲れ様 でした');
  });

  it('builds an entry with one meaning and no example', () => {
    expect(phraseEntry('Give Up', '放棄')).toEqual({
      lemma: 'give up',
      phonetic: null,
      senses: [{ meaning: '放棄', example: '', translation: '' }],
    });
  });

  it("keeps a phrase's meaning whole, and still splits a word's", () => {
    expect(
      meaningsOf({ meaning: '好，走吧', example: '', translation: '' }),
    ).toEqual(['好，走吧']);
    expect(
      meaningsOf({ meaning: '銀行，河岸', example: 'x', translation: 'y' }),
    ).toEqual(['銀行', '河岸']);
  });
});

const SENSE = {
  meaning: '銀行',
  example: 'A bank.',
  translation: '一家銀行。',
};

describe('splitMeaning', () => {
  it('splits on Chinese and Latin punctuation', () => {
    expect(splitMeaning('這個；那個')).toEqual(['這個', '那個']);
    expect(splitMeaning('run, walk / go')).toEqual(['run', 'walk', 'go']);
    expect(splitMeaning('甲、乙，丙')).toEqual(['甲', '乙', '丙']);
  });

  it('keeps a single meaning and drops empty parts', () => {
    expect(splitMeaning('銀行')).toEqual(['銀行']);
    expect(splitMeaning('銀行；')).toEqual(['銀行']);
  });
});

describe('toWordEntry', () => {
  it('keeps at most two senses', () => {
    const entry = toWordEntry({
      lemma: 'bank',
      phonetic: '/bæŋk/',
      senses: [SENSE, SENSE, SENSE],
    });
    expect(entry?.senses).toHaveLength(2);
  });

  it('allows a missing phonetic', () => {
    expect(
      toWordEntry({ lemma: 'bank', phonetic: null, senses: [SENSE] })?.phonetic,
    ).toBeNull();
    expect(
      toWordEntry({ lemma: 'bank', phonetic: '  ', senses: [SENSE] })?.phonetic,
    ).toBeNull();
  });

  it('drops incomplete senses', () => {
    const entry = toWordEntry({
      lemma: 'bank',
      senses: [{ meaning: '河岸' }, SENSE],
    });
    expect(entry?.senses).toEqual([SENSE]);
  });

  it('rejects anything without a lemma and a usable sense', () => {
    for (const value of [
      null,
      'bank',
      { lemma: 'bank' },
      { lemma: 'bank', senses: [] },
      { lemma: 'bank', senses: [{ meaning: '河岸' }] },
      { senses: [SENSE] },
    ]) {
      expect(toWordEntry(value)).toBeNull();
    }
  });
});
