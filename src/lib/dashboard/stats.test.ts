import { describe, expect, it } from 'vitest';
import { newReviewState } from '../vocabulary/schedule';
import type { ReviewEvent, SavedWord } from '../vocabulary/vocabulary';
import {
  languageSummaries,
  forecast,
  hardWords,
  intervalCounts,
  longestStreak,
  reviewsByDay,
  reviewsLastWeek,
  reviewsToday,
  reviewTrail,
  stageCounts,
  stageOf,
  streakDays,
  trailShade,
} from './stats';

const NOW = new Date(2026, 10, 6, 15).getTime();
const daysAgo = (days: number) => new Date(2026, 10, 6 - days, 9).getTime();
const event = (at: number): ReviewEvent => ({
  wordId: 'w',
  encounterId: 'e',
  grade: 'good',
  levelBefore: 0,
  levelAfter: 2,
  at,
});
const word = (
  id: string,
  review: Partial<SavedWord['review']> = {},
): SavedWord => ({
  id,
  lemma: id,
  phonetic: null,
  senses: [],
  source: 'en',
  target: 'zh-TW',
  forms: [],
  encounters: [],
  review: { ...newReviewState(0), reviewCount: 1, ...review },
  savedAt: 0,
  updatedAt: 0,
});
const forgot = (wordId: string, at: number): ReviewEvent => ({
  ...event(at),
  wordId,
  grade: 'again',
});

describe('reviewsByDay', () => {
  it('counts each day, oldest first, including empty days', () => {
    const counts = reviewsByDay(
      [
        event(daysAgo(0)),
        event(daysAgo(0)),
        event(daysAgo(2)),
        event(daysAgo(9)),
      ],
      NOW,
      3,
    );
    expect(counts.map((day) => day.count)).toEqual([1, 0, 2]);
  });
});

describe('streakDays', () => {
  it('counts days in a row up to today', () => {
    const log = [0, 1, 2, 5].map((days) => event(daysAgo(days)));
    expect(streakDays(log, NOW)).toBe(3);
  });

  it('keeps the streak until today is over', () => {
    expect(streakDays([event(daysAgo(1)), event(daysAgo(2))], NOW)).toBe(2);
  });

  it('is zero after a missed day', () => {
    expect(streakDays([event(daysAgo(2))], NOW)).toBe(0);
    expect(streakDays([], NOW)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest run of days, even one that has ended', () => {
    const log = [0, 1, 5, 6, 7, 8, 12, 12].map((days) => event(daysAgo(days)));
    expect(longestStreak(log)).toBe(4);
  });

  it('is zero with no reviews', () => {
    expect(longestStreak([])).toBe(0);
  });
});

describe('reviewsToday', () => {
  it('counts only reviews since midnight', () => {
    const log = [event(daysAgo(0)), event(daysAgo(0)), event(daysAgo(1))];
    expect(reviewsToday(log, NOW)).toBe(2);
  });
});

describe('reviewsLastWeek', () => {
  it('counts the last seven days', () => {
    expect(reviewsLastWeek([event(daysAgo(1)), event(daysAgo(9))], NOW)).toBe(
      1,
    );
  });
});

describe('stageOf', () => {
  it('separates new, learning, and known words', () => {
    expect(stageOf(word('a', { reviewCount: 0 }))).toBe('new');
    expect(stageOf(word('a', { level: 4 }))).toBe('learning');
    expect(stageOf(word('a', { level: 5 }))).toBe('known');
  });

  it('counts a forgotten word as learning, not new', () => {
    expect(stageOf(word('a', { level: 0 }))).toBe('learning');
  });

  it('counts a Retired word as known', () => {
    expect(
      stageOf(word('a', { level: 1, retired: { reason: 'manual', at: 0 } })),
    ).toBe('known');
  });

  it('counts each stage', () => {
    expect(
      stageCounts([
        word('a', { reviewCount: 0 }),
        word('b'),
        word('c', { level: 6 }),
      ]),
    ).toEqual({ new: 1, learning: 1, known: 1 });
  });
});

describe('intervalCounts', () => {
  it('counts reviewed words on the schedule by interval', () => {
    const counts = intervalCounts([
      word('new', { reviewCount: 0 }),
      word('a', { level: 1 }),
      word('b', { level: 1 }),
      word('c', { level: 5 }),
      word('gone', { level: 1, retired: { reason: 'manual', at: 0 } }),
    ]);
    expect(counts.map((item) => item.count)).toEqual([0, 2, 0, 0, 0, 1, 0]);
    expect(counts[1]?.stage).toBe('learning');
    expect(counts[5]?.stage).toBe('known');
  });
});

describe('forecast', () => {
  it('counts overdue words in today and separates those due now', () => {
    const laterToday = NOW + 3_600_000;
    const days = forecast(
      [
        word('old', { dueAt: daysAgo(5) }),
        word('later', { dueAt: laterToday }),
        word('tomorrow', { dueAt: new Date(2026, 10, 7, 9).getTime() }),
        word('far', { dueAt: new Date(2026, 11, 7).getTime() }),
        word('done', { dueAt: 0, retired: { reason: 'manual', at: 0 } }),
      ],
      NOW,
      7,
    );
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ count: 2, dueNow: 1 });
    expect(days[1]?.count).toBe(1);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });
});

