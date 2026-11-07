import { describe, expect, it } from 'vitest';
import { splitMeaning, toWordEntry } from './entry';

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
