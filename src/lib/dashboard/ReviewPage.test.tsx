// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/settings';
import {
  createVocabularyClient,
  createVocabularyService,
  answerVocabularyMessage,
} from '../vocabulary/service';
import {
  createVocabulary,
  type EncounterInput,
} from '../vocabulary/vocabulary';
import { ReviewPage } from './ReviewPage';
import type { DashboardServices } from './services';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const input = (lemma: string): EncounterInput => ({
  entry: {
    lemma,
    phonetic: '/x/',
    senses: [
      { meaning: '銀行', example: 'A bank.', translation: '一家銀行。' },
    ],
  },
  source: 'en',
  target: 'zh-TW',
  cues: [
    { original: 'before it', startMs: 0 },
    { original: `sat on the ${lemma} today`, startMs: 204_000 },
  ],
  currentCue: 1,
  form: lemma,
  formOffset: 11,
  origin: { site: 'youtube', videoId: 'abc', title: 'A video' },
});

async function setup(lemmas: readonly string[], translated = ['譯文']) {
  const vocabulary = createVocabulary();
  for (const lemma of lemmas) await vocabulary.save(input(lemma), 0);
  const translate = vi.fn(() => Promise.resolve([...translated]));
  const handle = createVocabularyService({
    vocabulary,
    createTranslate: () => translate,
  });
  const speaker = { speak: vi.fn(), stop: vi.fn() };
  const services: DashboardServices = {
    vocabulary: createVocabularyClient(
      (message) =>
        new Promise((resolve) => {
          answerVocabularyMessage(message, handle, resolve);
        }),
    ),
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
    speaker,
    settings: () => Promise.resolve(defaultSettings('zh-TW')),
    saveSettings: () => Promise.resolve(),
    onSettingsChange: () => () => undefined,
    explain: () => Promise.reject(new Error('Unused')),
    previewSaveSound: () => undefined,
    playGradeSound: () => undefined,
    onVocabularyChange: () => () => undefined,
  };
  return { services, vocabulary, translate, speaker };
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const q = (selector: string) => document.querySelector<HTMLElement>(selector);
const buttonNamed = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a')].find((item) =>
    item.textContent.includes(text),
  );
