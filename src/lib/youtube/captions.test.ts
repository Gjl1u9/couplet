import { describe, expect, it } from 'vitest';
import {
  parseCaptions,
  chooseTrack,
  selectLearningTrack,
  selectSourceTrack,
} from './captions';

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

  it('splits segments that hold whole lines, as YouTube sometimes sends', () => {
    const cues = parse([
      asr(0, 4000, [['Why can you scroll through your phone', 0]]),
      asr(2000, 4000, [
        ['\nfor an hour without noticing the time? But when you sit down', 0],
      ]),
      asr(6000, 2000, [['\nto study, you stop.', 0]]),
    ]);
    expect(cues.map((c) => c.text)).toEqual([
      'Why can you scroll through your phone for an hour without noticing the time?',
      'But when you sit down to study, you stop.',
    ]);
    expect(cues[1]?.start).toBeGreaterThan(2);
    expect(cues[1]?.start).toBeLessThan(6);
    expect(cues[1]?.end).toBe(8);
  });

  it('shares a segment’s time among its words by length', () => {
    const cues = parse([
      asr(0, 2000, [['aaa. b', 0]]),
      asr(4000, 1000, [['c', 0]]),
    ]);
    // "aaa." and "b" have 4 and 1 characters, so "b" starts 4/5 into 0–2000 ms.
    expect(cues.map((c) => [c.text, c.start])).toEqual([
      ['aaa.', 0],
      ['b c', 1.6],
    ]);
  });

  it('splits CJK sentences inside one segment', () => {
    const cues = parse([asr(0, 3000, [['今天天氣很好。我們出門吧', 0]])]);
    expect(cues.map((c) => c.text)).toEqual(['今天天氣很好。', '我們出門吧']);
  });

  it('attaches punctuation sent as its own segment to the word before it', () => {
    const cues = parse([
      asr(0, 3000, [
        ['health', 0],
        [' .', 200],
        [' First', 400],
        [' ,', 500],
        [' my', 600],
        [' view', 700],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual(['health.', 'First, my view']);
  });

  it('finishes a sentence that ends just past the word limit', () => {
    const words = Array.from(
      { length: 14 },
      (_, i): readonly [string, number] => [` w${String(i)}`, i * 100],
    );
    const cues = parse([
      asr(0, 3000, [...words, [' end?', 1400], [' next', 1500]]),
    ]);
    expect(cues.map((c) => c.text.split(' ').length)).toEqual([15, 1]);
    expect(cues[0]?.text.endsWith('end?')).toBe(true);
  });

  it('breaks long cues by characters, after the last clause', () => {
    const long = (i: number): readonly [string, number] => [
      ` internationalization${String(i)}`,
      i * 100,
    ];
    const cues = parse([
      asr(0, 5000, [long(0), long(1), long(2), [' ok,', 300], long(4)]),
    ]);
    expect(cues.map((c) => c.text)).toEqual([
      'internationalization0 internationalization1 internationalization2 ok,',
      'internationalization4',
    ]);
    expect(cues.every((c) => c.text.length <= 100)).toBe(true);
  });

  it('never grows past the hard limit to finish a sentence', () => {
    const long = (i: number): readonly [string, number] => [
      ` internationalization${String(i)}`,
      i * 100,
    ];
    const cues = parse([
      asr(0, 5000, [
        long(0),
        long(1),
        long(2),
        long(3),
        long(4),
        [' end.', 500],
      ]),
    ]);
    expect(cues.every((c) => c.text.length <= 100)).toBe(true);
    expect(cues.at(-1)?.text.endsWith('end.')).toBe(true);
  });

  it('starts a new cue when the speaker changes', () => {
    const cues = parse([
      asr(0, 3000, [
        ['>> Yeah,', 0],
        [' having', 100],
        [' a', 200],
        [' sniff', 300],
        [' >>', 400],
        [' Rookie', 500],
        [' runs', 600],
      ]),
    ]);
    expect(cues.map((c) => c.text)).toEqual([
      '>> Yeah, having a sniff',
      '>> Rookie runs',
    ]);
  });
});

describe('selectLearningTrack', () => {
  const asr = { languageCode: 'en', kind: 'asr' };
  const manual = { languageCode: 'en-GB' };
  const french = { languageCode: 'fr' };

  it('prefers human-made captions over automatic ones', () => {
    expect(
      selectLearningTrack({ captionTracks: [asr, manual, french] }, 'en'),
    ).toBe(manual);
  });

  it('prefers the default track when it matches', () => {
    expect(
      selectLearningTrack(
        {
          captionTracks: [manual, asr],
          audioTracks: [{ defaultCaptionTrackIndex: 1 }],
        },
        'en',
      ),
    ).toBe(asr);
  });

  it('falls back to automatic captions, and ignores other languages', () => {
    expect(selectLearningTrack({ captionTracks: [french, asr] }, 'en')).toBe(
      asr,
    );
    expect(selectLearningTrack({ captionTracks: [french] }, 'en')).toBeNull();
    expect(selectLearningTrack(null, 'en')).toBeNull();
  });

  it('matches any variant of a language family', () => {
    const traditional = { languageCode: 'zh-Hant' };
    expect(selectLearningTrack({ captionTracks: [traditional] }, 'zh')).toBe(
      traditional,
    );
  });
});

describe('chooseTrack', () => {
  const english = { languageCode: 'en' };
  const japanese = { languageCode: 'ja', kind: 'asr' };
  const chinese = { languageCode: 'zh-TW', kind: 'asr' };

  it('prefers the learning language', () => {
    expect(
      chooseTrack({ captionTracks: [japanese, english] }, 'en', 'zh-TW'),
    ).toEqual({ mode: 'learning', track: english });
  });

  it("falls back to the video's own language, to translate it", () => {
    expect(chooseTrack({ captionTracks: [japanese] }, 'en', 'zh-TW')).toEqual({
      mode: 'translation',
      track: japanese,
    });
  });

  it('leaves a video in the native language alone, whatever its script', () => {
    expect(chooseTrack({ captionTracks: [chinese] }, 'en', 'zh-CN')).toEqual({
      mode: 'native',
      track: null,
    });
  });

  it('reports a video without captions', () => {
    expect(chooseTrack({ captionTracks: [] }, 'en', 'zh-TW')).toEqual({
      mode: 'none',
      track: null,
    });
    expect(chooseTrack(undefined, 'en', 'zh-TW').mode).toBe('none');
  });
});
