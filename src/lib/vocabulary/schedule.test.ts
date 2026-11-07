import { describe, expect, it } from 'vitest';
import {
  intervalSeconds,
  LADDER_SECONDS,
  newReviewState,
  schedule,
  type Grade,
} from './schedule';

const DAY = 86400;
const GRADES: readonly Grade[] = ['again', 'hard', 'good'];

describe('schedule', () => {
  it('shows the intervals the spec lists at every level', () => {
    const table = LADDER_SECONDS.map((_, level) =>
      GRADES.map((grade) => intervalSeconds(level, grade)),
    );
    expect(table).toEqual([
      [600, DAY, 3 * DAY],
      [600, DAY, 3 * DAY],
      [600, DAY, 7 * DAY],
      [600, 3 * DAY, 14 * DAY],
      [600, 7 * DAY, 30 * DAY],
      [600, 14 * DAY, 60 * DAY],
      [600, 30 * DAY, null],
    ]);
  });

  it('never gives two buttons the same interval', () => {
    for (const level of LADDER_SECONDS.keys()) {
      const shown = GRADES.map((grade) => intervalSeconds(level, grade));
      expect(new Set(shown).size).toBe(3);
    }
  });

  it('sets the next due time from the new level', () => {
    const next = schedule(newReviewState(0), 'good', 1000);
    expect(next.level).toBe(2);
    expect(next.dueAt).toBe(1000 + 3 * DAY * 1000);
    expect(next.lastReviewedAt).toBe(1000);
    expect(next.reviewCount).toBe(1);
  });

  it('retires a new word after six good reviews over 114 days', () => {
    let state = newReviewState(0);
    let now = 0;
    let reviews = 0;
    while (!state.retired) {
      now = state.dueAt;
      state = schedule(state, 'good', now);
      reviews += 1;
    }
    expect(reviews).toBe(6);
    expect(now).toBe(114 * DAY * 1000);
    expect(state.retired).toEqual({ reason: 'mastered', at: now });
  });

  it('sends a forgotten word back to the start', () => {
    const state = { ...newReviewState(0), level: 5 };
    expect(schedule(state, 'again', 0)).toMatchObject({
      level: 0,
      dueAt: 600_000,
    });
  });
});
