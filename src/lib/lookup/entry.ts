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
