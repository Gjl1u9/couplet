import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrackRequester, type CaptionPlayer } from './track-requester';

const en = { languageCode: 'en' };
const asr = { languageCode: 'en', kind: 'asr' };

function setup(active: { languageCode?: string; kind?: string } | null = null) {
  const setOption = vi.fn();
  const player: CaptionPlayer = {
    loadModule: vi.fn(),
    setOption,
    getOption: () => active,
  };
  const state = { ready: true, player: player as CaptionPlayer | null };
  const onGiveUp = vi.fn();
  const requester = createTrackRequester({
    getPlayer: () => state.player,
    canRequest: () => state.ready,
    onGiveUp,
    retryDelaysMs: [100, 200],
  });
  return { setOption, player, state, onGiveUp, requester };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTrackRequester', () => {
  it('先載入字幕模組，再選字幕軌，不多發 reload', () => {
    const { setOption, player, requester } = setup();
    requester.request(asr);
    expect(player.loadModule).toHaveBeenCalledWith('captions');
    expect(setOption.mock.calls).toEqual([
      ['captions', 'track', { languageCode: 'en', kind: 'asr' }],
    ]);
    requester.cancel();
  });

  it('人工字幕不帶 kind', () => {
    const { setOption, requester } = setup();
    requester.request(en);
    expect(setOption).toHaveBeenCalledWith('captions', 'track', {
      languageCode: 'en',
    });
    requester.cancel();
  });

  it('同一條字幕軌已經選好時只發 reload', () => {
    const { setOption, requester } = setup({ languageCode: 'en', kind: '' });
    requester.request(en);
    expect(setOption.mock.calls).toEqual([['captions', 'reload', true]]);
    requester.cancel();
  });

  it('語言相同但種類不同時要重新選', () => {
    const { setOption, requester } = setup({ languageCode: 'en', kind: 'asr' });
    requester.request(en);
    expect(setOption).toHaveBeenCalledWith('captions', 'track', {
      languageCode: 'en',
    });
    requester.cancel();
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
    expect(setOption).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledWith(en);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel 後不再重試，也不算放棄', () => {
    const { setOption, requester, onGiveUp } = setup();
    requester.request(en);
    requester.cancel();
    vi.advanceTimersByTime(10_000);
    expect(setOption).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('再次 request 會取代上一個', () => {
    const { setOption, requester } = setup();
    requester.request(en);
    requester.request(asr);
    vi.advanceTimersByTime(100);
    expect(setOption).toHaveBeenLastCalledWith('captions', 'track', {
      languageCode: 'en',
      kind: 'asr',
    });
    expect(setOption).toHaveBeenCalledTimes(3);
    requester.cancel();
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
    requester.cancel();
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
    requester.cancel();
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
    requester.cancel();
  });
});
