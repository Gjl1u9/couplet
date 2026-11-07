import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageEvent } from './bridge';
import {
  createPageAgent,
  patchXhr,
  type CapturedCaptions,
  type YouTubePlayer,
} from './page-agent';

interface FakeState {
  videoId: string | null;
  responseId: string | null;
  ad: boolean;
  tracks: { languageCode: string; kind?: string }[];
}

function fakePlayer(state: FakeState): YouTubePlayer {
  return {
    classList: {
      contains: (name: string) => name === 'ad-showing' && state.ad,
    },
    getVideoData: () =>
      state.videoId === null ? undefined : { video_id: state.videoId },
    getPlayerResponse: () => ({
      ...(state.responseId === null
        ? {}
        : { videoDetails: { videoId: state.responseId } }),
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: state.tracks,
          audioTracks: [{ defaultCaptionTrackIndex: 0 }],
        },
      },
    }),
  } as unknown as YouTubePlayer;
}

function setup(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    videoId: 'a',
    responseId: 'a',
    ad: false,
    tracks: [{ languageCode: 'en' }],
    ...initial,
  };
  let player: YouTubePlayer | null = fakePlayer(state);
  const posted: PageEvent[] = [];
  const requester = { request: vi.fn(), finish: vi.fn() };
  const watchPlayer = vi.fn();
  const agent = createPageAgent({
    learningLanguage: 'en',
    getPlayer: () => player,
    post: (event) => posted.push(event),
    requester,
    watchPlayer,
  });
  return {
    agent,
    state,
    posted,
    requester,
    watchPlayer,
    setPlayer: (next: YouTubePlayer | null) => {
      player = next;
    },
    /** 換影片：影片 ID 和回應一起更新。 */
    goTo: (id: string) => {
      state.videoId = id;
      state.responseId = id;
      agent.report();
    },
  };
}

const captions = (
  overrides: Partial<CapturedCaptions> = {},
): CapturedCaptions => ({
  videoId: 'a',
  lang: 'en',
  kind: null,
  status: 200,
  body: '{"events":[]}',
  ...overrides,
});

const captionsPosted = (posted: readonly PageEvent[]) =>
  posted.filter((e) => e.type === 'captions');

