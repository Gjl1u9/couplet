import { Parser } from 'budoux/module/parser.js';
import { model as japaneseModel } from 'budoux/module/data/models/ja.js';

export interface CaptionPart {
  readonly text: string;
  /** Whether this part is a clickable token. */
  readonly isToken: boolean;
}

/** Scripts written without spaces, which need dictionary-based word segmentation. */
const SEGMENTED_LANGUAGE = /^(zh|th|lo|km|my)\b/i;
const JAPANESE = /^ja\b/i;
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCTUATION = /[^\p{L}\p{N}\p{M}]+$/u;

/** Parts always join back into the original text, so nothing the caption says is lost. */
export function tokenizeCaption(
  text: string,
  language: string | null,
): readonly CaptionPart[] {
  if (language && JAPANESE.test(language)) return chunkJapanese(text);
  return language && SEGMENTED_LANGUAGE.test(language)
    ? segmentWords(text, language)
    : splitOnSpaces(text);
}

let japaneseParser: Parser | null = null;

/** Particles that never belong to the word before them. */
const PARTICLES = new Set([
  'を',
  'の',
  'が',
  'は',
  'も',
  'へ',
  'から',
  'まで',
  'より',
  'けど',
  'けれど',
  'のに',
  'ので',
  'ぐらい',
  'くらい',
  'だけ',
  'しか',
  'とか',
  'など',
  'には',
  'では',
  'にも',
  'とは',
  'への',
  'との',
  'での',
  'からは',
  'までは',
  'でも',
]);
/** Also verb endings, as in 読んで or 動かさないで, so these depend on the word before. */
const SHORT_PARTICLES = new Set(['に', 'で', 'と']);
/** Where に, で, or と ends a verb rather than following a word. */
const VERB_BEFORE_PARTICLE = /(ん|ない)$/u;
/** The copula, which the segmenter cuts in two (で|した). */
const COPULAS = new Set(['でした', 'でしょう', 'でしょ']);
/** Common words the segmenter cuts apart, kept whole before segmenting. */
const EXPRESSIONS =
  /(こんにちは|こんばんは|じゃあ|ときどき|ものすごく|それでも)/u;
/** Nouns written in hiragana, which a particle can follow inside one segment (ここに). */
const HIRAGANA_NOUNS =
  'これ|それ|あれ|どれ|ここ|そこ|あそこ|どこ|こちら|そちら|どちら|こと|とき|ところ|ほう|もの|うち';
const NOUN_WITH_PARTICLE = new RegExp(
  `^(\\p{sc=Han}+|${HIRAGANA_NOUNS})(には|では|でも|に|で|の|と)$`,
  'u',
);
const CONJUNCTIONS = new Set([
  'ところで',
  'これで',
  'それで',
  'それに',
  'それと',
]);
const ONLY_KANJI = /^\p{sc=Han}{2,}$/u;
/** Words that follow a noun but are words of their own (クロ|みたい, 道|かな). */
const AFTER_NOUN_WORD = /^(みたい|かな|かも)/u;
const COUNT = /^\p{N}+(?:[\p{sc=Han}ヶ]+|つ)$/u;
const HIRAGANA_START = /^\p{sc=Hiragana}/u;
/** A verb's stem before a second verb, as 動き in 動き出す or 撮り in 撮り忘れる. */
const VERB_STEM = /^\p{sc=Han}+[いきしちにひみりぎじびえけせてねめれげべ]$/u;
const VERB_START = /^\p{sc=Han}+\p{sc=Hiragana}/u;
const NOUN_END = /[\p{sc=Han}\p{sc=Katakana}ー々\p{N}\p{sc=Latin}]$/u;
const WORD_START = /^[\p{sc=Han}\p{sc=Katakana}\p{N}\p{sc=Latin}]/u;
const KATAKANA_START = /^[\p{sc=Katakana}ー]/u;
const KATAKANA_END = /[\p{sc=Katakana}ー]$/u;
const COUNTER_START = /^[\p{sc=Han}ヶ]/u;
const DIGIT_END = /\p{N}$/u;
const SINGLE_KANJI = /^\p{sc=Han}$/u;
/** Stems before って in a te-form, such as 始ま in 始まって. */
const TE_STEM_END = /[まわかが]$/u;
/** Short verbs' stems before って: なる, やる, いう, もつ, あう, とる. */
const TE_STEM_LETTER = /^[なやいもあと]$/u;
/** What follows okurigana that looks like a particle. */
const OKURIGANA_START = /^[っるりられろ]/u;
const PREFIXES = new Set(['お', 'ご']);
/** What automatic captions add, such as [音楽] or [笑い]. */
const ANNOTATION = /(\[[^\]]*\])/u;

