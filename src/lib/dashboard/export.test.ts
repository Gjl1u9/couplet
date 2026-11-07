import { describe, expect, it } from 'vitest';
import { newReviewState } from '../vocabulary/schedule';
import type { SavedWord, VideoOrigin } from '../vocabulary/vocabulary';
import { jumpLink } from '../youtube/origin';
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
  it("keeps a saved phrase's translation in one piece", () => {
    const csv = wordsToCsv([
      {
        ...WORD,
        lemma: 'okay, let us go',
        senses: [{ meaning: '好，走吧', example: '', translation: '' }],
      },
    ]);
    expect(csv).toContain('"okay, let us go","/bæŋk/","好，走吧"');
  });

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

  it('exports every line, to match the translation that covers them', () => {
    const [encounter] = WORD.encounters;
    if (!encounter) throw new Error('missing fixture');
    const csv = wordsToCsv([
      {
        ...WORD,
        encounters: [
          {
            ...encounter,
            cues: [
              { original: 'We sat by', startMs: 1000 },
              { original: 'the bank', startMs: 2000 },
            ],
            currentCue: 1,
            translation: '我們坐在河岸邊',
          },
        ],
      },
    ]);
    expect(csv).toContain('"We sat by the bank","我們坐在河岸邊"');
    // The link still goes to the word's own line.
    expect(csv).toContain(
      jumpLink(encounter.origin as VideoOrigin, {
        original: '',
        startMs: 2000,
      }),
    );
  });
});
