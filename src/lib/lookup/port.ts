import type { LanguagePair } from '../translation/google';
import type { PortLike } from '../translation/port';
import { toWordEntry } from './entry';
import type { LookupService, WordEntry } from './types';

export const LOOKUP_PORT = 'lookup';

interface LookupRequest {
  readonly word: string;
  readonly languages: LanguagePair;
}

type LookupResponse =
  | { readonly ok: true; readonly value: WordEntry | null }
  | { readonly ok: false; readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isLookupRequest(value: unknown): value is LookupRequest {
  return (
    isRecord(value) &&
    typeof value.word === 'string' &&
    isRecord(value.languages) &&
    typeof value.languages.source === 'string' &&
    typeof value.languages.target === 'string'
  );
}

/** One port per request, so closing the panel can cancel the service worker's work. */
export function createPortLookup(connect: () => PortLike): LookupService {
  return {
    lookUp: (word, languages, signal) =>
      new Promise<WordEntry | null>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error('查字已取消'));
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
            reject(new Error('查字已取消'));
          });
        };
        signal.addEventListener('abort', onAbort);
        port.onDisconnect.addListener(() => {
          settle(() => {
            reject(new Error('查字服務連線中斷'));
          });
        });
        port.onMessage.addListener((message) => {
          settle(() => {
            port.disconnect();
            const response = message as Partial<LookupResponse> | null;
            if (response?.ok === false && typeof response.error === 'string') {
              reject(new Error(response.error));
              return;
            }
            const entry = response?.ok ? toWordEntry(response.value) : null;
            if (entry || (response?.ok && response.value === null)) {
              resolve(entry);
            } else {
              reject(new Error('查字回應格式錯誤'));
            }
          });
        });
        const request: LookupRequest = { word, languages };
        port.postMessage(request);
      }),
  };
}

export function servePortLookup(port: PortLike, service: LookupService): void {
  const controller = new AbortController();
  let closed = false;
  port.onDisconnect.addListener(() => {
    closed = true;
    controller.abort();
  });
  const respond = (response: LookupResponse) => {
    if (!closed) port.postMessage(response);
  };
  port.onMessage.addListener((message) => {
    if (!isLookupRequest(message)) {
      respond({ ok: false, error: '查字請求格式錯誤' });
      return;
    }
    service.lookUp(message.word, message.languages, controller.signal).then(
      (value) => {
        respond({ ok: true, value });
      },
      (error: unknown) => {
        respond({ ok: false, error: String(error) });
      },
    );
  });
}

/**
 * A word's entry does not depend on its cue, so each paid lookup is shared by every
 * later click on that word. Requests outlive the panel, because the result stays useful.
 */
export function createCachedLookup(
  service: LookupService,
  maxEntries = 300,
): LookupService {
  const keepRunning = new AbortController().signal;
  const cache = new Map<string, Promise<WordEntry | null>>();
  return {
    lookUp(word, languages) {
      const key = JSON.stringify([word, languages.source, languages.target]);
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const pending = service.lookUp(word, languages, keepRunning);
      cache.set(key, pending);
      pending.catch(() => {
        if (cache.get(key) === pending) cache.delete(key);
      });
      if (cache.size > maxEntries) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      return pending;
    },
  };
}
