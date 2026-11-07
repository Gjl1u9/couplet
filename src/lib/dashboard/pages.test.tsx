// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/settings';
import { newReviewState } from '../vocabulary/schedule';
import type { VocabularyClient } from '../vocabulary/service';
import type { ReviewEvent, SavedWord } from '../vocabulary/vocabulary';
import { HomePage } from './HomePage';
import { ProgressPage } from './ProgressPage';
import type { DashboardServices } from './services';
import { SettingsPage } from './SettingsPage';
import { WordsPage } from './WordsPage';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const word = (
  lemma: string,
  review: Partial<SavedWord['review']> = {},
  title = 'Video A',
): SavedWord => ({
  id: `en:${lemma}`,
  lemma,
  phonetic: '/x/',
  senses: [
    {
      meaning: `${lemma}意思`,
      example: 'An example.',
      translation: '例句。',
    },
  ],
  source: 'en',
  target: 'zh-TW',
  forms: [lemma],
  encounters: [
    {
      id: `${lemma}-e`,
      cues: [
        { original: 'before it', startMs: 1000 },
        { original: `the ${lemma} here`, startMs: 5000 },
        { original: 'after it', startMs: 9000 },
      ],
      currentCue: 1,
      translation: '這裡的字',
      form: lemma,
      formOffset: 4,
      origin: { site: 'youtube', videoId: 'abc', title },
      meaning: null,
      savedAt: 0,
    },
  ],
  review: { ...newReviewState(0), reviewCount: 1, ...review },
  savedAt: 0,
  updatedAt: 0,
});

function setup() {
  const retire = vi.fn(() => Promise.resolve(null));
  const restore = vi.fn(() => Promise.resolve(null));
  const revert = vi.fn(() => Promise.resolve());
  const remove = vi.fn(() => Promise.resolve());
  const speak = vi.fn();
  const previewSaveSound = vi.fn();
  const services: DashboardServices = {
    vocabulary: {
      retire,
      restore,
      revert,
      remove,
    } as unknown as VocabularyClient,
    auth: {
      account: () => Promise.resolve(null),
      signIn: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
    },
    onAccountChange: () => () => undefined,
    sync: {
      ready: () => Promise.resolve('ready'),
      syncNow: () => Promise.resolve(),
    },
    syncStatus: () => Promise.resolve(null),
    onSyncStatus: () => () => undefined,
    speaker: { speak, stop: vi.fn() },
    settings: () => Promise.resolve(defaultSettings('zh-TW')),
    saveSettings: () => Promise.resolve(),
    onSettingsChange: () => () => undefined,
    previewSaveSound,
    onVocabularyChange: () => () => undefined,
  };
  return { services, retire, restore, revert, remove, speak, previewSaveSound };
}

const forget = (wordId: string, at: number): ReviewEvent => ({
  wordId,
  encounterId: 'e',
  grade: 'again',
  levelBefore: 0,
  levelAfter: 0,
  at,
});

