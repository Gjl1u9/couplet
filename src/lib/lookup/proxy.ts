import { toWordEntry } from './entry';
import type { LookupService, WordEntry } from './types';

export const LOOKUP_ENDPOINT = 'https://api.coupletapp.com/v1/lookup';

/** Survives the port between the background script and the video tab, as text. */
export const LOOKUP_BUSY = 'lookup-busy';

export interface ProxyLookupOptions {
  /** `null` when signed out: lookups do not need an account. */
  readonly accessToken: () => Promise<string | null>;
  /** Guards against abuse for someone without an account. */
  readonly installId: () => Promise<string>;
  readonly fetchFn?: typeof fetch;
  readonly endpoint?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;

interface ProxyBody {
  readonly entry?: unknown;
  readonly error?: unknown;
}

/** Looks up words through our service, which holds the AI key. */
export function createProxyLookup(options: ProxyLookupOptions): LookupService {
  const fetchFn = options.fetchFn ?? fetch;
  return {
    async lookUp(word, { source, target }, signal) {
      // Lookups work without an account, so a failure to read the session changes nothing.
      const token = await options.accessToken().catch(() => null);
      const response = await fetchFn(options.endpoint ?? LOOKUP_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-install-id': await options.installId(),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ word, source, target }),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
      const body = (await response.json().catch(() => ({}))) as ProxyBody;
      if (body.error === 'service_busy') throw new Error(LOOKUP_BUSY);
      if (!response.ok) {
        throw new Error(`查字服務回應 ${String(response.status)}`);
      }
      if (body.entry === null) return null;
      const entry: WordEntry | null = toWordEntry(body.entry);
      if (!entry) throw new Error('查字回應格式錯誤');
      return entry;
    },
  };
}

/** Sent when the pointer reaches the subtitles, before any word is clicked. */
export const LOOKUP_WARM = 'lookup-warm';

export const isLookupWarmMessage = (message: unknown): boolean =>
  (message as { type?: unknown } | null)?.type === LOOKUP_WARM;

/**
 * Opens the connection to our service ahead of the click, so the lookup skips the
 * handshake. A preflight-style request, so it costs no quota and reaches no model.
 */
export function warmLookup(
  fetchFn: typeof fetch = fetch,
  endpoint: string = LOOKUP_ENDPOINT,
): Promise<void> {
  return fetchFn(endpoint, { method: 'OPTIONS' }).then(
    () => undefined,
    () => undefined,
  );
}

/** What the Lookup Panel says when a lookup fails, and whether trying again can help. */
export function lookupFailure(error: unknown): {
  readonly text: string;
  readonly canRetry: boolean;
} {
  const message = String(error);
  if (message.includes(LOOKUP_BUSY)) {
    return {
      text: 'Lookups are busy right now. Try again later.',
      canRetry: false,
    };
  }
  return { text: "Couldn't reach the dictionary", canRetry: true };
}
