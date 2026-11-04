import type { LanguagePair } from './google';

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
