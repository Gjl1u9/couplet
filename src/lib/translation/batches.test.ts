import { describe, expect, it } from 'vitest';
import { createBatches, normalizeCueText, type Cue } from './batches';

const cue = (i: number, text = `line ${String(i)}`): Cue => ({
  id: `c${String(i)}`,
  start: i,
  end: i + 1,
  text,
});

const ids = (batches: ReturnType<typeof createBatches>) =>
  batches.map((b) => b.items.map((item) => item.id));

describe('normalizeCueText', () => {
  it('把換行換成空格，避免翻譯結果被斷開', () => {
    expect(normalizeCueText('humans are not supposed to pull\ntwo --')).toBe(
      'humans are not supposed to pull two --',
    );
  });

  it('合併多餘空白並去掉頭尾', () => {
    expect(normalizeCueText('  a \r\n\n  b\t c  ')).toBe('a b c');
  });
});

describe('createBatches', () => {
  it('依句數切批，並保持順序', () => {
    const batches = createBatches(
      [0, 1, 2, 3, 4].map((i) => cue(i)),
      {
        maxCues: 2,
        maxChars: 1000,
      },
    );
    expect(ids(batches)).toEqual([['c0', 'c1'], ['c2', 'c3'], ['c4']]);
  });

  it('依字元數切批，換行分隔也計入', () => {
    const batches = createBatches(
      [cue(0, 'aaaa'), cue(1, 'bbbb'), cue(2, 'cc')],
      { maxCues: 10, maxChars: 9 },
    );
    expect(ids(batches)).toEqual([['c0', 'c1'], ['c2']]);

    const tight = createBatches([cue(0, 'aaaa'), cue(1, 'bbbb')], {
      maxCues: 10,
      maxChars: 8,
    });
    expect(ids(tight)).toEqual([['c0'], ['c1']]);
  });

  it('單句超過上限時自成一批，不會被丟掉', () => {
    const batches = createBatches(
      [cue(0, 'a'), cue(1, 'x'.repeat(50)), cue(2, 'b')],
      { maxCues: 10, maxChars: 10 },
    );
    expect(ids(batches)).toEqual([['c0'], ['c1'], ['c2']]);
  });

  it('跳過空白字幕，也不會產生空批次', () => {
    const batches = createBatches([cue(0, '  \n '), cue(1, ''), cue(2, 'ok')], {
      maxCues: 10,
      maxChars: 100,
    });
    expect(ids(batches)).toEqual([['c2']]);
    expect(
      createBatches([cue(0, ' ')], { maxCues: 10, maxChars: 100 }),
    ).toEqual([]);
  });

  it('送出的文字已經整理過', () => {
    const [batch] = createBatches([cue(0, 'a\nb')], {
      maxCues: 10,
      maxChars: 100,
    });
    expect(batch?.items[0]?.text).toBe('a b');
  });

  it('批次時間涵蓋裡面的字幕，字幕重疊時取最大的結束時間', () => {
    const [batch] = createBatches(
      [
        { id: 'a', start: 5, end: 20, text: 'a' },
        { id: 'b', start: 6, end: 8, text: 'b' },
      ],
      { maxCues: 10, maxChars: 100 },
    );
    expect(batch?.start).toBe(5);
    expect(batch?.end).toBe(20);
  });
});
