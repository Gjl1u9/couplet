const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICON_SPEAK = [
  'M15 8a5 5 0 0 1 0 8',
  'M17.7 5a9 9 0 0 1 0 14',
  'M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5',
];
export const ICON_STAR = [
  'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245',
];
export const ICON_CHECK = ['M5 12l5 5l9 -10'];
export const ICON_CHEVRON_DOWN = ['M6 9l6 6l6 -6'];
export const ICON_CLOSE = ['M6 6l12 12', 'M18 6L6 18'];
export const ICON_DICTIONARY = [
  'M10 19h-6a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1h6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2h6a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-6a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2',
  'M12 5v16',
  'M7 7h1',
  'M7 11h1',
  'M16 7h1',
  'M16 11h1',
  'M16 15h1',
];
export const ICON_ALERT = ['M12 4l9 16H3l9-16z', 'M12 10v4', 'M12 17v.01'];
/** Two columns of three dots. */
export const ICON_GRIP = [
  'M9 6v.01',
  'M9 12v.01',
  'M9 18v.01',
  'M15 6v.01',
  'M15 12v.01',
  'M15 18v.01',
];
/** The current line alone, with room above and below it. */
export const ICON_CONTEXT_OFF = ['M4 12h16', 'M12 5v.01', 'M12 19v.01'];
/** The current line between two shorter ones. */
export const ICON_CONTEXT_ON = ['M8 6h8', 'M4 12h16', 'M8 18h8'];
/** Sliders, so it never reads as YouTube's own gear. From Tabler Icons (MIT). */
export const ICON_ADJUSTMENTS = [
  'M4 6h8',
  'M16 6h4',
  'M4 12h2',
  'M10 12h10',
  'M4 18h11',
  'M19 18h1',
];
export const ICON_ADJUSTMENTS_KNOBS = [
  'M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  'M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  'M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
];

/**
 * The product mark, on the 16-grid of brand/toolbar.svg, in the colours it
 * takes over video: white for the original, vermilion for the translation.
 * Off, it is grey and struck through.
 */
export function productMark(active: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const OFF = '#a7adb7';
  const shapes = [
    {
      d: 'M4 1H7A3 3 0 0 1 10 4V6H9A3 3 0 0 0 6 9V10H4A3 3 0 0 1 1 7V4A3 3 0 0 1 4 1Z',
      fill: active ? '#ffffff' : OFF,
    },
    {
      d: 'M10 6H12A3 3 0 0 1 15 9V12A3 3 0 0 1 12 15H9A3 3 0 0 1 6 12V10H7A3 3 0 0 0 10 7Z',
      fill: active ? '#ff7a59' : OFF,
    },
  ];
  for (const shape of shapes) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', shape.d);
    path.setAttribute('fill', shape.fill);
    svg.append(path);
  }
  if (!active) {
    const strike = document.createElementNS(SVG_NS, 'line');
    for (const [name, value] of Object.entries({
      x1: 2.5,
      y1: 2.5,
      x2: 13.5,
      y2: 13.5,
      stroke: '#ffffff',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
    })) {
      strike.setAttribute(name, String(value));
    }
    svg.append(strike);
  }
  return svg;
}

/** Text only ever enters the DOM through this helper, so captions cannot inject HTML. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

export function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function iconButton(
  className: string,
  label: string,
  paths: readonly string[],
  onClick: () => void,
): HTMLButtonElement {
  const button = element(
    'button',
    `icon-button ${className}`.trim(),
    icon(paths),
  );
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

/** Chips separate meanings, so the interface needs no commas or semicolons. */
export function meaningChip(meaning: string): HTMLElement {
  const chip = element('span', 'meaning-chip', meaning);
  chip.dir = 'auto';
  return chip;
}

/**
 * Closes a panel on Esc or a click outside it. A click on the video would also toggle
 * playback, so it is swallowed and the click only closes the panel.
 */
export function watchDismiss(
  isInside: (path: readonly EventTarget[]) => boolean,
  onDismiss: (byKeyboard: boolean) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (isInside(event.composedPath())) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('video, .html5-video-container')
    ) {
      event.stopPropagation();
      event.preventDefault();
    }
    onDismiss(false);
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onDismiss(true);
  };
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('keydown', onKeydown, { capture: true });
  return () => {
    document.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('keydown', onKeydown, { capture: true });
  };
}
