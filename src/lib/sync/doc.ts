import type { WordEntry } from '../lookup/types';
import type { ReviewState } from '../vocabulary/schedule';
import type {
  Encounter,
  ReviewEvent,
  SavedWord,
} from '../vocabulary/vocabulary';
import { stampMs, type Stamp } from './stamp';

export const DOC_SCHEMA = 3;
const MAX_ENCOUNTERS = 3;

export interface WordContent extends WordEntry {
  readonly source: string;
  readonly target: string;
}

export interface Versioned<T> {
  readonly stamp: Stamp;
  readonly value: T;
}

export interface WordLife {
  readonly birth: Stamp;
  readonly savedAt: number;
  readonly entry: Versioned<WordContent>;
  readonly review: Versioned<ReviewState>;
  readonly forms: readonly string[];
  readonly encounters: readonly Encounter[];
}

export interface WordDoc {
  readonly schema: number;
  readonly id: string;
  readonly deleted: Stamp | null;
  readonly lives: Readonly<Record<Stamp, WordLife>>;
}

export interface ReviewEventDoc extends ReviewEvent {
  readonly id: string;
  readonly wordBirth: Stamp;
  readonly undone: boolean;
}

/** Equality that ignores key order, because Postgres reorders the keys of `jsonb`. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** Postgres cannot store NUL in text, and one such word would block every sync. */
export function withoutNul<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('\\u0000', '')) as T;
}

const later = (a: Stamp | null, b: Stamp | null) => {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
};

const newer = <T>(a: Versioned<T>, b: Versioned<T>) =>
  a.stamp >= b.stamp ? a : b;

export const encounterMoment = (encounter: Encounter) =>
  JSON.stringify([
    encounter.origin?.site ?? null,
    encounter.origin?.videoId ?? null,
    encounter.cues[encounter.currentCue]?.original ?? '',
  ]);

const newestFirst = (a: Encounter, b: Encounter) =>
  b.savedAt - a.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const greaterText = (a: string | null, b: string | null) => {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
};

/**
 * Union by ID, then the newest per moment, then the newest three. Keeping the newest makes
 * this order-independent: anything cut is older than everything kept.
 */
export function mergeEncounters(
  a: readonly Encounter[],
  b: readonly Encounter[],
): readonly Encounter[] {
  const byId = new Map<string, Encounter>();
  for (const encounter of [...a, ...b]) {
    const seen = byId.get(encounter.id);
    byId.set(
      encounter.id,
      seen
        ? {
            ...seen,
            translation: greaterText(seen.translation, encounter.translation),
          }
        : encounter,
    );
  }
  const byMoment = new Map<string, Encounter>();
  for (const encounter of byId.values()) {
    const key = encounterMoment(encounter);
    const seen = byMoment.get(key);
    if (!seen || newestFirst(encounter, seen) < 0) {
      byMoment.set(key, encounter);
    }
  }
  return [...byMoment.values()].sort(newestFirst).slice(0, MAX_ENCOUNTERS);
}

function mergeLife(a: WordLife, b: WordLife): WordLife {
  return {
    birth: a.birth,
    savedAt: Math.min(a.savedAt, b.savedAt),
    entry: newer(a.entry, b.entry),
    review: newer(a.review, b.review),
    forms: [...new Set([...a.forms, ...b.forms])].sort(),
    encounters: mergeEncounters(a.encounters, b.encounters),
  };
}

