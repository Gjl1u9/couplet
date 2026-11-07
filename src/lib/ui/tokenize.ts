export interface CaptionPart {
  readonly text: string;
  /** Whether this part is a clickable token. */
  readonly isToken: boolean;
}

/** Scripts written without spaces, which need dictionary-based word segmentation. */
const SEGMENTED_LANGUAGE = /^(zh|ja|th|lo|km|my)\b/i;
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCTUATION = /[^\p{L}\p{N}\p{M}]+$/u;

/** Parts always join back into the original text, so nothing the caption says is lost. */
export function tokenizeCaption(
  text: string,
  language: string | null,
): readonly CaptionPart[] {
  return language && SEGMENTED_LANGUAGE.test(language)
    ? segmentWords(text, language)
    : splitOnSpaces(text);
}

function segmentWords(text: string, language: string): CaptionPart[] {
  return Array.from(
    new Intl.Segmenter(language, { granularity: 'word' }).segment(text),
    ({ segment, isWordLike }) => ({
      text: segment,
      isToken: isWordLike === true,
    }),
  );
}

/** Keeps hyphens and apostrophes inside a token, so `Navier-Stokes` stays one word. */
function splitOnSpaces(text: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  for (const piece of text.split(/(\s+)/u)) {
    if (piece === '') continue;
    if (!WORD_CHARACTER.test(piece)) {
      parts.push({ text: piece, isToken: false });
      continue;
    }
    const leading = LEADING_PUNCTUATION.exec(piece)?.[0] ?? '';
    const trailing = TRAILING_PUNCTUATION.exec(piece)?.[0] ?? '';
    const word = piece.slice(leading.length, piece.length - trailing.length);
    if (leading) parts.push({ text: leading, isToken: false });
    parts.push({ text: word, isToken: true });
    if (trailing) parts.push({ text: trailing, isToken: false });
  }
  return parts;
}
