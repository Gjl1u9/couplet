// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '../settings/settings';
import { newReviewState } from '../vocabulary/schedule';
import type { VocabularyClient } from '../vocabulary/service';
import type {
  Encounter,
  ReviewEvent,
  SavedWord,
} from '../vocabulary/vocabulary';
import type { ReadyResult } from '../sync/account-sync';
import { App } from './App';
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
  // Only a word with a sentence can come due.
  encounters: [{ id: 'e' } as Encounter],
  review: { ...newReviewState(0), dueAt, reviewCount: 1 },
  savedAt: 0,
  updatedAt: 0,
});

describe('App across languages', () => {
  let root: Root;
  let settings: Settings;
  let account: { email: string; name: string } | null;
  let ready: () => Promise<ReadyResult>;
  let signIn: () => Promise<{ email: string; name: string } | null>;
  const q = (selector: string) => document.querySelector<HTMLElement>(selector);
  const click = async (node: HTMLElement | null | undefined) => {
    await act(async () => {
      node?.click();
      await Promise.resolve();
    });
  };
  const show = async (
    words: readonly SavedWord[],
    log: readonly ReviewEvent[] = [],
  ) => {
    const services: DashboardServices = {
      vocabulary: {
        list: () => Promise.resolve(words),
        reviewLog: () => Promise.resolve(log),
      } as unknown as VocabularyClient,
      auth: {
        account: () => Promise.resolve(account),
        signIn: () => signIn(),
        signOut: () => Promise.resolve(),
      },
      onAccountChange: () => () => undefined,
      sync: {
        ready: () => ready(),
        syncNow: () => Promise.resolve(),
      },
      syncStatus: () => Promise.resolve(null),
      onSyncStatus: () => () => undefined,
      speaker: { speak: vi.fn(), stop: vi.fn() },
      settings: () => Promise.resolve(settings),
      saveSettings: (next) => {
        settings = next;
        return Promise.resolve();
      },
      onSettingsChange: () => () => undefined,
      explain: () => Promise.reject(new Error('Unused')),
      previewSaveSound: vi.fn(),
      playGradeSound: () => undefined,
      onVocabularyChange: () => () => undefined,
    };
    await act(async () => {
      root.render(<App services={services} />);
      await new Promise((resolve) => setTimeout(resolve));
    });
  };

  beforeEach(() => {
    location.hash = '';
    account = { email: 'a@example.com', name: 'A' };
    signIn = () => Promise.resolve(null);
    ready = () => Promise.resolve('ready');
    settings = { ...defaultSettings('zh-TW'), learningLanguage: 'en' };
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('asks for sign-in before showing any page', async () => {
    account = null;
    location.hash = '#/words';
    await show([word('bank', 'en', 0)]);
    expect(q('h1')?.textContent).toBe('Sign in to open your Dashboard');
    expect(q('.rail')).toBeNull();
    expect(q('.row-word')).toBeNull();
  });

  it('opens the Dashboard once signed in', async () => {
    account = null;
    signIn = () => Promise.resolve({ email: 'a@example.com', name: 'A' });
    await show([word('bank', 'en', 0)]);
    await click(q('.google-sign-in'));
    expect(q('.rail')).not.toBeNull();
    expect(q('.row-word')?.textContent).toBe('bank');
  });

  it('stays on sign-in when the window is closed, and says when it failed', async () => {
    account = null;
    await show([word('bank', 'en', 0)]);
    await click(q('.google-sign-in'));
    expect(q('.rail')).toBeNull();
    expect(q('[role=alert]')).toBeNull();
    signIn = () => Promise.reject(new Error('Nope'));
    await act(async () => {
      q('.google-sign-in')?.click();
      await new Promise((resolve) => setTimeout(resolve));
    });
    expect(q('[role=alert]')?.textContent).toContain('Try again');
  });

  it('says other words are safe when this language has none', async () => {
    settings = { ...settings, learningLanguage: 'ko' };
    await show([word('bank', 'en', 0)]);
    expect(q('h1')?.textContent).toBe('No Korean words yet');
    expect(q('.hero')?.textContent).toContain(
      'Your 1 English word is still here',
    );
    await click(q('.hero .button'));
    expect(settings.learningLanguage).toBe('en');
    expect(q('.row-word')?.textContent).toBe('bank');
  });

  it('explains a failed first load, and can try again', async () => {
    ready = () =>
      Promise.reject(new Error('The background script did not answer'));
    await show([word('bank', 'en', 0)]);
    expect(q('[role=alert]')?.textContent).toContain(
      "Couldn't load your words",
    );
    expect(q('.sign-in-detail')?.textContent).toContain('did not answer');
    expect(q('.rail')).toBeNull();
    ready = () => Promise.resolve('ready');
    await act(async () => {
      [...document.querySelectorAll<HTMLElement>('button')]
        .find((node) => node.textContent.includes('Try again'))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve));
    });
    expect(q('.rail')).not.toBeNull();
  });

  it('welcomes a user with no words in any language', async () => {
    await show([]);
    expect(q('h1')?.textContent).toBe('Start with a video');
  });

  it('counts the streak across languages', async () => {
    const reviewed: ReviewEvent = {
      wordId: 'en:bank',
      encounterId: 'e',
      grade: 'good',
      levelBefore: 0,
      levelAfter: 1,
      at: Date.now(),
    };
    settings = { ...settings, learningLanguage: 'es' };
    await show([word('bank', 'en', 0), word('casa', 'es', 0)], [reviewed]);
    expect(q('.stat-value')?.textContent).toBe('1 day');
  });
});
