import type { ControllerEvent } from '../subtitles/controller';
import { parseCaptions } from './captions';

type CaptionsEvent = Extract<ControllerEvent, { type: 'captions' }>;

/** Asks a development build's content script for its caption state. See docs/DEBUGGING.md. */
export const DEV_DUMP_REQUEST = '__dualSubtitlesDevDump';
export const DEV_DUMP_RESULT = '__dualSubtitlesDevDumpResult';

export interface CaptionDump {
  readonly videoId: string;
  readonly lang: string | null;
  readonly kind: string | null;
  readonly status: number;
  readonly bytes: number;
  /** Non-empty segments, and how many of them hold more than one word. */
  readonly segments: number;
  readonly multiWordSegments: number;
  readonly cues: number;
  readonly medianCueChars: number;
  readonly maxCueChars: number;
  readonly longestCue: string;
  readonly body?: string;
}

interface Json3 {
  readonly events?: readonly { readonly segs?: readonly { utf8?: string }[] }[];
}

/** What the parser made of the captions the page agent forwarded. */
export function describeCaptions(
  event: CaptionsEvent,
  withBody: boolean,
): CaptionDump {
  const texts = ((JSON.parse(event.body) as Json3).events ?? [])
    .flatMap((e) => e.segs ?? [])
    .map((seg) => (seg.utf8 ?? '').trim())
    .filter((text) => text !== '');
  const cues = parseCaptions(event.body, event.kind);
  const lengths = cues.map((cue) => cue.text.length).sort((a, b) => a - b);
  const longest = cues.reduce<string>(
    (text, cue) => (cue.text.length > text.length ? cue.text : text),
    '',
  );
  return {
    videoId: event.videoId,
    lang: event.lang,
    kind: event.kind,
    status: event.status,
    bytes: event.body.length,
    segments: texts.length,
    multiWordSegments: texts.filter((text) => /\s/.test(text)).length,
    cues: cues.length,
    medianCueChars: lengths[Math.floor(lengths.length / 2)] ?? 0,
    maxCueChars: lengths.at(-1) ?? 0,
    longestCue: longest,
    ...(withBody ? { body: event.body } : {}),
  };
}
