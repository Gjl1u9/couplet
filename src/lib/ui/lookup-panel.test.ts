// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WordEntry } from '../lookup/types';
import {
  createLookupPanel,
  senseRow,
  type LookupPanelOptions,
} from './lookup-panel';

const CUE = { word: 'banks', sentence: 'the banks', offset: 4 };
const PHRASE = { word: 'Get rid of', sentence: 'Get rid of it', offset: 0 };
const ENTRY: WordEntry = {
  lemma: 'bank',
  phonetic: '/bæŋk/',
  senses: [
    { meaning: '銀行', example: 'At the bank.', translation: '在銀行。' },
    { meaning: '河岸', example: 'On the bank.', translation: '在河岸上。' },
  ],
};
const entryFor = (meaning: string): WordEntry => ({
  ...ENTRY,
  senses: [{ meaning, example: 'x', translation: 'y' }],
});
const flush = () => new Promise((resolve) => setTimeout(resolve));

function setup(overrides: Partial<LookupPanelOptions> = {}) {
  document.body.innerHTML =
    '<div id="layer"></div><button class="token" id="a">a</button><button class="token" id="b">b</button><video></video>';
  const layer = document.querySelector<HTMLElement>('#layer');
  const anchor = document.querySelector<HTMLElement>('#a');
  const other = document.querySelector<HTMLElement>('#b');
  if (!layer || !anchor || !other) throw new Error('missing fixture');
  const speaker = { speak: vi.fn(), stop: vi.fn() };
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const panel = createLookupPanel({
    layer: () => layer,
    lookUp: () => Promise.resolve(ENTRY),
    translateSelection: () => Promise.resolve('擺脫'),
    wordStatus: () => Promise.resolve('none' as const),
    setWordStatus: () => Promise.resolve(),
    sourceLanguage: () => 'en',
    theme: () => 'dark',
    speaker,
    onOpen,
    onClose,
    ...overrides,
  });
  const find = (selector: string) => layer.querySelector<HTMLElement>(selector);
  return { panel, anchor, other, find, speaker, onOpen, onClose };
}

afterEach(() => {
  document.body.innerHTML = '';
});

async function openWithSave(overrides: Partial<LookupPanelOptions>) {
  const setWordStatus = vi.fn(() => Promise.resolve());
  const { panel, anchor, find } = setup({ setWordStatus, ...overrides });
  panel.toggle(CUE, anchor);
  await flush();
  return { panel, setWordStatus, button: () => find('.save') };
}

