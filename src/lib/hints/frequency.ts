import { languageBase } from '../language';

/** Learning languages with a word list in public/frequency. */
const LISTED = new Set(['en']);

export const FREQUENCY_MESSAGE_TYPE = 'frequency';

export interface FrequencyMessage {
  readonly type: typeof FREQUENCY_MESSAGE_TYPE;
  readonly language: string;
}

export function isFrequencyMessage(
  message: unknown,
): message is FrequencyMessage {
  const value = message as Partial<FrequencyMessage> | null;
  return (
    value?.type === FREQUENCY_MESSAGE_TYPE && typeof value.language === 'string'
  );
}

/** The list a language uses, such as `en` for `en-GB`, or `null` when there is none. */
export function frequencyLanguage(language: string): string | null {
  const base = languageBase(language);
  return LISTED.has(base) ? base : null;
}

/** Splits a list file into its words, most common first. */
export function parseFrequencyList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A word's place in the list, from 1, or `undefined` when it is not listed. */
export type RankOf = (form: string) => number | undefined;

export function rankLookup(words: readonly string[]): RankOf {
  const ranks = new Map<string, number>();
  words.forEach((word, index) => {
    if (!ranks.has(word)) ranks.set(word, index + 1);
  });
  return (form) => ranks.get(form);
}

/** Background: answers with the list's text, which ships inside the extension. */
export function answerFrequencyMessage(
  message: FrequencyMessage,
  read: (path: string) => Promise<string>,
  respond: (response: string | null) => void,
): void {
  const language = frequencyLanguage(message.language);
  if (!language) {
    respond(null);
    return;
  }
  read(`/frequency/${language}.txt`).then(respond, () => {
    respond(null);
  });
}
