import { createGoogleTranslate } from '../lib/translation/google';
import {
  isTranslateRequest,
  type TranslateResponse,
} from '../lib/translation/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;

      if (import.meta.env.MODE === 'development') {
        if ((message as { type?: string } | null)?.type === 'dev-reload') {
          browser.runtime.reload();
          return false;
        }
      }

      if (!isTranslateRequest(message)) return false;
      const respond = sendResponse as (response: TranslateResponse) => void;
      createGoogleTranslate(message.languages)(
        message.texts,
        new AbortController().signal,
      ).then(
        (translations) => {
          respond({ ok: true, translations });
        },
        (error: unknown) => {
          respond({ ok: false, error: String(error) });
        },
      );
      return true;
    },
  );
});
