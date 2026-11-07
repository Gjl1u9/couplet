import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import recording from '../../../fixtures/youtube/recording-2026-11-05.json';
import type { Translate } from '../translation/queue';
import {
  createSubtitleController,
  type ControllerEvent,
  type SubtitleView,
} from './controller';

const manualBody = (prefix = 'line') =>
  JSON.stringify({
    events: [0, 1, 2, 3].map((i) => ({
      tStartMs: i * 10_000,
      dDurationMs: 10_000,
      segs: [{ utf8: `${prefix} ${String(i)}` }],
    })),
  });

interface Call {
  texts: readonly string[];
  signal: AbortSignal;
  resolve: (t: readonly string[]) => void;
}

function setup(targetLanguage = 'zh-TW') {
  const calls: Call[] = [];
  const sources: string[] = [];
  const views: (SubtitleView | null)[] = [];
  const native: boolean[] = [];
  const errors: string[] = [];
  let time = 0;
  const translate: Translate = (texts, signal) =>
    new Promise((resolve) => {
      calls.push({ texts, signal, resolve });
    });
  const controller = createSubtitleController({
    targetLanguage,
    createTranslate: (source) => {
      sources.push(source);
      return translate;
    },
    getTime: () => time,
    render: (view) => views.push(view),
    setNativeCaptionsHidden: (hidden) => native.push(hidden),
    onError: (message) => errors.push(message),
  });
  return {
    calls,
    sources,
    views,
    native,
    errors,
    controller,
    setTime: (t: number) => {
      time = t;
    },
  };
}

const player = (
  videoId: string | null,
  adShowing = false,
): ControllerEvent => ({
  type: 'player',
  videoId,
  adShowing,
});
const captions = (
  videoId: string,
  overrides: Partial<Extract<ControllerEvent, { type: 'captions' }>> = {},
): ControllerEvent => ({
  type: 'captions',
  videoId,
  lang: 'en',
  kind: null,
  status: 200,
  body: manualBody(),
  ...overrides,
});
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('顯示', () => {
  it('先顯示原文，翻好後補上譯文，並隱藏原生字幕', async () => {
    const { controller, calls, views, native, sources } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    await flush();

    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: null,
    });
    expect(native).toEqual([true]);
    expect(sources).toEqual(['en']);

    calls[0]?.resolve(calls[0].texts.map((t) => `zh ${t}`));
    await flush();
    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: 'zh line 0',
    });
  });

  it('譯文是空字串時只顯示原文', async () => {
    const { controller, calls, views } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    await flush();
    calls[0]?.resolve(calls[0].texts.map(() => '  '));
    await flush();
    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: null,
    });
  });

  it('內容沒變就不重繪', async () => {
    const { controller, views } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    await flush();
    const count = views.length;
    controller.update();
    controller.update();
    expect(views).toHaveLength(count);
  });

  it('update 回傳下一次字幕改變的時間', () => {
    const { controller, setTime } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    setTime(5);
    expect(controller.update()).toBe(10);
  });

  it('來源和目標同語言時只顯示原文，不呼叫翻譯', async () => {
    const { controller, calls, views } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a', { lang: 'zh-Hant' }));
    await flush();
    expect(calls).toHaveLength(0);
    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: null,
    });
  });

  it.each(['zh-CN', 'zh-Hans', 'zh', 'zh-SG'])(
    '簡體字幕 %s 會翻成繁體',
    async (lang) => {
      const { controller, calls, sources } = setup();
      controller.handle(player('a'));
      controller.handle(captions('a', { lang }));
      await flush();
      expect(calls).toHaveLength(1);
      expect(sources).toEqual([lang]);
    },
  );

  it.each(['zh-TW', 'zh-Hant', 'zh-HK', 'zh-Hant-TW'])(
    '繁體字幕 %s 不需要翻譯',
    async (lang) => {
      const { controller, calls } = setup();
      controller.handle(player('a'));
      controller.handle(captions('a', { lang }));
      await flush();
      expect(calls).toHaveLength(0);
    },
  );

  it('目標語言的地區不同時不翻譯', async () => {
    const { controller, calls } = setup('en-GB');
    controller.handle(player('a'));
    controller.handle(captions('a', { lang: 'en-US' }));
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('沒有字幕時不隱藏原生字幕', () => {
    const { controller, native } = setup();
    controller.handle(player('a'));
    expect(native).toEqual([]);
  });
});