describe('回報播放器狀態', () => {
  it('回報影片和廣告狀態，沒有變化時不重複', () => {
    const { agent, posted } = setup();
    agent.report();
    agent.report();
    expect(posted.filter((e) => e.type === 'player')).toEqual([
      { type: 'player', videoId: 'a', adShowing: false },
    ]);
  });

  it('廣告開始和結束都會回報', () => {
    const { agent, posted, state } = setup();
    agent.report();
    state.ad = true;
    agent.report();
    state.ad = false;
    agent.report();
    expect(
      posted.filter((e) => e.type === 'player').map((e) => e.adShowing),
    ).toEqual([false, true, false]);
  });

  it('沒有播放器時不回報', () => {
    const { agent, posted, setPlayer, watchPlayer } = setup();
    setPlayer(null);
    agent.report();
    expect(posted).toEqual([]);
    expect(watchPlayer).not.toHaveBeenCalled();
  });

  it('播放器元素換掉時才重新監聽', () => {
    const { agent, setPlayer, state, watchPlayer } = setup();
    agent.report();
    agent.report();
    expect(watchPlayer).toHaveBeenCalledTimes(1);
    const next = fakePlayer(state);
    setPlayer(next);
    agent.report();
    expect(watchPlayer).toHaveBeenLastCalledWith(next);
    setPlayer(null);
    agent.report();
    expect(watchPlayer).toHaveBeenLastCalledWith(null);
  });

  it('播放器 API 丟錯時不會往外丟', () => {
    const { agent, setPlayer, state } = setup();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const broken = fakePlayer(state);
    broken.getVideoData = () => {
      throw new Error('not ready');
    };
    setPlayer(broken);
    expect(() => {
      agent.report();
    }).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});

describe('選字幕軌', () => {
  it('請求影片預設的字幕軌，只請求一次', () => {
    const { agent, requester } = setup();
    agent.report();
    agent.report();
    expect(requester.request).toHaveBeenCalledTimes(1);
    expect(requester.request).toHaveBeenCalledWith({ languageCode: 'en' });
  });

  it('播放器的資料還是上一支影片時先不選', () => {
    const { agent, requester, state } = setup({ responseId: 'old' });
    agent.report();
    expect(requester.request).not.toHaveBeenCalled();
    state.responseId = 'a';
    agent.report();
    expect(requester.request).toHaveBeenCalledTimes(1);
  });

  it('廣告期間不選，廣告結束才選', () => {
    const { agent, requester, state } = setup({ ad: true });
    agent.report();
    expect(requester.request).not.toHaveBeenCalled();
    state.ad = false;
    agent.report();
    expect(requester.request).toHaveBeenCalledTimes(1);
  });

  it('沒有影片 ID 時不選', () => {
    const { agent, requester } = setup({ videoId: null });
    agent.report();
    expect(requester.request).not.toHaveBeenCalled();
  });

  it('沒有字幕的影片不請求，換到下一支仍然正常', () => {
    const { agent, requester, state, goTo } = setup({ tracks: [] });
    agent.report();
    expect(requester.request).not.toHaveBeenCalled();
    state.tracks = [{ languageCode: 'en-GB' }];
    goTo('b');
    expect(requester.request).toHaveBeenCalledWith({ languageCode: 'en-GB' });
  });

  it('換影片時先結束上一次請求，避免舊的重試繼續跑', () => {
    const { agent, requester, goTo } = setup();
    agent.report();
    requester.finish.mockClear();
    goTo('b');
    expect(requester.finish).toHaveBeenCalled();
    expect(requester.request).toHaveBeenCalledTimes(2);
  });
});

describe('字幕回應', () => {
  it('選定字幕軌的回應會送出，並結束重試', () => {
    const { agent, posted, requester } = setup();
    agent.report();
    requester.finish.mockClear();
    agent.onCaptured(captions());
    expect(captionsPosted(posted)).toEqual([
      { type: 'captions', ...captions() },
    ]);
    expect(requester.finish).toHaveBeenCalled();
  });

  it('自動字幕要和種類一起比對', () => {
    const { agent, posted } = setup({
      tracks: [{ languageCode: 'en', kind: 'asr' }],
    });
    agent.report();
    agent.onCaptured(captions({ kind: null }));
    expect(captionsPosted(posted)).toEqual([]);
    agent.onCaptured(captions({ kind: 'asr' }));
    expect(captionsPosted(posted)).toHaveLength(1);
  });

  it('同一份字幕只送一次', () => {
    const { agent, posted } = setup();
    agent.report();
    agent.onCaptured(captions());
    agent.onCaptured(captions());
    expect(captionsPosted(posted)).toHaveLength(1);
  });

  it.each([
    ['其他語言', { lang: 'fr' }],
    ['廣告或預覽的影片', { videoId: 'ad' }],
    ['被取消的請求', { status: 0, body: '' }],
    ['錯誤狀態', { status: 403 }],
    ['空內容', { body: '' }],
  ])('不送出：%s', (_name, overrides) => {
    const { agent, posted, requester } = setup();
    agent.report();
    requester.finish.mockClear();
    agent.onCaptured(captions(overrides));
    expect(captionsPosted(posted)).toEqual([]);
    expect(requester.finish).not.toHaveBeenCalled();
  });

  it('字幕比影片 ID 更早抵達時，選好字幕軌就直接使用，不動 CC', () => {
    const { agent, posted, requester } = setup();
    agent.onCaptured(captions());
    agent.report();
    expect(captionsPosted(posted)).toHaveLength(1);
    expect(requester.request).not.toHaveBeenCalled();
  });

  it('暫存字幕不符合選定的字幕軌時，還是要請求', () => {
    const { agent, posted, requester } = setup();
    agent.onCaptured(captions({ lang: 'fr' }));
    agent.report();
    expect(captionsPosted(posted)).toEqual([]);
    expect(requester.request).toHaveBeenCalledTimes(1);
  });

  it('換影片後，新影片的字幕可以再送出', () => {
    const { agent, posted, goTo } = setup();
    agent.report();
    agent.onCaptured(captions());
    goTo('b');
    agent.onCaptured(captions({ videoId: 'b' }));
    expect(captionsPosted(posted)).toHaveLength(2);
  });

  it('切回同一支影片時會重新請求，也能再送出', () => {
    const { agent, posted, requester, goTo } = setup();
    agent.report();
    agent.onCaptured(captions());
    goTo('b');
    goTo('a');
    expect(requester.request).toHaveBeenCalledTimes(3);
    agent.onCaptured(captions());
    expect(captionsPosted(posted)).toHaveLength(2);
  });
});

describe('記憶體', () => {
  const big = (videoId: string) => captions({ videoId, body: 'x'.repeat(10) });

  it('只暫存最新的幾份，舊的會被丟棄', () => {
    const { agent, posted, requester, state } = setup({ videoId: null });
    agent.onCaptured(big('a'));
    agent.onCaptured(big('ad1'));
    agent.onCaptured(big('ad2'));
    state.videoId = 'a';
    agent.report();
    expect(captionsPosted(posted)).toEqual([]);
    expect(requester.request).toHaveBeenCalledTimes(1);
  });

  it('還在範圍內的暫存可以使用', () => {
    const { agent, posted, state } = setup({ videoId: null });
    agent.onCaptured(big('ad1'));
    agent.onCaptured(big('a'));
    agent.onCaptured(big('ad2'));
    state.videoId = 'a';
    agent.report();
    expect(captionsPosted(posted)).toHaveLength(1);
  });

  it('選好字幕軌後全部釋放，之後切回來不會用舊字幕', () => {
    const { agent, posted, requester, goTo } = setup({ videoId: null });
    agent.onCaptured(big('b'));
    goTo('a');
    goTo('b');
    expect(captionsPosted(posted)).toEqual([]);
    expect(requester.request).toHaveBeenCalledTimes(2);
  });

  it('已選定影片的其他字幕軌不會暫存', () => {
    const { agent, posted, requester, goTo } = setup();
    agent.report();
    agent.onCaptured(captions({ lang: 'fr' }));
    goTo('b');
    goTo('a');
    expect(captionsPosted(posted)).toEqual([]);
    expect(requester.request).toHaveBeenCalledTimes(3);
  });
});

describe('patchXhr', () => {
  const URL_BASE = 'https://www.youtube.com/watch?v=a';

  class FakeXhr {
    static opened: unknown[][] = [];
    listeners: (() => void)[] = [];
    responseType = '';
    status = 200;
    responseText = 'body';
    open(...args: unknown[]) {
      FakeXhr.opened.push(args);
      expect(this).toBeInstanceOf(FakeXhr);
    }
    addEventListener(_type: string, listener: () => void) {
      this.listeners.push(listener);
    }
    fire() {
      for (const listener of this.listeners) listener();
    }
  }

  function setupXhr() {
    const proto = class extends FakeXhr {};
    const onCaptured = vi.fn();
    patchXhr(proto.prototype, () => URL_BASE, onCaptured);
    const open = (url: unknown) => {
      const xhr = new proto();
      xhr.open('GET', url, true);
      return xhr;
    };
    return { open, onCaptured };
  }

  beforeEach(() => {
    FakeXhr.opened = [];
  });

  it('所有請求都照常傳給原本的 open', () => {
    const { open } = setupXhr();
    open('/other');
    expect(FakeXhr.opened).toEqual([['GET', '/other', true]]);
  });

  it('其他請求不會加監聽', () => {
    const { open, onCaptured } = setupXhr();
    const xhr = open('/youtubei/v1/log_event');
    expect(xhr.listeners).toHaveLength(0);
    xhr.fire();
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it('讀取字幕回應和網址參數', () => {
    const { open, onCaptured } = setupXhr();
    const xhr = open(
      '/api/timedtext?v=a&lang=en&kind=asr&pot=secret&fmt=json3',
    );
    expect(onCaptured).not.toHaveBeenCalled();
    xhr.fire();
    expect(onCaptured).toHaveBeenCalledWith({
      videoId: 'a',
      lang: 'en',
      kind: 'asr',
      status: 200,
      body: 'body',
    });
  });

  it('完整網址和 URL 物件也能辨識', () => {
    const { open, onCaptured } = setupXhr();
    open('https://www.youtube.com/api/timedtext?v=a&lang=en').fire();
    open(new URL('https://www.youtube.com/api/timedtext?v=b&lang=en')).fire();
    expect(onCaptured).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['機器翻譯的字幕', '/api/timedtext?v=a&lang=en&tlang=zh-TW'],
    ['沒有影片 ID', '/api/timedtext?lang=en'],
  ])('略過：%s', (_name, url) => {
    const { open, onCaptured } = setupXhr();
    open(url).fire();
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it('無法讀成文字的回應不會讀取，避免丟錯', () => {
    const { open, onCaptured } = setupXhr();
    const xhr = open('/api/timedtext?v=a&lang=en');
    xhr.responseType = 'json';
    xhr.fire();
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it('無效的網址不會影響原本的請求', () => {
    const { open } = setupXhr();
    expect(() => open('http://[invalid')).not.toThrow();
    expect(FakeXhr.opened).toHaveLength(1);
  });
});

describe('learning language', () => {
  const noLanguage = (tracks: FakeState['tracks']) => {
    const state: FakeState = {
      videoId: 'a',
      responseId: 'a',
      ad: false,
      tracks,
    };
    const posted: PageEvent[] = [];
    const requester = { request: vi.fn(), finish: vi.fn() };
    const agent = createPageAgent({
      getPlayer: () => fakePlayer(state),
      post: (event) => posted.push(event),
      requester,
      watchPlayer: vi.fn(),
    });
    return { agent, posted, requester };
  };

  it('selects nothing until the language is known', () => {
    const { agent, requester } = noLanguage([{ languageCode: 'en' }]);
    agent.report();
    expect(requester.request).not.toHaveBeenCalled();
    agent.setLearningLanguage('en');
    expect(requester.request).toHaveBeenCalledWith({ languageCode: 'en' });
  });

  it('reports when the video has no track in that language', () => {
    const { agent, posted, requester } = noLanguage([{ languageCode: 'fr' }]);
    agent.setLearningLanguage('ja');
    expect(requester.request).not.toHaveBeenCalled();
    expect(posted).toContainEqual({
      type: 'track-status',
      videoId: 'a',
      available: false,
    });
  });

  it('switches track on the same video, and ignores a repeated language', () => {
    const { agent, requester } = noLanguage([
      { languageCode: 'en' },
      { languageCode: 'fr' },
    ]);
    agent.setLearningLanguage('en');
    agent.setLearningLanguage('en');
    expect(requester.request).toHaveBeenCalledTimes(1);
    agent.setLearningLanguage('fr');
    expect(requester.request).toHaveBeenLastCalledWith({ languageCode: 'fr' });
  });

  it('forwards the new track after switching back to an earlier language', () => {
    const { agent, posted } = noLanguage([
      { languageCode: 'en' },
      { languageCode: 'fr' },
    ]);
    agent.setLearningLanguage('en');
    agent.onCaptured(captions());
    agent.setLearningLanguage('fr');
    agent.onCaptured(captions({ lang: 'fr' }));
    agent.setLearningLanguage('en');
    agent.onCaptured(captions());
    expect(captionsPosted(posted).map((e) => e.lang)).toEqual([
      'en',
      'fr',
      'en',
    ]);
  });
});
