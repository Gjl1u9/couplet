import type { RankOf } from './frequency';

/**
 * New-word hints point out, in each subtitle line, one word worth learning now: a word
 * a little past the ones the user knows, in a band of the frequency list.
 */
export interface HintZone {
  /** The most common rank hinted. */
  readonly from: number;
  /** The least common rank hinted. */
  readonly to: number;
}

/** The most common words, such as `the` or `is`, are never hinted. */
export const ALWAYS_KNOWN = 200;
/** Saved words needed before they, rather than the Word Check, set the zone. */
export const SAVED_FOR_ZONE = 20;
/** The zone reaches this many times past its start. */
const ZONE_SPAN = 2.5;

/**
 * Where hints start: the higher of the Word Check and the user's own saved words, once
 * there are enough of them. Saved words move it up as the user learns, and a higher
 * Word Check always takes effect at once. `null` hints nothing.
 */
export function hintZone(
  level: number | null,
  savedRanks: readonly number[],
): HintZone | null {
  let saved: number | null = null;
  if (savedRanks.length >= SAVED_FOR_ZONE) {
    // A quarter of saved words are more common than this: roughly where knowing ends.
    const sorted = [...savedRanks].sort((a, b) => a - b);
    saved = sorted[Math.floor(sorted.length / 4)] ?? null;
  }
  if (level === null && saved === null) return null;
  const from = Math.max(level ?? 0, saved ?? 0, ALWAYS_KNOWN + 1);
  return { from, to: Math.round(from * ZONE_SPAN) };
}

/** A token as the list spells it: lowercase letters, without apostrophes. */
export function hintForm(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}]/gu, '');
}

const APOSTROPHE = /['\u2019]/u;

/** Groups simple inflections, so `generation` and `generations` count as one word. */
function family(form: string): string {
  return form.replace(/(ies|es|s|ed|ing)$/u, '');
}

export interface HintPickerOptions {
  readonly rankOf: RankOf;
  readonly zone: () => HintZone | null;
  /** Saved or known words are never hinted. */
  readonly inVocabulary: (form: string) => boolean;
}

export interface HintPicker {
  /** The index of the token to hint in this line, or `null`. */
  pick: (tokens: readonly string[]) => number | null;
  /** Starts a new video, so its words may be hinted again. */
  reset: () => void;
}

/**
 * At most one hint a line, the most common candidate, and each word once a video. A
 * line shown again, after seeking back or replaying it, keeps the hint it had.
 */
export function createHintPicker(options: HintPickerOptions): HintPicker {
  const hinted = new Set<string>();
  const lines = new Map<string, number | null>();
  return {
    pick(tokens) {
      const zone = options.zone();
      if (!zone) return null;
      const key = tokens.join(' ');
      if (lines.has(key)) {
        const index = lines.get(key) ?? null;
        const token = index === null ? undefined : tokens[index];
        return token !== undefined && !options.inVocabulary(hintForm(token))
          ? index
          : null;
      }
      let best: { index: number; rank: number; form: string } | null = null;
      for (const [index, token] of tokens.entries()) {
        // Contractions and possessives are grammar, and without the apostrophe they
        // read as other words: can't as cant, I'll as ill.
        if (APOSTROPHE.test(token)) continue;
        const form = hintForm(token);
        const rank = options.rankOf(form);
        if (rank === undefined || rank < zone.from || rank > zone.to) continue;
        if (hinted.has(family(form)) || options.inVocabulary(form)) continue;
        if (!best || rank < best.rank) best = { index, rank, form };
      }
      lines.set(key, best?.index ?? null);
      if (!best) return null;
      hinted.add(family(best.form));
      return best.index;
    },
    reset() {
      hinted.clear();
      lines.clear();
    },
  };
}
