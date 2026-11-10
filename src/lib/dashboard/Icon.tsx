import { ICON_CONTEXT_OFF, ICON_CONTEXT_ON, ICON_KNOWN } from '../ui/dom';

export const ICONS = {
  home: [
    'M5 12h-2l9 -9l9 9h-2',
    'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7',
    'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6',
  ],
  review: [
    'M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M8 21h8',
  ],
  words: ['M5 6h14', 'M5 12h14', 'M5 18h9'],
  progress: ['M4 20h16', 'M7 20v-6', 'M12 20v-11', 'M17 20v-15'],
  settings: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
  youtube: [
    'M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z',
    'M10 9l5 3l-5 3z',
  ],
  sun: [
    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M12 3v2',
    'M12 19v2',
    'M3 12h2',
    'M19 12h2',
    'M5.6 5.6l1.4 1.4',
    'M17 17l1.4 1.4',
    'M5.6 18.4l1.4 -1.4',
    'M17 7l1.4 -1.4',
  ],
  moon: ['M12 3a9 9 0 1 0 9 9a7 7 0 0 1 -9 -9'],
  check: ['M5 12l5 5l9 -10'],
  /** A check in a circle, as I know this has on video. */
  known: ICON_KNOWN,
  contextOn: ICON_CONTEXT_ON,
  contextOff: ICON_CONTEXT_OFF,
  trash: [
    'M4 7h16',
    'M10 11v6',
    'M14 11v6',
    'M6 7l1 13h10l1 -13',
    'M9 7v-3h6v3',
  ],
  down: ['M6 9l6 6l6 -6'],
  up: ['M6 15l6 -6l6 6'],
  right: ['M9 6l6 6l-6 6'],
  play: ['M8 5v14l11 -7z'],
  download: ['M12 4v11', 'M7 11l5 5l5 -5', 'M5 20h14'],
} as const;

export function Icon({ paths }: { readonly paths: readonly string[] }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
