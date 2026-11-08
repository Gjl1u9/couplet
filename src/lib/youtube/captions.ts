import { languageBase } from '../language';
import type { Cue } from '../translation/batches';

export interface CaptionTrack {
  readonly languageCode: string;
  readonly kind?: string | undefined;
}

/** `player.getPlayerResponse().captions.playerCaptionsTracklistRenderer` 用到的部分。 */
export interface CaptionTracklist {
  readonly captionTracks?: readonly CaptionTrack[];
  readonly audioTracks?: readonly {
    readonly defaultCaptionTrackIndex?: number;
  }[];
  readonly defaultAudioTrackIndex?: number;
}

/** 選影片預設音軌對應的字幕，沒有的話優先選自動字幕，因為它的語言就是影片語言。 */
export function selectSourceTrack(
  tracklist: CaptionTracklist | null | undefined,
): CaptionTrack | null {
  const tracks = tracklist?.captionTracks ?? [];
  const audio = tracklist?.audioTracks?.[tracklist.defaultAudioTrackIndex ?? 0];
  const index = audio?.defaultCaptionTrackIndex;
  const preferred = index === undefined ? undefined : tracks[index];
  return preferred ?? tracks.find((t) => t.kind === 'asr') ?? tracks[0] ?? null;
}

/**
 * Picks the track for the learning language. Prefers the video's default track, then
 * human-made captions, because they are more accurate than automatic ones.
 */
export function selectLearningTrack(
  tracklist: CaptionTracklist | null | undefined,
  language: string,
): CaptionTrack | null {
  const base = languageBase(language);
  const matches = (track: CaptionTrack | undefined): track is CaptionTrack =>
    track !== undefined && languageBase(track.languageCode) === base;
  const tracks = tracklist?.captionTracks ?? [];
  const audio = tracklist?.audioTracks?.[tracklist.defaultAudioTrackIndex ?? 0];
  const index = audio?.defaultCaptionTrackIndex;
  const preferred = index === undefined ? undefined : tracks[index];
  if (matches(preferred)) return preferred;
  return (
    tracks.find((t) => matches(t) && t.kind !== 'asr') ??
    tracks.find(matches) ??
    null
  );
}

interface Json3Segment {
  readonly utf8?: string;
  readonly tOffsetMs?: number;
}

interface Json3Event {
  readonly tStartMs?: number;
  readonly dDurationMs?: number;
  readonly aAppend?: number;
  readonly segs?: readonly Json3Segment[];
}

const ASR_PAUSE_MS = 500;
/** 字幕只有每個字的開始時間，所以用字數估計念完這個字要多久。 */
const ASR_SPEECH_MS_PER_CHAR = 80;
const ASR_MIN_WORDS_BEFORE_PAUSE = 4;
const ASR_MAX_WORDS = 14;
const ASR_MAX_CHARS = 80;
/** A sentence that ends within this many words may run past the limits above. */
const ASR_SENTENCE_LOOKAHEAD = 3;
/** No cue grows past this, even to finish a sentence. */
const ASR_HARD_MAX_CHARS = 100;
const SENTENCE_END = /[.?!。？！]$/;
const CLAUSE_END = /[,;:，、；：]$/;
/** Punctuation that YouTube sometimes sends as its own segment, after the word it belongs to. */
const TRAILING_PUNCTUATION = /^[.,!?;:…%)\]}」』”’"'。，、！？；：）]+$/;
/** Automatic captions mark a new speaker with `>>`. */
const SPEAKER_CHANGE = /^>>/;

export function parseCaptions(body: string, kind: string | null): Cue[] {
  const parsed = JSON.parse(body) as { events?: readonly Json3Event[] };
  const events = parsed.events ?? [];
  return kind === 'asr' ? parseAsr(events) : parseManual(events);
}

function clampToNextStart(cues: readonly Cue[]): Cue[] {
  return cues.map((cue, index) => {
    const next = cues[index + 1];
    return next && next.start < cue.end ? { ...cue, end: next.start } : cue;
  });
}

function parseManual(events: readonly Json3Event[]): Cue[] {
  const cues: Cue[] = [];
  for (const event of events) {
    const text = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? '')
      .join('')
      .trim();
    if (text === '' || event.tStartMs === undefined) continue;
    cues.push({
      id: `m${String(cues.length)}`,
      start: event.tStartMs / 1000,
      end: (event.tStartMs + (event.dDurationMs ?? 0)) / 1000,
      text,
    });
  }
  return clampToNextStart(cues);
}

interface Word {
  readonly text: string;
  readonly startMs: number;
  /** 這個字所在字幕事件的結束時間。 */
  readonly eventEndMs: number;
}

function collectSegments(events: readonly Json3Event[]): Word[] {
  const segments: Word[] = [];
  for (const event of events) {
    if (event.aAppend || event.tStartMs === undefined) continue;
    const eventEndMs = event.tStartMs + (event.dDurationMs ?? 0);
    for (const seg of event.segs ?? []) {
      const text = seg.utf8 ?? '';
      if (text.trim() === '') continue;
      segments.push({
        text,
        startMs: event.tStartMs + (seg.tOffsetMs ?? 0),
        eventEndMs,
      });
    }
  }
  return segments;
}

/**
 * Splits at spaces, line breaks and CJK sentence ends. A piece that followed a space
 * starts with one, so `joinText` keeps the original spacing.
 */
