import { describe, expect, it } from 'vitest';
import recording from '../../../fixtures/youtube/recording-2026-11-05.json';
import {
  canShowSubtitles,
  initialSessionState,
  isCurrentSession,
  reduceSession,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from './session';

interface RecordedEvent {
  type: string;
  playerVideoId?: string | null;
  ad?: boolean;
  v?: string | null;
  lang?: string | null;
  kind?: string | null;
  status?: number;
  bytes?: number;
}

const sessions = recording.sessions as unknown as {
  events: (RecordedEvent & { url?: string | null })[];
}[];

function toSessionEvent(event: RecordedEvent): SessionEvent | null {
  if (event.type === 'timedtext') {
    return {
      type: 'caption-response',
      videoId: event.v ?? null,
      lang: event.lang ?? null,
      kind: event.kind ?? null,
      status: event.status ?? 0,
      bytes: event.bytes ?? 0,
    };
  }
  if (event.playerVideoId === undefined || event.ad === undefined) return null;
  return {
    type: 'player',
    videoId: event.playerVideoId,
    adShowing: event.ad,
  };
}

function replay(events: readonly SessionEvent[]) {
  let state: SessionState = initialSessionState;
  const effects: SessionEffect[] = [];
  const states: SessionState[] = [];
  for (const event of events) {
    const result = reduceSession(state, event);
    state = result.state;
    effects.push(...result.effects);
    states.push(state);
  }
  return { state, effects, states };
}

function replayRecording(firstVideoId: string) {
  const session = sessions.find((s) => s.events[0]?.url === firstVideoId);
  if (!session) throw new Error(`no recording for ${firstVideoId}`);
  const events = session.events
    .map(toSessionEvent)
    .filter((e): e is SessionEvent => e !== null);
  return { ...replay(events), events };
}

function summarize(effects: readonly SessionEffect[]): string[] {
  return effects.map((effect) => {
    switch (effect.type) {
      case 'session-started':
        return `start ${effect.videoId}${effect.adShowing ? ' (ad)' : ''}`;
      case 'ad-started':
        return 'ad-started';
      case 'ad-ended':
        return 'ad-ended';
      case 'captions-received':
        return `captions ${effect.videoId} ${String(effect.lang)}`;
    }
  });
}

describe('真實錄製回放', () => {
  it('片頭廣告：不收廣告字幕，廣告結束才收正片字幕', () => {
    const { effects, state } = replayRecording('kJQP7kiw5Fk');
    expect(summarize(effects)).toEqual([
      'start kJQP7kiw5Fk (ad)',
      'ad-ended',
      'captions kJQP7kiw5Fk en',
    ]);
    expect(canShowSubtitles(state)).toBe(true);
  });

  it('站內切換：每支影片一個 session，廣告中切換也正確，舊請求和空回應都丟棄', () => {
    const { effects } = replayRecording('8KkKuTCFvzI');
    expect(summarize(effects)).toEqual([
      'start 8KkKuTCFvzI',
      'captions 8KkKuTCFvzI en',
      'start sEQf5lcnj_o',
      'start q9iCPaJ6Z-c (ad)',
      'start sEQf5lcnj_o (ad)',
      'start q9iCPaJ6Z-c',
      'captions q9iCPaJ6Z-c en',
      'start sEQf5lcnj_o',
    ]);
  });

  it('縮小播放器和連續跳轉：不重置 session，也不收首頁預覽的字幕', () => {
    const { effects, events } = replayRecording('fxbCHn6gE3U');
    expect(summarize(effects)).toEqual([
      'start fxbCHn6gE3U',
      'captions fxbCHn6gE3U en',
    ]);
    expect(
      events.some(
        (e) => e.type === 'caption-response' && e.videoId === 'lUlhMk2cKNo',
      ),
    ).toBe(true);
  });

  it('跳到長影片中段：沒有廣告，字幕正常收下', () => {
    expect(summarize(replayRecording('ZAzWPE9CItg').effects)).toEqual([
      'start ZAzWPE9CItg',
      'captions ZAzWPE9CItg en',
    ]);
  });

  it('所有錄製都符合基本規則', () => {
    for (const session of sessions) {
      const events = session.events
        .map(toSessionEvent)
        .filter((e): e is SessionEvent => e !== null);
      const { effects, states } = replay(events);

      const ids = effects.flatMap((e) =>
        e.type === 'session-started' ? [e.sessionId] : [],
      );
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);

      states.forEach((state, index) => {
        const event = events[index];
        if (event?.type === 'player' && event.videoId !== null) {
          expect(state.videoId).toBe(event.videoId);
          expect(canShowSubtitles(state)).toBe(!event.adShowing);
        }
      });

      expect(replay(events).effects).toEqual(effects);
    }
  });
});

