import { describe, expect, it } from 'vitest';
import { newReviewState } from '../vocabulary/schedule';
import type { SavedWord } from '../vocabulary/vocabulary';
import { reduceSession, startSession } from './session';

const word = (id: string): SavedWord => ({
  id,
  lemma: id,
  phonetic: null,
  senses: [],
  source: 'en',
  target: 'zh-TW',
  forms: [],
  encounters: [],
  review: newReviewState(0),
  savedAt: 0,
  updatedAt: 0,
});

const answered = (target: SavedWord) =>
  ({
    type: 'answered',
    outcome: 'good',
    step: { word: target, eventAt: 1, stamp: null },
  }) as const;

describe('reduceSession', () => {
  it('moves on after an answer and takes it back', () => {
    const a = word('a');
    const start = startSession([a, word('b')]);
    const next = reduceSession(start, answered(a));
    expect(next).toMatchObject({ index: 1, outcomes: ['good'] });
    expect(reduceSession(next, { type: 'undone' })).toMatchObject({
      index: 0,
      outcomes: [],
      undo: [],
    });
  });

  it('removes a deleted word and clears undo', () => {
    const a = word('a');
    const state = reduceSession(
      startSession([a, word('b'), word('c')]),
      answered(a),
    );
    const next = reduceSession(state, { type: 'deleted' });
    expect(next.queue.map((item) => item.id)).toEqual(['a', 'c']);
    expect(next.index).toBe(1);
    expect(next.undo).toEqual([]);
  });

  it('adds words that came due, without repeating waiting ones', () => {
    const a = word('a');
    const state = reduceSession(startSession([a, word('b')]), answered(a));
    const next = reduceSession(state, {
      type: 'due',
      words: [word('b'), word('a')],
    });
    expect(next.queue.map((item) => item.id)).toEqual(['a', 'b', 'a']);
  });

  it('drops a rejoined copy when its answer is undone', () => {
    const a = word('a');
    const answeredOnce = reduceSession(startSession([a]), answered(a));
    const rejoined = reduceSession(answeredOnce, { type: 'due', words: [a] });
    const undone = reduceSession(rejoined, { type: 'undone' });
    expect(undone.queue).toHaveLength(1);
    expect(undone.index).toBe(0);
  });

  it('ignores undo with nothing to take back', () => {
    const state = startSession([word('a')]);
    expect(reduceSession(state, { type: 'undone' })).toBe(state);
  });
});