function splitWords(text: string): string[] {
  const pieces: string[] = [];
  for (const [, space = '', word = ''] of text.matchAll(/(\s*)(\S+)/g)) {
    word.split(/(?<=[。？！])/).forEach((part, index) => {
      pieces.push(index === 0 && space !== '' ? ` ${part}` : part);
    });
  }
  return pieces;
}

/**
 * YouTube sends automatic captions one word per segment, but sometimes the same track
 * comes with whole lines per segment. Splitting every segment makes both look the same.
 * Words in a longer segment share its time by their length.
 */
function collectWords(events: readonly Json3Event[]): Word[] {
  const segments = collectSegments(events);
  const words: Word[] = [];
  segments.forEach((segment, index) => {
    const pieces = splitWords(segment.text);
    const nextStartMs = segments[index + 1]?.startMs ?? segment.eventEndMs;
    const endMs = Math.max(
      segment.startMs,
      Math.min(nextStartMs, segment.eventEndMs),
    );
    const total = pieces.reduce((sum, piece) => sum + piece.trim().length, 0);
    let offset = 0;
    for (const piece of pieces) {
      const previous = words.at(-1);
      if (previous && TRAILING_PUNCTUATION.test(piece.trim())) {
        words[words.length - 1] = {
          ...previous,
          text: previous.text + piece.trim(),
        };
        continue;
      }
      words.push({
        text: piece,
        startMs:
          segment.startMs +
          Math.round(((endMs - segment.startMs) * offset) / total),
        eventEndMs: segment.eventEndMs,
      });
      offset += piece.trim().length;
    }
  });
  return words;
}

/** 中文、日文和泰文不用空格分詞。 */
const NO_SPACE_SCRIPT =
  /[\u0e00-\u0e7f\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** 保留原始片段的間隔，只有字幕事件交界這種沒有間隔的地方才補空格。 */
export function joinText(text: string, next: string): string {
  const needsSpace =
    text !== '' &&
    !/\s$/.test(text) &&
    !/^\s/.test(next) &&
    !NO_SPACE_SCRIPT.test(text.slice(-1)) &&
    !NO_SPACE_SCRIPT.test(next.charAt(0));
  return needsSpace ? `${text} ${next}` : text + next;
}

function joinWords(words: readonly Word[]): string {
  return words
    .map((word) => word.text)
    .reduce(joinText, '')
    .trim();
}

/** 長的字本身就念比較久，不能把念字的時間當成停頓。 */
function isPauseBetween(previous: Word, next: Word): boolean {
  const spoken = previous.text.trim().length * ASR_SPEECH_MS_PER_CHAR;
  return next.startMs - previous.startMs >= spoken + ASR_PAUSE_MS;
}

const endsSentence = (word: Word) => SENTENCE_END.test(word.text.trimEnd());
const isSpeakerChange = (word: Word) => SPEAKER_CHANGE.test(word.text.trim());

/** Whether the sentence ends within a few words without making the cue too long. */
function sentenceEndsSoon(
  current: readonly Word[],
  words: readonly Word[],
  index: number,
): boolean {
  let text = joinWords(current);
  const last = Math.min(index + ASR_SENTENCE_LOOKAHEAD, words.length - 1);
  for (let at = index + 1; at <= last; at += 1) {
    const word = words[at];
    if (!word || isSpeakerChange(word)) return false;
    text = joinText(text, word.text);
    if (text.trim().length > ASR_HARD_MAX_CHARS) return false;
    if (endsSentence(word)) return true;
  }
  return false;
}

/** The last word ending a clause, so a long cue splits where the speaker paused. */
function lastClauseEnd(current: readonly Word[]): number {
  for (
    let at = current.length - 2;
    at >= ASR_MIN_WORDS_BEFORE_PAUSE - 1;
    at -= 1
  ) {
    const word = current[at];
    if (word && CLAUSE_END.test(word.text.trimEnd())) return at;
  }
  return -1;
}

/** 自動字幕是逐字的，也沒有標點，所以依停頓和長度重新斷句，翻譯才有完整的語意。 */
function parseAsr(events: readonly Json3Event[]): Cue[] {
  const cues: Cue[] = [];
  let current: Word[] = [];

  const close = (next: Word | undefined) => {
    const [first] = current;
    const last = current.at(-1);
    if (!first || !last) return;
    cues.push({
      id: `a${String(cues.length)}`,
      start: first.startMs / 1000,
      end:
        (next ? Math.min(next.startMs, last.eventEndMs) : last.eventEndMs) /
        1000,
      text: joinWords(current),
    });
    current = [];
  };

  const words = collectWords(events);
  words.forEach((word, index) => {
    const previous = current.at(-1);
    if (
      previous &&
      (isSpeakerChange(word) ||
        (isPauseBetween(previous, word) &&
          current.length >= ASR_MIN_WORDS_BEFORE_PAUSE))
    ) {
      close(word);
    }
    current.push(word);
    const next = words[index + 1];
    if (endsSentence(word)) {
      close(next);
      return;
    }
    const full =
      current.length >= ASR_MAX_WORDS ||
      joinWords(current).length >= ASR_MAX_CHARS;
    if (!full || sentenceEndsSoon(current, words, index)) return;
    const clauseEnd = lastClauseEnd(current);
    if (clauseEnd === -1) {
      close(next);
      return;
    }
    const rest = current.slice(clauseEnd + 1);
    current = current.slice(0, clauseEnd + 1);
    close(rest[0]);
    current = rest;
  });
  close(undefined);
  return clampToNextStart(cues);
}
