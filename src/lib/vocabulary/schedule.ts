/** The rule behind these numbers is in docs/REVIEW.md. */
export const LADDER_SECONDS = [
  10 * 60,
  86400,
  3 * 86400,
  7 * 86400,
  14 * 86400,
  30 * 86400,
  60 * 86400,
] as const;

const TOP_LEVEL = LADDER_SECONDS.length - 1;

export type Grade = 'again' | 'hard' | 'good';
export type RetiredReason = 'mastered' | 'manual';

export interface ReviewState {
  readonly scheduler: 'ladder-v1';
  readonly level: number;
  readonly dueAt: number;
  readonly lastReviewedAt: number | null;
  /** Picks which Encounter the next Card shows. */
  readonly reviewCount: number;
  readonly retired: {
    readonly reason: RetiredReason;
    readonly at: number;
  } | null;
}

export function newReviewState(now: number): ReviewState {
  return {
    scheduler: 'ladder-v1',
    level: 0,
    dueAt: now,
    lastReviewedAt: null,
    reviewCount: 0,
    retired: null,
  };
}

/** `null` means this grade takes the word off the schedule. */
export function nextLevel(level: number, grade: Grade): number | null {
  if (grade === 'again') return 0;
  if (grade === 'hard') return Math.max(level - 1, 1);
  return level >= TOP_LEVEL ? null : Math.max(level + 1, 2);
}

/** What a grade button shows; `null` means no further review. */
export function intervalSeconds(level: number, grade: Grade): number | null {
  const next = nextLevel(level, grade);
  return next === null ? null : (LADDER_SECONDS[next] ?? null);
}

export function schedule(
  state: ReviewState,
  grade: Grade,
  now: number,
): ReviewState {
  const reviewed = {
    ...state,
    lastReviewedAt: now,
    reviewCount: state.reviewCount + 1,
  };
  const level = nextLevel(state.level, grade);
  if (level === null) {
    return { ...reviewed, retired: { reason: 'mastered', at: now } };
  }
  return {
    ...reviewed,
    level,
    dueAt: now + (LADDER_SECONDS[level] ?? 0) * 1000,
  };
}
