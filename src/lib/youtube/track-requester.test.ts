import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrackRequester, type CaptionPlayer } from './track-requester';

const en = { languageCode: 'en' };
const asr = { languageCode: 'en', kind: 'asr' };

function setup(
  initial: { languageCode?: string; kind?: string } | null = null,
) {
  const state = {
    ready: true,
    player: null as CaptionPlayer | null,
    active: initial,
  };
  const setOption = vi.fn((_module: string, option: string, value: unknown) => {
    if (option === 'track') {
      state.active = value as { languageCode?: string; kind?: string };
    }
  });
  const player: CaptionPlayer = {
    loadModule: vi.fn(),
    setOption,
    getOption: () => state.active,
  };
  state.player = player;
  const onGiveUp = vi.fn();
  const requester = createTrackRequester({
    getPlayer: () => state.player,
    canRequest: () => state.ready,
    onGiveUp,
    retryDelaysMs: [100, 200],
    initialDelayMs: 0,
  });
  return { setOption, player, state, onGiveUp, requester };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('第一次請求前的等待', () => {
  function withDelay() {
    const active = { current: {} as { languageCode?: string } };
    const setOption = vi.fn();
    const requester = createTrackRequester({
      getPlayer: () => ({
        setOption,
        getOption: () => active.current,
      }),
      canRequest: () => true,
      onGiveUp: vi.fn(),
      retryDelaysMs: [100],
      initialDelayMs: 1500,
    });
    return { active, setOption, requester };
  }

  it('播放器在等待期間自己載入字幕時，完全不動它的狀態', () => {
    const { setOption, requester } = withDelay();
    requester.request(en);
    vi.advanceTimersByTime(1000);
    requester.finish();
    vi.advanceTimersByTime(10_000);
    expect(setOption).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('等待結束才讀 CC 狀態，所以 CC 開著時不會被關掉', () => {
    const { active, setOption, requester } = withDelay();
    requester.request(en);
    active.current = { languageCode: 'zh-TW' };
    vi.advanceTimersByTime(1500);
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {
      languageCode: 'en',
    });
    active.current = { languageCode: 'en' };
    requester.finish();
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {
      languageCode: 'zh-TW',
    });
  });

  it('等待結束還沒有字幕才主動請求', () => {
    const { setOption, requester } = withDelay();
    requester.request(en);
    vi.advanceTimersByTime(1499);
    expect(setOption).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setOption).toHaveBeenCalledTimes(1);
    requester.finish();
  });
});

