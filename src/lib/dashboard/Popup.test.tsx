// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '../settings/settings';
import { newReviewState } from '../vocabulary/schedule';
import type { VocabularyClient } from '../vocabulary/service';
import type { Encounter, SavedWord } from '../vocabulary/vocabulary';
import { Popup } from './Popup';
import type { DashboardServices } from './services';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const word = (lemma: string, source: string, dueAt: number): SavedWord => ({
  lemma,
  phonetic: null,
  senses: [],
  id: `${source}:${lemma}`,
  source,
  target: 'zh-TW',
  forms: [lemma],
  encounters: [{ id: 'e' } as Encounter],
  review: { ...newReviewState(0), dueAt, reviewCount: 1 },
  savedAt: 0,
  updatedAt: 0,
});

describe('Popup', () => {
  let root: Root;
  let saved: Settings | null;
  const openDashboard = vi.fn();
  const q = (selector: string) => document.querySelector<HTMLElement>(selector);
  const named = (text: string) =>
    [...document.querySelectorAll<HTMLElement>('button')].find((node) =>
      node.textContent.includes(text),
    );

  const show = async (
    words: readonly SavedWord[],
    auth: Partial<DashboardServices['auth']> = {},
    saveSettings: DashboardServices['saveSettings'] = (next) => {
      saved = next;
      return Promise.resolve();
    },
  ) => {
    const services: DashboardServices = {
      vocabulary: {
        list: () => Promise.resolve(words),
      } as unknown as VocabularyClient,
      auth: {
        account: () => Promise.resolve({ email: 'a@example.com', name: 'A' }),
        signIn: () => Promise.resolve(null),
        signOut: () => Promise.resolve(),
        ...auth,
      },
      onAccountChange: () => () => undefined,
      sync: {
        ready: () => Promise.resolve('ready'),
        syncNow: () => Promise.resolve(),
      },
      syncStatus: () => Promise.resolve(null),
      onSyncStatus: () => () => undefined,
      speaker: { speak: vi.fn(), stop: vi.fn() },
      settings: () =>
        Promise.resolve({
          ...defaultSettings('zh-TW'),
          learningLanguage: 'en',
        }),
      saveSettings,
      onSettingsChange: () => () => undefined,
      explain: () => Promise.reject(new Error('Unused')),
      previewSaveSound: vi.fn(),
      onVocabularyChange: () => () => undefined,
    };
    await act(async () => {
      root.render(
        <Popup
          services={services}
          productName="Dual Subtitles"
          iconUrl="/icon.png"
          openDashboard={openDashboard}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve));
    });
  };

  beforeEach(() => {
    saved = null;
    openDashboard.mockClear();
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('links the product name to the product page, in a new tab', async () => {
    await show([]);
    const link = document.querySelector<HTMLAnchorElement>('.popup-head a');
    expect(link?.getAttribute('href')).toBe('https://coupletapp.com');
    expect(link?.target).toBe('_blank');
    expect(link?.textContent).toBe('Dual Subtitles');
  });

  it('counts due words in the learning language and starts review', async () => {
    await show([word('bank', 'en', 0), word('casa', 'es', 0)]);
    expect(q('.popup-review')?.textContent).toContain(
      '1 word ready for review',
    );
    act(() => {
      named('Start review')?.click();
    });
    expect(openDashboard).toHaveBeenCalledWith('/review');
  });

  it('says when nothing is due', async () => {
    await show([word('bank', 'en', 9e15)]);
    expect(q('.popup-review')?.textContent).toContain('Nothing to review');
    expect(named('Start review')).toBeUndefined();
  });

  it('turns subtitles off, and restores the switch if saving fails', async () => {
    await show([]);
    await act(async () => {
      q('.switch')?.click();
      await Promise.resolve();
    });
    expect(saved?.enabled).toBe(false);
    act(() => {
      root.unmount();
    });
    root = createRoot(document.body.appendChild(document.createElement('div')));
    await show([], {}, () => Promise.reject(new Error('Nope')));
    await act(async () => {
      q('.switch')?.click();
      await new Promise((resolve) => setTimeout(resolve));
    });
    expect((q('.switch') as HTMLInputElement).checked).toBe(true);
  });

  it('keeps only subtitles and sign-in when signed out', async () => {
    const signIn = vi.fn(() =>
      Promise.resolve({ email: 'a@example.com', name: 'A' }),
    );
    await show([word('bank', 'en', 0)], {
      account: () => Promise.resolve(null),
      signIn,
    });
    expect(q('.popup-review')).toBeNull();
    expect(named('Open Dashboard')).toBeUndefined();
    expect(q('.switch')).not.toBeNull();
    await act(async () => {
      named('Sign in with Google')?.click();
      await Promise.resolve();
    });
    expect(signIn).toHaveBeenCalledOnce();
    expect(q('.account-email')?.textContent).toBe('a@example.com');
  });

  it('opens the Dashboard', async () => {
    await show([]);
    act(() => {
      named('Open Dashboard')?.click();
    });
    expect(openDashboard).toHaveBeenCalledWith('/');
  });
});
