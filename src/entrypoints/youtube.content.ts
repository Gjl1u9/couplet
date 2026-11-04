import { createSubtitleController } from '../lib/subtitles/controller';
import { createOverlay } from '../lib/subtitles/overlay';
import type { LanguagePair } from '../lib/translation/google';
import type {
  TranslateRequest,
  TranslateResponse,
} from '../lib/translation/messages';
import type { Translate } from '../lib/translation/queue';
import { parseBridgeMessage } from '../lib/youtube/bridge';

const TARGET_LANGUAGE = 'zh-TW';
const PLAYBACK_EVENTS = [
  'timeupdate',
  'seeked',
  'playing',
  'pause',
  'ratechange',
];

const remoteTranslate =
  (languages: LanguagePair): Translate =>
  async (texts) => {
    const request: TranslateRequest = { type: 'translate', languages, texts };
    const response = await browser.runtime.sendMessage<
      TranslateRequest,
      TranslateResponse
    >(request);
    if (!response.ok) throw new Error(response.error);
    return response.translations;
  };

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  main() {
    const mainVideo = () =>
      document.querySelector<HTMLVideoElement>(
        '#movie_player video.html5-main-video',
      );
    const overlay = createOverlay();
    let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const controller = createSubtitleController({
      targetLanguage: TARGET_LANGUAGE,
      createTranslate: (source) =>
        remoteTranslate({ source, target: TARGET_LANGUAGE }),
      getTime: () => mainVideo()?.currentTime ?? 0,
      render: overlay.render,
      setNativeCaptionsHidden: overlay.setNativeCaptionsHidden,
      onError: (message, error) => {
        console.warn(`[dual-subtitles] ${message}`, error);
      },
    });

    /**
     * 擴充功能更新或重新載入後，頁面上的舊腳本會和它斷線，也沒辦法再翻譯。
     * 這時要自己收尾，把字幕交還給 YouTube。
     */
    const stopIfDisconnected = (): boolean => {
      if (stopped) return true;
      if (browser.runtime.id) return false;
      stopped = true;
      if (boundaryTimer !== null) clearTimeout(boundaryTimer);
      boundaryTimer = null;
      controller.dispose();
      overlay.dispose();
      return true;
    };

    /** timeupdate 每秒只有約 4 次，所以另外對準下一句的時間。 */
    const refresh = () => {
      if (boundaryTimer !== null) clearTimeout(boundaryTimer);
      boundaryTimer = null;
      if (stopIfDisconnected()) return;
      const next = controller.update();
      const video = mainVideo();
      if (next === null || !video || video.paused) return;
      const delay = (next - video.currentTime) / (video.playbackRate || 1);
      boundaryTimer = setTimeout(refresh, Math.max(0, delay * 1000) + 10);
    };

    const isMainVideo = (event: Event) => event.target === mainVideo();
    for (const type of PLAYBACK_EVENTS) {
      document.addEventListener(
        type,
        (event) => {
          if (isMainVideo(event)) refresh();
        },
        { capture: true },
      );
    }
    document.addEventListener(
      'seeking',
      (event) => {
        if (isMainVideo(event) && !stopIfDisconnected()) controller.seek();
      },
      { capture: true },
    );

    window.addEventListener('message', (message) => {
      if (message.source !== window) return;
      if (import.meta.env.MODE === 'development') {
        if (
          (message.data as { __dualSubtitlesDevReload?: boolean } | null)
            ?.__dualSubtitlesDevReload
        ) {
          void browser.runtime.sendMessage({ type: 'dev-reload' });
          return;
        }
      }
      const event = parseBridgeMessage(message.data);
      if (!event || stopIfDisconnected()) return;
      controller.handle(event);
      refresh();
    });
  },
});
