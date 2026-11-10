import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokenizeCaption } from './tokenize';

/**
 * Scores Japanese splitting against a hand-made reference for every line of one video,
 * BMqqIz7H8Bg. In the reference, `|` is a boundary a split must have, and `¦` one it
 * may have, such as between a noun and です. A token counts as meaningful when it starts
 * and ends on a boundary and crosses no required one.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')
    .trim()
    .split('\n');

const LETTER = /[\p{L}\p{N}ー]/u;
const letters = (text: string) =>
  Array.from(
    text.matchAll(new RegExp(LETTER, 'gu')),
    ([character]) => character,
  ).join('');

interface Score {
  readonly meaningful: number;
  readonly total: number;
  readonly misses: readonly string[];
}

function score(lines: readonly string[], reference: readonly string[]): Score {
  let meaningful = 0;
  let total = 0;
  const misses: string[] = [];
  lines.forEach((line, index) => {
    const marked = reference[index] ?? '';
    const required = new Set([0]);
    const optional = new Set<number>();
    let at = 0;
    for (const piece of marked.split(/ ([|¦]) /u)) {
      if (piece === '|') required.add(at);
      else if (piece === '¦') optional.add(at);
      else at += letters(piece).length;
    }
    required.add(at);
    const isBoundary = (offset: number) =>
      required.has(offset) || optional.has(offset);
    let start = 0;
    for (const part of tokenizeCaption(line, 'ja')) {
      const token = letters(part.text);
      if (!part.isToken || token === '') continue;
      const end = start + token.length;
      let ok = isBoundary(start) && isBoundary(end);
      for (let offset = start + 1; ok && offset < end; offset++) {
        if (required.has(offset)) ok = false;
      }
      total++;
      if (ok) meaningful++;
      else misses.push(`${String(index + 1)}: ${token} in ${marked}`);
      start = end;
    }
  });
  return { meaningful, total, misses };
}

describe('Japanese splitting benchmark', () => {
  const lines = fixture('japanese-yakushima.txt');
  const reference = fixture('japanese-yakushima.gold.txt');

  it('has a reference for every line, with the same letters', () => {
    expect(reference).toHaveLength(lines.length);
    lines.forEach((line, index) => {
      expect(letters((reference[index] ?? '').replace(/[|¦]/gu, ''))).toBe(
        letters(line),
      );
    });
  });

  // The goal is 95%; the bar sits just under today's score to catch regressions.
  it('splits at least 98% of tokens into meaningful units', () => {
    const { meaningful, total, misses } = score(lines, reference);
    const share = meaningful / total;
    expect(share, misses.join('\n')).toBeGreaterThanOrEqual(0.98);
  });
});
