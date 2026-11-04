import type { CaptionTrack } from './captions';

/**
 * 要求播放器載入字幕軌。
 *
 * 使用者把 CC 關掉時，播放器不會先載入字幕，這時太早呼叫 setOption 不會有效果，
 * 也不會報錯。所以這裡持續重試，直到呼叫端收到字幕並呼叫 finish，或用完重試次數。
 *
 * 選字幕軌會改變使用者的 CC 狀態。我們用自己的 overlay 顯示，不需要它一直開著，
 * 所以結束時要還原，否則移除擴充功能後字幕可能還開著。
 */

interface ActiveTrack {
  languageCode?: string;
  kind?: string;
}

export interface CaptionPlayer {
  loadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  getOption?: (
    module: string,
    option: string,
  ) => ActiveTrack | null | undefined;
}

export interface TrackRequesterOptions {
  readonly getPlayer: () => CaptionPlayer | null;
  /** 廣告期間回傳 false。這段時間不會消耗重試次數。 */
  readonly canRequest: () => boolean;
  readonly onGiveUp: (track: CaptionTrack) => void;
  readonly retryDelaysMs?: readonly number[];
  /**
   * 第一次請求前先等一下。CC 開著時，播放器會自己載入字幕，這樣就不用動它的狀態。
   * 頁面剛載入時也還讀不到使用者的 CC 狀態，太早讀會誤以為是關著的。
   */
  readonly initialDelayMs?: number;
}

export interface TrackRequester {
  request: (track: CaptionTrack) => void;
  /** 停止重試，並把 CC 還原成請求之前的狀態。 */
  finish: () => void;
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16_000];
const DEFAULT_INITIAL_DELAY_MS = 1500;

function toOption(track: ActiveTrack | CaptionTrack): ActiveTrack {
  return {
    ...(track.languageCode ? { languageCode: track.languageCode } : {}),
    ...(track.kind ? { kind: track.kind } : {}),
  };
}

function sameTrack(
  a: ActiveTrack | CaptionTrack | null | undefined,
  b: ActiveTrack | CaptionTrack | null | undefined,
): boolean {
  return (
    (a?.languageCode ?? '') === (b?.languageCode ?? '') &&
    (a?.kind ?? '') === (b?.kind ?? '')
  );
}

export function createTrackRequester(
  options: TrackRequesterOptions,
): TrackRequester {
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** undefined 代表這次還沒有動過播放器，不需要還原。 */
  let previous: ActiveTrack | null | undefined;

  const finish = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;

    const original = previous;
    previous = undefined;
    if (original === undefined) return;
    try {
      const player = options.getPlayer();
      const active = player?.getOption?.('captions', 'track');
      if (sameTrack(active, original)) return;
      // 空物件代表關閉字幕。
      player?.setOption?.(
        'captions',
        'track',
        original?.languageCode ? toOption(original) : {},
      );
    } catch (error) {
      console.warn('[dual-subtitles] 還原字幕狀態失敗', error);
    }
  };

  const send = (player: CaptionPlayer, track: CaptionTrack) => {
    player.loadModule?.('captions');
    const active = player.getOption?.('captions', 'track');
    if (previous === undefined) previous = active ?? null;
    if (sameTrack(active, track)) {
      // 已經選好同一條字幕軌時，設定 track 不會發出請求。
      player.setOption?.('captions', 'reload', true);
      return;
    }
    player.setOption?.('captions', 'track', toOption(track));
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
      finish();
      options.onGiveUp(track);
      return;
    }
    timer = setTimeout(() => {
      attempt(track, ready ? retryIndex + 1 : retryIndex);
    }, delay);
  };

  return {
    request(track) {
      finish();
      if (initialDelay > 0) {
        timer = setTimeout(() => {
          attempt(track, 0);
        }, initialDelay);
      } else {
        attempt(track, 0);
      }
    },
    finish,
  };
}
