import type { Sense, WordEntry } from './types';

const MAX_SENSES = 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim() || null : null;

function toSense(value: unknown): Sense | null {
  if (!isRecord(value)) return null;
  const meaning = text(value.meaning);
  const example = text(value.example);
  const translation = text(value.translation);
  return meaning && example && translation
    ? { meaning, example, translation }
    : null;
}

/**
 * Each meaning shows as its own chip, so a model that still lists alternatives
 * in one meaning does not bring punctuation into the interface.
 */
export function splitMeaning(meaning: string): string[] {
  return meaning
    .split(/[,，;；、/／]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The longest text the service accepts as a word, so also the longest saved phrase. */
export const MAX_WORD_LENGTH = 80;

/** A phrase's meaning is a translation, whose commas belong to it. */
export const meaningsOf = (sense: Sense): string[] =>
  sense.example ? splitMeaning(sense.meaning) : [sense.meaning];

/** Saving `Give Up` after `give  up` adds to the same Saved Word. */
export const phraseLemma = (text: string): string =>
  text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

/** A Selection as a Word Entry. Its translation is its one meaning, with no example. */
export const phraseEntry = (text: string, translation: string): WordEntry => ({
  lemma: phraseLemma(text),
  phonetic: null,
  senses: [{ meaning: translation, example: '', translation: '' }],
});

/** Checks untrusted data, and returns `null` unless it has a lemma and a usable sense. */
export function toWordEntry(value: unknown): WordEntry | null {
  if (!isRecord(value) || !Array.isArray(value.senses)) return null;
  const lemma = text(value.lemma);
  const senses = value.senses
    .map(toSense)
    .filter((sense) => sense !== null)
    .slice(0, MAX_SENSES);
  if (!lemma || senses.length === 0) return null;
  return { lemma, phonetic: text(value.phonetic), senses };
}
