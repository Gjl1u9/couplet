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

  it('還沒翻譯時 translation 是 null，翻好後才有值', () => {
    const s = store();
    expect(s.cueAt(1)?.translation).toBeNull();
    s.setTranslation('a', '甲');
    expect(s.cueAt(1)).toEqual({ id: 'a', text: 'A', translation: '甲' });
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