describe('hardWords', () => {
  it('needs two recent forgets on a word still low on the schedule', () => {
    const log = [
      forgot('a', daysAgo(1)),
      forgot('a', daysAgo(2)),
      forgot('b', daysAgo(1)),
      forgot('c', daysAgo(40)),
      forgot('c', daysAgo(1)),
      forgot('d', daysAgo(1)),
      forgot('d', daysAgo(2)),
      forgot('e', daysAgo(1)),
      forgot('e', daysAgo(2)),
      forgot('e', daysAgo(3)),
    ];
    const result = hardWords(
      [
        word('a', { level: 2 }),
        word('b'),
        word('c'),
        word('d', { level: 3 }),
        word('e'),
      ],
      log,
      NOW,
    );
    expect(result.map((item) => [item.word.id, item.forgets])).toEqual([
      ['e', 3],
      ['a', 2],
    ]);
  });

  it('leaves out Retired words', () => {
    expect(
      hardWords(
        [word('a', { retired: { reason: 'manual', at: 0 } })],
        [forgot('a', daysAgo(1)), forgot('a', daysAgo(2))],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('reviewTrail', () => {
  it('fills whole weeks and leaves future days empty', () => {
    // 2026-11-06 is a Friday, so Saturday and Sunday have not happened.
    const days = reviewTrail([event(daysAgo(0))], NOW, 12);
    expect(days).toHaveLength(84);
    expect(days.slice(-2)).toEqual([null, null]);
    expect(days.at(-3)?.count).toBe(1);
    expect(new Date(days[0]?.day ?? 0).getDay()).toBe(1);
  });
});

describe('trailShade', () => {
  it('shades by share of the busiest day', () => {
    expect(trailShade(0, 8)).toBe(0);
    expect(trailShade(1, 8)).toBe(1);
    expect(trailShade(4, 8)).toBe(2);
    expect(trailShade(8, 8)).toBe(4);
  });
});

describe('languageSummaries', () => {
  const saved = (id: string, source: string, dueAt: number) =>
    ({
      id,
      source,
      encounters: [{}],
      review: { retired: null, dueAt },
    }) as unknown as SavedWord;
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'ko', name: 'Korean' },
  ];

  it('counts regional tracks together and sorts by words', () => {
    const summaries = languageSummaries(
      languages,
      [saved('a', 'en-US', 5), saved('b', 'es', 5), saved('c', 'es', 20)],
      10,
    );
    expect(summaries).toEqual([
      { code: 'es', name: 'Spanish', words: 2, due: 1 },
      { code: 'en', name: 'English', words: 1, due: 1 },
      { code: 'ko', name: 'Korean', words: 0, due: 0 },
    ]);
  });
});
