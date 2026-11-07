import { describe, expect, it } from 'vitest';
import { dueWords } from '../vocabulary/vocabulary';
import { viewOf } from './doc';
import { parseLegacy } from './legacy';

const ENTRY = {
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [{ meaning: '銀行', example: 'A bank.', translation: '一家銀行。' }],
};

const record = (source: string, lastReviewedAt: number, level: number) => ({
  ...ENTRY,
  source,
  target: 'zh-TW',
  forms: [source],
  encounters: [
    {
      id: source,
      cues: [{ original: source, startMs: 0 }],
      currentCue: 0,
      translation: null,
      form: 'bank',
      formOffset: null,
      origin: null,
      meaning: null,
      savedAt: 1,
    },
  ],
  review: { level, dueAt: 5, lastReviewedAt, reviewCount: 1, retired: null },
  savedAt: lastReviewedAt,
  updatedAt: lastReviewedAt,
});

describe('parseLegacy', () => {
  it('turns a word saved before review into a new Card', () => {
    const { docs } = parseLegacy(
      [
        {
          ...ENTRY,
          source: 'en',
          target: 'zh-TW',
          sentence: 'old',
          savedAt: 9,
        },
      ],
      undefined,
    );
    const word = viewOf(docs[0]);
    expect(word?.review).toMatchObject({ level: 0, dueAt: 9 });
    expect(word?.encounters[0]).toMatchObject({
      cues: [{ original: 'old', startMs: null }],
      form: 'bank',
      origin: null,
    });
  });

  it('skips malformed records', () => {
    expect(parseLegacy([{ lemma: 1 }, 'x'], undefined).docs).toEqual([]);
    expect(parseLegacy(undefined, undefined)).toEqual({ docs: [], events: [] });
  });

  it('merges regional ids, keeping the newer schedule', () => {
    const { docs, events } = parseLegacy(
      [record('en', 1, 1), record('en-US', 9, 3)],
      [{ wordId: 'en-US:bank', at: 9 }],
    );
    expect(docs).toHaveLength(1);
    const word = viewOf(docs[0]);
    expect(word?.review.level).toBe(3);
    expect(word?.encounters.map((item) => item.id).sort()).toEqual([
      'en',
      'en-US',
    ]);
    expect(word?.savedAt).toBe(1);
    expect(events[0]).toMatchObject({
      wordId: 'en:bank',
      id: 'en:bank:9',
      undone: false,
    });
  });

  it('drops bad Encounters and leaves the word out of the queue', () => {
    const { docs } = parseLegacy(
      [{ ...record('en', 0, 0), encounters: [{ id: 'x' }] }],
      undefined,
    );
    const word = viewOf(docs[0]);
    expect(word?.encounters).toEqual([]);
    expect(word ? dueWords([word], 10) : null).toEqual([]);
  });

  it('gives the same result when retried', () => {
    const data = [record('en', 3, 1)];
    expect(parseLegacy(data, [])).toEqual(parseLegacy(data, []));
  });

  it('drops log entries for words it does not know', () => {
    const { events } = parseLegacy([], [{ wordId: 'en:none', at: 1 }]);
    expect(events).toEqual([]);
  });
});
