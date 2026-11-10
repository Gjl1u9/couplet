import { sameLanguage } from '../language';
import { LADDER_SECONDS } from '../vocabulary/schedule';
import {
  dueWords,
  type ReviewEvent,
  type SavedWord,
} from '../vocabulary/vocabulary';
import { startOfDay } from './format';

export interface DayCount {
  /** Local midnight. */
  readonly day: number;
  readonly count: number;
}

const previousDay = (day: number) => {
  const date = new Date(day);
  date.setDate(date.getDate() - 1);
  return date.getTime();
};

const nextDay = (day: number) => {
  const date = new Date(day);
  date.setDate(date.getDate() + 1);
  return date.getTime();
};

/** Oldest first, including days without reviews. */
export function reviewsByDay(
  log: readonly ReviewEvent[],
  now: number,
  days: number,
): readonly DayCount[] {
  const counts = new Map<number, number>();
  for (const event of log) {
    const day = startOfDay(event.at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const result: DayCount[] = [];
  let day = startOfDay(now);
  for (let left = days; left > 0; left -= 1) {
    result.unshift({ day, count: counts.get(day) ?? 0 });
    day = previousDay(day);
  }
  return result;
}

/** Days in a row with a review. Today not being done yet does not break it. */
export function streakDays(log: readonly ReviewEvent[], now: number): number {
  const days = new Set(log.map((event) => startOfDay(event.at)));
  let day = startOfDay(now);
  if (!days.has(day)) day = previousDay(day);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = previousDay(day);
  }
  return streak;
}

/** The most days in a row with a review, ever. */
export function longestStreak(log: readonly ReviewEvent[]): number {
  const days = [...new Set(log.map((event) => startOfDay(event.at)))].sort(
    (a, b) => a - b,
  );
  let longest = 0;
  let run = 0;
  let last: number | null = null;
  for (const day of days) {
    run = last !== null && nextDay(last) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    last = day;
  }
  return longest;
}

/** Reviews since local midnight. */
export function reviewsToday(log: readonly ReviewEvent[], now: number): number {
  const today = startOfDay(now);
  return log.filter((event) => event.at >= today && event.at <= now).length;
}

const WEEK_MS = 7 * 86_400_000;

export function reviewsLastWeek(
  log: readonly ReviewEvent[],
  now: number,
): number {
  return log.filter((event) => now - event.at < WEEK_MS).length;
}

export type Stage = 'new' | 'learning' | 'known';

export const STAGES: readonly { readonly id: Stage; readonly label: string }[] =
  [
    { id: 'new', label: 'New' },
    { id: 'learning', label: 'Learning' },
    { id: 'known', label: 'Known' },
  ];

export const stageLabel = (stage: Stage) =>
  STAGES.find(({ id }) => id === stage)?.label ?? '';

/** The level whose interval is 30 days: the word survived a 14-day wait. */
const KNOWN_LEVEL = 5;

export function stageOf({ review }: SavedWord): Stage {
  if (review.retired || review.level >= KNOWN_LEVEL) return 'known';
  return review.reviewCount === 0 ? 'new' : 'learning';
}

export function stageCounts(
  words: readonly SavedWord[],
): Readonly<Record<Stage, number>> {
  const counts = { new: 0, learning: 0, known: 0 };
  for (const word of words) counts[stageOf(word)] += 1;
  return counts;
}

export interface IntervalCount {
  readonly seconds: number;
  readonly count: number;
  readonly stage: Stage;
}

/** Scheduled words by the interval they are on. New and Retired words are left out. */
export function intervalCounts(
  words: readonly SavedWord[],
): readonly IntervalCount[] {
  return LADDER_SECONDS.map((seconds, level) => ({
    seconds,
    count: words.filter(
      ({ review }) =>
        !review.retired && review.reviewCount > 0 && review.level === level,
    ).length,
    stage: level >= KNOWN_LEVEL ? 'known' : 'learning',
  }));
}

export interface ForecastDay extends DayCount {
  /** Words already due, which are part of today's count. */
  readonly dueNow: number;
}

/** Today first. Overdue words count as today, because that is when they are done. */
export function forecast(
  words: readonly SavedWord[],
  now: number,
  days: number,
): readonly ForecastDay[] {
  const scheduled = words.filter((word) => !word.review.retired);
  const result: ForecastDay[] = [];
  let day = startOfDay(now);
  for (let at = 0; at < days; at += 1) {
    const end = nextDay(day);
    const from = at === 0 ? -Infinity : day;
    const inDay = scheduled.filter(
      ({ review }) => review.dueAt >= from && review.dueAt < end,
    );
    result.push({
      day,
      count: inDay.length,
      dueNow:
        at === 0 ? inDay.filter(({ review }) => review.dueAt <= now).length : 0,
    });
    day = end;
  }
  return result;
}

const HARD_WINDOW_MS = 30 * 86_400_000;
const HARD_MIN_FORGETS = 2;
const HARD_BELOW_LEVEL = 3;

export interface HardWord {
  readonly word: SavedWord;
  readonly forgets: number;
}

/** Most forgotten first. A word leaves by reaching a 7-day interval. */
export function hardWords(
  words: readonly SavedWord[],
  log: readonly ReviewEvent[],
  now: number,
): readonly HardWord[] {
  const forgets = new Map<string, number>();
  for (const event of log) {
    if (event.grade === 'again' && now - event.at <= HARD_WINDOW_MS) {
      forgets.set(event.wordId, (forgets.get(event.wordId) ?? 0) + 1);
    }
  }
  return words
    .filter(
      (word) =>
        !word.review.retired &&
        word.review.level < HARD_BELOW_LEVEL &&
        (forgets.get(word.id) ?? 0) >= HARD_MIN_FORGETS,
    )
    .map((word) => ({ word, forgets: forgets.get(word.id) ?? 0 }))
    .sort((a, b) => b.forgets - a.forgets);
}

/** Whole weeks, Monday first, ending with the week of `now`. Future days are `null`. */
export function reviewTrail(
  log: readonly ReviewEvent[],
  now: number,
  weeks: number,
): readonly (DayCount | null)[] {
  const today = startOfDay(now);
  const weekday = (new Date(today).getDay() + 6) % 7;
  const total = (weeks - 1) * 7 + weekday + 1;
  const past: readonly (DayCount | null)[] = reviewsByDay(log, now, total);
  return [...past, ...Array<null>(6 - weekday).fill(null)];
}

const SHADES = 4;

/** 0 for no reviews, otherwise 1 to 4 relative to the busiest day. */
export function trailShade(count: number, peak: number): number {
  if (count === 0 || peak === 0) return 0;
  return Math.max(Math.ceil((count / peak) * SHADES), 1);
}

export interface LanguageSummary {
  readonly code: string;
  readonly name: string;
  readonly words: number;
  readonly due: number;
}

/** Languages with the most words come first, because those are the ones to go back to. */
export function languageSummaries(
  languages: readonly { readonly code: string; readonly name: string }[],
  words: readonly SavedWord[],
  now: number,
): readonly LanguageSummary[] {
  return languages
    .map(({ code, name }) => {
      const own = words.filter((word) => sameLanguage(word.source, code));
      return {
        code,
        name,
        words: own.length,
        due: dueWords(own, now).length,
      };
    })
    .sort((a, b) => b.words - a.words);
}