describe('還原 CC 狀態', () => {
  it('使用者原本關著 CC 時，結束後關回去', () => {
    const { setOption, state, requester } = setup({});
    requester.request(en);
    requester.finish();
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {});
    expect(state.active).toEqual({});
  });

  it('播放器回傳 null 也視為關閉', () => {
    const { setOption, requester } = setup(null);
    requester.request(en);
    requester.finish();
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {});
  });

  it('使用者原本選別的語言時，結束後換回去', () => {
    const { state, requester } = setup({ languageCode: 'zh-TW', kind: '' });
    requester.request(en);
    expect(state.active).toEqual({ languageCode: 'en' });
    requester.finish();
    expect(state.active).toEqual({ languageCode: 'zh-TW' });
  });

  it('原本就是同一條字幕軌時不用還原', () => {
    const { setOption, requester } = setup({ languageCode: 'en', kind: '' });
    requester.request(en);
    requester.finish();
    expect(setOption.mock.calls).toEqual([['captions', 'reload', true]]);
  });

  it('重試多次也只記住第一次的狀態', () => {
    const { setOption, requester } = setup({});
    requester.request(en);
    vi.advanceTimersByTime(100);
    requester.finish();
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {});
  });

  it('沒動過播放器時不還原，例如整段都在廣告中', () => {
    const { setOption, state, requester } = setup({});
    state.ready = false;
    requester.request(en);
    requester.finish();
    expect(setOption).not.toHaveBeenCalled();
  });

  it('finish 重複呼叫只還原一次', () => {
    const { setOption, requester } = setup({});
    requester.request(en);
    requester.finish();
    const count = setOption.mock.calls.length;
    requester.finish();
    expect(setOption).toHaveBeenCalledTimes(count);
  });

  it('還原時播放器丟錯不會往外丟', () => {
    const { state, requester } = setup({});
    requester.request(en);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.player = {
      getOption: () => {
        throw new Error('gone');
      },
    };
    expect(() => {
      requester.finish();
    }).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('createTrackRequester', () => {
  it('先載入字幕模組，再選字幕軌，不多發 reload', () => {
    const { setOption, player, requester } = setup();
    requester.request(asr);
    expect(player.loadModule).toHaveBeenCalledWith('captions');
    expect(setOption.mock.calls).toEqual([
      ['captions', 'track', { languageCode: 'en', kind: 'asr' }],
    ]);
    requester.finish();
  });

  it('人工字幕不帶 kind', () => {
    const { setOption, requester } = setup();
    requester.request(en);
    expect(setOption).toHaveBeenCalledWith('captions', 'track', {
      languageCode: 'en',
    });
    requester.finish();
  });

  it('同一條字幕軌已經選好時只發 reload', () => {
    const { setOption, requester } = setup({ languageCode: 'en', kind: '' });
    requester.request(en);
    expect(setOption.mock.calls).toEqual([['captions', 'reload', true]]);
    requester.finish();
  });

  it('語言相同但種類不同時要重新選', () => {
    const { setOption, requester } = setup({ languageCode: 'en', kind: 'asr' });
    requester.request(en);
    expect(setOption).toHaveBeenCalledWith('captions', 'track', {
      languageCode: 'en',
    });
    requester.finish();
  });

  it('沒收到字幕就依間隔重試，用完才放棄', () => {
    const { setOption, requester, onGiveUp } = setup();
    requester.request(en);
    vi.advanceTimersByTime(99);
    expect(setOption).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(setOption).toHaveBeenCalledTimes(2);
    expect(onGiveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(setOption).toHaveBeenCalledTimes(4);
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {});
    expect(onGiveUp).toHaveBeenCalledWith(en);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finish 後不再重試，也不算放棄', () => {
    const { setOption, requester, onGiveUp } = setup();
    requester.request(en);
    requester.finish();
    const count = setOption.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(setOption).toHaveBeenCalledTimes(count);
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('再次 request 會取代上一個，不留下舊的重試', () => {
    const { setOption, state, requester } = setup();
    requester.request(en);
    requester.request(asr);
    expect(state.active).toEqual({ languageCode: 'en', kind: 'asr' });
    expect(vi.getTimerCount()).toBe(1);

    setOption.mockClear();
    vi.advanceTimersByTime(100);
    expect(setOption.mock.calls).toEqual([['captions', 'reload', true]]);
    requester.finish();
  });

  it('廣告期間不送也不消耗次數，結束後才送', () => {
    const { setOption, state, requester, onGiveUp } = setup();
    state.ready = false;
    requester.request(en);
    vi.advanceTimersByTime(10_000);
    expect(setOption).not.toHaveBeenCalled();
    expect(onGiveUp).not.toHaveBeenCalled();

    state.ready = true;
    vi.advanceTimersByTime(100);
    expect(setOption).toHaveBeenCalledTimes(1);
    requester.finish();
  });

  it('播放器還不存在時也會等待', () => {
    const { setOption, state, player, requester } = setup();
    state.player = null;
    requester.request(en);
    vi.advanceTimersByTime(100);
    expect(setOption).not.toHaveBeenCalled();
    state.player = player;
    vi.advanceTimersByTime(100);
    expect(setOption).toHaveBeenCalledTimes(1);
    requester.finish();
  });

  it('播放器丟錯時繼續重試', () => {
    const { state, requester } = setup();
    const setOption = vi.fn(() => {
      throw new Error('not ready');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.player = { setOption };
    requester.request(en);
    vi.advanceTimersByTime(100);
    expect(setOption).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    requester.finish();
  });
});
