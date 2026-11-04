import type { Translate } from './queue';

export interface LanguagePair {
  readonly source: string;
  readonly target: string;
}

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t';

export class TranslationHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`翻譯服務回應 ${String(status)}`);
    this.name = 'TranslationHttpError';
    this.status = status;
  }
}

/** 回應是字串陣列；來源語言為 auto 時，每項是 [譯文, 語言]。 */
export function parseGoogleResponse(body: unknown): string[] {
  if (!Array.isArray(body)) throw new Error('翻譯回應格式錯誤');
  return body.map((item: unknown) => {
    if (typeof item === 'string') return item;
    if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
    throw new Error('翻譯回應格式錯誤');
  });
}

/** Google 的免費端點沒有穩定性保證，所以只透過 Translate 介面使用，之後可以替換。 */
export function createGoogleTranslate(
  languages: LanguagePair,
  fetchFn: typeof fetch = fetch,
): Translate {
  return async (texts, signal) => {
    const url = new URL(ENDPOINT);
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', languages.source);
    url.searchParams.set('tl', languages.target);
    url.searchParams.set('format', 'text');

    const body = new URLSearchParams();
    for (const text of texts) body.append('q', text);

    const response = await fetchFn(url, { method: 'POST', body, signal });
    if (!response.ok) throw new TranslationHttpError(response.status);
    return parseGoogleResponse(await response.json());
  };
}