const click = async (node: HTMLElement | null | undefined) => {
  await act(async () => {
    node?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const press = async (key: string) => {
  await act(async () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('ReviewPage', () => {
  let root: Root;

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

  const show = async (services: DashboardServices, sounds = false) => {
    await act(async () => {
      root.render(
        <ReviewPage
          services={services}
          learningLanguage="en"
          sounds={sounds}
        />,
      );
      await Promise.resolve();
    });
    await settle();
  };

  it('shows the marked word as the title, with answers hidden', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    expect(q('.review-word')?.textContent).toBe('bank');
    expect(q('.cue.is-current mark')?.textContent).toBe('bank');
    expect(q('.review-translation')).toBeNull();
    expect(q('.dict')).toBeNull();
    expect(buttonNamed('Back to video')?.getAttribute('href')).toContain(
      't=202s',
    );
  });

  it('opens the translation and dictionary separately', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    await click(buttonNamed('Show translation'));
    await settle();
    expect(q('.review-translation')?.textContent).toBe('譯文');
    expect(q('.dict')).toBeNull();
    await click(q('[aria-label="Open dictionary"]'));
    expect(q('.dict .meaning-chip')?.textContent).toBe('銀行');
  });

  it('leaves the marked word without an action', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    await click(q('.cue.is-current mark'));
    expect(q('.dict')).toBeNull();
  });

  it('offers a retry when the translation fails', async () => {
    const { services, translate } = await setup(['bank']);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await show(services);
    const { encounters } = (await services.vocabulary.list())[0] ?? {
      encounters: [],
    };
    expect(encounters).toHaveLength(1);
    translate.mockRejectedValueOnce(new Error('offline'));
    await click(buttonNamed('Show translation'));
    await settle();
    expect(q('.review-translation')?.textContent).toContain(
      "Couldn't load the translation",
    );
    await click(buttonNamed('Try again'));
    await settle();
    expect(q('.review-translation')?.textContent).toBe('譯文');
  });

  it('lists every shortcut under the grade buttons', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    const hints = q('.review-keys')?.textContent;
    for (const hint of [
      '123Grade',
      'SpaceTranslation',
      'DDictionary',
      'PPronunciation',
      'CNearby lines',
      'ZUndo',
    ]) {
      expect(hints).toContain(hint);
    }
  });

  it('grades by key, shows the interval, and can undo', async () => {
    const { services, vocabulary } = await setup(['bank', 'river']);
    await show(services);
    expect(buttonNamed('Got it')?.textContent).toContain('3 days');
    await press('3');
    expect(q('.review-word')?.textContent).toBe('river');
    expect(q('.answer-pill')?.textContent).toBe('bank · back in 3 daysUndo');
    await expect(vocabulary.reviewLog()).resolves.toHaveLength(1);
    await press('z');
    expect(q('.review-word')?.textContent).toBe('bank');
    await expect(vocabulary.reviewLog()).resolves.toHaveLength(0);
  });

  it('retires a word, keeping it in the Vocabulary', async () => {
    const { services, vocabulary } = await setup(['bank']);
    await show(services);
    await click(buttonNamed('I know this'));
    const [word] = await vocabulary.list();
    expect(word?.review.retired?.reason).toBe('manual');
    expect(q('.review-card')).toBeNull();
    expect(q('.answer-pill')?.textContent).toContain(
      "bank · Known. Won't be reviewed again",
    );
    await click(q('.answer-pill button'));
    expect(q('.answer-pill')?.textContent).toBe('Undone');
    expect(q('.review-word')?.textContent).toBe('bank');
    const [restored] = await vocabulary.list();
    expect(restored?.review.retired).toBeNull();
  });

  it('asks before removing, and blocks grade keys meanwhile', async () => {
    const { services, vocabulary } = await setup(['bank']);
    await show(services);
    await click(buttonNamed('Remove'));
    expect(q('.confirm')?.textContent).toContain('Remove bank from Words?');
    await press('3');
    await expect(vocabulary.reviewLog()).resolves.toHaveLength(0);
    await press('Escape');
    expect(q('.confirm')).toBeNull();
    await click(buttonNamed('Remove'));
    await click(q('.review-actions .is-danger'));
    await expect(vocabulary.list()).resolves.toEqual([]);
    expect(q('.answer-pill')?.textContent).toBe('Removed bank');
    expect(buttonNamed('Undo')).toBeUndefined();
  });

  it('puts the video source above the word', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    const top = q('.review-source');
    expect(top?.textContent).toContain('Back to video');
    expect(top?.textContent).toContain('A video');
    expect(top?.querySelector('[aria-label="Open dictionary"]')).not.toBeNull();
    expect(q('.review-actions')?.textContent).not.toContain('Back to video');
  });

  it('collapses the neighbouring cues and remembers it across Cards', async () => {
    localStorage.clear();
    const { services } = await setup(['bank', 'river']);
    await show(services);
    expect(document.querySelectorAll('.cue')).toHaveLength(2);
    expect(q('.context-button')?.textContent).toBe('Hide nearby linesC');
    await click(q('.context-button'));
    expect(q('.context-button')?.textContent).toBe('Nearby linesC');
    expect(document.querySelectorAll('.cue')).toHaveLength(1);
    expect(q('.cue')?.classList.contains('is-current')).toBe(true);
    await press('3');
    expect(q('.review-word')?.textContent).toBe('river');
    expect(document.querySelectorAll('.cue')).toHaveLength(1);
    await press('c');
    expect(document.querySelectorAll('.cue')).toHaveLength(2);
    localStorage.clear();
  });

  it('moves on when the word was deleted elsewhere', async () => {
    const { services, vocabulary } = await setup(['bank', 'river']);
    await show(services);
    const [first] = await vocabulary.list();
    await vocabulary.remove(first?.id ?? '');
    await press('3');
    expect(q('.review-word')?.textContent).toBe('river');
    expect(q('.answer-pill')?.textContent).toBe('bank · was removed elsewhere');
  });

  it('plays each answer’s sound only with Sounds on', async () => {
    const quiet = await setup(['bank']);
    const silent = vi.fn();
    await show({ ...quiet.services, playGradeSound: silent });
    await press('1');
    expect(silent).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    const container = document.getElementById('root');
    if (!container) throw new Error('missing root');
    root = createRoot(container);
    const loud = await setup(['bank', 'river']);
    const play = vi.fn();
    await show({ ...loud.services, playGradeSound: play }, true);
    await press('3');
    expect(play).toHaveBeenCalledWith('good');
    await press('1');
    expect(play).toHaveBeenLastCalledWith('again');
  });

  it('ignores Card shortcuts on the Done screen', async () => {
    const { services, speaker } = await setup(['bank']);
    await show(services);
    await press('3');
    await settle();
    speaker.speak.mockClear();
    await press('p');
    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it('shows a summary when the queue is empty', async () => {
    const { services } = await setup(['bank']);
    await show(services);
    await press('1');
    await settle();
    expect(q('.empty h1')?.textContent).toBe('All done for now');
    expect(q('.page-note')?.textContent).toContain('returns in 10 min');
    expect(q('.grades')).toBeNull();
  });

  it('speaks the word as written', async () => {
    const { services, speaker } = await setup(['bank']);
    await show(services);
    await press('p');
    expect(speaker.speak).toHaveBeenCalledWith(
      'bank',
      'en',
      expect.any(Function),
    );
  });
});
