import { frequencyLanguage } from '../hints/frequency';
import {
  LEARNING_LANGUAGES,
  NATIVE_LANGUAGES,
  type Settings,
  type PanelTheme,
  type SubtitleSize,
} from '../settings/settings';
import { languageName } from '../language';
import type { TrackMode } from '../youtube/captions';
import {
  element,
  icon,
  iconButton,
  ICON_ADJUSTMENTS,
  ICON_ADJUSTMENTS_KNOBS,
  ICON_ALERT,
  ICON_CLOSE,
  ICON_DICTIONARY,
  watchDismiss,
  productMark,
} from './dom';
import {
  createSelectMenu,
  type SelectChoice,
  type SelectMenu,
} from './select-menu';

export interface TrackStatus {
  readonly mode: TrackMode;
  /** The shown track's language. */
  readonly language: string | null;
}

export interface SettingsPanelOptions {
  readonly layer: () => HTMLElement | null;
  readonly getSettings: () => Settings;
  readonly update: (patch: Partial<Settings>) => void;
  /** What Dual Subtitles show on the current video, or `null` before it is known. */
  readonly trackStatus: () => TrackStatus | null;
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
const SWITCH_CLASS = 'dual-subtitles-switch-button';
const GROUP_CLASS = 'dual-subtitles-controls';
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
  let subtitleSwitch: HTMLButtonElement | null = null;
  /** Our own frosted pill, beside YouTube's, rather than inside it. */
  let group: HTMLElement | null = null;
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
          ...trackNote(settings, options.trackStatus()),
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
          switchRow('New word hints', settings.newWordHints, (newWordHints) => {
            options.update({ newWordHints });
          }),
          ...(frequencyLanguage(settings.learningLanguage)
            ? []
            : [
                element(
                  'p',
                  'setting-note',
                  'New word hints are English only for now.',
                ),
              ]),
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

  const syncSwitch = () => {
    if (!subtitleSwitch) return;
    const { enabled } = options.getSettings();
    const label = enabled
      ? 'Turn off dual subtitles'
      : 'Turn on dual subtitles';
    subtitleSwitch.setAttribute('aria-label', label);
    subtitleSwitch.setAttribute('aria-pressed', String(enabled));
    subtitleSwitch.title = label;
    subtitleSwitch.replaceChildren(sizedForControls(productMark(enabled)));
  };

  return {
    toggle,
    close,
    isOpen: () => panel !== null,
    refresh() {
      draw();
      syncSwitch();
    },
    ensureButton() {
      const youtubeControls = document.querySelector(
        '#movie_player .ytp-right-controls',
      );
      if (!youtubeControls || group?.nextElementSibling === youtubeControls) {
        return;
      }
      group?.remove();
      button = createButton(BUTTON_CLASS, toggle);
      button.append(settingsIcon());
      button.setAttribute('aria-label', 'Subtitle settings');
      button.title = 'Subtitle settings';
      subtitleSwitch = createButton(SWITCH_CLASS, () => {
        options.update({ enabled: !options.getSettings().enabled });
      });
      group = createGroup(subtitleSwitch, button);
      syncExpanded();
      syncSwitch();
      youtubeControls.before(group);
    },
    dispose() {
      close();
      group?.remove();
      group = null;
      button = null;
      subtitleSwitch = null;
    },
  };
}

/** Lives in YouTube's controls, outside our shadow root, so its styles are inline. */
function sizedForControls(svg: SVGSVGElement): SVGSVGElement {
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  // YouTube's buttons change height with the player, but their icons stay this size.
  svg.style.display = 'block';
  svg.style.margin = 'auto';
  return svg;
}

/** White sliders with vermilion knobs, so it reads apart from YouTube's own white icons. */
function settingsIcon(): SVGSVGElement {
  const svg = sizedForControls(icon(ICON_ADJUSTMENTS));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const path of icon(ICON_ADJUSTMENTS_KNOBS).querySelectorAll('path')) {
    path.setAttribute('stroke', '#ff7a59');
    svg.append(path);
  }
  return svg;
}

function createGroup(...buttons: readonly HTMLElement[]): HTMLElement {
  const group = element('div', GROUP_CLASS, ...buttons);
  group.style.cssText = [
    'display: flex',
    'flex: none',
    'align-items: center',
    'align-self: center',
    'height: 40px',
    'margin-right: 8px',
    'padding: 0 4px',
    'box-sizing: border-box',
    'border: 1px solid rgba(255, 255, 255, 0.18)',
    'border-radius: 20px',
    'background: rgba(21, 24, 30, 0.45)',
    'backdrop-filter: blur(12px) saturate(1.2)',
  ].join(';');
  return group;
}

function createButton(
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  // Not YouTube's `ytp-button`, whose red hover effect would show inside our pill.
  const button = element('button', className);
  button.type = 'button';
  button.style.cssText = [
    'width: 40px',
    'height: 38px',
    'padding: 0',
    'border: 0',
    'background: none',
    'color: #fff',
    'cursor: pointer',
  ].join(';');
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

/** Says why the subtitles look the way they do when the video lacks the learning language. */
function trackNote(
  settings: Settings,
  status: TrackStatus | null,
): readonly HTMLElement[] {
  if (!status || status.mode === 'learning') return [];
  if (status.mode === 'none') {
    return [
      element(
        'p',
        'setting-note is-alert',
        icon(ICON_ALERT),
        element('span', '', 'This video has no subtitles.'),
      ),
    ];
  }
  const learning = languageName(settings.learningLanguage);
  const text =
    status.mode === 'native'
      ? "This video is in your language, so YouTube's own subtitles stay."
      : `No ${learning} subtitles here, so this shows ${languageName(status.language ?? '')} with a translation. Words can be looked up in ${learning} videos.`;
  return [element('p', 'setting-note', text)];
}
