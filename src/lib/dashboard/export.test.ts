import { describe, expect, it } from 'vitest';
import { newReviewState } from '../vocabulary/schedule';
import type { SavedWord } from '../vocabulary/vocabulary';
import { wordsToCsv } from './export';

const WORD: SavedWord = {
  id: 'en:bank',
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [{ meaning: '銀行；河岸', example: 'x', translation: 'y' }],
  source: 'en',
  target: 'zh-TW',
  forms: ['bank'],
  encounters: [
    {
      id: 'e',
      cues: [{ original: 'the "bank"', startMs: 5000 }],
      currentCue: 0,
      translation: '=銀行',
      form: 'bank',
      formOffset: 5,
      origin: { site: 'youtube', videoId: 'abc', title: 'T, 1' },
      meaning: null,
      savedAt: 0,
    },
  ],
  review: newReviewState(0),
  savedAt: 0,
  updatedAt: 0,
};

describe('wordsToCsv', () => {
  it('starts with a BOM and a header', () => {
    const csv = wordsToCsv([]);
    expect(
      csv.startsWith(String.fromCodePoint(0xfeff) + '"Word","Phonetics"'),
    ).toBe(true);
  });

  it('quotes fields and joins meanings', () => {
    const row = wordsToCsv([WORD]).split('\r\n')[1];
    expect(row).toContain('"銀行; 河岸"');
    expect(row).toContain('"the ""bank"""');
    expect(row).toContain('"T, 1"');
    expect(row).toContain('"https://www.youtube.com/watch?v=abc&t=3s"');
    expect(row).toContain('"New"');
  });

  it('keeps spreadsheets from running a cell as a formula', () => {
    expect(wordsToCsv([WORD])).toContain(`"'=銀行"`);
  });
});