describe('廣告', () => {
  it('片頭廣告時不顯示，也不用廣告時間定位；結束後對準播放位置', async () => {
    const { controller, calls, views, setTime } = setup();
    controller.handle(player('a', true));
    setTime(7);
    controller.handle(captions('a'));
    await flush();
    expect(views.filter((v) => v !== null)).toEqual([]);
    expect(calls[0]?.texts[0]).toBe('line 0');

    setTime(25);
    controller.handle(player('a', false));
    expect(views.at(-1)).toMatchObject({
      original: 'line 2',
      translation: null,
    });

    calls[0]?.resolve(calls[0].texts.map(() => 'x'));
    await flush();
  });

  it('片中廣告時隱藏，結束後恢復', () => {
    const { controller, views, setTime } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    setTime(5);
    controller.handle(player('a', true));
    expect(views.at(-1)).toBeNull();
    controller.handle(player('a', false));
    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: null,
    });
  });

  it('廣告期間的 seek 不影響翻譯位置，update 也不顯示字幕', () => {
    const { controller, views, setTime } = setup();
    controller.handle(player('a', true));
    controller.handle(captions('a'));
    setTime(15);
    controller.seek();
    expect(controller.update()).toBeNull();
    expect(views.filter((v) => v !== null)).toEqual([]);
  });
});

describe('切換影片', () => {
  it('取消舊請求，舊譯文不會出現在新影片', async () => {
    const { controller, calls, views, native } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    await flush();
    const old = calls[0];

    controller.handle(player('b'));
    expect(old?.signal.aborted).toBe(true);
    expect(views.at(-1)).toBeNull();
    expect(native).toEqual([true, false]);

    controller.handle(captions('b', { body: manualBody('new') }));
    await flush();
    old?.resolve(old.texts.map(() => '舊譯文'));
    await flush();
    expect(views.at(-1)).toMatchObject({
      original: 'new 0',
      translation: null,
    });
    expect(views.some((v) => v?.translation === '舊譯文')).toBe(false);
  });

  it('上一支影片晚到的字幕不會被採用', () => {
    const { controller, views, sources } = setup();
    controller.handle(player('a'));
    controller.handle(player('b'));
    controller.handle(captions('a'));
    expect(sources).toEqual([]);
    expect(views.filter((v) => v !== null)).toEqual([]);
  });

  it('dispose 後取消請求並清除畫面', async () => {
    const { controller, calls, views, native } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a'));
    await flush();
    controller.dispose();
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(views.at(-1)).toBeNull();
    expect(native.at(-1)).toBe(false);
  });
});

describe('翻譯順序與錯誤', () => {
  it('跳轉後下一批從新位置開始', async () => {
    const { controller, calls, setTime } = setup();
    const events = Array.from({ length: 300 }, (_, i) => ({
      tStartMs: i * 1000,
      dDurationMs: 1000,
      segs: [{ utf8: `c${String(i)}` }],
    }));
    controller.handle(player('a'));
    controller.handle(captions('a', { body: JSON.stringify({ events }) }));
    await flush();
    expect(calls[0]?.texts).toHaveLength(150);

    setTime(200);
    controller.seek();
    calls[0]?.resolve(calls[0].texts.map((t) => t));
    await flush();
    expect(calls[1]?.texts[0]).toBe('c150');
  });

  it('自動字幕每批 60 句', async () => {
    const { controller, calls } = setup();
    const events = Array.from({ length: 70 }, (_, i) => ({
      tStartMs: i * 1000,
      dDurationMs: 1000,
      segs: [{ utf8: `w${String(i)}.` }],
    }));
    controller.handle(player('a'));
    controller.handle(
      captions('a', { kind: 'asr', body: JSON.stringify({ events }) }),
    );
    await flush();
    expect(calls[0]?.texts).toHaveLength(60);
  });

  it('字幕解析失敗時回報錯誤，不影響之後的影片', async () => {
    const { controller, errors, views } = setup();
    controller.handle(player('a'));
    controller.handle(captions('a', { body: 'not json' }));
    expect(errors).toEqual(['字幕解析失敗']);
    controller.handle(player('b'));
    controller.handle(captions('b'));
    await flush();
    expect(views.at(-1)).toMatchObject({
      original: 'line 0',
      translation: null,
    });
  });
});

