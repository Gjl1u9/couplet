import type { CaptionTrack } from './captions';

/**
 * 要求播放器載入字幕軌。
 *
 * 使用者把 CC 關掉時，播放器不會先載入字幕，這時太早呼叫 setOption 不會有效果，
 * 也不會報錯。所以這裡持續重試，直到呼叫端收到字幕並呼叫 cancel，或用完重試次數。
 */

export interface CaptionPlayer {
  loadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  getOption?: (
    module: string,
    option: string,
  ) => { languageCode?: string; kind?: string } | null | undefined;
}

export interface TrackRequesterOptions {
  readonly getPlayer: () => CaptionPlayer | null;
  /** 廣告期間回傳 false。這段時間不會消耗重試次數。 */
  readonly canRequest: () => boolean;
  readonly onGiveUp: (track: CaptionTrack) => void;
  readonly retryDelaysMs?: readonly number[];
}

export interface TrackRequester {
  request: (track: CaptionTrack) => void;
  cancel: () => void;
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16_000];

export function createTrackRequester(
  options: TrackRequesterOptions,
): TrackRequester {
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const send = (player: CaptionPlayer, track: CaptionTrack) => {
    player.loadModule?.('captions');
    const active = player.getOption?.('captions', 'track');
    if (
      active?.languageCode === track.languageCode &&
      (active.kind ?? '') === (track.kind ?? '')
    ) {
      // 已經選好同一條字幕軌時，設定 track 不會發出請求。
      player.setOption?.('captions', 'reload', true);
      return;
    }
    player.setOption?.('captions', 'track', {
      languageCode: track.languageCode,
      ...(track.kind ? { kind: track.kind } : {}),
    });
  };

  const attempt = (track: CaptionTrack, retryIndex: number) => {
    timer = null;
    const player = options.getPlayer();
    const ready = player !== null && options.canRequest();
    if (ready) {
      try {
        send(player, track);
      } catch (error) {
        console.warn('[dual-subtitles] 載入字幕軌失敗', error);
      }
    }

    const delayIndex = ready ? retryIndex : Math.max(0, retryIndex - 1);
    const delay = delays[delayIndex];
    if (delay === undefined) {
      options.onGiveUp(track);
      return;
    }
    timer = setTimeout(() => {
      attempt(track, ready ? retryIndex + 1 : retryIndex);
    }, delay);
  };

  return {
    request(track) {
      cancel();
      attempt(track, 0);
    },
    cancel,
  };
}
