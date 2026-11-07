import {
  LEARNING_LANGUAGES,
  NATIVE_LANGUAGES,
  type Settings,
  type PanelTheme,
  type SubtitleSize,
} from '../settings/settings';
import {
  element,
  icon,
  iconButton,
  ICON_ALERT,
  ICON_CLOSE,
  ICON_COUPLET,
  ICON_DICTIONARY,
  watchDismiss,
} from './dom';
import {
  createSelectMenu,
  type SelectChoice,
  type SelectMenu,
} from './select-menu';

export interface SettingsPanelOptions {
  readonly layer: () => HTMLElement | null;
  readonly getSettings: () => Settings;
  readonly update: (patch: Partial<Settings>) => void;
  /** `false` when the current video has no track in the learning language. */
  readonly trackAvailable: () => boolean | null;
  /** Lets the user hear the sound they just turned on. */
  readonly previewSaveSound: () => void;
  readonly openDashboard: () => void;
  readonly onOpen: () => void;
}

export interface SettingsPanel {
  toggle: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** Redraws after settings or the track status change. */
  refresh: () => void;
  /** Keeps the entry button in the player's controls. */
  ensureButton: () => void;
  dispose: () => void;
}

const BUTTON_CLASS = 'dual-subtitles-settings-button';
const SIZES: readonly { value: SubtitleSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];
const PANEL_THEMES: readonly { value: PanelTheme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function createSettingsPanel(
  options: SettingsPanelOptions,
): SettingsPanel {
  let panel: HTMLElement | null = null;
  let stopWatching: (() => void) | null = null;
  let button: HTMLButtonElement | null = null;
  let menus: SelectMenu[] = [];
  /** A redraw waiting for an open list, which it would otherwise close. */
  let redrawLater = false;

  const disposeMenus = () => {
    redrawLater = false;
    for (const menu of menus) menu.dispose();
    menus = [];
  };

  const selectRow = (
    label: string,
    choices: readonly SelectChoice[],
    value: string,
    onChange: (value: string) => void,
  ): HTMLElement => {
    const menu = createSelectMenu({
      label,
      choices,
      value,
      onChange,
      onClose: () => {
        if (redrawLater) draw();
      },
    });
    menus.push(menu);
    return element('div', 'setting', element('span', '', label), menu.element);
  };

  const syncExpanded = () => {
    button?.setAttribute('aria-expanded', String(panel !== null));
  };

  const close = () => {
    stopWatching?.();
    stopWatching = null;
    disposeMenus();
    panel?.remove();
    panel = null;
    syncExpanded();
  };

  const draw = () => {
    if (!panel) return;
    if (menus.some((menu) => menu.isOpen())) {
      redrawLater = true;
      return;
    }
    const settings = options.getSettings();
    const current = panel;
    const controls = () => [
      ...current.querySelectorAll<HTMLElement>('button, input'),
    ];
    // Every change redraws, and keyboard users should stay on the control they used.
    const focused = controls().indexOf(
      (current.getRootNode() as ShadowRoot).activeElement as HTMLElement,
    );
    disposeMenus();
    panel.replaceChildren(
      element(
        'div',
        'settings-head',
        'Subtitle settings',
        iconButton(
          'dashboard',
          'Open Dashboard',
          ICON_DICTIONARY,
          options.openDashboard,
        ),
        iconButton('close', 'Close', ICON_CLOSE, close),
      ),
      element(
        'div',
        'settings-menu',
        menuGroup(
          'Language',
          selectRow(
            'Learning language',
            LEARNING_LANGUAGES,
            settings.learningLanguage,
            (learningLanguage) => {
              options.update({ learningLanguage });
            },
          ),
          selectRow(
            'Native language',
            NATIVE_LANGUAGES,
            settings.nativeLanguage,
            (code) => {
              const nativeLanguage = NATIVE_LANGUAGES.find(
                (language) => language.code === code,
              )?.code;
              if (nativeLanguage) options.update({ nativeLanguage });
            },
          ),
          ...missingTrackNote(settings, options.trackAvailable()),
        ),
        menuGroup(
          'Subtitles',
          switchRow('Dual subtitles', settings.enabled, (enabled) => {
            options.update({ enabled });
          }),
          switchRow(
            'Show translation',
            settings.showTranslation,
            (showTranslation) => {
              options.update({ showTranslation });
            },
          ),
          segmentedRow(
            'Subtitle size',
            SIZES,
            settings.subtitleSize,
            (subtitleSize) => {
              options.update({ subtitleSize });
            },
          ),
          ...(settings.subtitlePosition
            ? [
                buttonRow('Subtitle position', 'Reset', () => {
                  options.update({ subtitlePosition: null });
                }),
              ]
            : []),
        ),
        menuGroup(
          'Lookup',
          switchRow(
            'Pause on lookup',
            settings.pauseOnLookup,
            (pauseOnLookup) => {
              options.update({ pauseOnLookup });
            },
          ),
          segmentedRow(
            'Lookup panel',
            PANEL_THEMES,
            settings.panelTheme,
            (panelTheme) => {
              options.update({ panelTheme });
            },
          ),
          switchRow('Save sound', settings.saveSound, (saveSound) => {
            options.update({ saveSound });
            if (saveSound) options.previewSaveSound();
          }),
        ),
      ),
    );
    if (focused >= 0) controls()[focused]?.focus();
  };

  const open = () => {
    const layer = options.layer();
    if (!layer || panel) return;
    options.onOpen();
    const current = element('div', 'panel settings-panel');
    current.dataset.theme = 'dark';
    current.setAttribute('role', 'dialog');
    current.setAttribute('aria-label', 'Subtitle settings');
    panel = current;
    layer.append(current);
    draw();
    syncExpanded();
    stopWatching = watchDismiss(
      (path) =>
        path.includes(current) || (button !== null && path.includes(button)),
      close,
    );
  };

  const toggle = () => {
    if (panel) close();
    else open();
  };

  return {
    toggle,
    close,
    isOpen: () => panel !== null,
    refresh: draw,
    ensureButton() {
      const controls =
        document.querySelector('#movie_player .ytp-right-controls-left') ??
        document.querySelector('#movie_player .ytp-right-controls');
      if (!controls || button?.parentElement === controls) return;
      button?.remove();
      button = createButton(toggle);
      syncExpanded();
      controls.prepend(button);
    },
    dispose() {
      close();
      button?.remove();
      button = null;
    },
  };
}

/** Lives in YouTube's controls, outside our shadow root, so its styles are inline. */
function createButton(onClick: () => void): HTMLButtonElement {
  const svg = icon(ICON_COUPLET);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.style.padding = '20%';
  svg.style.boxSizing = 'border-box';
  const button = element('button', `ytp-button ${BUTTON_CLASS}`, svg);
  button.type = 'button';
  button.setAttribute('aria-label', 'Subtitle settings');
  button.title = 'Subtitle settings';
  button.style.color = '#fff';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function menuGroup(
  title: string,
  ...rows: readonly HTMLElement[]
): HTMLElement {
  return element(
    'section',
    'menu-group',
    element('h3', 'menu-title', title),
    ...rows,
  );
}

function switchRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = element('input', 'switch');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => {
    onChange(input.checked);
  });
  return element('label', 'setting', label, input);
}

function segmentedRow<T extends string>(
  label: string,
  choices: readonly { value: T; label: string }[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = element(
    'div',
    'segmented',
    ...choices.map((choice) => {
      const input = element('input', '');
      input.type = 'radio';
      input.name = label;
      input.checked = choice.value === value;
      input.addEventListener('change', () => {
        onChange(choice.value);
      });
      return element('label', '', input, choice.label);
    }),
  );
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  return element('div', 'setting', element('span', '', label), group);
}

function buttonRow(
  label: string,
  action: string,
  onClick: () => void,
): HTMLElement {
  const button = element('button', 'menu-action', action);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return element('div', 'setting', element('span', '', label), button);
}

function missingTrackNote(
  settings: Settings,
  available: boolean | null,
): readonly HTMLElement[] {
  if (available !== false) return [];
  const name =
    LEARNING_LANGUAGES.find((l) => l.code === settings.learningLanguage)
      ?.name ?? settings.learningLanguage;
  return [
    element(
      'p',
      'setting-note is-alert',
      icon(ICON_ALERT),
      element(
        'span',
        '',
        `This video has no ${name} subtitles. Change your learning language, or try another video.`,
      ),
    ),
  ];
}