describe('真實錄製回放', () => {
  const sessions = recording.sessions as unknown as {
    events: {
      type: string;
      playerVideoId?: string | null;
      ad?: boolean;
      url?: string | null;
      v?: string | null;
      lang?: string | null;
      kind?: string | null;
      status?: number;
      bytes?: number;
      ct?: number | null;
    }[];
  }[];

  it.each(sessions.map((s) => [s.events[0]?.url ?? 'unknown', s] as const))(
    '%s：廣告時絕不顯示字幕',
    async (_id, session) => {
      const { controller, views, setTime } = setup();
      let adShowing = false;

      for (const event of session.events) {
        if (typeof event.ct === 'number') setTime(event.ct);
        if (event.type === 'timedtext') {
          controller.handle({
            type: 'captions',
            videoId: event.v ?? '',
            lang: event.lang ?? null,
            kind: event.kind ?? null,
            status: event.status ?? 0,
            body: (event.bytes ?? 0) > 0 ? manualBody() : '',
          });
        } else if (
          event.playerVideoId !== undefined &&
          event.ad !== undefined
        ) {
          adShowing = event.ad;
          controller.handle(player(event.playerVideoId, event.ad));
        }
        if (adShowing) expect(views.at(-1) ?? null).toBeNull();
        await flush();
      }
      controller.dispose();
    },
  );
});

describe('settings changes', () => {
  const started = async () => {
    const t = setup();
    t.controller.handle(player('a'));
    t.controller.handle(captions('a'));
    await flush();
    return t;
  };

  it('reports the source language and whether a translation is coming', async () => {
    const t = await started();
    expect(t.controller.sourceLanguage()).toBe('en');
    expect(t.controller.expectsTranslation()).toBe(true);
  });

  it('expects no translation when the source is the native language', async () => {
    const t = setup('en');
    t.controller.handle(player('a'));
    t.controller.handle(captions('a'));
    await flush();
    expect(t.controller.expectsTranslation()).toBe(false);
  });

  it('stops expecting a translation after a failure', async () => {
    const t = setup();
    const failing = createSubtitleController({
      targetLanguage: 'zh-TW',
      createTranslate: () => () => Promise.reject(new Error('offline')),
      getTime: () => 0,
      render: () => undefined,
      setNativeCaptionsHidden: () => undefined,
    });
    failing.handle(player('a'));
    failing.handle(captions('a'));
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(t.calls).toEqual([]);
    expect(failing.expectsTranslation()).toBe(false);
  });

  it('translates again, without old translations, for a new native language', async () => {
    const t = await started();
    const first = t.calls[0];
    first?.resolve(first.texts.map((text) => `zh:${text}`));
    await flush();
    t.controller.update();
    expect(t.views.at(-1)?.translation).toMatch(/^zh:/);

    t.controller.setTargetLanguage('ja');
    expect(t.views.at(-1)?.translation).toBeNull();
    await flush();
    expect(t.calls).toHaveLength(2);
  });

  it('accepts the same track again after a reset', async () => {
    const t = await started();
    t.controller.resetCaptions();
    expect(t.views.at(-1)).toBeNull();
    expect(t.native.at(-1)).toBe(false);
    expect(t.controller.sourceLanguage()).toBeNull();
    t.controller.handle(captions('a'));
    expect(t.views.at(-1)).not.toBeNull();
    expect(t.native.at(-1)).toBe(true);
  });

  it('gives captions back to YouTube while off, and restores them', async () => {
    const t = await started();
    t.controller.setEnabled(false);
    expect(t.views.at(-1)).toBeNull();
    expect(t.native.at(-1)).toBe(false);
    t.controller.setEnabled(true);
    expect(t.views.at(-1)).not.toBeNull();
    expect(t.native.at(-1)).toBe(true);
  });

  it('does not hide YouTube captions when captions arrive while off', () => {
    const t = setup();
    t.controller.setEnabled(false);
    t.controller.handle(player('a'));
    t.controller.handle(captions('a'));
    expect(t.native).not.toContain(true);
  });
});
