// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '../settings/settings';
import { createSettingsPanel, type TrackStatus } from './settings-panel';

function setup(
  trackStatus: TrackStatus | null = { mode: 'learning', language: 'en' },
) {
  document.body.innerHTML =
    '<div id="movie_player"><div class="ytp-right-controls"><button id="existing"></button></div></div><div id="layer"></div><video></video>';
  const layer = document.querySelector<HTMLElement>('#layer');
  if (!layer) throw new Error('missing fixture');
  let settings: Settings = defaultSettings('zh-TW');
  const update = vi.fn((patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
  });
  const onOpen = vi.fn();
  const previewSaveSound = vi.fn();
  const openDashboard = vi.fn();
  const panel = createSettingsPanel({
    layer: () => layer,
    getSettings: () => settings,
    update,
    trackStatus: () => trackStatus,
    previewSaveSound,
    openDashboard,
    onOpen,
  });
  const find = (selector: string) => layer.querySelector<HTMLElement>(selector);
  const entry = () =>
    document.querySelector<HTMLElement>('.dual-subtitles-settings-button');
  return {
    panel,
    layer,
    find,
    update,
    onOpen,
    entry,
    previewSaveSound,
    openDashboard,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createSettingsPanel', () => {
  beforeEach(() => {
    // The test DOM has no top layer.
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  });

  it('adds one entry button to the player controls', () => {
    const { panel, entry } = setup();
    panel.ensureButton();
    panel.ensureButton();
    expect(
      document.querySelectorAll('.dual-subtitles-settings-button'),
    ).toHaveLength(1);
    const group = entry()?.parentElement;
    expect(group?.className).toBe('dual-subtitles-controls');
    expect(group?.nextElementSibling?.className).toBe('ytp-right-controls');
    panel.dispose();
    expect(entry()).toBeNull();
  });

  it('turns subtitles on and off without opening the panel', () => {
    const { panel, update, find } = setup();
    panel.ensureButton();
    const subtitleSwitch = () =>
      document.querySelector<HTMLElement>('.dual-subtitles-switch-button');
    expect(subtitleSwitch()?.getAttribute('aria-pressed')).toBe('true');
    expect(subtitleSwitch()?.getAttribute('aria-label')).toBe(
      'Turn off dual subtitles',
    );
    const struck = () => subtitleSwitch()?.querySelectorAll('line').length;
    expect(struck()).toBe(0);

    subtitleSwitch()?.click();
    expect(update).toHaveBeenCalledWith({ enabled: false });
    panel.refresh();
    expect(subtitleSwitch()?.getAttribute('aria-pressed')).toBe('false');
    expect(subtitleSwitch()?.getAttribute('aria-label')).toBe(
      'Turn on dual subtitles',
    );
    expect(struck()).toBe(1);
    expect(find('.settings-panel')).toBeNull();

    panel.dispose();
    expect(subtitleSwitch()).toBeNull();
  });

  it('adds the button again when the player controls are replaced', () => {
    const { panel, entry } = setup();
    panel.ensureButton();
    document.querySelector('.ytp-right-controls')?.replaceWith(
      Object.assign(document.createElement('div'), {
        className: 'ytp-right-controls',
      }),
    );
    panel.ensureButton();
    expect(entry()).not.toBeNull();
    panel.dispose();
  });

  it('says hints are English only when learning another language', () => {
    const { panel, layer, update } = setup();
    panel.toggle();
    expect(layer.textContent).not.toContain('English only');
    panel.toggle();
    update({ learningLanguage: 'es' });
    panel.toggle();
    expect(layer.textContent).toContain(
      'New word hints are English only for now.',
    );
    panel.dispose();
  });

  it('toggles from the button without reaching the player', () => {
    const { panel, entry, find, onOpen } = setup();
    panel.ensureButton();
    const onPlayerClick = vi.fn();
    document
      .querySelector('#movie_player')
      ?.addEventListener('click', onPlayerClick);
    entry()?.click();
    expect(find('.settings-panel')).not.toBeNull();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(entry()?.getAttribute('aria-expanded')).toBe('true');
    expect(onPlayerClick).not.toHaveBeenCalled();
    entry()?.click();
    expect(find('.settings-panel')).toBeNull();
    expect(entry()?.getAttribute('aria-expanded')).toBe('false');
    panel.dispose();
  });

  it('shows current values and sends every change', () => {
    const { panel, layer, update } = setup();
    panel.toggle();
    const selects = layer.querySelectorAll<HTMLElement>('.select');
    const [learning, native] = selects;
    expect(learning?.querySelector('.select-value')?.textContent).toBe(
      'English',
    );
    expect(native?.querySelector('.select-value')?.textContent).toBe(
      '繁體中文',
    );
    const pick = (select: HTMLElement | undefined, code: string) => {
      select?.querySelector<HTMLElement>('.select-trigger')?.click();
      select?.querySelector<HTMLElement>(`[data-code="${code}"]`)?.click();
    };
    pick(learning, 'ja');
    pick(native, 'ko');
    const switches = layer.querySelectorAll<HTMLInputElement>('.switch');
    const [enabled] = switches;
    if (enabled) {
      enabled.checked = false;
      enabled.dispatchEvent(new Event('change'));
    }
    const large =
      layer.querySelectorAll<HTMLInputElement>('.segmented input')[2];
    large?.dispatchEvent(new Event('change'));
    expect(update.mock.calls.map(([patch]) => patch)).toEqual([
      { learningLanguage: 'ja' },
      { nativeLanguage: 'ko' },
      { enabled: false },
      { subtitleSize: 'large' },
    ]);
    panel.dispose();
  });

  it('offers the Lookup Panel theme without changing its own', () => {
    const { panel, find, update, layer } = setup();
    panel.toggle();
    expect(find('.settings-panel')?.dataset.theme).toBe('dark');
    const [light] = [
      ...layer.querySelectorAll<HTMLInputElement>(
        '[aria-label="Lookup panel"] input',
      ),
    ].slice(1);
    expect(light?.parentElement?.textContent).toBe('Light');
    light?.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenCalledWith({ panelTheme: 'light' });
    panel.dispose();
  });

  it('says a video without the learning language is translated from its own', () => {
    const { panel, find } = setup({ mode: 'translation', language: 'ja' });
    panel.toggle();
    const note = find('.setting-note')?.textContent;
    expect(note).toContain('No English subtitles here');
    expect(note).toContain('Japanese');
    expect(find('.setting-note.is-alert')).toBeNull();
    panel.dispose();
  });

  it("says YouTube's own subtitles stay on a video in the native language", () => {
    const { panel, find } = setup({ mode: 'native', language: null });
    panel.toggle();
    expect(find('.setting-note')?.textContent).toContain(
      "YouTube's own subtitles",
    );
    panel.dispose();
  });

  it('warns when the video has no subtitles', () => {
    const { panel, find } = setup({ mode: 'none', language: null });
    panel.toggle();
    expect(find('.setting-note.is-alert')?.textContent).toBe(
      'This video has no subtitles.',
    );
    panel.dispose();
  });

  it('closes on an outside click and on Esc', () => {
    const { panel } = setup();
    panel.toggle();
    document
      .querySelector('video')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.isOpen()).toBe(false);
    panel.toggle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.isOpen()).toBe(false);
  });

  it('stays open when a control inside is used', () => {
    const { panel, find } = setup();
    panel.toggle();
    find('.select-trigger')?.click();
    expect(panel.isOpen()).toBe(true);
    panel.dispose();
  });

  it('lets Escape close an open select before the panel', () => {
    const { panel, find } = setup();
    panel.toggle();
    find('.select-trigger')?.click();
    find('.select-trigger')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(find('.select-trigger')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(panel.isOpen()).toBe(true);
    panel.dispose();
  });

  it('holds a redraw until the open select closes', () => {
    const { panel, find } = setup();
    panel.toggle();
    const trigger = find('.select-trigger');
    trigger?.click();
    panel.refresh();
    expect(find('.select-trigger')).toBe(trigger);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    trigger?.click();
    expect(find('.select-trigger')).not.toBe(trigger);
    panel.dispose();
  });

  it('keeps focus on the control after a redraw', () => {
    const { panel, layer } = setup();
    panel.toggle();
    const at = 3;
    layer.querySelectorAll<HTMLElement>('button, input')[at]?.focus();
    panel.refresh();
    expect(document.activeElement).toBe(
      layer.querySelectorAll('button, input')[at],
    );
    panel.dispose();
  });

  it('previews the save sound only when turning it on', () => {
    const { panel, layer, update, previewSaveSound } = setup();
    panel.toggle();
    const row = [...layer.querySelectorAll('.setting')].find((item) =>
      item.textContent.includes('Sounds'),
    );
    const input = row?.querySelector('input');
    if (!input) throw new Error('missing switch');
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenLastCalledWith({ saveSound: false });
    expect(previewSaveSound).not.toHaveBeenCalled();
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenLastCalledWith({ saveSound: true });
    expect(previewSaveSound).toHaveBeenCalledTimes(1);
  });

  it('opens the Dashboard', () => {
    const { panel, layer, openDashboard } = setup();
    panel.toggle();
    layer.querySelector<HTMLElement>('[aria-label="Open Dashboard"]')?.click();
    expect(openDashboard).toHaveBeenCalledTimes(1);
  });

  it('groups its rows under titled sections', () => {
    const { panel, layer } = setup();
    panel.toggle();
    expect(
      [...layer.querySelectorAll('.menu-title')].map(
        (title) => title.textContent,
      ),
    ).toEqual(['Language', 'Subtitles', 'Lookup']);
    expect(layer.querySelector('.setting-note')).toBeNull();
    panel.dispose();
  });

  it('offers a reset only after the subtitle was moved', () => {
    const { panel, layer, update } = setup();
    panel.toggle();
    const reset = () =>
      [...layer.querySelectorAll<HTMLElement>('.menu-action')].find(
        (button) => button.textContent === 'Reset',
      );
    expect(reset()).toBeUndefined();
    update({ subtitlePosition: { x: 0.3, y: 0.5 } });
    panel.refresh();
    reset()?.click();
    expect(update).toHaveBeenLastCalledWith({ subtitlePosition: null });
  });
});
