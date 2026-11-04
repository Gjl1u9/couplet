import { describe, expect, it } from 'vitest';
import { parseCaptions, selectSourceTrack } from './captions';

describe('selectSourceTrack', () => {
  const en = { languageCode: 'en' };
  const asr = { languageCode: 'en', kind: 'asr' };
  const fr = { languageCode: 'fr' };

  it('選預設音軌對應的字幕', () => {
    expect(
      selectSourceTrack({
        captionTracks: [fr, en, asr],
        audioTracks: [
          { defaultCaptionTrackIndex: 0 },
          { defaultCaptionTrackIndex: 1 },
        ],
        defaultAudioTrackIndex: 1,
      }),
    ).toBe(en);
  });

  it('沒有指定音軌時用第一條音軌', () => {
    expect(
      selectSourceTrack({
        captionTracks: [fr, en],
        audioTracks: [{ defaultCaptionTrackIndex: 1 }],
      }),
    ).toBe(en);
  });

  it('索引無效時優先選自動字幕，其次第一條', () => {
    expect(
      selectSourceTrack({
        captionTracks: [fr, asr],
        audioTracks: [{ defaultCaptionTrackIndex: 9 }],
      }),
    ).toBe(asr);
    expect(selectSourceTrack({ captionTracks: [fr, en] })).toBe(fr);
  });

  it('沒有字幕時回傳 null', () => {
    expect(selectSourceTrack(null)).toBeNull();
    expect(selectSourceTrack(undefined)).toBeNull();
    expect(selectSourceTrack({ captionTracks: [] })).toBeNull();
  });
});

describe('parseCaptions：人工字幕', () => {
  it('對應真實格式，換算時間並略過空事件', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 5000 },
        {
          tStartMs: 13120,
          dDurationMs: 4416,
          segs: [{ utf8: 'Seven years ago,\nand asked me' }],
        },
        { tStartMs: 17560, dDurationMs: 1976, segs: [{ utf8: '\n' }] },
        {
          tStartMs: 18000,
          dDurationMs: 1000,
          segs: [{ utf8: 'He ' }, { utf8: 'said' }],
        },
      ],
    });
    expect(parseCaptions(body, null)).toEqual([
      {
        id: 'm0',
        start: 13.12,
        end: 17.536,
        text: 'Seven years ago,\nand asked me',
      },
      { id: 'm1', start: 18, end: 19, text: 'He said' },
    ]);
  });

  it('前一句和下一句重疊時，結束時間截到下一句開始', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'a' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'b' }] },
      ],
    });
    expect(parseCaptions(body, null)[0]?.end).toBe(2);
  });

  it('沒有 events 時回傳空陣列', () => {
    expect(parseCaptions('{}', null)).toEqual([]);
  });

  it('格式錯誤時丟出錯誤，由呼叫端處理', () => {
    expect(() => parseCaptions('not json', null)).toThrow();
  });
});

describe('parseCaptions：自動字幕', () => {
  const asr = (
    tStartMs: number,
    dDurationMs: number,
    words: readonly (readonly [string, number])[],
  ) => ({
    tStartMs,
    dDurationMs,
    wWinId: 1,
    segs: words.map(([utf8, tOffsetMs]) => ({ utf8, tOffsetMs })),
  });
  const parse = (events: readonly unknown[]) =>
    parseCaptions(JSON.stringify({ events }), 'asr');

  it('略過換行事件，把逐字合併成句子', () => {
    const cues = parse([
      { tStartMs: 0, dDurationMs: 6981760 },
      asr(199, 4721, [
        ['hi', 0],
        [' everyone', 240],
        [' so', 400],
      ]),
      {
        tStartMs: 2510,
        dDurationMs: 2410,
        wWinId: 1,
        aAppend: 1,
        segs: [{ utf8: '\n' }],
      },
    ]);
    expect(cues).toEqual([
      { id: 'a0', start: 0.199, end: 4.92, text: 'hi everyone so' },
    ]);
  });

  it('有足夠字數且停頓時斷句，下一句不會和上一句重疊', () => {
    const cues = parse([
      asr(0, 3000, [
        ['a', 0],
        [' b', 100],
        [' c', 200],
        [' d', 300],
        [' e', 1000],
        [' f', 1100],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['a b c d', 'e f']);
    expect(cues[0]?.end).toBe(1);
    expect(cues[1]?.start).toBe(1);
    expect(cues[1]?.end).toBe(3);
  });

  it('念比較久的長字不算停頓', () => {
    const cues = parse([
      asr(0, 5000, [
        ['a', 0],
        [' b', 100],
        [' c', 200],
        [' internationalization', 300],
        [' now', 1500],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['a b c internationalization now']);
  });

  it('長字念完後還有明顯空檔才斷句', () => {
    const cues = parse([
      asr(0, 5000, [
        ['a', 0],
        [' b', 100],
        [' c', 200],
        [' internationalization', 300],
        [' now', 2800],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual([
      'a b c internationalization',
      'now',
    ]);
  });

  it('字數太少時，停頓也不斷句', () => {
    const cues = parse([
      asr(0, 3000, [
        ['a', 0],
        [' b', 1000],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['a b']);
  });

  it('超過最大字數時斷句', () => {
    const words = Array.from(
      { length: 15 },
      (_, i): readonly [string, number] => [`w${String(i)}`, i * 100],
    );
    const cues = parse([asr(0, 3000, words)]);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text.split(' ')).toHaveLength(14);
    expect(cues[1]?.text).toBe('w14');
  });

  it('中文和日文不會被插入空格', () => {
    const cues = parse([
      asr(0, 3000, [
        ['今日は', 0],
        ['天気が', 100],
      ]),
      asr(3000, 3000, [['いいです', 0]]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['今日は天気がいいです']);
  });

  it('英文跨事件時補上空格，已有的空格不會重複', () => {
    const cues = parse([
      asr(0, 1000, [
        ['hi', 0],
        [' there', 100],
      ]),
      asr(1000, 1000, [
        ['big', 0],
        [' world', 100],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['hi there big world']);
  });

  it('韓文保留空格', () => {
    const cues = parse([
      asr(0, 1000, [['안녕하세요', 0]]),
      asr(1000, 1000, [['여러분', 0]]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['안녕하세요 여러분']);
  });

  it('句尾標點後面有空白也算', () => {
    const cues = parse([
      asr(0, 3000, [
        ['Yes. ', 0],
        ['Next', 100],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['Yes.', 'Next']);
  });

  it('遇到句尾標點時斷句', () => {
    const cues = parse([
      asr(0, 3000, [
        ['Yes.', 0],
        ['Next', 100],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['Yes.', 'Next']);
  });
});
