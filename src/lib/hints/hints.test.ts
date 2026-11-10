import { describe, expect, it } from 'vitest';
import {
  frequencyLanguage,
  isFrequencyMessage,
  parseFrequencyList,
  rankLookup,
} from './frequency';
import { createHintPicker, hintForm, hintZone, type HintZone } from './hints';

// Ranks: the=1 ... common words fill the top, then the hint band.
const WORDS = [
  ...Array.from({ length: 300 }, (_, i) => `common${String(i)}`),
  'atmosphere',
  'isolated',
  'generation',
  'generations',
  'ancestors',
];
const rankOf = rankLookup(WORDS);
const ZONE: HintZone = { from: 250, to: 400 };

function picker(inVocabulary: (form: string) => boolean = () => false) {
  return createHintPicker({ rankOf, zone: () => ZONE, inVocabulary });
}

describe('hintZone', () => {
  it('starts from the Word Check until enough words are saved', () => {
    expect(hintZone(3000, [])).toEqual({ from: 3000, to: 7500 });
    expect(hintZone(null, [])).toBeNull();
  });

  it('moves up with saved words once there are enough', () => {
    const saved = Array.from({ length: 20 }, (_, i) => 1000 + i * 100);
    expect(hintZone(null, saved)?.from).toBe(1500);
    expect(hintZone(1000, saved)?.from).toBe(1500);
  });

  it('takes a higher Word Check at once, even with saved words', () => {
    const saved = Array.from({ length: 20 }, (_, i) => 1000 + i * 100);
    expect(hintZone(5000, saved)).toEqual({ from: 5000, to: 12500 });
  });

  it('never reaches into the most common words', () => {
    expect(hintZone(50, [])?.from).toBe(201);
  });
});

describe('createHintPicker', () => {
  it('hints the most common word in the zone, one per line', () => {
    const hints = picker();
    expect(hints.pick(['the', 'isolated', 'atmosphere', 'common5'])).toBe(2);
  });

  it('hints a word once a video, inflections included', () => {
    const hints = picker();
    expect(hints.pick(['generation'])).toBe(0);
    expect(hints.pick(['generations'])).toBeNull();
    hints.reset();
    expect(hints.pick(['Generations'])).toBe(0);
  });

  it('keeps the hint of a line shown again', () => {
    const hints = picker();
    const line = ['the', 'isolated', 'one'];
    expect(hints.pick(line)).toBe(1);
    expect(hints.pick(['an', 'isolated', 'place'])).toBeNull();
    expect(hints.pick(line)).toBe(1);
  });

  it('skips saved or known words, and words outside the zone', () => {
    const hints = picker((form) => form === 'atmosphere');
    expect(hints.pick(['atmosphere', 'common10'])).toBeNull();
    expect(hints.pick(['unlisted'])).toBeNull();
  });

  it('hints nothing without a zone', () => {
    const hints = createHintPicker({
      rankOf,
      zone: () => null,
      inVocabulary: () => false,
    });
    expect(hints.pick(['atmosphere'])).toBeNull();
  });
});

describe('frequency lists', () => {
  it('reads a list most common first', () => {
    const lookup = rankLookup(parseFrequencyList('you\ni\n\nthe\n'));
    expect(lookup('the')).toBe(3);
    expect(lookup('cat')).toBeUndefined();
  });

  it('knows which learning languages have a list', () => {
    expect(frequencyLanguage('en-GB')).toBe('en');
    expect(frequencyLanguage('ja')).toBeNull();
  });

  it('spells tokens the way the list does', () => {
    expect(hintForm("Don't")).toBe('dont');
    expect(hintForm('Isolated,')).toBe('isolated');
  });

  it('recognises its message', () => {
    expect(isFrequencyMessage({ type: 'frequency', language: 'en' })).toBe(
      true,
    );
    expect(isFrequencyMessage({ type: 'frequency' })).toBe(false);
  });
});
