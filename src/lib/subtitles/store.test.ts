import { describe, expect, it } from 'vitest';
import { SubtitleStore } from './store';

const store = () =>
  new SubtitleStore([
    { id: 'b', start: 10, end: 12, text: 'B' },
    { id: 'a', start: 1, end: 3, text: 'A' },
    { id: 'c', start: 12, end: 15, text: 'C' },
  ]);

describe('SubtitleStore', () => {
  it.each([
    [0, null],
    [1, 'a'],
    [2.9, 'a'],
    [3, null],
    [5, null],
    [10, 'b'],
    [12, 'c'],
    [14.99, 'c'],
    [15, null],
    [99, null],
  ])('時間 %d 對應字幕 %s', (time, id) => {
    expect(store().cueAt(time)?.id ?? null).toBe(id);
  });

  it('includes the neighbouring cues', () => {
    const s = new SubtitleStore([
      { id: 'a', start: 0, end: 1, text: 'A' },
      { id: 'b', start: 1, end: 2, text: 'B' },
      { id: 'c', start: 2, end: 3, text: 'C' },
    ]);
    expect(s.cueAt(0.5)).toMatchObject({ previous: null, next: 'B' });
    expect(s.cueAt(1.5)).toMatchObject({ previous: 'A', next: 'C' });
    expect(s.cueAt(2.5)).toMatchObject({ previous: 'B', next: null });
  });

  it('還沒翻譯時 translation 是 null，翻好後才有值', () => {
    const s = store();
    expect(s.cueAt(1)?.translation).toBeNull();
    s.setTranslation('a', '甲');
    expect(s.cueAt(1)).toMatchObject({ id: 'a', text: 'A', translation: '甲' });
  });

  it.each([
    [0, 1],
    [1, 3],
    [3, 10],
    [11, 12],
    [12, 15],
    [15, null],
  ])('時間 %d 之後下一次變化是 %s', (time, expected) => {
    expect(store().nextChangeAfter(time)).toBe(expected);
  });

  it('空字幕也能查詢', () => {
    const s = new SubtitleStore([]);
    expect(s.cueAt(1)).toBeNull();
    expect(s.nextChangeAfter(1)).toBeNull();
  });
});

describe('SubtitleStore.contextFor', () => {
  const store = new SubtitleStore([
    { id: 'a', start: 1, end: 2, text: 'one' },
    { id: 'b', start: 2, end: 3, text: 'two' },
    { id: 'c', start: 3, end: 4, text: 'three' },
  ]);

  it('returns the cue and both neighbours', () => {
    expect(store.contextFor(2.5, 'two')).toEqual({
      cues: [
        { original: 'one', startMs: 1000 },
        { original: 'two', startMs: 2000 },
        { original: 'three', startMs: 3000 },
      ],
      currentCue: 1,
    });
  });

  it('finds a word clicked in a Context Line', () => {
    expect(store.contextFor(2.5, 'one')).toMatchObject({
      currentCue: 0,
      cues: [{ original: 'one' }, { original: 'two' }],
    });
    expect(store.contextFor(2.5, 'three')?.cues).toHaveLength(2);
  });

  it('has no context for text it does not know', () => {
    expect(store.contextFor(2.5, 'four')).toBeNull();
  });
});
