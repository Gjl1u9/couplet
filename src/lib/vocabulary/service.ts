import { sameLanguage } from '../language';
import type { LanguagePair } from '../translation/google';
import type { Translate } from '../translation/queue';
import { joinText } from '../youtube/captions';
import type { Grade } from './schedule';
import type {
  EncounterInput,
  ReviewEvent,
  RevertResult,
  SavedEncounter,
  SavedWord,
  Vocabulary,
  WordStatus,
} from './vocabulary';

const MESSAGE_TYPE = 'vocabulary';

/**
 * Every write goes through the background script. Each page would otherwise keep its
 * own write queue, and a video tab and the Dashboard could overwrite each other.
 */
export type VocabularyCommand =
  | { readonly op: 'list' }
  | { readonly op: 'reviewLog' }
  | { readonly op: 'has'; readonly lemma: string; readonly source: string }
  | { readonly op: 'status'; readonly lemma: string; readonly source: string }
  | { readonly op: 'save'; readonly input: EncounterInput }
  | { readonly op: 'addEncounter'; readonly input: EncounterInput }
  | {
      readonly op: 'fillTranslation';
      readonly wordId: string;
      readonly encounterId: string;
    }
  | {
      readonly op: 'grade';
      readonly wordId: string;
      readonly encounterId: string;
      readonly grade: Grade;
    }
  | { readonly op: 'retire'; readonly wordId: string }
  | { readonly op: 'restore'; readonly wordId: string }
  | {
      readonly op: 'revert';
      readonly word: SavedWord;
      readonly removeEventAt: number | null;
      readonly expectedStamp: string | null;
    }
  | { readonly op: 'remove'; readonly wordId: string }
  | {
      readonly op: 'removeByLemma';
      readonly lemma: string;
      readonly source: string;
    };

export interface VocabularyServiceOptions {
  readonly vocabulary: Vocabulary;
  readonly createTranslate: (languages: LanguagePair) => Translate;
  readonly now?: () => number;
  readonly onError?: (message: string, error: unknown) => void;
}

/** Translates all of an Encounter's cues as one text, and stores the result. */
async function fillTranslation(
  { vocabulary, createTranslate }: VocabularyServiceOptions,
  wordId: string,
  encounterId: string,
): Promise<string | null> {
  const word = (await vocabulary.list()).find((item) => item.id === wordId);
  const encounter = word?.encounters.find((item) => item.id === encounterId);
  if (!word || !encounter) return null;
  if (encounter.translation !== null) return encounter.translation;
  if (sameLanguage(word.source, word.target)) return null;
  const text = encounter.cues
    .map((cue) => cue.original)
    .reduce(joinText, '')
    .trim();
  const translate = createTranslate({
    source: word.source,
    target: word.target,
  });
  const [translation] = await translate([text], new AbortController().signal);
  if (!translation) return null;
  await vocabulary.setTranslation(wordId, encounterId, translation);
  return translation;
}

export function createVocabularyService(options: VocabularyServiceOptions) {
  const { vocabulary } = options;
  const now = options.now ?? Date.now;

  /** The Card retries later, so a failure here costs nothing but a log line. */
  const translateInBackground = (saved: SavedEncounter | null) => {
    if (!saved) return;
    fillTranslation(options, saved.word.id, saved.encounter.id).catch(
      (error: unknown) => {
        options.onError?.('情境翻譯失敗', error);
      },
    );
  };

  return async (command: VocabularyCommand): Promise<unknown> => {
    switch (command.op) {
      case 'list':
        return vocabulary.list();
      case 'reviewLog':
        return vocabulary.reviewLog();
      case 'has':
        return vocabulary.has(command.lemma, command.source);
      case 'status':
        return vocabulary.status(command.lemma, command.source);
      case 'save': {
        const saved = await vocabulary.save(command.input, now());
        translateInBackground(saved);
        return saved.word;
      }
      case 'addEncounter': {
        const saved = await vocabulary.addEncounter(command.input, now());
        translateInBackground(saved);
        return saved?.word ?? null;
      }
      case 'fillTranslation':
        return fillTranslation(options, command.wordId, command.encounterId);
      case 'grade':
        return vocabulary.grade(
          command.wordId,
          command.encounterId,
          command.grade,
          now(),
        );
      case 'retire':
        return vocabulary.retire(command.wordId, now());
      case 'restore':
        return vocabulary.restore(command.wordId, now());
      case 'revert':
        return vocabulary.revert(
          command.word,
          command.removeEventAt,
          command.expectedStamp,
        );
      case 'remove':
        await vocabulary.remove(command.wordId);
        return null;
      case 'removeByLemma':
        await vocabulary.removeByLemma(command.lemma, command.source);
        return null;
    }
  };
}

