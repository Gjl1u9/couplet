import type { WordInCue } from '../lookup/types';
import type { SubtitlePosition, SubtitleSize } from '../settings/settings';
import {
  element,
  icon,
  ICON_CONTEXT_OFF,
  ICON_CONTEXT_ON,
  ICON_GRIP,
} from '../ui/dom';
import lookupPanelStyles from '../ui/lookup-panel.css?inline';
import overlayStyles from '../ui/overlay.css?inline';
import settingsMenuStyles from '../ui/settings-menu.css?inline';
import tokenStyles from '../ui/tokens.css?inline';
import { tokenizeCaption } from '../ui/tokenize';
import { joinText } from '../youtube/captions';
import type { SubtitleView } from './controller';

const HOST_ID = 'dual-subtitles-overlay';
const HIDE_NATIVE_ID = 'dual-subtitles-hide-native';

/** Clicks handled by our interface should not also control YouTube's player. */
const ISOLATED_EVENTS = [
  'click',
  'dblclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'keydown',
  'keyup',
  'keypress',
];

const SCALE: Record<SubtitleSize, string> = {
  small: '0.68',
  medium: '0.8',
  large: '0.96',
};

/** Keeps a wide strip and its grip inside the player wherever it is placed. */
const MIN_CENTER = 0.25;
const MAX_WIDTH = 0.86;
const SIDE_MARGIN = 0.08;
const MIN_BOTTOM = 0.02;
const MOVE_THRESHOLD_PX = 3;
const KEYBOARD_STEP = 0.02;
/** The click that ends a drag arrives right after the pointer is released. */
const CLICK_AFTER_DRAG_MS = 400;

/** Leaves the same margin at the top as at the bottom. */
const highestBottom = (heightRatio: number) =>
  Math.max(MIN_BOTTOM, 1 - heightRatio - MIN_BOTTOM);

/** `heightRatio` is the subtitle's height as a share of the player's. */
export function clampPosition(
  position: SubtitlePosition,
  heightRatio: number,
): SubtitlePosition {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));
  return {
    x: clamp(position.x, MIN_CENTER, 1 - MIN_CENTER),
    y: clamp(position.y, MIN_BOTTOM, highestBottom(heightRatio)),
  };
}

export interface OverlayOptions {
  readonly sourceLanguage?: () => string | null;
  /** Whether a missing translation is still loading, so its line keeps its place. */
  readonly expectsTranslation?: () => boolean;
  /** Whether this token is a Saved Word still on the schedule. */
  readonly isMarked?: (token: string) => boolean;
  readonly onToken?: (cue: WordInCue, element: HTMLElement) => void;
  /** A drag reached a second token. */
  readonly onSelectionStart?: () => void;
  /** The sentence and offset are where the Selection starts, even if it crosses cues. */
  readonly onSelection?: (selection: WordInCue, anchor: HTMLElement) => void;
  /** A started drag ended back on a single token. */
  readonly onSelectionCancel?: () => void;
  readonly onMoveStart?: () => void;
  /** `null` returns the subtitle to its default place. */
  readonly onMove?: (position: SubtitlePosition | null) => void;
  /** The user asked to show or hide the Context Lines. */
  readonly onContextToggle?: (visible: boolean) => void;
}

export interface OverlayDisplay {
  readonly showTranslation: boolean;
  readonly subtitleSize: SubtitleSize;
  readonly subtitlePosition?: SubtitlePosition | null | undefined;
}

export interface Overlay {
  render: (view: SubtitleView | null) => void;
  /** Redraws the marks on Saved Words after the Vocabulary changes. */
  refreshMarks: () => void;
  setNativeCaptionsHidden: (hidden: boolean) => void;
  setDisplay: (display: OverlayDisplay) => void;
  /** Shows the previous and next cues around the current one. */
  setContextVisible: (visible: boolean) => void;
  /** Attaches to the player and returns the layer panels go in. */
  panelLayer: () => HTMLElement | null;
  selectToken: (element: HTMLElement | null) => void;
  dispose: () => void;
}

