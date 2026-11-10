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
/** A check in a circle: done, so it never reads as a second save. The ring fills when known. */
export const ICON_KNOWN = [
  'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  'M8.5 12.2l2.4 2.4l4.6 -5',
];
/** Filled, unlike the other icons, so AI reads apart. The Dashboard's Explain uses it too. From Tabler Icons (MIT). */
export const ICON_SPARKLES = [
  'M17.964 2.733c.156 .563 .312 1 .484 1.353c.342 .71 .758 1.125 1.47 1.467c.353 .17 .79 .326 1.352 .484c.98 .276 .97 1.668 -.013 1.93a8.3 8.3 0 0 0 -1.34 .481c-.71 .342 -1.127 .757 -1.463 1.453a8 8 0 0 0 -.486 1.352c-.258 .988 -1.658 1 -1.932 .015c-.156 -.565 -.312 -1.002 -.484 -1.354c-.342 -.71 -.758 -1.124 -1.458 -1.46a8 8 0 0 0 -1.374 -.495a.4 .4 0 0 1 -.06 -.02l-.044 -.017l-.045 -.02l-.049 -.025l-.035 -.02a.4 .4 0 0 1 -.049 -.03l-.032 -.023l-.043 -.034l-.033 -.028l-.036 -.035l-.034 -.035l-.028 -.033l-.035 -.043l-.022 -.032a.4 .4 0 0 1 -.032 -.049l-.02 -.035l-.025 -.05l-.02 -.044l-.017 -.043a.4 .4 0 0 1 -.02 -.06l-.01 -.034a.5 .5 0 0 1 -.02 -.098l-.006 -.065l-.005 -.035v-.05a.4 .4 0 0 1 .003 -.085a.5 .5 0 0 1 .013 -.093a.5 .5 0 0 1 .024 -.103a.4 .4 0 0 1 .02 -.06l.017 -.044l.02 -.045l.025 -.049l.02 -.035a.4 .4 0 0 1 .03 -.049l.023 -.032l.034 -.043l.028 -.033l.035 -.036l.035 -.034q .015 -.015 .033 -.028l.043 -.035l.032 -.022a.4 .4 0 0 1 .049 -.032l.035 -.02l.05 -.025l.044 -.02l.043 -.017a.4 .4 0 0 1 .06 -.02l.027 -.008a8.3 8.3 0 0 0 1.339 -.48c.71 -.342 1.127 -.757 1.47 -1.466c.17 -.354 .327 -.792 .483 -1.355c.272 -.976 1.657 -.976 1.928 0',
  'M10.965 6.737q .219 .801 .503 1.574c.856 2.28 1.945 3.363 4.23 4.22q .708 .265 1.571 .506c.976 .272 .974 1.656 -.002 1.927q -.798 .221 -1.568 .504c-2.288 .858 -3.376 1.94 -4.229 4.216a19 19 0 0 0 -.505 1.579c-.268 .983 -1.662 .983 -1.93 0a19 19 0 0 0 -.503 -1.574c-.856 -2.281 -1.944 -3.363 -4.226 -4.219a20 20 0 0 0 -1.594 -.513a.4 .4 0 0 1 -.054 -.018l-.044 -.017l-.043 -.02a.3 .3 0 0 1 -.048 -.024l-.036 -.02a.4 .4 0 0 1 -.048 -.03l-.032 -.024l-.044 -.034l-.033 -.029l-.037 -.034l-.034 -.037l-.03 -.033l-.033 -.044l-.023 -.032a.4 .4 0 0 1 -.03 -.048l-.021 -.036a.3 .3 0 0 1 -.024 -.048l-.02 -.043l-.017 -.044a.4 .4 0 0 1 -.018 -.054a.2 .2 0 0 1 -.01 -.039a.4 .4 0 0 1 -.014 -.059l-.007 -.04l-.007 -.056l-.003 -.044l-.002 -.05v-.05q 0 -.023 .004 -.044q .001 -.03 .007 -.057l.007 -.04a.4 .4 0 0 1 .017 -.076l.007 -.021a.4 .4 0 0 1 .018 -.054l.017 -.044l.02 -.043a.3 .3 0 0 1 .024 -.048l.02 -.036a.4 .4 0 0 1 .03 -.048l.024 -.032l.034 -.044l.029 -.033l.034 -.037l.037 -.034l.033 -.03l.044 -.033l.032 -.023a.4 .4 0 0 1 .048 -.03l.036 -.021a.3 .3 0 0 1 .048 -.024l.043 -.02l.044 -.017a.4 .4 0 0 1 .054 -.018l.021 -.007a20 20 0 0 0 1.568 -.504c2.287 -.858 3.375 -1.94 4.229 -4.216a19 19 0 0 0 .505 -1.579c.268 -.983 1.662 -.983 1.93 0',
];
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
