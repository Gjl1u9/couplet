import { describe, expect, it } from 'vitest';
import {
  formatDue,
  formatInterval,
  formatIntervalAdjective,
  formatTimestamp,
  isLongText,
  markWord,
  savedGroup,
  shortLabel,
} from './format';

describe('long saved phrases', () => {
  it('leaves words and short phrases alone', () => {
    expect(isLongText('give up')).toBe(false);
    expect(shortLabel('give up')).toBe('give up');
    expect(shortLabel('a'.repeat(24))).toBe('a'.repeat(24));
  });

  it('shortens the rest without a space before the ellipsis', () => {
    const phrase = 'we need to get rid of all the old stuff';
    expect(isLongText(phrase)).toBe(true);
    expect(shortLabel(phrase)).toBe('we need to get rid of al…');
    expect(shortLabel(`${'a'.repeat(23)} b`)).toBe(`${'a'.repeat(23)}…`);
  });

  it('never cuts an emoji in half', () => {
    expect(shortLabel('😀'.repeat(30))).toBe(`${'😀'.repeat(24)}…`);
  });
});

describe('markWord with a phrase', () => {
  it('marks the whole phrase where it was selected', () => {
    expect(
      markWord('Get rid of it, get rid of them', 'get rid of', 15),
    ).toEqual({
      before: 'Get rid of it, ',
      mark: 'get rid of',
      after: ' them',
    });
  });

  it('marks nothing when the phrase crosses into the next cue', () => {
    expect(markWord('we should get', 'get rid of', 10)).toBeNull();
  });
});

describe('formatInterval', () => {
  it('uses the largest fitting unit, in the right number', () => {
    expect(formatInterval(600)).toBe('10 min');
    expect(formatInterval(3600)).toBe('1 hour');
    expect(formatInterval(7200)).toBe('2 hours');
    expect(formatInterval(86400)).toBe('1 day');
    expect(formatInterval(3 * 86400)).toBe('3 days');
  });

  it('has a form for use before a noun', () => {
    expect(formatIntervalAdjective(600)).toBe('10-min');
    expect(formatIntervalAdjective(86400)).toBe('1-day');
    expect(formatIntervalAdjective(14 * 86400)).toBe('14-day');
  });
});

describe('formatTimestamp', () => {
  it('formats short and long videos', () => {
    expect(formatTimestamp(204_900)).toBe('3:24');
    expect(formatTimestamp(3_728_000)).toBe('1:02:08');
  });
});

describe('formatDue', () => {
  it('says now for anything already due', () => {
    expect(formatDue(5, 10)).toBe('Now');
    expect(formatDue(600_000, 0)).toBe('In 10 min');
  });
});

describe('savedGroup', () => {
  const now = new Date(2026, 10, 6, 9).getTime();
  it('groups by local day', () => {
    expect(savedGroup(new Date(2026, 10, 6, 0, 1).getTime(), now)).toBe(
      'Today',
    );
    expect(savedGroup(new Date(2026, 10, 5, 23).getTime(), now)).toBe(
      'Yesterday',
    );
    expect(savedGroup(new Date(2026, 10, 4, 23).getTime(), now)).toBe(
      'Earlier',
    );
  });
});

describe('markWord', () => {
  it('uses the saved offset when a word appears twice', () => {
    expect(markWord('bank to bank', 'bank', 8)).toEqual({
      before: 'bank to ',
      mark: 'bank',
      after: '',
    });
  });

  it('falls back to a search that ignores case', () => {
    expect(markWord('The Bank is', 'bank', null)?.mark).toBe('Bank');
    expect(markWord('The Bank is', 'bank', 99)?.before).toBe('The ');
  });

  it('marks nothing when the word is absent', () => {
    expect(markWord('a river', 'bank', null)).toBeNull();
  });
});