const sortedLives = (lives: Record<Stamp, WordLife>) =>
  Object.fromEntries(
    Object.entries(lives).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

/** Commutative, associative, and idempotent. See docs/SYNC.md. */
export function mergeDocs(a: WordDoc | null, b: WordDoc | null): WordDoc {
  if (!a && !b) throw new Error('Nothing to merge');
  if (!a) return b as WordDoc;
  if (!b) return a;
  const deleted = later(a.deleted, b.deleted);
  const lives: Record<Stamp, WordLife> = {};
  for (const source of [a, b]) {
    for (const [birth, life] of Object.entries(source.lives)) {
      if (deleted !== null && birth <= deleted) continue;
      const seen = lives[birth];
      lives[birth] = seen ? mergeLife(seen, life) : life;
    }
  }
  return {
    schema: Math.max(a.schema, b.schema),
    id: a.id,
    deleted,
    lives: sortedLives(lives),
  };
}

export const mergeEvents = (
  a: ReviewEventDoc | null,
  b: ReviewEventDoc,
): ReviewEventDoc => (a ? { ...a, undone: a.undone || b.undone } : b);

export const coveredByDeletion = (
  event: ReviewEventDoc,
  doc: WordDoc | null | undefined,
) => doc?.deleted != null && event.wordBirth <= doc.deleted;

export const newestLife = (doc: WordDoc): WordLife | null =>
  Object.values(doc.lives).sort((a, b) => (a.birth > b.birth ? -1 : 1))[0] ??
  null;

/** What the app reads. `null` when the word is deleted. */
export function viewOf(doc: WordDoc | null | undefined): SavedWord | null {
  if (!doc) return null;
  const lives = Object.values(doc.lives);
  const first = lives[0];
  if (!first) return null;
  const entry = lives.map((life) => life.entry).reduce(newer);
  const review = lives.map((life) => life.review).reduce(newer);
  const all = lives.flatMap((life) => life.encounters);
  const encounters = lives
    .map((life) => life.encounters)
    .reduce(mergeEncounters)
    .map((encounter) => {
      if (encounter.translation !== null) return encounter;
      const key = encounterMoment(encounter);
      const other = all
        .filter(
          (item) => encounterMoment(item) === key && item.translation !== null,
        )
        .map((item) => item.translation)
        .reduce(greaterText, null);
      return other === null ? encounter : { ...encounter, translation: other };
    });
  const stamps = [entry.stamp, review.stamp].map(stampMs);
  return {
    ...entry.value,
    id: doc.id,
    forms: [...new Set(lives.flatMap((life) => life.forms))],
    encounters,
    review: review.value,
    reviewStamp: review.stamp,
    birth: newestLife(doc)?.birth ?? first.birth,
    savedAt: Math.min(...lives.map((life) => life.savedAt)),
    updatedAt: Math.max(
      ...stamps,
      ...encounters.map((encounter) => encounter.savedAt),
    ),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isLife(value: unknown): value is WordLife {
  if (!isRecord(value)) return false;
  const { birth, savedAt, entry, review, forms, encounters } = value;
  return (
    typeof birth === 'string' &&
    typeof savedAt === 'number' &&
    isRecord(entry) &&
    typeof entry.stamp === 'string' &&
    isRecord(entry.value) &&
    typeof entry.value.lemma === 'string' &&
    isRecord(review) &&
    typeof review.stamp === 'string' &&
    isRecord(review.value) &&
    typeof review.value.level === 'number' &&
    Array.isArray(forms) &&
    Array.isArray(encounters)
  );
}

/** What comes from the server is checked before it reaches the local database. */
export function parseDoc(value: unknown): WordDoc | null {
  if (!isRecord(value)) return null;
  const { schema, id, deleted, lives } = value;
  if (
    typeof schema !== 'number' ||
    typeof id !== 'string' ||
    (deleted !== null && typeof deleted !== 'string') ||
    !isRecord(lives) ||
    !Object.values(lives).every(isLife)
  ) {
    return null;
  }
  return value as unknown as WordDoc;
}

export function parseEvent(value: unknown): ReviewEventDoc | null {
  if (!isRecord(value)) return null;
  const { id, wordId, wordBirth, at, grade } = value;
  if (
    typeof id !== 'string' ||
    typeof wordId !== 'string' ||
    typeof wordBirth !== 'string' ||
    typeof at !== 'number' ||
    typeof grade !== 'string'
  ) {
    return null;
  }
  return value as unknown as ReviewEventDoc;
}
