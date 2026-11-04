import { createGoogleTranslate } from '../lib/translation/google';
import { TRANSLATE_PORT } from '../lib/translation/messages';
import { servePortTranslate } from '../lib/translation/port';

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;
    if (port.sender?.id !== browser.runtime.id) return;
    servePortTranslate(port, (languages) => createGoogleTranslate(languages));
  });

  if (import.meta.env.MODE === 'development') {
    browser.runtime.onMessage.addListener((message: unknown, sender) => {
      if (
        sender.id === browser.runtime.id &&
        (message as { type?: string } | null)?.type === 'dev-reload'
      ) {
        browser.runtime.reload();
      }
    });
  }
});