interface TokenLine {
  readonly element: HTMLElement;
  /** Returns whether the tokens were replaced. */
  readonly draw: (text: string) => boolean;
}

export function createOverlay(options: OverlayOptions = {}): Overlay {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const createLine = (className: string): TokenLine => {
    const line = element('div', className);
    line.dir = 'auto';
    let current: string | null = null;
    return {
      element: line,
      draw(text) {
        if (text === current) return false;
        current = text;
        let offset = 0;
        line.replaceChildren(
          ...tokenizeCaption(text, options.sourceLanguage?.() ?? null).map(
            (part) => {
              const start = offset;
              offset += part.text.length;
              if (!part.isToken) return part.text;
              const token = element('button', 'token', part.text);
              token.type = 'button';
              token.dataset.offset = String(start);
              if (options.isMarked?.(part.text)) {
                token.classList.add('is-marked');
              }
              return token;
            },
          ),
        );
        return true;
      },
    };
  };

  const style = document.createElement('style');
  style.textContent = `${tokenStyles}\n${lookupPanelStyles}\n${overlayStyles}\n${settingsMenuStyles}`;
  const previous = createLine('context context-previous');
  const original = createLine('original');
  const next = createLine('context context-next');
  const translation = element('div', 'translation');
  translation.dir = 'auto';
  const grip = element('button', 'grip', icon(ICON_GRIP));
  grip.type = 'button';
  grip.title = 'Drag to move the subtitles. Double-click to reset.';
  grip.setAttribute('aria-label', 'Move subtitles');
  const contextToggle = element('button', 'context-toggle');
  contextToggle.type = 'button';
  const strip = element(
    'div',
    'strip',
    grip,
    contextToggle,
    previous.element,
    original.element,
    translation,
    next.element,
  );
  const box = element('div', 'box', strip);
  box.hidden = true;
  const panels = element('div', 'panels');
  shadow.append(style, box, panels);

  const nativeStyle = document.createElement('style');
  nativeStyle.id = HIDE_NATIVE_ID;
  nativeStyle.textContent =
    '#movie_player .ytp-caption-window-container { display: none !important; }';

  let showTranslation = true;
  let contextVisible = false;
  let lastView: SubtitleView | null = null;
  let selected: HTMLElement | null = null;
  let range: readonly HTMLElement[] = [];
  let position: SubtitlePosition | null = null;

  for (const target of [panels, strip]) {
    for (const type of ISOLATED_EVENTS) {
      target.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }
  }

  const tokenOf = (event: Event) =>
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('.token')
      : null;

  const cueOf = (token: HTMLElement): WordInCue => ({
    word: token.textContent,
    sentence: token.parentElement?.textContent ?? '',
    offset: Number(token.dataset.offset),
  });

  const clearRange = () => {
    for (const token of range) token.classList.remove('is-in-range');
    range = [];
  };

  const allTokens = () => [...strip.querySelectorAll<HTMLElement>('.token')];

  /** Keeps the text between tokens on a line, and joins lines like the captions do. */
  const selectionOf = (tokens: readonly HTMLElement[]): WordInCue => {
    const lines = new Map<HTMLElement, HTMLElement[]>();
    for (const token of tokens) {
      const line = token.parentElement;
      if (line) lines.set(line, [...(lines.get(line) ?? []), token]);
    }
    let text = '';
    for (const [line, inLine] of lines) {
      const whole = line.textContent;
      const first = inLine[0];
      const last = inLine.at(-1);
      if (!first || !last) continue;
      text = joinText(
        text,
        whole.slice(
          Number(first.dataset.offset),
          Number(last.dataset.offset) + last.textContent.length,
        ),
      );
    }
    const start = tokens[0];
    return {
      word: text,
      sentence: start?.parentElement?.textContent ?? '',
      offset: Number(start?.dataset.offset ?? 0),
    };
  };

  /** Stops the click that ends a drag, wherever the pointer was released. */
  const swallowNextClick = () => {
    const onClick = (event: Event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    window.addEventListener('click', onClick, { capture: true, once: true });
    setTimeout(() => {
      window.removeEventListener('click', onClick, { capture: true });
    }, CLICK_AFTER_DRAG_MS);
  };

  let press: {
    readonly token: HTMLElement;
    active: boolean;
  } | null = null;

  // YouTube's player is draggable, so a native drag would otherwise take over the pointer.
  strip.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  strip.addEventListener('pointerdown', (event) => {
    const token = tokenOf(event);
    if (!token || event.button !== 0) return;
    press = { token, active: false };
    // Without capture, the pointer leaving a word would stop the drag from tracking.
    token.setPointerCapture(event.pointerId);
  });
  strip.addEventListener('pointermove', (event) => {
    if (!press) return;
    if (!press.token.isConnected) {
      press = null;
      return;
    }
    const over = shadow
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.token');
    if (!over || (!press.active && over === press.token)) return;
    if (!press.active) {
      press.active = true;
      options.onSelectionStart?.();
    }
    const tokens = allTokens();
    const from = tokens.indexOf(press.token);
    const to = tokens.indexOf(over);
    clearRange();
    range = tokens.slice(Math.min(from, to), Math.max(from, to) + 1);
    for (const token of range) token.classList.add('is-in-range');
  });
  const endPress = (cancelled: boolean) => {
    const ended = press;
    press = null;
    if (!ended?.active) return;
    swallowNextClick();
    const anchor = range[Math.floor(range.length / 2)];
    if (cancelled || range.length < 2 || !anchor) {
      clearRange();
      options.onSelectionCancel?.();
      return;
    }
    options.onSelection?.(selectionOf(range), anchor);
  };
  strip.addEventListener('pointerup', () => {
    endPress(false);
  });
  strip.addEventListener('pointercancel', () => {
    endPress(true);
  });
  strip.addEventListener('click', (event) => {
    const token = tokenOf(event);
    if (!token) return;
    clearRange();
    options.onToken?.(cueOf(token), token);
  });

  const applyPosition = () => {
    box.classList.toggle('is-placed', position !== null);
    if (!position) {
      box.style.removeProperty('left');
      box.style.removeProperty('width');
      box.style.removeProperty('--place-bottom');
      return;
    }
    const { x, y } = position;
    const width = Math.min(MAX_WIDTH, 2 * Math.min(x, 1 - x) - SIDE_MARGIN);
    box.style.left = `${String(x * 100)}%`;
    box.style.width = `${String(width * 100)}%`;
    // A taller cue, or turning on Context Lines, must not push the strip off the top.
    const fitted = Math.min(y, highestBottom(heightRatio()));
    box.style.setProperty('--place-bottom', `${String(fitted * 100)}%`);
  };

  const heightRatio = () => {
    const height = host.getBoundingClientRect().height;
    return height > 0 ? box.getBoundingClientRect().height / height : 0;
  };

  /** Where the subtitle is now, including when it still follows its default rules. */
  const currentPosition = (): SubtitlePosition => {
    if (position) return position;
    const area = host.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    if (area.width === 0 || area.height === 0) return { x: 0.5, y: 0.06 };
    return {
      x: (rect.left + rect.width / 2 - area.left) / area.width,
      y: (area.bottom - rect.bottom) / area.height,
    };
  };

  let move: {
    readonly x: number;
    readonly y: number;
    readonly origin: SubtitlePosition;
    moved: boolean;
  } | null = null;

  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    grip.setPointerCapture(event.pointerId);
    move = {
      x: event.clientX,
      y: event.clientY,
      origin: currentPosition(),
      moved: false,
    };
    box.classList.add('is-moving');
    options.onMoveStart?.();
  });
  grip.addEventListener('pointermove', (event) => {
    if (!move) return;
    const dx = event.clientX - move.x;
    const dy = event.clientY - move.y;
    if (!move.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
    move.moved = true;
    const area = host.getBoundingClientRect();
    if (area.width === 0 || area.height === 0) return;
    position = clampPosition(
      {
        x: move.origin.x + dx / area.width,
        y: move.origin.y - dy / area.height,
      },
      heightRatio(),
    );
    applyPosition();
  });
  const endMove = () => {
    const ended = move;
    move = null;
    box.classList.remove('is-moving');
    if (!ended?.moved) return;
    swallowNextClick();
    options.onMove?.(position);
  };
  grip.addEventListener('pointerup', endMove);
  grip.addEventListener('pointercancel', endMove);
  grip.addEventListener('lostpointercapture', endMove);
  grip.addEventListener('dblclick', () => {
    position = null;
    applyPosition();
    options.onMove?.(null);
  });
  grip.addEventListener('keydown', (event) => {
    const keys: Partial<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, KEYBOARD_STEP],
      ArrowDown: [0, -KEYBOARD_STEP],
    };
    if (event.key === 'Home') {
      event.preventDefault();
      position = null;
      applyPosition();
      options.onMove?.(null);
      return;
    }
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    const { x, y } = currentPosition();
    position = clampPosition({ x: x + step[0], y: y + step[1] }, heightRatio());
    applyPosition();
    options.onMove?.(position);
  });

  const attach = (): boolean => {
    const player = document.querySelector('#movie_player');
    if (!player) return false;
    if (host.parentElement !== player) player.append(host);
    return true;
  };

  const drawTranslation = (view: SubtitleView) => {
    const text = view.translation;
    const loading = text === null && (options.expectsTranslation?.() ?? false);
    translation.textContent = text ?? '';
    translation.classList.toggle('is-loading', loading);
    translation.hidden = !showTranslation || (text === null && !loading);
  };

  const drawContext = (line: TokenLine, text: string | null | undefined) => {
    line.element.hidden = !contextVisible || !text;
    if (text && line.draw(text)) clearRange();
  };

  const drawNeighbours = (view: SubtitleView) => {
    drawContext(previous, view.previous);
    drawContext(next, view.next);
  };

  const drawContextToggle = () => {
    const label = contextVisible ? 'Hide nearby lines' : 'Show nearby lines';
    contextToggle.replaceChildren(
      icon(contextVisible ? ICON_CONTEXT_ON : ICON_CONTEXT_OFF),
    );
    contextToggle.title = label;
    contextToggle.setAttribute('aria-label', label);
    contextToggle.setAttribute('aria-pressed', String(contextVisible));
  };
  drawContextToggle();
  contextToggle.addEventListener('click', () => {
    options.onContextToggle?.(!contextVisible);
  });

  return {
    refreshMarks() {
      for (const token of strip.querySelectorAll('.token')) {
        token.classList.toggle(
          'is-marked',
          options.isMarked?.(token.textContent) ?? false,
        );
      }
    },
    render(view) {
      lastView = view;
      if (!view) {
        box.hidden = true;
        return;
      }
      attach();
      if (original.draw(view.original)) {
        selected = null;
        clearRange();
      }
      drawTranslation(view);
      drawNeighbours(view);
      box.hidden = false;
      if (!move) applyPosition();
    },
    setNativeCaptionsHidden(hidden) {
      if (hidden) document.documentElement.append(nativeStyle);
      else nativeStyle.remove();
    },
    setDisplay(display) {
      showTranslation = display.showTranslation;
      host.style.setProperty('--subtitle-scale', SCALE[display.subtitleSize]);
      if (lastView) drawTranslation(lastView);
      if (!move) {
        position = display.subtitlePosition ?? null;
        applyPosition();
      }
    },
    setContextVisible(visible) {
      if (visible === contextVisible) return;
      contextVisible = visible;
      drawContextToggle();
      if (lastView) drawNeighbours(lastView);
      if (!move) applyPosition();
    },
    panelLayer: () => (attach() ? panels : null),
    selectToken(token) {
      selected?.classList.remove('is-selected');
      selected = token;
      selected?.classList.add('is-selected');
      box.classList.toggle('is-raised', token !== null);
      if (!token) clearRange();
    },
    dispose() {
      host.remove();
      nativeStyle.remove();
    },
  };
}
