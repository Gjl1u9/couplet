import { frequencyLanguage } from './frequency';

/**
 * The Word Check: rows of words from the frequency list, the most common first. The
 * user picks the last row where they know every word, and that row's size is their
 * level, the start of new-word hints. Levels beside each size are rough guides.
 */
export interface WordCheckRow {
  /** How many of the most common words this row stands for. */
  readonly size: number;
  /** A rough level on the language's own scale. */
  readonly level: string;
  /** Words from near this rank in the list. */
  readonly words: readonly string[];
}

export interface WordCheck {
  readonly scale: 'CEFR' | 'JLPT';
  readonly rows: readonly WordCheckRow[];
}

const CHECKS: Readonly<Record<string, WordCheck>> = {
  en: {
    scale: 'CEFR',
    rows: [
      {
        size: 500,
        level: 'A1',
        words: [
          'although',
          'market',
          'ready',
          'street',
          'experience',
          'chance',
        ],
      },
      {
        size: 1000,
        level: 'A2',
        words: ['speak', 'century', 'create', 'tomorrow', 'allow', 'pressure'],
      },
      {
        size: 2000,
        level: 'B1',
        words: [
          'promise',
          'terrible',
          'afraid',
          'ancient',
          'expensive',
          'planet',
        ],
      },
      {
        size: 3000,
        level: 'B1',
        words: [
          'permission',
          'tradition',
          'celebrate',
          'ignore',
          'temporary',
          'practical',
        ],
      },
      {
        size: 5000,
        level: 'B2',
        words: [
          'pollution',
          'privilege',
          'resist',
          'excitement',
          'insight',
          'widespread',
        ],
      },
      {
        size: 8000,
        level: 'C1',
        words: [
          'farewell',
          'foolish',
          'misery',
          'voyage',
          'immense',
          'interfere',
        ],
      },
      {
        size: 12000,
        level: 'C1',
        words: [
          'bravery',
          'commence',
          'cynical',
          'humility',
          'multitude',
          'resemblance',
        ],
      },
      {
        size: 20000,
        level: 'C2',
        words: [
          'cumbersome',
          'epiphany',
          'foresight',
          'propensity',
          'vigilance',
          'uproar',
        ],
      },
    ],
  },
};

/** The Word Check for a learning language, or `null` when it has none yet. */
export function wordCheckFor(language: string): WordCheck | null {
  const listed = frequencyLanguage(language);
  return listed ? (CHECKS[listed] ?? null) : null;
}
