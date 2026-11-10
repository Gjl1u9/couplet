import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFrequencyList, rankLookup } from './frequency';
import { wordCheckFor } from './word-check';

describe('wordCheckFor', () => {
  it('has a check only where a word list exists', () => {
    expect(wordCheckFor('en-US')?.scale).toBe('CEFR');
    expect(wordCheckFor('fr')).toBeNull();
  });

  // A row stands for a size, so its words must come from near that rank in the list.
  it('takes every row from near its size in the English list', () => {
    const rankOf = rankLookup(
      parseFrequencyList(
        readFileSync(
          new URL('../../../public/frequency/en.txt', import.meta.url),
          'utf8',
        ),
      ),
    );
    for (const row of wordCheckFor('en')?.rows ?? []) {
      for (const word of row.words) {
        const rank = rankOf(word) ?? Infinity;
        expect(rank, word).toBeGreaterThan(row.size * 0.75);
        expect(rank, word).toBeLessThan(row.size * 1.25);
      }
    }
  });
});
