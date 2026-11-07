import { toWordEntry } from '../lookup/entry';
import type { WordEntry } from '../lookup/types';
import { newReviewState, type ReviewState } from '../vocabulary/schedule';
import {
  wordIdOf,
  type Encounter,
  type ReviewEvent,
  type SavedWord,
} from '../vocabulary/vocabulary';
import {
  DOC_SCHEMA,
  withoutNul,
  type ReviewEventDoc,
  type WordDoc,
} from './doc';
import { makeStamp } from './stamp';

/** Words stored in `chrome.storage.local` before sync. See "Moving existing data". */
export const LEGACY_WORDS_KEY = 'vocabulary';
export const LEGACY_LOG_KEY = 'reviewLog';
const MAX_ENCOUNTERS = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function toReviewState(value: unknown): ReviewState | null {
  if (!isRecord(value)) return null;
  const { level, dueAt, lastReviewedAt, reviewCount, retired } = value;
  if (
    typeof level !== 'number' ||
    typeof dueAt !== 'number' ||
    (lastReviewedAt !== null && typeof lastReviewedAt !== 'number') ||
    typeof reviewCount !== 'number'
  ) {
    return null;
  }
  return {
    scheduler: 'ladder-v1',
    level,
    dueAt,
    lastReviewedAt,
    reviewCount,
    retired: isRecord(retired)
      ? (retired as unknown as NonNullable<ReviewState['retired']>)
      : null,
  };
}

/** Words saved before review existed have one sentence and join the queue as new. */
function fromLegacy(
  entry: WordEntry,
  value: Record<string, unknown>,
  source: string,
  target: string,
): SavedWord | null {
  const { sentence, savedAt } = value;
  if (typeof sentence !== 'string' || typeof savedAt !== 'number') return null;
  return {
    ...entry,
    id: wordIdOf(entry.lemma, source),
    source,
    target,
    forms: [],
    encounters: [
      {
        id: `legacy-${String(savedAt)}`,
        cues: [{ original: sentence, startMs: null }],
        currentCue: 0,
        translation: null,
        form: entry.lemma,
        formOffset: null,
        origin: null,
        meaning: null,
        savedAt,
      },
    ],
    review: newReviewState(savedAt),
    savedAt,
    updatedAt: savedAt,
  };
}

function toSavedWord(value: unknown): SavedWord | null {
  const entry = toWordEntry(value);
  if (!entry || !isRecord(value)) return null;
  const { source, target } = value;
  if (typeof source !== 'string' || typeof target !== 'string') return null;
  if (!Array.isArray(value.encounters)) {
    return fromLegacy(entry, value, source, target);
  }
  const review = toReviewState(value.review);
  const { savedAt, updatedAt, forms } = value;
  if (
    !review ||
    typeof savedAt !== 'number' ||
    typeof updatedAt !== 'number' ||
    !Array.isArray(forms)
  ) {
    return null;
  }
  return {
    ...entry,
    id: wordIdOf(entry.lemma, source),
    source,
    target,
    forms: forms.filter((form) => typeof form === 'string'),
    encounters: value.encounters.filter(isEncounter),
    review,
    savedAt,
    updatedAt,
  };
}

function isEncounter(value: unknown): value is Encounter {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    Array.isArray(value.cues) &&
    typeof value.currentCue === 'number' &&
    typeof value.form === 'string' &&
    isRecord(value.cues[value.currentCue])
  );
}

/** Words saved under regional ids before they shared one Card. */
function mergeDuplicates(words: readonly SavedWord[]): readonly SavedWord[] {
  const merged = new Map<string, SavedWord>();
  for (const word of words) {
    const seen = merged.get(word.id);
    if (!seen) {
      merged.set(word.id, word);
      continue;
    }
    const [newer, older] =
      (word.review.lastReviewedAt ?? 0) >= (seen.review.lastReviewedAt ?? 0)
        ? [word, seen]
        : [seen, word];
    merged.set(word.id, {
      ...newer,
      forms: [...new Set([...newer.forms, ...older.forms])],
      encounters: [...newer.encounters, ...older.encounters].slice(
        0,
        MAX_ENCOUNTERS,
      ),
      savedAt: Math.min(newer.savedAt, older.savedAt),
    });
  }
  return [...merged.values()];
}

const normalizedWordId = (wordId: string) => {
  const at = wordId.indexOf(':');
  return at < 0 ? wordId : wordIdOf(wordId.slice(at + 1), wordId.slice(0, at));
};

/** Stamps come from the data, so a retried move produces the same documents. */
const legacyStamp = (ms: number) => makeStamp(ms, 0, 'legacy');

function toDoc(word: SavedWord): WordDoc {
  const birth = legacyStamp(word.savedAt);
  const { review, forms, encounters, savedAt, id } = word;
  const entry = {
    lemma: word.lemma,
    phonetic: word.phonetic,
    senses: word.senses,
    source: word.source,
    target: word.target,
  };
  const changedAt = Math.max(
    word.savedAt,
    review.lastReviewedAt ?? 0,
    review.retired?.at ?? 0,
  );
  return {
    schema: DOC_SCHEMA,
    id,
    deleted: null,
    lives: {
      [birth]: {
        birth,
        savedAt,
        entry: { stamp: birth, value: entry },
        review: { stamp: legacyStamp(changedAt), value: review },
        forms: [...new Set(forms)].sort(),
        encounters,
      },
    },
  };
}

export interface LegacyData {
  readonly docs: readonly WordDoc[];
  readonly events: readonly ReviewEventDoc[];
}

export function parseLegacy(words: unknown, log: unknown): LegacyData {
  const saved = Array.isArray(words)
    ? mergeDuplicates(words.map(toSavedWord).filter((word) => word !== null))
    : [];
  const docs = saved.map((word) => withoutNul(toDoc(word)));
  const births = new Map(
    docs.map((doc) => [doc.id, Object.keys(doc.lives)[0] ?? legacyStamp(0)]),
  );
  const events = Array.isArray(log)
    ? (log as ReviewEvent[]).flatMap((event): ReviewEventDoc[] => {
        const wordId = normalizedWordId(event.wordId);
        const wordBirth = births.get(wordId);
        if (!wordBirth || typeof event.at !== 'number') return [];
        return [
          {
            ...event,
            id: `${wordId}:${String(event.at)}`,
            wordId,
            wordBirth,
            undone: false,
          },
        ];
      })
    : [];
  return { docs, events };
}