describe('createLookupPanel', () => {
  it('explains that lookups are busy, with nothing to retry', async () => {
    const { panel, anchor, find } = setup({
      lookUp: () => Promise.reject(new Error('Error: lookup-busy')),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.alert')?.textContent).toBe(
      'Lookups are busy right now. Try again later.',
    );
    expect(find('.text-button')).toBeNull();
    panel.close();
  });

  it('shows the clicked word and a skeleton while loading', () => {
    const { panel, anchor, find, onOpen } = setup({
      lookUp: () => new Promise(() => undefined),
    });
    panel.toggle(CUE, anchor);
    expect(find('.lookup-word')?.textContent).toBe('banks');
    expect(find('.lookup-skeleton')).not.toBeNull();
    expect(find('.phonetic')?.hidden).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    panel.close();
  });

  it('shows the lemma, phonetics, and each sense with its example', async () => {
    const { panel, anchor, find } = setup();
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.lookup-word')?.textContent).toBe('bank');
    expect(find('.phonetic')?.textContent).toBe('/bæŋk/');
    expect(find('.phonetic')?.hidden).toBe(false);
    expect(find('.lookup-skeleton')).toBeNull();
    const senses = [...(find('.lookup-senses')?.children ?? [])];
    expect(senses.map((sense) => sense.textContent)).toEqual([
      '銀行At the bank.在銀行。',
      '河岸On the bank.在河岸上。',
    ]);
    panel.close();
  });

  it('shows a meaning with alternatives as separate chips', async () => {
    const { panel, anchor, find } = setup({
      lookUp: () => Promise.resolve(entryFor('這個；那個')),
    });
    panel.toggle(CUE, anchor);
    await flush();
    const chips = [...(find('.lookup-meaning')?.children ?? [])];
    expect(chips.map((chip) => chip.textContent)).toEqual(['這個', '那個']);
    panel.close();
  });

  it('leaves out missing phonetics', async () => {
    const { panel, anchor, find } = setup({
      lookUp: () => Promise.resolve({ ...ENTRY, phonetic: null }),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.phonetic')?.hidden).toBe(true);
    panel.close();
  });

  it('hides the senses when both languages match', async () => {
    const { panel, anchor, find } = setup({
      lookUp: () => Promise.resolve(null),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.lookup-word')?.textContent).toBe('banks');
    expect(find('.lookup-senses')?.hidden).toBe(true);
    panel.close();
  });

  it('never treats an entry as HTML', async () => {
    const { panel, anchor, find } = setup({
      lookUp: () => Promise.resolve(entryFor('<img src=x>')),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.lookup-senses img')).toBeNull();
    panel.close();
  });

  it('speaks the clicked word until the lemma arrives', async () => {
    const { panel, anchor, find, speaker } = setup();
    panel.toggle(CUE, anchor);
    const play = find('[aria-label="Play pronunciation"]');
    play?.click();
    expect(speaker.speak.mock.calls[0]?.[0]).toBe('banks');
    await flush();
    play?.click();
    expect(speaker.speak.mock.calls[1]?.[0]).toBe('bank');
    panel.close();
  });

  it('marks the play button while speaking', async () => {
    const { panel, anchor, find, speaker } = setup();
    panel.toggle(CUE, anchor);
    await flush();
    const play = find('[aria-label="Play pronunciation"]');
    play?.click();
    expect(speaker.speak).toHaveBeenCalledWith(
      'bank',
      'en',
      expect.any(Function),
    );
    expect(play?.classList.contains('is-playing')).toBe(true);
    (speaker.speak.mock.calls[0]?.[2] as () => void)();
    expect(play?.classList.contains('is-playing')).toBe(false);
    panel.close();
  });

  it('offers saving only once the entry has loaded', async () => {
    const { panel, anchor, find } = setup();
    panel.toggle(CUE, anchor);
    expect(find('.save')).toBeNull();
    await flush();
    expect(find('.save')?.getAttribute('aria-pressed')).toBe('false');
    panel.close();
  });

  it('shows that a word is already saved', async () => {
    const { panel, anchor, find } = setup({
      wordStatus: () => Promise.resolve('saved' as const),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.save')?.getAttribute('aria-pressed')).toBe('true');
    expect(find('.save')?.getAttribute('aria-label')).toBe(
      'Remove from saved words',
    );
    panel.close();
  });

  it('saves only after beforeSave allows it, even if the panel closed', async () => {
    let allow: (allowed: boolean) => void = () => undefined;
    const beforeSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          allow = resolve;
        }),
    );
    const { panel, setWordStatus, button } = await openWithSave({ beforeSave });
    button()?.click();
    button()?.click();
    expect(beforeSave).toHaveBeenCalledOnce();
    expect(setWordStatus).not.toHaveBeenCalled();
    expect(button()?.classList.contains('is-saved')).toBe(false);
    panel.close();
    allow(true);
    await vi.waitFor(() => {
      expect(setWordStatus).toHaveBeenCalledOnce();
    });
  });

  it('stays open for clicks on what keepsOpen names', async () => {
    const { panel, anchor, other, onClose } = setup({
      keepsOpen: (path) => path.includes(other),
    });
    panel.toggle(CUE, anchor);
    await flush();
    other.click();
    expect(onClose).not.toHaveBeenCalled();
    panel.close();
  });

  it('leaves the word unsaved when beforeSave declines', async () => {
    const beforeSave = vi.fn(() => Promise.resolve(false));
    const { setWordStatus, button } = await openWithSave({ beforeSave });
    button()?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(setWordStatus).not.toHaveBeenCalled();
    expect(button()?.classList.contains('is-saved')).toBe(false);
  });

  it('does not ask before removing a word', async () => {
    const beforeSave = vi.fn(() => Promise.resolve(true));
    const { setWordStatus, button } = await openWithSave({
      beforeSave,
      wordStatus: () => Promise.resolve('saved' as const),
    });
    button()?.click();
    expect(beforeSave).not.toHaveBeenCalled();
    expect(setWordStatus).toHaveBeenCalled();
  });

  it('saves and unsaves the entry with its cue', async () => {
    const setWordStatus = vi.fn(() => Promise.resolve());
    const { panel, anchor, find } = setup({ setWordStatus });
    panel.toggle(CUE, anchor);
    await flush();
    find('.save')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(ENTRY, CUE, 'saved', 'none');
    expect(find('.save')?.classList.contains('is-saved')).toBe(true);
    find('.save')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(ENTRY, CUE, 'none', 'saved');
    expect(find('.save')?.classList.contains('is-saved')).toBe(false);
    panel.close();
  });

  it('shows the previous state again when saving fails', async () => {
    const { panel, anchor, find } = setup({
      setWordStatus: () => Promise.reject(new Error('quota')),
    });
    panel.toggle(CUE, anchor);
    await flush();
    find('.save')?.click();
    expect(find('.save')?.classList.contains('is-saved')).toBe(true);
    await flush();
    expect(find('.save')?.classList.contains('is-saved')).toBe(false);
    panel.close();
  });

  it('marks a word known under its senses, and undoes it', async () => {
    const setWordStatus = vi.fn(() => Promise.resolve());
    const { panel, anchor, find } = setup({ setWordStatus });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.lookup-foot')?.textContent).toBe('I know this');
    find('.lookup-foot .known-action')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(ENTRY, CUE, 'known', 'none');
    expect(find('.known-note')?.textContent).toBe('Known');
    expect(find('.known-hint')?.textContent).toBe(
      "Won't be marked or reviewed.",
    );
    find('.lookup-foot .known-action')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(ENTRY, CUE, 'none', 'known');
    expect(find('.known-note')).toBeNull();
    panel.close();
  });

  it('lets saving and knowing replace each other', async () => {
    const setWordStatus = vi.fn(() => Promise.resolve());
    const { panel, anchor, find } = setup({
      setWordStatus,
      wordStatus: () => Promise.resolve('saved' as const),
    });
    panel.toggle(CUE, anchor);
    await flush();
    find('.lookup-foot .known-action')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(
      ENTRY,
      CUE,
      'known',
      'saved',
    );
    expect(find('.save')?.classList.contains('is-saved')).toBe(false);
    find('.save')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(
      ENTRY,
      CUE,
      'saved',
      'known',
    );
    expect(find('.save')?.classList.contains('is-saved')).toBe(true);
    expect(find('.lookup-foot')?.textContent).toBe('I know this');
    panel.close();
  });

  it('shows a known word as known, and Undo puts it back on review', async () => {
    const setWordStatus = vi.fn(() => Promise.resolve());
    const { panel, anchor, find } = setup({
      setWordStatus,
      wordStatus: () => Promise.resolve('known' as const),
    });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.known-note')).not.toBeNull();
    expect(find('.save')?.getAttribute('aria-pressed')).toBe('false');
    find('.lookup-foot .known-action')?.click();
    expect(setWordStatus).toHaveBeenLastCalledWith(
      ENTRY,
      CUE,
      'saved',
      'known',
    );
    panel.close();
  });

  it('asks beforeSave before knowing an unsaved word', async () => {
    const beforeSave = vi.fn(() => Promise.resolve(false));
    const setWordStatus = vi.fn(() => Promise.resolve());
    const { panel, anchor, find } = setup({ beforeSave, setWordStatus });
    panel.toggle(CUE, anchor);
    await flush();
    find('.lookup-foot .known-action')?.click();
    await flush();
    expect(beforeSave).toHaveBeenCalledOnce();
    expect(setWordStatus).not.toHaveBeenCalled();
    expect(find('.known-note')).toBeNull();
    panel.close();
  });

  it('offers no I know this for a phrase', async () => {
    const { panel, anchor, find } = setup();
    panel.showSelection(PHRASE, anchor);
    await flush();
    expect(find('.save')).not.toBeNull();
    expect(find('.lookup-foot')).toBeNull();
    panel.close();
  });

  it('offers a retry after a failure', async () => {
    const lookUp = vi
      .fn<() => Promise<WordEntry | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(ENTRY);
    const { panel, anchor, find } = setup({ lookUp });
    panel.toggle(CUE, anchor);
    await flush();
    expect(find('.alert')?.textContent).toBe("Couldn't reach the dictionary");
    find('.text-button')?.click();
    await flush();
    expect(find('.lookup-meaning')?.textContent).toBe('銀行');
    panel.close();
  });

  it('ignores late answers after moving to another word', async () => {
    let resolveFirst: (value: WordEntry) => void = () => undefined;
    const lookUp = vi
      .fn<() => Promise<WordEntry | null>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...entryFor('第二個'), lemma: 'the' });
    const { panel, anchor, other, find, onOpen } = setup({ lookUp });
    panel.toggle(CUE, anchor);
    panel.toggle({ ...CUE, word: 'the', offset: 0 }, other);
    await flush();
    resolveFirst(entryFor('第一個'));
    await flush();
    expect(find('.lookup-word')?.textContent).toBe('the');
    expect(find('.lookup-meaning')?.textContent).toBe('第二個');
    expect(onOpen).toHaveBeenCalledTimes(1);
    panel.close();
  });

  it('closes when its token is clicked again', () => {
    const { panel, anchor, onClose } = setup();
    panel.toggle(CUE, anchor);
    panel.toggle(CUE, anchor);
    expect(panel.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc, returning focus to the token', () => {
    const { panel, anchor } = setup();
    panel.toggle(CUE, anchor);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('closes on an outside click, and keeps the video from toggling', () => {
    const { panel, anchor } = setup();
    panel.toggle(CUE, anchor);
    const onVideoClick = vi.fn();
    const video = document.querySelector('video');
    video?.addEventListener('click', onVideoClick);
    video?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.isOpen()).toBe(false);
    expect(onVideoClick).not.toHaveBeenCalled();
  });

  it('uses the chosen theme each time it opens', () => {
    let theme: 'dark' | 'light' = 'light';
    const { panel, anchor, find } = setup({ theme: () => theme });
    panel.toggle(CUE, anchor);
    expect(find('.lookup-panel')?.dataset.theme).toBe('light');
    panel.close();
    theme = 'dark';
    panel.toggle(CUE, anchor);
    expect(find('.lookup-panel')?.dataset.theme).toBe('dark');
    panel.close();
  });

  it('stays open for clicks inside the panel', async () => {
    const { panel, anchor, find } = setup();
    panel.toggle(CUE, anchor);
    await flush();
    find('.lookup-word')?.click();
    expect(panel.isOpen()).toBe(true);
    panel.close();
  });

  it('stops watching after closing', () => {
    const { panel, anchor, onClose, speaker } = setup();
    panel.toggle(CUE, anchor);
    panel.close();
    expect(speaker.stop).toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a player', () => {
    const { anchor } = setup();
    const onOpen = vi.fn();
    const panel = createLookupPanel({
      layer: () => null,
      lookUp: () => Promise.resolve(ENTRY),
      translateSelection: () => Promise.resolve('擺脫'),
      wordStatus: () => Promise.resolve('none' as const),
      setWordStatus: () => Promise.resolve(),
      sourceLanguage: () => 'en',
      theme: () => 'dark',
      speaker: { speak: vi.fn(), stop: vi.fn() },
      onOpen,
      onClose: vi.fn(),
    });
    panel.toggle(CUE, anchor);
    expect(panel.isOpen()).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  describe('selected text', () => {
    it('shows the text and its translation in one chip', async () => {
      const { panel, anchor, find } = setup();
      panel.showSelection(PHRASE, anchor);
      expect(find('.lookup-phrase')?.textContent).toBe('Get rid of');
      expect(find('.skeleton')).not.toBeNull();
      await flush();
      expect(find('.meaning-chip')?.textContent).toBe('擺脫');
      expect(find('.skeleton')).toBeNull();
    });

    it('saves the text as a phrase once it is translated', async () => {
      const setWordStatus = vi.fn(() => Promise.resolve());
      const { panel, anchor, find } = setup({ setWordStatus });
      panel.showSelection(PHRASE, anchor);
      expect(find('.save')).toBeNull();
      await flush();
      const save = find('.save');
      expect(save?.getAttribute('aria-label')).toBe('Save phrase');
      save?.click();
      await flush();
      expect(setWordStatus).toHaveBeenCalledWith(
        {
          lemma: 'get rid of',
          phonetic: null,
          senses: [{ meaning: '擺脫', example: '', translation: '' }],
        },
        PHRASE,
        'saved',
        'none',
      );
      expect(find('.save')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('shows a saved phrase as saved', async () => {
      const onSeenAgain = vi.fn();
      const { panel, anchor, find } = setup({
        wordStatus: () => Promise.resolve('saved' as const),
        onSeenAgain,
      });
      panel.showSelection(PHRASE, anchor);
      await flush();
      expect(find('.save')?.getAttribute('aria-pressed')).toBe('true');
      expect(onSeenAgain).toHaveBeenCalledTimes(1);
    });

    it('accepts text up to the limit, and no longer', async () => {
      const { panel, anchor, other, find } = setup();
      panel.showSelection({ ...PHRASE, word: 'a'.repeat(80) }, anchor);
      await flush();
      expect(find('.save')).not.toBeNull();
      panel.showSelection({ ...PHRASE, word: 'a'.repeat(81) }, other);
      await flush();
      expect(find('.save')).toBeNull();
      expect(find('.meaning-chip')?.textContent).toBe('擺脫');
    });

    it.each([
      ['failed', () => Promise.reject(new Error('down'))],
      ['not needed', () => Promise.resolve(null)],
      ['empty', () => Promise.resolve(' ')],
    ])('cannot save when the translation is %s', async (_, translate) => {
      const { panel, anchor, find } = setup({
        translateSelection: translate,
      });
      panel.showSelection(PHRASE, anchor);
      await flush();
      expect(find('.save')).toBeNull();
    });

    it('shows no example row for a saved phrase', () => {
      const row = senseRow({
        meaning: '好，走吧',
        example: '',
        translation: '',
      });
      expect(row.querySelectorAll('.meaning-chip')).toHaveLength(1);
      expect(row.querySelector('.couplet-original')).toBeNull();
      expect(row.querySelector('.couplet-translation')).toBeNull();
    });

    it('offers a retry when translation fails', async () => {
      const translateSelection = vi
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce('擺脫');
      const { panel, anchor, find } = setup({ translateSelection });
      panel.showSelection(PHRASE, anchor);
      await flush();
      expect(find('.alert')?.textContent).toContain(
        "Couldn't reach the translator",
      );
      find('.text-button')?.click();
      await flush();
      expect(find('.meaning-chip')?.textContent).toBe('擺脫');
    });

    it('shows only the text when no translation is needed', async () => {
      const { panel, anchor, find } = setup({
        translateSelection: () => Promise.resolve(null),
      });
      panel.showSelection({ ...PHRASE, word: 'hello there' }, anchor);
      await flush();
      expect(find('.meaning-chip')).toBeNull();
      expect(find('.lookup-senses')?.hidden).toBe(true);
    });

    it('drops a late translation after another word opens', async () => {
      let finish: (value: string) => void = () => undefined;
      const { panel, anchor, other, find } = setup({
        translateSelection: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      });
      panel.showSelection(PHRASE, anchor);
      panel.toggle(CUE, other);
      finish('late');
      await flush();
      expect(find('.lookup-word')?.textContent).toBe('bank');
      expect(find('.lookup-meaning')?.textContent).not.toContain('late');
    });
  });

  describe('a word met again', () => {
    it('reports a saved word when it is opened', async () => {
      const onSeenAgain = vi.fn();
      const { panel, anchor } = setup({
        wordStatus: () => Promise.resolve('saved' as const),
        onSeenAgain,
      });
      panel.toggle(CUE, anchor);
      await flush();
      expect(onSeenAgain).toHaveBeenCalledWith(ENTRY, CUE);
    });

    it('stays quiet for a word not saved', async () => {
      const onSeenAgain = vi.fn();
      const { panel, anchor } = setup({ onSeenAgain });
      panel.toggle(CUE, anchor);
      await flush();
      expect(onSeenAgain).not.toHaveBeenCalled();
    });
  });

  describe('save sound', () => {
    it('fires only when saving, not when removing', async () => {
      const onSaved = vi.fn();
      const { panel, anchor, find } = setup({ onSaved });
      panel.toggle(CUE, anchor);
      await flush();
      find('.save')?.click();
      expect(onSaved).toHaveBeenCalledTimes(1);
      find('.save')?.click();
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  describe('placement', () => {
    const rect = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 100,
        width: 100,
        height: bottom - top,
      }) as DOMRect;

    function placedAt(stripTop: number, stripBottom: number, height: number) {
      const context = setup();
      const strip = document.createElement('div');
      strip.className = 'strip';
      context.anchor.before(strip);
      strip.append(context.anchor);
      const layer = document.querySelector<HTMLElement>('#layer');
      if (!layer) throw new Error('missing layer');
      layer.getBoundingClientRect = () => rect(0, 500);
      strip.getBoundingClientRect = () => rect(stripTop, stripBottom);
      context.anchor.getBoundingClientRect = () =>
        rect(stripTop + 30, stripTop + 50);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
        height,
      );
      context.panel.toggle(CUE, context.anchor);
      return context;
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('opens above the whole subtitle, with a line reaching the word', () => {
      const { find, anchor } = placedAt(300, 400, 100);
      expect(find('.lookup-panel')?.style.bottom).toBe('214px');
      expect(anchor.classList.contains('is-panel-below')).toBe(false);
      expect(anchor.style.getPropertyValue('--leader')).toBe('44px');
    });

    it('opens below a subtitle near the top of the player', () => {
      const { find, anchor, panel } = placedAt(20, 120, 200);
      expect(find('.lookup-panel')?.style.top).toBe('134px');
      expect(anchor.classList.contains('is-panel-below')).toBe(true);
      panel.close();
      expect(anchor.classList.contains('is-panel-below')).toBe(false);
      expect(anchor.style.getPropertyValue('--leader')).toBe('');
    });
  });
});
