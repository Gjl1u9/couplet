import type { LanguagePair } from '../translation/google';

/** A clicked token, with the cue it appears in. */
export interface WordInCue {
  readonly word: string;
  readonly sentence: string;
  /** Where the word starts in the sentence, since a word can appear twice. */
  readonly offset: number;
}

/** One meaning of a word, with an example showing it in use. */
export interface Sense {
  readonly meaning: string;
  readonly example: string;
  readonly translation: string;
}

/** What the Lookup Panel shows for a word. */
export interface WordEntry {
  /** The dictionary form, such as `observe` for `observing`. */
  readonly lemma: string;
  readonly phonetic: string | null;
  /** The most common meanings first, one or two of them. */
  readonly senses: readonly Sense[];
}

export interface LookupService {
  /** Resolves to `null` when both languages match, so there is nothing to translate. */
  lookUp: (
    word: string,
    languages: LanguagePair,
    signal: AbortSignal,
  ) => Promise<WordEntry | null>;
}