describe('錄製裡沒有涵蓋的情況', () => {
  const player = (videoId: string | null, adShowing = false): SessionEvent => ({
    type: 'player',
    videoId,
    adShowing,
  });
  const captions = (
    videoId: string | null,
    overrides: Partial<{ status: number; bytes: number; lang: string }> = {},
  ): SessionEvent => ({
    type: 'caption-response',
    videoId,
    lang: overrides.lang ?? 'en',
    kind: null,
    status: overrides.status ?? 200,
    bytes: overrides.bytes ?? 100,
  });

  it('片中廣告：session 不變，字幕隱藏後再恢復', () => {
    const { effects, states } = replay([
      player('a'),
      player('a', true),
      player('a'),
    ]);
    expect(summarize(effects)).toEqual(['start a', 'ad-started', 'ad-ended']);
    expect(states.map(canShowSubtitles)).toEqual([true, false, true]);
    expect(states[2]?.sessionId).toBe(states[0]?.sessionId);
  });

  it('尚未有影片 ID 時不建立 session', () => {
    const { state, effects } = replay([player(null), player(null, true)]);
    expect(effects).toEqual([]);
    expect(state.videoId).toBeNull();
    expect(canShowSubtitles(state)).toBe(false);
  });

  it('播放器暫時回報 null 時，不結束目前的 session', () => {
    const { state, effects } = replay([player('a'), player(null), player('a')]);
    expect(summarize(effects)).toEqual(['start a']);
    expect(state.videoId).toBe('a');
  });

  it('切回同一支影片算新的 session', () => {
    const { effects } = replay([player('a'), player('b'), player('a')]);
    expect(summarize(effects)).toEqual(['start a', 'start b', 'start a']);
  });

  it('廣告中收到正片字幕可以先收下，但不能顯示', () => {
    const { state, effects } = replay([player('a', true), captions('a')]);
    expect(summarize(effects)).toEqual(['start a (ad)', 'captions a en']);
    expect(canShowSubtitles(state)).toBe(false);
  });

  it('同一語言的字幕只收一次，不同語言分開收', () => {
    const { effects } = replay([
      player('a'),
      captions('a'),
      captions('a'),
      captions('a', { lang: 'ja' }),
    ]);
    expect(summarize(effects)).toEqual([
      'start a',
      'captions a en',
      'captions a ja',
    ]);
  });

  it('換 session 後，同一語言可以重新收下', () => {
    const { effects } = replay([
      player('a'),
      captions('a'),
      player('b'),
      player('a'),
      captions('a'),
    ]);
    expect(summarize(effects)).toEqual([
      'start a',
      'captions a en',
      'start b',
      'start a',
      'captions a en',
    ]);
  });

  it.each([
    ['其他影片', captions('other')],
    ['沒有影片 ID', captions(null)],
    ['被取消的請求', captions('a', { status: 0, bytes: 0 })],
    ['空內容', captions('a', { bytes: 0 })],
    ['錯誤狀態', captions('a', { status: 403 })],
  ])('丟棄字幕：%s', (_name, event) => {
    expect(summarize(replay([player('a'), event]).effects)).toEqual([
      'start a',
    ]);
  });

  it('沒有 session 時丟棄字幕', () => {
    expect(replay([captions('a')]).effects).toEqual([]);
  });

  it('可以判斷非同步結果是否還屬於目前的 session', () => {
    const first = reduceSession(initialSessionState, player('a')).state;
    const startedId = first.sessionId;
    expect(isCurrentSession(first, startedId)).toBe(true);
    const second = reduceSession(first, player('b')).state;
    expect(isCurrentSession(second, startedId)).toBe(false);
  });
});
