import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCaptions } from './captions';
import { describeCaptions } from './dev-dump';

/**
 * Real automatic captions from YouTube: the first 28 seconds of an esports broadcast. The
 * line-level file is the same track with each event's segments joined, the way YouTube
 * sometimes serves it. See docs/DEBUGGING.md for capturing another.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');

const WORD_LEVEL = fixture('asr-word-level');
const LINE_LEVEL = fixture('asr-line-level');

const words = (body: string) =>
  parseCaptions(body, 'asr')
    .map((cue) => cue.text)
    .join(' ')
    .split(/\s+/);

describe('real automatic captions', () => {
  test.each([
    ['word-level', WORD_LEVEL],
    ['line-level', LINE_LEVEL],
  ])('%s cues stay short enough to read', (_, body) => {
    const cues = parseCaptions(body, 'asr');
    expect(cues.length).toBeGreaterThanOrEqual(10);
    for (const cue of cues) expect(cue.text.length).toBeLessThanOrEqual(100);
  });

  test('both forms keep every word in order', () => {
    expect(words(LINE_LEVEL)).toEqual(words(WORD_LEVEL));
  });

  test('both forms split into about as many cues', () => {
    const word = parseCaptions(WORD_LEVEL, 'asr').length;
    const line = parseCaptions(LINE_LEVEL, 'asr').length;
    expect(Math.abs(word - line)).toBeLessThanOrEqual(2);
  });
});

describe('describeCaptions', () => {
  const event = (body: string) =>
    ({
      type: 'captions',
      videoId: 'v1',
      lang: 'en',
      kind: 'asr',
      status: 200,
      body,
    }) as const;

  test('tells word-level captions from line-level ones', () => {
    const word = describeCaptions(event(WORD_LEVEL), false);
    const line = describeCaptions(event(LINE_LEVEL), false);
    expect(word.multiWordSegments / word.segments).toBeLessThan(0.2);
    expect(line.multiWordSegments / line.segments).toBeGreaterThan(0.5);
  });

  test('reports the parsed cues', () => {
    const dump = describeCaptions(event(WORD_LEVEL), false);
    expect(dump.cues).toBe(parseCaptions(WORD_LEVEL, 'asr').length);
    expect(dump.maxCueChars).toBe(dump.longestCue.length);
    expect(dump.medianCueChars).toBeGreaterThan(0);
    expect(dump).not.toHaveProperty('body');
  });

  test('includes the body only when asked', () => {
    expect(describeCaptions(event(WORD_LEVEL), true).body).toBe(WORD_LEVEL);
  });
});
