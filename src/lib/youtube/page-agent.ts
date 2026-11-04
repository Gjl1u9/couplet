import { observeClass } from '../dom/observers';
import type { ControllerEvent } from '../subtitles/controller';
import { toBridgeMessage } from './bridge';
import { selectSourceTrack, type CaptionTracklist } from './captions';
import {
  createTrackRequester,
  type CaptionPlayer,
  type TrackRequester,
} from './track-requester';

/**
 * 在頁面環境執行：回報播放器狀態、讀取字幕，並要求播放器載入選定的字幕軌。
 * 字幕網址需要播放器產生的 token，所以直接攔截播放器自己的請求。
 */

export interface YouTubePlayer extends Element, CaptionPlayer {
  getVideoData?: () => { video_id?: string } | undefined;
  getPlayerResponse?: () =>
    | {
        videoDetails?: { videoId?: string };
        captions?: { playerCaptionsTracklistRenderer?: CaptionTracklist };
      }
    | undefined;
}

export interface CapturedCaptions {
  readonly videoId: string;
  readonly lang: string | null;
  readonly kind: string | null;
  readonly status: number;
  readonly body: string;
}

export interface PageAgentDeps {
  readonly getPlayer: () => YouTubePlayer | null;
  readonly post: (event: ControllerEvent) => void;
  readonly requester: TrackRequester;
  /** 播放器元素換掉時呼叫，用來重新監聽它的 class。 */
  readonly watchPlayer: (player: YouTubePlayer | null) => void;
}

export interface PageAgent {
  report: () => void;
  onCaptured: (captions: CapturedCaptions) => void;
}

/**
 * 字幕可能比播放器回報的影片 ID 更早抵達，所以要暫存，但一份長影片字幕可以超過 2 MB，
 * 廣告和首頁預覽的字幕也會進來，所以只留最新的幾份，選好字幕軌後就全部釋放。
 */
const MAX_PENDING_CAPTIONS = 2;

const captureKey = (lang: string | null, kind: string | null) =>
  `${String(lang)}|${String(kind)}`;

export function createPageAgent(deps: PageAgentDeps): PageAgent {
  const { post, requester } = deps;
  let player: YouTubePlayer | null = null;
  let lastReport = '';
  let selected: { videoId: string; key: string | null } | null = null;
  let forwarded = false;
  const pendingCaptions = new Map<string, CapturedCaptions>();

  const forward = (captions: CapturedCaptions) => {
    requester.finish();
    if (forwarded) return;
    forwarded = true;
    post({ type: 'captions', ...captions });
  };

  const onCaptured = (captions: CapturedCaptions) => {
    if (captions.status !== 200 || captions.body === '') return;

    if (selected?.videoId === captions.videoId) {
      if (selected.key === captureKey(captions.lang, captions.kind)) {
        forward(captions);
      }
      // 同一支影片的其他字幕軌用不到，例如還原使用者原本的 CC 語言。
      return;
    }

    const key = `${captions.videoId}|${captureKey(captions.lang, captions.kind)}`;
    pendingCaptions.delete(key);
    pendingCaptions.set(key, captions);
    if (pendingCaptions.size > MAX_PENDING_CAPTIONS) {
      const oldest = pendingCaptions.keys().next();
      if (!oldest.done) pendingCaptions.delete(oldest.value);
    }
  };

  const selectTrack = (target: YouTubePlayer, videoId: string) => {
    if (selected?.videoId === videoId) return;
    const response = target.getPlayerResponse?.();
    // 切換影片時，播放器可能還保留上一支影片的資料。
    if (response?.videoDetails?.videoId !== videoId) return;

    const track = selectSourceTrack(
      response.captions?.playerCaptionsTracklistRenderer,
    );
    forwarded = false;
    requester.finish();
    const key = track
      ? captureKey(track.languageCode, track.kind ?? null)
      : null;
    selected = { videoId, key };

    const existing = pendingCaptions.get(`${videoId}|${String(key)}`);
    pendingCaptions.clear();
    if (!track) return;
    if (existing) forward(existing);
    else requester.request(track);
  };

  const report = () => {
    try {
      const current = deps.getPlayer();
      if (current !== player) {
        player = current;
        deps.watchPlayer(current);
      }
      if (!current) return;

      const videoId = current.getVideoData?.()?.video_id ?? null;
      const adShowing = current.classList.contains('ad-showing');
      const key = `${String(videoId)}|${String(adShowing)}`;
      if (key !== lastReport) {
        lastReport = key;
        post({ type: 'player', videoId, adShowing });
      }
      // 廣告期間播放器的字幕屬於廣告，等正片開始再選。
      if (videoId && !adShowing) selectTrack(current, videoId);
    } catch (error) {
      console.error('[dual-subtitles] 讀取播放器失敗', error);
    }
  };

  return { report, onCaptured };
}

/** 攔截字幕請求。只讀取回應，不影響播放器。 */
export function patchXhr(
  proto: Pick<typeof XMLHttpRequest.prototype, 'open'>,
  baseUrl: () => string,
  onCaptured: (captions: CapturedCaptions) => void,
): void {
  // 會在下面用 apply 帶回原本的 this。

  const originalOpen = proto.open;

  proto.open = function patchedOpen(
    this: XMLHttpRequest,
    ...args: Parameters<typeof originalOpen>
  ) {
    const url = captionRequestUrl(args[1], baseUrl());
    if (url) {
      this.addEventListener('load', () => {
        const videoId = url.searchParams.get('v');
        if (!videoId || url.searchParams.has('tlang')) return;
        if (this.responseType !== '' && this.responseType !== 'text') return;
        onCaptured({
          videoId,
          lang: url.searchParams.get('lang'),
          kind: url.searchParams.get('kind'),
          status: this.status,
          body: this.responseText,
        });
      });
    }
    originalOpen.apply(this, args);
  } as typeof originalOpen;
}

function captionRequestUrl(raw: string | URL, base: string): URL | null {
  try {
    const url = new URL(raw, base);
    return url.pathname === '/api/timedtext' ? url : null;
  } catch {
    return null;
  }
}

const NAVIGATION_EVENTS = [
  'yt-navigate-start',
  'yt-navigate-finish',
  'yt-player-updated',
  'yt-page-data-updated',
];
const VIDEO_EVENTS = ['loadstart', 'loadedmetadata', 'playing', 'emptied'];

export function startPageAgent(): void {
  const getPlayer = () =>
    document.querySelector<YouTubePlayer>('#movie_player');
  let playerWatcher: AbortController | null = null;

  const agent: PageAgent = createPageAgent({
    getPlayer,
    post: (event) => {
      window.postMessage(toBridgeMessage(event), location.origin);
    },
    requester: createTrackRequester({
      getPlayer,
      canRequest: () => !getPlayer()?.classList.contains('ad-showing'),
      onGiveUp: (track) => {
        console.warn('[dual-subtitles] 無法載入字幕軌', track.languageCode);
      },
    }),
    watchPlayer: (player) => {
      playerWatcher?.abort();
      playerWatcher = null;
      if (player) {
        playerWatcher = new AbortController();
        observeClass(player, playerWatcher.signal, () => {
          agent.report();
        });
      }
    },
  });

  patchXhr(
    XMLHttpRequest.prototype,
    () => location.href,
    (captions) => {
      agent.onCaptured(captions);
    },
  );

  for (const type of NAVIGATION_EVENTS) {
    window.addEventListener(type, () => {
      agent.report();
    });
  }
  for (const type of VIDEO_EVENTS) {
    document.addEventListener(
      type,
      () => {
        agent.report();
      },
      { capture: true },
    );
  }
  agent.report();
}
