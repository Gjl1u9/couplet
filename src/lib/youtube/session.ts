/**
 * 判斷目前是哪個觀看 session、能不能顯示字幕、字幕結果要不要收下。
 * 這裡是純函式，規則來自 fixtures/youtube 的真實錄製：
 *
 * - 換影片以播放器的影片 ID 為準。導航事件和網址都不可靠，縮小播放器時兩者都會變，影片卻沒換。
 * - 廣告期間的影片 ID 是正片的，所以廣告狀態要分開判斷。
 * - 字幕回應可能屬於廣告、上一支影片或首頁預覽，也可能被取消，所以都要核對。
 */

export interface SessionState {
  /** 每次換影片遞增，用來丟棄晚到的非同步結果。 */
  readonly sessionId: number;
  readonly videoId: string | null;
  readonly adShowing: boolean;
  readonly captionKeys: readonly string[];
}

export type SessionEvent =
  | {
      readonly type: 'player';
      readonly videoId: string | null;
      readonly adShowing: boolean;
    }
  | {
      readonly type: 'caption-response';
      readonly videoId: string | null;
      readonly lang: string | null;
      readonly kind: string | null;
      readonly status: number;
      readonly bytes: number;
    };

export type SessionEffect =
  | {
      readonly type: 'session-started';
      readonly sessionId: number;
      readonly videoId: string;
      readonly adShowing: boolean;
    }
  | { readonly type: 'ad-started'; readonly sessionId: number }
  | { readonly type: 'ad-ended'; readonly sessionId: number }
  | {
      readonly type: 'captions-received';
      readonly sessionId: number;
      readonly videoId: string;
      readonly lang: string | null;
      readonly kind: string | null;
    };

export interface SessionResult {
  readonly state: SessionState;
  readonly effects: readonly SessionEffect[];
}

export const initialSessionState: SessionState = {
  sessionId: 0,
  videoId: null,
  adShowing: false,
  captionKeys: [],
};

export function reduceSession(
  state: SessionState,
  event: SessionEvent,
): SessionResult {
  return event.type === 'player'
    ? reducePlayer(state, event)
    : reduceCaptions(state, event);
}

/** 有影片、而且沒有在播廣告時才能顯示字幕。 */
export function canShowSubtitles(state: SessionState): boolean {
  return state.videoId !== null && !state.adShowing;
}

export function isCurrentSession(
  state: SessionState,
  sessionId: number,
): boolean {
  return state.videoId !== null && state.sessionId === sessionId;
}

function reducePlayer(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'player' }>,
): SessionResult {
  // 播放器還沒準備好時會回報 null，這不代表影片結束。
  if (event.videoId === null) return { state, effects: [] };

  if (event.videoId !== state.videoId) {
    const sessionId = state.sessionId + 1;
    return {
      state: {
        sessionId,
        videoId: event.videoId,
        adShowing: event.adShowing,
        captionKeys: [],
      },
      effects: [
        {
          type: 'session-started',
          sessionId,
          videoId: event.videoId,
          adShowing: event.adShowing,
        },
      ],
    };
  }

  if (event.adShowing === state.adShowing) return { state, effects: [] };

  return {
    state: { ...state, adShowing: event.adShowing },
    effects: [
      {
        type: event.adShowing ? 'ad-started' : 'ad-ended',
        sessionId: state.sessionId,
      },
    ],
  };
}

function reduceCaptions(
  state: SessionState,
  event: Extract<SessionEvent, { type: 'caption-response' }>,
): SessionResult {
  const { videoId } = state;
  if (
    videoId === null ||
    event.videoId !== videoId ||
    event.status !== 200 ||
    event.bytes <= 0
  ) {
    return { state, effects: [] };
  }

  const key = `${String(event.lang)}|${String(event.kind)}`;
  if (state.captionKeys.includes(key)) return { state, effects: [] };

  return {
    state: { ...state, captionKeys: [...state.captionKeys, key] },
    effects: [
      {
        type: 'captions-received',
        sessionId: state.sessionId,
        videoId,
        lang: event.lang,
        kind: event.kind,
      },
    ],
  };
}
