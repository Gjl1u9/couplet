import { languageIdentity } from '../language';
import type { WordEntry } from '../lookup/types';
import {
  coveredByDeletion,
  DOC_SCHEMA,
  mergeEncounters,
  newestLife,
  viewOf,
  withoutNul,
  type ReviewEventDoc,
  type WordDoc,
  type WordLife,
} from '../sync/doc';
import { createStampClock, type Stamp, type StampClock } from '../sync/stamp';
import {
  createMemoryStore,
  createWriteQueue,
  type OutboxKey,
  type StoreCommit,
  type SyncStore,
  type WriteQueue,
} from '../sync/store';
import {
  newReviewState,
  schedule,
  type Grade,
  type ReviewState,
} from './schedule';

export interface ContextCue {
  readonly original: string;
  readonly startMs: number | null;
}

export interface VideoOrigin {
  readonly site: 'youtube';
  readonly videoId: string;
  readonly title: string;
}

export interface ContextMeaning {
  readonly text: string;
  readonly model: string;
  readonly createdAt: number;
}

/** One time the user met a Saved Word. */
export interface Encounter {
  readonly id: string;
  /** Previous, current, and next; a neighbour may be absent. */
  readonly cues: readonly ContextCue[];
  readonly currentCue: number;
  /** All cues translated together, because cues split sentences anywhere. */
  readonly translation: string | null;
  /** The word as written in the current cue. */
  readonly form: string;
  /** Where the form starts in the current cue, since a word can appear twice. */
  readonly formOffset: number | null;
  /** `null` for words saved before review existed. */
  readonly origin: VideoOrigin | null;
  /** Premium. */
  readonly meaning: ContextMeaning | null;
  readonly savedAt: number;
}

export interface SavedWord extends WordEntry {
  readonly id: string;
  /** The Learning Language side, which together with the lemma identifies the word. */
  readonly source: string;
  readonly target: string;
  /** Spellings met in subtitles, used to mark the word. */
  readonly forms: readonly string[];
  /** Newest first. */
  readonly encounters: readonly Encounter[];
  readonly review: ReviewState;
  readonly savedAt: number;
  readonly updatedAt: number;
  /** Identifies this version of the schedule, so Undo can tell if it has moved on. */
  readonly reviewStamp?: string;
  /** The life this view's newest writes belong to. See docs/SYNC.md. */
  readonly birth?: string;
}

export interface ReviewEvent {
  readonly wordId: string;
  readonly encounterId: string;
  readonly grade: Grade;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly at: number;
}

/** What the video side knows when a word is saved or met again. */
export interface EncounterInput {
  readonly entry: WordEntry;
  readonly source: string;
  readonly target: string;
  readonly cues: readonly ContextCue[];
  readonly currentCue: number;
  readonly form: string;
  readonly formOffset: number | null;
  readonly origin: VideoOrigin | null;
}

export interface SavedEncounter {
  readonly word: SavedWord;
  readonly encounter: Encounter;
}

export type RevertResult = 'reverted' | 'changed';

export interface VocabularyOptions {
  readonly store?: SyncStore;
  readonly clock?: StampClock;
  readonly queue?: WriteQueue;
  readonly newId?: () => string;
  /** After each committed write, so sync can follow it. */
  readonly onWrite?: () => void;
}

export interface Vocabulary {
  list: () => Promise<readonly SavedWord[]>;
  reviewLog: () => Promise<readonly ReviewEvent[]>;
  has: (lemma: string, source: string) => Promise<boolean>;
  /** Saves a new word, or adds this Encounter to one already saved. */
  save: (input: EncounterInput, now: number) => Promise<SavedEncounter>;
  /** Records a saved word met again, leaving its schedule alone. */
  addEncounter: (
    input: EncounterInput,
    now: number,
  ) => Promise<SavedEncounter | null>;
  setTranslation: (
    wordId: string,
    encounterId: string,
    translation: string,
  ) => Promise<void>;
  grade: (
    wordId: string,
    encounterId: string,
    grade: Grade,
    now: number,
  ) => Promise<SavedWord | null>;
  retire: (wordId: string, now: number) => Promise<SavedWord | null>;
  /** Puts a Retired word back at the start of the schedule. */
  restore: (wordId: string, now: number) => Promise<SavedWord | null>;
  /**
   * Undoes a grade or retirement by putting the earlier schedule back. With a stamp, it is
   * refused if the schedule has moved on since, such as on another device.
   */
  revert: (
    word: SavedWord,
    removeEventAt: number | null,
    expectedStamp?: string | null,
  ) => Promise<RevertResult>;
  /** Deletes the word and its review history. */
  remove: (wordId: string) => Promise<void>;
  removeByLemma: (lemma: string, source: string) => Promise<void>;
}

const WORD_ID_SEPARATOR = ':';

/** Regional tracks such as en and en-US hold the same word, so they share one Card. */
export const wordIdOf = (lemma: string, source: string) =>
  `${languageIdentity(source)}${WORD_ID_SEPARATOR}${lemma}`;

