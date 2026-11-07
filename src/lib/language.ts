/** Regional differences need no translation, but Simplified and Traditional Chinese do. */
export function languageIdentity(code: string): string {
  const lower = code.toLowerCase();
  const base = lower.split('-')[0] ?? lower;
  if (base !== 'zh') return base;
  return /-(hant|tw|hk|mo)\b/.test(lower) ? 'zh-hant' : 'zh-hans';
}

export function sameLanguage(a: string, b: string): boolean {
  return languageIdentity(a) === languageIdentity(b);
}

/** The language family, so a learning language of `zh` matches `zh-Hant` tracks. */
export function languageBase(code: string): string {
  const lower = code.toLowerCase();
  return lower.split('-')[0] ?? lower;
}
