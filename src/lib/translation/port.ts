import type { LanguagePair } from './google';
import {
  isTranslateRequest,
  isTranslateResponse,
  type TranslateResponse,
} from './messages';
import type { Translate } from './queue';

/**
 * 內容腳本和 service worker 之間，每個翻譯請求用一條 Port。
 * 一般訊息沒辦法取消，Port 斷線時 service worker 可以中止對翻譯服務的請求。
 */

export interface PortLike {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (listener: (message: unknown) => void) => void };
  onDisconnect: { addListener: (listener: () => void) => void };
}

export function createPortTranslate(
  languages: LanguagePair,
  connect: () => PortLike,
): Translate {
  return (texts, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('翻譯請求已取消'));
        return;
      }
      const port = connect();
      let settled = false;
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        action();
      };
      const onAbort = () => {
        settle(() => {
          port.disconnect();
          reject(new Error('翻譯請求已取消'));
        });
      };
      signal.addEventListener('abort', onAbort);

      port.onDisconnect.addListener(() => {
        settle(() => {
          reject(new Error('翻譯服務連線中斷'));
        });
      });
      port.onMessage.addListener((message) => {
        settle(() => {
          port.disconnect();
          if (!isTranslateResponse(message)) {
            reject(new Error('翻譯回應格式錯誤'));
          } else if (message.ok) {
            resolve(message.translations);
          } else {
            reject(new Error(message.error));
          }
        });
      });
      port.postMessage({ type: 'translate', languages, texts });
    });
}

export function servePortTranslate(
  port: PortLike,
  createTranslate: (languages: LanguagePair) => Translate,
): void {
  const controller = new AbortController();
  let closed = false;
  port.onDisconnect.addListener(() => {
    closed = true;
    controller.abort();
  });

  const respond = (response: TranslateResponse) => {
    if (!closed) port.postMessage(response);
  };

  port.onMessage.addListener((message) => {
    if (!isTranslateRequest(message)) {
      respond({ ok: false, error: '翻譯請求格式錯誤' });
      return;
    }
    createTranslate(message.languages)(message.texts, controller.signal).then(
      (translations) => {
        respond({ ok: true, translations });
      },
      (error: unknown) => {
        respond({ ok: false, error: String(error) });
      },
    );
  });
}