describe('Dashboard pages', () => {
  let root: Root;
  const q = (selector: string) => document.querySelector<HTMLElement>(selector);
  const texts = (selector: string) =>
    [...document.querySelectorAll(selector)].map((node) => node.textContent);
  const named = (text: string) =>
    [...document.querySelectorAll<HTMLElement>('button, a')].find((node) =>
      node.textContent.includes(text),
    );
  const show = async (element: ReactElement) => {
    await act(async () => {
      root.render(element);
      await Promise.resolve();
    });
  };
  const click = async (node: HTMLElement | null | undefined) => {
    await act(async () => {
      node?.click();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    if (!container) throw new Error('missing root');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  describe('HomePage', () => {
    it('guides a new user', async () => {
      await show(<HomePage words={[]} log={[]} streakLog={[]} />);
      expect(q('h1')?.textContent).toBe('Start with a video');
      expect(named('Start review')).toBeUndefined();
    });

    it('states what is due and starts Review', async () => {
      await show(<HomePage words={[word('bank')]} log={[]} streakLog={[]} />);
      expect(q('.hero-count')?.textContent).toBe('1 word');
      expect(named('Start review')?.getAttribute('href')).toBe('#/review');
    });

    it('says when the next word returns', async () => {
      const dueAt = Date.now() + 600_000;
      await show(
        <HomePage words={[word('bank', { dueAt })]} log={[]} streakLog={[]} />,
      );
      expect(q('.hero-count')?.textContent).toBe('0 words');
      expect(q('.hero')?.textContent).toContain('returns in 10 min');
      expect(named('Start review')).toBeUndefined();
    });

    it('labels its numbers and links recent words', async () => {
      await show(<HomePage words={[word('bank')]} log={[]} streakLog={[]} />);
      expect(q('.stats')?.textContent).toContain('0 of 1 saved');
      expect(q('.stats')?.textContent).toContain('Reviews, last 7 days');
      expect(q('.row-link')?.getAttribute('href')).toBe(
        '#/words?word=en%3Abank',
      );
    });
  });

  describe('ProgressPage', () => {
    it('explains itself with no words', async () => {
      await show(<ProgressPage words={[]} log={[]} streakLog={[]} />);
      expect(q('.empty')?.textContent).toContain('Save a word');
    });

    it('links stages and shows intervals', async () => {
      await show(
        <ProgressPage
          words={[word('bank', { level: 1 }), word('river', { level: 5 })]}
          log={[]}
          streakLog={[]}
        />,
      );
      expect(q('.big-number')?.textContent).toContain('1 of 2');
      expect(named('Known')?.getAttribute('href')).toBe('#/words?stage=known');
      expect(texts('.ladder-count')).toEqual([
        '0',
        '0',
        '1',
        '0',
        '0',
        '0',
        '1',
        '0',
      ]);
    });

    it('lists hard words, linking to their details only', async () => {
      const now = Date.now();
      await show(
        <ProgressPage
          words={[word('bank')]}
          log={[forget('en:bank', now), forget('en:bank', now - 1)]}
          streakLog={[forget('en:bank', now), forget('en:bank', now - 1)]}
        />,
      );
      expect(q('.forget-count')?.textContent).toBe('Forgot 2×');
      expect(q('.list-rows .row-link')?.getAttribute('href')).toBe(
        '#/words?word=en%3Abank',
      );
      expect(named('Review these')).toBeUndefined();
    });

    it('says when there are no hard words or upcoming reviews', async () => {
      await show(
        <ProgressPage
          words={[word('bank', { retired: { reason: 'manual', at: 0 } })]}
          log={[]}
          streakLog={[]}
        />,
      );
      expect(q('.hard-empty')?.textContent).toContain('No hard words');
      expect(q('.forecast')).toBeNull();
    });

    it('draws one square per day', async () => {
      await show(
        <ProgressPage words={[word('bank')]} log={[]} streakLog={[]} />,
      );
      expect(document.querySelectorAll('.trail > span')).toHaveLength(84);
    });
  });

  describe('WordsPage', () => {
    const words = [
      word('bank', { reviewCount: 0 }),
      { ...word('river', { level: 6 }, 'Video B'), savedAt: 5 },
    ];
    const render = (
      focus: string | null = null,
      services = setup().services,
      stage: string | null = null,
    ) =>
      show(
        <WordsPage
          services={services}
          words={words}
          focusWordId={focus}
          focusStage={stage}
        />,
      );

    it('explains an empty list', async () => {
      await show(
        <WordsPage
          services={setup().services}
          words={[]}
          focusWordId={null}
          focusStage={null}
        />,
      );
      expect(q('.empty')?.textContent).toContain('save from videos');
    });

    it('keeps meanings out of the list', async () => {
      await render();
      expect(q('.words')?.textContent).not.toContain('意思');
      expect(texts('.row-word')).toEqual(['river', 'bank']);
    });

    it('filters by stage with matching counts', async () => {
      await render();
      await click(named('Known 1'));
      expect(texts('.row-word')).toEqual(['river']);
    });

    it('starts from a linked stage', async () => {
      await render(null, setup().services, 'new');
      expect(texts('.row-word')).toEqual(['bank']);
    });

    it('searches words and video titles', async () => {
      await render();
      const input = q('input[type=search]') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set?.call(input, 'video b');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await Promise.resolve();
      });
      expect(texts('.row-word')).toEqual(['river']);
    });

    it('groups by video', async () => {
      await render();
      await click(named('By video'));
      expect(texts('.word-group-title')).toEqual(['Video B', 'Video A']);
    });

    it('opens a linked word, with nearby lines collapsed', async () => {
      await render('en:bank');
      expect(q('.sentence-text')?.textContent).toContain('the bank here');
      expect(q('.sentence-line')).toBeNull();
      expect(q('.level')?.textContent).toContain('New word');
      await click(q('[aria-label="Show nearby lines"]'));
      expect(texts('.sentence-line')).toEqual(['before it', 'after it']);
    });

    it('shows a translation on request', async () => {
      await render('en:bank');
      expect(q('.sentence-translation')).toBeNull();
      await click(named('Show translation'));
      expect(q('.sentence-translation')?.textContent).toBe('這裡的字');
    });

    it('opens the dictionary with pronunciation on demand', async () => {
      const { services, speak } = setup();
      await render('en:bank', services);
      expect(q('.dict')).toBeNull();
      await click(q('[aria-label="Open dictionary"]'));
      expect(q('.dict .meaning-chip')?.textContent).toBe('bank意思');
      await click(q('.dict [aria-label="Play pronunciation"]'));
      expect(speak).toHaveBeenCalledWith('bank', 'en', expect.any(Function));
      expect(q('.dict')).not.toBeNull();
    });

    it('marks each video title with its site', async () => {
      const { services } = setup();
      await render('en:bank', services);
      for (const place of ['.word-from', '.sentence-video']) {
        expect(q(`${place} [aria-label="YouTube"]`)).not.toBeNull();
      }
      await click(named('By video'));
      expect(q('.word-group-title [aria-label="YouTube"]')).not.toBeNull();
    });

    it('retires, and offers restore on a Retired word', async () => {
      const { services, retire, restore, revert } = setup();
      await render('en:bank', services);
      await click(named('Stop reviewing'));
      expect(retire).toHaveBeenCalledWith('en:bank');
      expect(q('.toast')?.textContent).toContain(
        "bank won't come up for review again",
      );
      await click(q('.toast button'));
      expect(revert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'en:bank' }),
        null,
        null,
      );
      expect(q('.toast')).toBeNull();
      await show(
        <WordsPage
          services={services}
          words={[word('bank', { retired: { reason: 'manual', at: 0 } })]}
          focusWordId="en:bank"
          focusStage={null}
        />,
      );
      await click(named('Review again'));
      expect(restore).toHaveBeenCalledWith('en:bank');
    });

    it('asks before deleting', async () => {
      const { services, remove } = setup();
      await render('en:bank', services);
      await click(named('Delete'));
      expect(remove).not.toHaveBeenCalled();
      expect(q('.confirm')?.textContent).toContain('Delete bank');
      await click(q('.detail-actions .is-danger'));
      expect(remove).toHaveBeenCalledWith('en:bank');
    });
  });

  describe('SettingsPage', () => {
    it('sends changes and previews the sound only when turned on', async () => {
      const { services, previewSaveSound } = setup();
      const onChange = vi.fn();
      const settings = { ...defaultSettings('zh-TW'), saveSound: false };
      await show(
        <SettingsPage
          services={services}
          settings={settings}
          failed={false}
          onChange={onChange}
        />,
      );
      await click(q('.switch'));
      expect(onChange).toHaveBeenCalledWith({ saveSound: true });
      expect(previewSaveSound).toHaveBeenCalledTimes(1);
      await click(q('input[name=page-theme][value=dark]'));
      expect(onChange).toHaveBeenCalledWith({ pageTheme: 'dark' });
    });

    describe('account', () => {
      const account = { email: 'a@example.com', name: 'A' };
      const render = async (auth: Partial<DashboardServices['auth']>) => {
        const { services } = setup();
        await show(
          <SettingsPage
            services={{ ...services, auth: { ...services.auth, ...auth } }}
            settings={defaultSettings('zh-TW')}
            failed={false}
            onChange={vi.fn()}
          />,
        );
      };

      it('signs in and shows who is signed in', async () => {
        const signIn = vi.fn(() => Promise.resolve(account));
        await render({ signIn });
        await click(named('Sign in with Google'));
        expect(signIn).toHaveBeenCalledOnce();
        expect(q('.account-email')?.textContent).toBe('a@example.com');
      });

      it('stays signed out, without an error, when the window is closed', async () => {
        await render({});
        await click(named('Sign in with Google'));
        expect(named('Sign in with Google')).toBeDefined();
        expect(q('[role=alert]')).toBeNull();
      });

      it('signs out', async () => {
        const signOut = vi.fn(() => Promise.resolve());
        await render({ account: () => Promise.resolve(account), signOut });
        await click(named('Sign out'));
        expect(signOut).toHaveBeenCalledOnce();
        expect(named('Sign in with Google')).toBeDefined();
      });

      it('says when signing in failed', async () => {
        await render({ signIn: () => Promise.reject(new Error('Nope')) });
        await click(named('Sign in with Google'));
        expect(q('[role=alert]')?.textContent).toContain('Try again');
        expect(named('Sign in with Google')).toBeDefined();
      });
    });

    it('says when a change was not saved', async () => {
      await show(
        <SettingsPage
          services={setup().services}
          settings={defaultSettings('zh-TW')}
          failed
          onChange={vi.fn()}
        />,
      );
      expect(q('[role=alert]')?.textContent).toContain("Couldn't save");
    });
  });
});