/**
 * Japanese breaks into phrases with BudouX, then each phrase into the browser's
 * dictionary words, which are joined back into what a lookup can use. The word
 * segmenter cuts verbs apart (食べ|られ|なかっ|た), so hiragana after a word stays with
 * it, and the lookup turns 行きました into its dictionary form. A new word starts at
 * kanji, katakana, or a digit, and particles stand alone, because the lookup would keep
 * them (私は) and translate them into the meaning. Every part is clickable, so a
 * learner who cannot read Japanese never meets a word they cannot select.
 */
function chunkJapanese(text: string): CaptionPart[] {
  japaneseParser ??= new Parser(japaneseModel);
  const parser = japaneseParser;
  const parts: CaptionPart[] = [];
  for (const piece of text.split(/(\s+)/u)) {
    if (piece === '') continue;
    if (/^\s+$/u.test(piece)) {
      parts.push({ text: piece, isToken: false });
      continue;
    }
    for (const fragment of piece.split(ANNOTATION)) {
      if (fragment === '') continue;
      if (ANNOTATION.test(fragment)) {
        parts.push({ text: fragment, isToken: false });
        continue;
      }
      for (const text of fragment.split(EXPRESSIONS)) {
        if (text === '') continue;
        const phrases = EXPRESSIONS.test(text) ? [text] : parser.parse(text);
        for (const phrase of joinNouns(phrases)) {
          parts.push(...splitPhrase(phrase));
        }
      }
    }
  }
  return parts;
}

/**
 * BudouX can break inside a noun (東|京って). The word segmenter splits nouns where they
 * really end, so phrases that meet between two noun characters are joined for it.
 */
function joinNouns(phrases: readonly string[]): string[] {
  const joined: string[] = [];
  for (const phrase of phrases) {
    const last = joined.at(-1);
    if (last !== undefined && NOUN_END.test(last) && WORD_START.test(phrase)) {
      joined[joined.length - 1] = last + phrase;
    } else {
      joined.push(phrase);
    }
  }
  return joined;
}

/**
 * The browser's dictionary words for a phrase, repaired where it is known to cut wrongly
 * (で|した, 駐車|場) or to join wrongly (ここに).
 */
function segmentPhrase(phrase: string): string[] {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  const segments = EXPRESSIONS.test(phrase)
    ? [phrase]
    : Array.from(segmenter.segment(phrase), ({ segment }) => segment);
  const joined = joinParticles(segments);
  return joinKanjiSuffixes(
    joined.flatMap((segment, index) => {
      // At the start, ところで and これで are conjunctions.
      const conjunction =
        index === 0 &&
        CONJUNCTIONS.has(segment) &&
        !PARTICLES.has(joined[1] ?? '');
      const match = conjunction ? null : NOUN_WITH_PARTICLE.exec(segment);
      return match ? match.slice(1, 3) : [segment];
    }),
  );
}

/** A single kanji after a kanji word is usually its suffix: 駐車|場, 屋久|杉. */
function joinKanjiSuffixes(segments: string[]): string[] {
  const joined: string[] = [];
  segments.forEach((segment, index) => {
    const last = joined.at(-1);
    const next = segments[index + 1] ?? '';
    if (
      last !== undefined &&
      SINGLE_KANJI.test(segment) &&
      ONLY_KANJI.test(last) &&
      endsWord(next)
    ) {
      joined[joined.length - 1] = last + segment;
    } else {
      joined.push(segment);
    }
  });
  return joined;
}

/** Whether a word can end before this segment, rather than continuing in okurigana. */
function endsWord(next: string): boolean {
  if (next === '' || !HIRAGANA_START.test(next))
    return !/^\p{sc=Han}/u.test(next);
  return (
    PARTICLES.has(next) ||
    SHORT_PARTICLES.has(next) ||
    /^(です|でし|だ|じゃ)/u.test(next)
  );
}

