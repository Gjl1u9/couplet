export type SubtitleSize = 'small' | 'medium' | 'large';
export type PanelTheme = 'dark' | 'light';
export type PageTheme = 'system' | 'light' | 'dark';

const PAGE_THEMES: readonly PageTheme[] = ['system', 'light', 'dark'];

/** Fractions of the player: the subtitle's center and its distance from the bottom. */
export interface SubtitlePosition {
  readonly x: number;
  readonly y: number;
}

export interface Settings {
  readonly enabled: boolean;
  readonly learningLanguage: string;
  readonly nativeLanguage: NativeLanguage;
  readonly showTranslation: boolean;
  readonly subtitleSize: SubtitleSize;
  readonly pauseOnLookup: boolean;
  /** The Lookup Panel's theme. */
  readonly panelTheme: PanelTheme;
  /** `null` keeps the subtitle in its default place. */
  readonly subtitlePosition: SubtitlePosition | null;
  /** Shows the previous and next cues around the current one. */
  readonly showContext: boolean;
  /** Plays a short sound when a word is saved. */
  readonly saveSound: boolean;
  /** The Dashboard's theme. */
  readonly pageTheme: PageTheme;
  /** Points out one word per line that is worth learning at the user's level. */
  readonly newWordHints: boolean;
  /**
   * How many of each learning language's most common words the user knows, from the
   * Word Check. Missing means not checked.
   */
  readonly vocabularyLevels: Readonly<Record<string, number>>;
}

export const NATIVE_LANGUAGES = [
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'sv', name: 'Svenska' },
  { code: 'cs', name: 'Čeština' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'fa', name: 'فارسی' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
] as const;

export type NativeLanguage = (typeof NATIVE_LANGUAGES)[number]['code'];

/** Each language here has run through the whole product on real videos. */
export const LEARNING_LANGUAGES: readonly {
  readonly code: string;
  readonly name: string;
}[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

const SUBTITLE_SIZES: readonly SubtitleSize[] = ['small', 'medium', 'large'];
const PANEL_THEMES: readonly PanelTheme[] = ['dark', 'light'];

export function defaultNativeLanguage(browserLanguage: string): NativeLanguage {
  const lower = browserLanguage.toLowerCase();
  if (/^zh-(hant|tw|hk|mo)\b/.test(lower)) return 'zh-TW';
  if (lower.startsWith('zh')) return 'zh-CN';
  const base = lower.split('-')[0];
  return NATIVE_LANGUAGES.find((l) => l.code === base)?.code ?? 'en';
}

export function defaultSettings(browserLanguage: string): Settings {
  const nativeLanguage = defaultNativeLanguage(browserLanguage);
  return {
    enabled: true,
    learningLanguage: nativeLanguage === 'en' ? 'es' : 'en',
    nativeLanguage,
    showTranslation: true,
    subtitleSize: 'medium',
    pauseOnLookup: true,
    panelTheme: 'dark',
    subtitlePosition: null,
    showContext: false,
    saveSound: true,
    pageTheme: 'system',
    newWordHints: true,
    vocabularyLevels: {},
  };
}

function parsePosition(raw: unknown): SubtitlePosition | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y } = raw as Record<string, unknown>;
  const fraction = (value: unknown): value is number =>
    typeof value === 'number' && value >= 0 && value <= 1;
  return fraction(x) && fraction(y) ? { x, y } : null;
}

/** Storage can hold anything, so every field falls back to its default. */
export function parseSettings(raw: unknown, defaults: Settings): Settings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const r = raw as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  return {
    enabled: bool(r.enabled, defaults.enabled),
    learningLanguage:
      LEARNING_LANGUAGES.find((l) => l.code === r.learningLanguage)?.code ??
      defaults.learningLanguage,
    nativeLanguage:
      NATIVE_LANGUAGES.find((l) => l.code === r.nativeLanguage)?.code ??
      defaults.nativeLanguage,
    showTranslation: bool(r.showTranslation, defaults.showTranslation),
    subtitleSize:
      SUBTITLE_SIZES.find((size) => size === r.subtitleSize) ??
      defaults.subtitleSize,
    pauseOnLookup: bool(r.pauseOnLookup, defaults.pauseOnLookup),
    panelTheme:
      PANEL_THEMES.find((theme) => theme === r.panelTheme) ??
      defaults.panelTheme,
    subtitlePosition: parsePosition(r.subtitlePosition),
    showContext: bool(r.showContext, defaults.showContext),
    saveSound: bool(r.saveSound, defaults.saveSound),
    pageTheme:
      PAGE_THEMES.find((theme) => theme === r.pageTheme) ?? defaults.pageTheme,
    newWordHints: bool(r.newWordHints, defaults.newWordHints),
    vocabularyLevels: parseLevels(r.vocabularyLevels),
  };
}

function parseLevels(raw: unknown): Readonly<Record<string, number>> {
  if (typeof raw !== 'object' || raw === null) return {};
  const levels: Record<string, number> = {};
  for (const [language, size] of Object.entries(raw)) {
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
      levels[language] = size;
    }
  }
  return levels;
}

const STORAGE_KEY = 'settings';

export interface SettingsStorage {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  onChanged: {
    addListener: (
      listener: (changes: Record<string, { newValue?: unknown }>) => void,
    ) => void;
  };
}

export interface SettingsStore {
  get: () => Settings;
  update: (patch: Partial<Settings>) => void;
  subscribe: (listener: (settings: Settings) => void) => void;
}

/** Other tabs may change settings too, so storage is the source of updates. */
export function saveSettings(
  storage: Pick<SettingsStorage, 'set'>,
  settings: Settings,
): Promise<void> {
  return storage.set({ [STORAGE_KEY]: settings });
}

/** One read, for pages that do not follow later changes. */
export async function loadSettings(
  storage: Pick<SettingsStorage, 'get'>,
  defaults: Settings,
): Promise<Settings> {
  const items = await storage.get(STORAGE_KEY);
  return parseSettings(items[STORAGE_KEY], defaults);
}

export function createSettingsStore(
  storage: SettingsStorage,
  defaults: Settings,
  onError: (error: unknown) => void,
): SettingsStore {
  let current = defaults;
  const listeners: ((settings: Settings) => void)[] = [];

  const apply = (next: Settings) => {
    current = next;
    for (const listener of listeners) listener(next);
  };

  storage.onChanged.addListener((changes) => {
    const change = changes[STORAGE_KEY];
    if (change) apply(parseSettings(change.newValue, defaults));
  });
  storage.get(STORAGE_KEY).then((items) => {
    apply(parseSettings(items[STORAGE_KEY], defaults));
  }, onError);

  return {
    get: () => current,
    update(patch) {
      const next = { ...current, ...patch };
      apply(next);
      // Storage throws synchronously once the extension context is gone.
      Promise.resolve()
        .then(() => storage.set({ [STORAGE_KEY]: next }))
        .catch(onError);
    },
    subscribe(listener) {
      listeners.push(listener);
    },
  };
}