interface VocabularyMessage {
  readonly type: typeof MESSAGE_TYPE;
  readonly command: VocabularyCommand;
}

type VocabularyResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

export function isVocabularyMessage(
  message: unknown,
): message is VocabularyMessage {
  return (message as { type?: unknown } | null)?.type === MESSAGE_TYPE;
}

/** Keeps the message channel open by answering through `respond`. */
export function answerVocabularyMessage(
  message: VocabularyMessage,
  handle: (command: VocabularyCommand) => Promise<unknown>,
  respond: (response: VocabularyResponse) => void,
): void {
  handle(message.command).then(
    (value) => {
      respond({ ok: true, value });
    },
    (error: unknown) => {
      respond({ ok: false, error: String(error) });
    },
  );
}

export interface VocabularyClient {
  list: () => Promise<readonly SavedWord[]>;
  reviewLog: () => Promise<readonly ReviewEvent[]>;
  has: (lemma: string, source: string) => Promise<boolean>;
  status: (lemma: string, source: string) => Promise<WordStatus>;
  save: (input: EncounterInput) => Promise<SavedWord>;
  addEncounter: (input: EncounterInput) => Promise<SavedWord | null>;
  fillTranslation: (
    wordId: string,
    encounterId: string,
  ) => Promise<string | null>;
  grade: (
    wordId: string,
    encounterId: string,
    grade: Grade,
  ) => Promise<SavedWord | null>;
  retire: (wordId: string) => Promise<SavedWord | null>;
  restore: (wordId: string) => Promise<SavedWord | null>;
  /** With a stamp, refused if the schedule has moved on, such as on another device. */
  revert: (
    word: SavedWord,
    removeEventAt: number | null,
    expectedStamp?: string | null,
  ) => Promise<RevertResult>;
  remove: (wordId: string) => Promise<void>;
  removeByLemma: (lemma: string, source: string) => Promise<void>;
}

export function createVocabularyClient(
  sendMessage: (message: VocabularyMessage) => Promise<unknown>,
): VocabularyClient {
  const send = async <T>(command: VocabularyCommand): Promise<T> => {
    const response = (await sendMessage({
      type: MESSAGE_TYPE,
      command,
    })) as VocabularyResponse | undefined;
    if (!response) throw new Error('背景程式沒有回應');
    if (!response.ok) throw new Error(response.error);
    return response.value as T;
  };
  return {
    list: () => send({ op: 'list' }),
    reviewLog: () => send({ op: 'reviewLog' }),
    has: (lemma, source) => send({ op: 'has', lemma, source }),
    status: (lemma, source) => send({ op: 'status', lemma, source }),
    save: (input) => send({ op: 'save', input }),
    addEncounter: (input) => send({ op: 'addEncounter', input }),
    fillTranslation: (wordId, encounterId) =>
      send({ op: 'fillTranslation', wordId, encounterId }),
    grade: (wordId, encounterId, grade) =>
      send({ op: 'grade', wordId, encounterId, grade }),
    retire: (wordId) => send({ op: 'retire', wordId }),
    restore: (wordId) => send({ op: 'restore', wordId }),
    revert: (word, removeEventAt, expectedStamp) =>
      send({
        op: 'revert',
        word,
        removeEventAt,
        expectedStamp: expectedStamp ?? null,
      }),
    remove: (wordId) => send({ op: 'remove', wordId }),
    removeByLemma: (lemma, source) =>
      send({ op: 'removeByLemma', lemma, source }),
  };
}