function splitPhrase(phrase: string): CaptionPart[] {
  const segments = segmentPhrase(phrase);
  const parts: CaptionPart[] = [];
  let word = '';
  let previous = '';
  let afterParticle = false;
  const close = () => {
    if (word) parts.push({ text: word, isToken: true });
    word = '';
  };
  segments.forEach((segment, index) => {
    if (!WORD_CHARACTER.test(segment)) {
      close();
      parts.push({ text: segment, isToken: false });
      previous = '';
      afterParticle = false;
      return;
    }
    const next = segments[index + 1] ?? '';
    const particle = isParticle(segment, previous, next);
    // The stem of a te-form, as な in 多くなって, starts its own verb.
    const teStem = TE_STEM_LETTER.test(segment) && next === 'って';
    if (
      afterParticle ||
      particle ||
      teStem ||
      startsWord(segment, previous, word)
    ) {
      close();
    }
    word += segment;
    if (particle) close();
    afterParticle = particle;
    previous = segment;
  });
  close();
  return parts;
}

/** The segmenter cuts some particles in two (の|に), so they are joined first. */
function joinParticles(segments: string[]): string[] {
  const joined: string[] = [];
  for (const segment of segments) {
    const last = joined.at(-1);
    const pair = last === undefined ? '' : last + segment;
    if (PARTICLES.has(pair) || COPULAS.has(pair)) {
      joined[joined.length - 1] = pair;
    } else {
      joined.push(segment);
    }
  }
  return joined;
}

function isParticle(segment: string, previous: string, next: string): boolean {
  if (previous === '' || PREFIXES.has(previous)) return false;
  // Quoting (言わないって), unless it ends a te-form (言って, なって, 始まって).
  if (segment === 'って') {
    return (
      !SINGLE_KANJI.test(previous) &&
      !TE_STEM_LETTER.test(previous) &&
      !TE_STEM_END.test(previous)
    );
  }
  // Okurigana rather than a particle, as in 美味しかった or 下がって.
  if (OKURIGANA_START.test(next) && next !== 'って') return false;
  if (next === 'って' && segment.length === 1 && SINGLE_KANJI.test(previous)) {
    return false;
  }
  if (segment.length === 1 && previous === 'って') return false;
  if (PARTICLES.has(segment)) return true;
  if (segment === 'や') return NOUN_END.test(previous);
  // Part of にくい, as in 運転しにくい.
  if (segment === 'に' && next.startsWith('く')) return false;
  return SHORT_PARTICLES.has(segment) && !VERB_BEFORE_PARTICLE.test(previous);
}

function startsWord(segment: string, previous: string, word: string): boolean {
  if (previous === '' || PREFIXES.has(previous)) return false;
  // The segmenter can cut a loanword (ド|タキ|ャン) or a count (1|年).
  if (KATAKANA_START.test(segment) && KATAKANA_END.test(previous)) return false;
  if (COUNTER_START.test(segment) && DIGIT_END.test(previous)) return false;
  if (VERB_STEM.test(word) && VERB_START.test(segment)) return false;
  if (AFTER_NOUN_WORD.test(segment) && NOUN_END.test(previous)) return true;
  // A count ends before a verb: ２つ|あります.
  if (COUNT.test(word) && HIRAGANA_START.test(segment) && segment !== 'め') {
    return true;
  }
  return WORD_START.test(segment);
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
    if (piece !== '') parts.push(...splitWord(piece));
  }
  return parts;
}

/** A word with the punctuation around it set apart, so only the word is clickable. */
function splitWord(piece: string): CaptionPart[] {
  if (!WORD_CHARACTER.test(piece)) return [{ text: piece, isToken: false }];
  const leading = LEADING_PUNCTUATION.exec(piece)?.[0] ?? '';
  const trailing = TRAILING_PUNCTUATION.exec(piece)?.[0] ?? '';
  const word = piece.slice(leading.length, piece.length - trailing.length);
  const parts: CaptionPart[] = [];
  if (leading) parts.push({ text: leading, isToken: false });
  parts.push({ text: word, isToken: true });
  if (trailing) parts.push({ text: trailing, isToken: false });
  return parts;
}