const sameMoment = (a: Encounter, input: EncounterInput) =>
  a.origin?.videoId === input.origin?.videoId &&
  a.cues[a.currentCue]?.original === input.cues[input.currentCue]?.original;

const toReviewEvent = (event: ReviewEventDoc): ReviewEvent => ({
  wordId: event.wordId,
  encounterId: event.encounterId,
  grade: event.grade,
  levelBefore: event.levelBefore,
  levelAfter: event.levelAfter,
  at: event.at,
});

const wordKey = (id: string): OutboxKey => `word:${id}`;
const eventKey = (id: string): OutboxKey => `event:${id}`;

/**
 * The Saved Words of one account. Every write commits to the local database together with
 * its outbox entry, and sync follows in the background. Rules are in docs/SYNC.md.
 */
export function createVocabulary(options: VocabularyOptions = {}): Vocabulary {
  const store = options.store ?? createMemoryStore();
  const clock = options.clock ?? createStampClock('local');
  const queued = options.queue ?? createWriteQueue();
  const newId = options.newId ?? (() => crypto.randomUUID());

  const commit = async (change: StoreCommit) => {
    await store.commit({
      ...change,
      meta: { ...change.meta, stamp: clock.latest() },
    });
    options.onWrite?.();
  };

  /** Stores a changed document with the version the outbox must send. */
  const changeDoc = (
    doc: WordDoc,
    rev: number,
    stamp: Stamp,
    extra: StoreCommit = {},
  ) =>
    commit({
      ...extra,
      words: [{ doc, rev }],
      queue: [[wordKey(doc.id), stamp], ...(extra.queue ?? [])],
    });

  const list = async () =>
    (await store.allWords())
      .map((word) => viewOf(word.doc))
      .filter((word) => word !== null);

  const withLife = (doc: WordDoc, life: WordLife): WordDoc => ({
    ...doc,
    lives: { ...doc.lives, [life.birth]: life },
  });

  const newEncounter = (input: EncounterInput, now: number): Encounter => ({
    id: newId(),
    cues: input.cues,
    currentCue: input.currentCue,
    translation: null,
    form: input.form,
    formOffset: input.formOffset,
    origin: input.origin,
    meaning: null,
    savedAt: now,
  });

  const upsert = (
    rawInput: EncounterInput,
    now: number,
    createMissing: boolean,
  ): Promise<SavedEncounter | null> =>
    queued(async () => {
      const input = withoutNul(rawInput);
      const id = wordIdOf(input.entry.lemma, input.source);
      const stored = await store.getWord(id);
      const word = viewOf(stored?.doc);
      const life = stored ? newestLife(stored.doc) : null;
      if (stored && word && life) {
        const known = word.encounters.find((item) => sameMoment(item, input));
        if (known) return { word, encounter: known };
        const encounter = newEncounter(input, now);
        const doc = withLife(stored.doc, {
          ...life,
          forms: [...new Set([...life.forms, input.form])].sort(),
          encounters: mergeEncounters(life.encounters, [encounter]),
        });
        await changeDoc(doc, stored.rev, clock.next());
        const next = viewOf(doc);
        if (!next) throw new Error('Word disappeared');
        return { word: next, encounter };
      }
      if (!createMissing) return null;
      const birth = clock.next();
      const encounter = newEncounter(input, now);
      const doc: WordDoc = {
        schema: DOC_SCHEMA,
        id,
        // A new life after a deletion: the tombstone must stay for devices that missed it.
        deleted: stored?.doc.deleted ?? null,
        lives: {
          [birth]: {
            birth,
            savedAt: now,
            entry: {
              stamp: birth,
              value: {
                ...input.entry,
                source: input.source,
                target: input.target,
              },
            },
            review: { stamp: birth, value: newReviewState(now) },
            forms: [input.form],
            encounters: [encounter],
          },
        },
      };
      await changeDoc(doc, stored?.rev ?? 0, birth);
      const next = viewOf(doc);
      if (!next) throw new Error('Word disappeared');
      return { word: next, encounter };
    });

  /** Writes a new schedule on the word's newest life. */
  const changeReview = (
    wordId: string,
    apply: (review: ReviewState) => ReviewState,
  ): Promise<SavedWord | null> =>
    queued(async () => {
      const stored = await store.getWord(wordId);
      const word = viewOf(stored?.doc);
      const life = stored ? newestLife(stored.doc) : null;
      if (!stored || !word || !life) return null;
      const stamp = clock.next();
      const doc = withLife(stored.doc, {
        ...life,
        review: { stamp, value: apply(word.review) },
      });
      await changeDoc(doc, stored.rev, stamp);
      return viewOf(doc);
    });

  const removeWord = (wordId: string) =>
    queued(async () => {
      const stored = await store.getWord(wordId);
      if (!stored || !viewOf(stored.doc)) return;
      const stamp = clock.next();
      const doc: WordDoc = { ...stored.doc, deleted: stamp, lives: {} };
      const events = (await store.allEvents()).filter(
        (event) => event.wordId === wordId && coveredByDeletion(event, doc),
      );
      await changeDoc(doc, stored.rev, stamp, {
        removeEvents: events.map((event) => event.id),
        unqueue: events.map((event) => eventKey(event.id)),
      });
    });

  return {
    list: () => queued(list),
    reviewLog: () =>
      queued(async () =>
        (await store.allEvents())
          .filter((event) => !event.undone)
          .sort((a, b) => a.at - b.at)
          .map(toReviewEvent),
      ),
    has: async (lemma, source) =>
      queued(
        async () =>
          viewOf((await store.getWord(wordIdOf(lemma, source)))?.doc) !== null,
      ),
    save: async (input, now) => {
      const saved = await upsert(input, now, true);
      if (!saved) throw new Error('收藏失敗');
      return saved;
    },
    addEncounter: (input, now) => upsert(input, now, false),
    setTranslation: (wordId, encounterId, translation) =>
      queued(async () => {
        const stored = await store.getWord(wordId);
        if (!stored) return;
        const lives = Object.fromEntries(
          Object.entries(stored.doc.lives).map(([birth, life]) => [
            birth,
            {
              ...life,
              encounters: life.encounters.map((item) =>
                item.id === encounterId
                  ? { ...item, translation: withoutNul(translation) }
                  : item,
              ),
            },
          ]),
        );
        await changeDoc({ ...stored.doc, lives }, stored.rev, clock.next());
      }),
    grade: (wordId, encounterId, grade, now) =>
      queued(async () => {
        const stored = await store.getWord(wordId);
        const word = viewOf(stored?.doc);
        const life = stored ? newestLife(stored.doc) : null;
        if (!stored || !word || !life) return null;
        const stamp = clock.next();
        const review = schedule(word.review, grade, now);
        const doc = withLife(stored.doc, {
          ...life,
          review: { stamp, value: review },
        });
        const event: ReviewEventDoc = {
          id: newId(),
          wordId,
          wordBirth: life.birth,
          undone: false,
          encounterId,
          grade,
          levelBefore: word.review.level,
          levelAfter: review.level,
          at: now,
        };
        await changeDoc(doc, stored.rev, stamp, {
          events: [event],
          queue: [[eventKey(event.id), stamp]],
        });
        return viewOf(doc);
      }),
    retire: (wordId, now) =>
      changeReview(wordId, (review) => ({
        ...review,
        retired: { reason: 'manual', at: now },
      })),
    restore: (wordId, now) =>
      changeReview(wordId, (review) => ({
        ...review,
        level: 0,
        dueAt: now,
        retired: null,
      })),
    revert: (earlier, removeEventAt, expectedStamp) =>
      queued(async () => {
        const stored = await store.getWord(earlier.id);
        const word = viewOf(stored?.doc);
        const life = stored ? newestLife(stored.doc) : null;
        if (!stored || !word || !life) return 'changed';
        if (expectedStamp && word.reviewStamp !== expectedStamp) {
          return 'changed';
        }
        const stamp = clock.next();
        // Only the schedule goes back: sentences and translations may be newer.
        const doc = withLife(stored.doc, {
          ...life,
          review: { stamp, value: earlier.review },
        });
        const event =
          removeEventAt === null
            ? undefined
            : (await store.allEvents()).find(
                (item) =>
                  item.wordId === earlier.id &&
                  item.at === removeEventAt &&
                  !item.undone,
              );
        // Marked, not removed: a removed event would return from another device.
        await changeDoc(
          doc,
          stored.rev,
          stamp,
          event
            ? {
                events: [{ ...event, undone: true }],
                queue: [[eventKey(event.id), stamp]],
              }
            : {},
        );
        return 'reverted';
      }),
    remove: removeWord,
    removeByLemma: (lemma, source) => removeWord(wordIdOf(lemma, source)),
  };
}

/** Words due now, oldest first. */
export function dueWords(
  words: readonly SavedWord[],
  now: number,
): readonly SavedWord[] {
  return words
    .filter(
      (word) =>
        !word.review.retired &&
        word.review.dueAt <= now &&
        word.encounters.length > 0,
    )
    .sort((a, b) => a.review.dueAt - b.review.dueAt);
}

/** Rotates through a word's sentences, so it is not recognised by one line alone. */
export function encounterForReview(word: SavedWord): Encounter | null {
  const { encounters, review } = word;
  return encounters[review.reviewCount % encounters.length] ?? null;
}

export const normalizeForm = (text: string) => text.toLocaleLowerCase();

/** The spellings to mark in subtitles. Retired words are left out to keep subtitles quiet. */
export function markedForms(
  words: readonly SavedWord[],
  language: string,
): ReadonlySet<string> {
  const identity = languageIdentity(language);
  const forms = new Set<string>();
  for (const word of words) {
    if (word.review.retired || languageIdentity(word.source) !== identity) {
      continue;
    }
    forms.add(normalizeForm(word.lemma));
    for (const form of word.forms) forms.add(normalizeForm(form));
  }
  return forms;
}
