import { describe, expect, it, vi } from 'vitest';
import {
  createSettingsStore,
  defaultNativeLanguage,
  defaultSettings,
  parseSettings,
  type SettingsStorage,
} from './settings';

describe('subtitle position and save sound', () => {
  const defaults = defaultSettings('zh-TW');

  it('defaults to the default place, with the sound on', () => {
    expect(defaults.subtitlePosition).toBeNull();
    expect(defaults.saveSound).toBe(true);
    expect(defaults.showContext).toBe(false);
  });

  it('keeps a valid position and rejects anything else', () => {
    const parse = (subtitlePosition: unknown) =>
      parseSettings({ subtitlePosition }, defaults).subtitlePosition;
    expect(parse({ x: 0.3, y: 0.5 })).toEqual({ x: 0.3, y: 0.5 });
    expect(parse({ x: 2, y: 0.5 })).toBeNull();
    expect(parse({ x: '0.3', y: 0.5 })).toBeNull();
    expect(parse('top')).toBeNull();
  });
});

describe('defaults', () => {
  it.each([
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW'],
    ['zh-CN', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['ja-JP', 'ja'],
    ['fr-FR', 'en'],
  ])('maps the browser language %s to %s', (browser, expected) => {
    expect(defaultNativeLanguage(browser)).toBe(expected);
  });

  it('never defaults the learning language to the native language', () => {
    expect(defaultSettings('en-US').learningLanguage).toBe('es');
    expect(defaultSettings('zh-TW').learningLanguage).toBe('en');
  });
});

describe('parseSettings', () => {
  const defaults = defaultSettings('zh-TW');

  it('falls back on missing or invalid values', () => {
    expect(parseSettings(undefined, defaults)).toEqual(defaults);
    expect(
      parseSettings(
        {
          enabled: 'yes',
          learningLanguage: 'klingon',
          nativeLanguage: 7,
          subtitleSize: 'huge',
          panelTheme: 'sepia',
        },
        defaults,
      ),
    ).toEqual(defaults);
  });

  it('keeps valid values', () => {
    expect(
      parseSettings(
        { enabled: false, learningLanguage: 'ja', subtitleSize: 'large' },
        defaults,
      ),
    ).toEqual({
      ...defaults,
      enabled: false,
      learningLanguage: 'ja',
      subtitleSize: 'large',
    });
  });
});

describe('createSettingsStore', () => {
  const setup = (stored: unknown) => {
    let changed: Parameters<
      SettingsStorage['onChanged']['addListener']
    >[0] = () => undefined;
    const storage: SettingsStorage = {
      get: () => Promise.resolve({ settings: stored }),
      set: vi.fn(() => Promise.resolve()),
      onChanged: {
        addListener: (listener) => {
          changed = listener;
        },
      },
    };
    const onError = vi.fn();
    const store = createSettingsStore(
      storage,
      defaultSettings('zh-TW'),
      onError,
    );
    return {
      store,
      storage,
      onError,
      emit: (changes: Parameters<typeof changed>[0]) => {
        changed(changes);
      },
    };
  };

  it('notifies after loading stored settings', async () => {
    const { store } = setup({ learningLanguage: 'ja' });
    const listener = vi.fn();
    store.subscribe(listener);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });
    expect(store.get().learningLanguage).toBe('ja');
  });

  it('applies updates right away and saves them', () => {
    const { store, storage } = setup(undefined);
    store.update({ showTranslation: false });
    expect(store.get().showTranslation).toBe(false);
    return vi.waitFor(() => {
      expect(storage.set).toHaveBeenCalledWith({
        settings: expect.objectContaining({ showTranslation: false }) as object,
      });
    });
  });

  it('follows changes from other tabs', () => {
    const { store, emit } = setup(undefined);
    emit({ settings: { newValue: { subtitleSize: 'small' } } });
    expect(store.get().subtitleSize).toBe('small');
    emit({ other: { newValue: 1 } });
    expect(store.get().subtitleSize).toBe('small');
  });

  it('reports a save that throws, without throwing', async () => {
    const { store, storage, onError } = setup(undefined);
    vi.mocked(storage.set).mockImplementation(() => {
      throw new Error('context invalidated');
    });
    expect(() => {
      store.update({ enabled: false });
    }).not.toThrow();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });
});
