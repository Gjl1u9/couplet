import { observeClass } from '../dom/observers';
import type { ControllerEvent } from '../subtitles/controller';
import { toBridgeMessage } from './bridge';
import {
  selectSourceTrack,
  type CaptionTrack,
  type CaptionTracklist,
} from './captions';

/**
 * 在頁面環境執行：回報播放器狀態、讀取字幕，並要求播放器載入選定的字幕軌。
 * 字幕網址需要播放器產生的 token，所以直接攔截播放器自己的請求。
 */

interface YouTubePlayer extends Element {
  getVideoData?: () => { video_id?: string } | undefined;
  getPlayerResponse?: () =>
    | {
        videoDetails?: { videoId?: string };
        captions?: { playerCaptionsTracklistRenderer?: CaptionTracklist };
      }
    | undefined;
  loadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
}

interface CapturedCaptions {
  readonly videoId: string;
  readonly lang: string | null;
  readonly kind: string | null;
  readonly status: number;
  readonly body: string;
}

const NAVIGATION_EVENTS = [
  'yt-navigate-start',
  'yt-navigate-finish',
  'yt-player-updated',
  'yt-page-data-updated',
];
const VIDEO_EVENTS = ['loadstart', 'loadedmetadata', 'playing', 'emptied'];
const MAX_CAPTURED = 8;

const captureKey = (lang: string | null, kind: string | null) =>
  `${String(lang)}|${String(kind)}`;

export function startPageAgent(): void {
  let player: YouTubePlayer | null = null;
  let playerWatcher: AbortController | null = null;
  let lastReport = '';
  let selected: { videoId: string; key: string | null } | null = null;
  let forwarded = false;
  const captured = new Map<string, CapturedCaptions>();

  const post = (event: ControllerEvent) => {
    window.postMessage(toBridgeMessage(event), location.origin);
  };

  const forward = (captions: CapturedCaptions) => {
    if (forwarded) return;
    forwarded = true;
    post({ type: 'captions', ...captions });
  };

  const onCaptured = (captions: CapturedCaptions) => {
    captured.set(
      `${captions.videoId}|${captureKey(captions.lang, captions.kind)}`,
      captions,
    );
    if (captured.size > MAX_CAPTURED) {
      const oldest = captured.keys().next();
      if (!oldest.done) captured.delete(oldest.value);
    }
    if (
      selected?.videoId === captions.videoId &&
      selected.key === captureKey(captions.lang, captions.kind) &&
      captions.status === 200 &&
      captions.body !== ''
    ) {
      forward(captions);
    }
  };

  const requestTrack = (target: YouTubePlayer, track: CaptionTrack) => {
    target.loadModule?.('captions');
    target.setOption?.('captions', 'track', {
      languageCode: track.languageCode,
      ...(track.kind ? { kind: track.kind } : {}),
    });
    // 同一條字幕軌已經選好時，上面不會發出請求。
    target.setOption?.('captions', 'reload', true);
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
    if (!track) {
      selected = { videoId, key: null };
      return;
    }
    const key = captureKey(track.languageCode, track.kind ?? null);
    selected = { videoId, key };

    const existing = captured.get(`${videoId}|${key}`);
    if (existing?.status === 200 && existing.body !== '') {
      forward(existing);
    } else {
      requestTrack(target, track);
    }
  };

  const report = () => {
    try {
      const current = document.querySelector<YouTubePlayer>('#movie_player');
      if (current !== player) {
        player = current;
        playerWatcher?.abort();
        playerWatcher = null;
        if (current) {
          playerWatcher = new AbortController();
          observeClass(current, playerWatcher.signal, report);
        }
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

  patchXhr(onCaptured);

  for (const type of NAVIGATION_EVENTS) window.addEventListener(type, report);
  for (const type of VIDEO_EVENTS) {
    document.addEventListener(type, report, { capture: true });
  }
  report();
}

function patchXhr(onCaptured: (captions: CapturedCaptions) => void): void {
  const proto = XMLHttpRequest.prototype;
  // 會在下面用 apply 帶回原本的 this。
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalOpen = proto.open;

  proto.open = function patchedOpen(
    this: XMLHttpRequest,
    ...args: Parameters<typeof originalOpen>
  ) {
    const url = captionRequestUrl(args[1]);
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

function captionRequestUrl(raw: string | URL): URL | null {
  try {
    const url = new URL(raw, location.href);
    return url.pathname === '/api/timedtext' ? url : null;
  } catch {
    return null;
  }
}
