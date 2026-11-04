import type { LanguagePair } from './google';

export const TRANSLATE_PORT = 'translate';

export interface TranslateRequest {
  readonly type: 'translate';
  readonly languages: LanguagePair;
  readonly texts: readonly string[];
}

export type TranslateResponse =
  | { readonly ok: true; readonly translations: readonly string[] }
  | { readonly ok: false; readonly error: string };

export function isTranslateRequest(value: unknown): value is TranslateRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<TranslateRequest>;
  return (
    v.type === 'translate' &&
    typeof v.languages?.source === 'string' &&
    typeof v.languages.target === 'string' &&
    Array.isArray(v.texts) &&
    v.texts.every((text) => typeof text === 'string')
  );
}

export function isTranslateResponse(
  value: unknown,
): value is TranslateResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { ok?: unknown; translations?: unknown; error?: unknown };
  return v.ok === true
    ? Array.isArray(v.translations) &&
        v.translations.every((text) => typeof text === 'string')
    : v.ok === false && typeof v.error === 'string';
}
