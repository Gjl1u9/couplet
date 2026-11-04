import type { Translate } from '../translation/queue';
import {
  createTranslationQueue,
  type TranslationQueue,
} from '../translation/queue';
import { parseCaptions } from '../youtube/captions';
import {
  canShowSubtitles,
  initialSessionState,
  reduceSession,
  type SessionEffect,
  type SessionState,
} from '../youtube/session';
import { SubtitleStore } from './store';

export interface SubtitleView {
  readonly original: string;
  readonly translation: string | null;
}

export type ControllerEvent =
  | {
      readonly type: 'player';
      readonly videoId: string | null;
      readonly adShowing: boolean;
    }
  | {
      readonly type: 'captions';
      readonly videoId: string;
      readonly lang: string | null;
      readonly kind: string | null;
      readonly status: number;
      readonly body: string;
    };

export interface ControllerOptions {
  readonly targetLanguage: string;
  readonly createTranslate: (source: string) => Translate;
  /** 目前影片的播放時間（秒）。 */
  readonly getTime: () => number;
  /** 內容改變時才會呼叫，所以實作不需要自行比對。 */
  readonly render: (view: SubtitleView | null) => void;
  /** 我們有字幕時，隱藏 YouTube 自己的字幕。 */
  readonly setNativeCaptionsHidden: (hidden: boolean) => void;
  readonly onError?: (message: string, error: unknown) => void;
}

export interface SubtitleController {
  handle: (event: ControllerEvent) => void;
  /** 依目前時間更新畫面，回傳下一次字幕會改變的影片時間。 */
  update: () => number | null;
  seek: () => void;
  dispose: () => void;
}

const ASR_MAX_CUES_PER_BATCH = 60;

function sameLanguage(a: string, b: string): boolean {
  return a.split('-')[0]?.toLowerCase() === b.split('-')[0]?.toLowerCase();
}

export function createSubtitleController(
  options: ControllerOptions,
): SubtitleController {
  let session: SessionState = initialSessionState;
  let store: SubtitleStore | null = null;
  let queue: TranslationQueue | null = null;
  let lastViewKey: string | null = null;
  let nativeHidden = false;

  const setNativeHidden = (hidden: boolean) => {
    if (hidden === nativeHidden) return;
    nativeHidden = hidden;
    options.setNativeCaptionsHidden(hidden);
  };

  const teardown = () => {
    queue?.dispose();
    queue = null;
    store = null;
    setNativeHidden(false);
  };

  const update = (): number | null => {
    const time = options.getTime();
    const visible = store !== null && canShowSubtitles(session);
    const cue = visible ? store?.cueAt(time) : null;
    const view: SubtitleView | null = cue
      ? { original: cue.text, translation: cue.translation }
      : null;
    const key = view ? JSON.stringify(view) : '';
    if (key !== lastViewKey) {
      lastViewKey = key;
      options.render(view);
    }
    return visible ? (store?.nextChangeAfter(time) ?? null) : null;
  };

  const startCaptions = (
    event: Extract<ControllerEvent, { type: 'captions' }>,
  ) => {
    let parsed;
    try {
      parsed = parseCaptions(event.body, event.kind);
    } catch (error) {
      options.onError?.('字幕解析失敗', error);
      return;
    }
    if (parsed.length === 0) return;

    const current = new SubtitleStore(parsed);
    store = current;
    setNativeHidden(true);

    const source = event.lang;
    if (source === null || sameLanguage(source, options.targetLanguage)) return;

    queue = createTranslationQueue({
      cues: current.allCues,
      translate: options.createTranslate(source),
      ...(event.kind === 'asr'
        ? { maxCuesPerBatch: ASR_MAX_CUES_PER_BATCH }
        : {}),
      onTranslated: (results) => {
        for (const { id, translation } of results) {
          current.setTranslation(id, translation);
        }
        update();
      },
      onBatchFailed: (_ids, error) => {
        options.onError?.('翻譯失敗', error);
      },
      onComplete: () => undefined,
    });
    // 廣告期間的時間是廣告的，先從頭翻，廣告結束時再對準播放位置。
    queue.start(canShowSubtitles(session) ? options.getTime() : 0);
  };

  const applyEffect = (effect: SessionEffect, event: ControllerEvent): void => {
    switch (effect.type) {
      case 'session-started':
        teardown();
        break;
      case 'ad-ended':
        queue?.seek(options.getTime());
        break;
      case 'ad-started':
        break;
      case 'captions-received':
        if (event.type === 'captions') startCaptions(event);
        break;
    }
  };

  return {
    handle(event) {
      const result = reduceSession(
        session,
        event.type === 'player'
          ? event
          : {
              type: 'caption-response',
              videoId: event.videoId,
              lang: event.lang,
              kind: event.kind,
              status: event.status,
              bytes: event.body.length,
            },
      );
      session = result.state;
      for (const effect of result.effects) applyEffect(effect, event);
      update();
    },
    update,
    seek() {
      if (canShowSubtitles(session)) queue?.seek(options.getTime());
      update();
    },
    dispose() {
      teardown();
      update();
    },
  };
}
