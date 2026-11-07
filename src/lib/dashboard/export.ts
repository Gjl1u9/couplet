import { encounterForReview, type SavedWord } from '../vocabulary/vocabulary';
import { splitMeaning } from '../lookup/entry';
import { jumpLink } from '../youtube/origin';
import { stageLabel, stageOf } from './stats';

const BOM = String.fromCodePoint(0xfeff);

const HEADERS = [
  'Word',
  'Phonetics',
  'Meanings',
  'Sentence',
  'Translation',
  'Video',
  'Link',
  'Stage',
  'Next review',
  'Saved',
];

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Quotes a field, and stops spreadsheets from running a cell as a formula. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Starts with a BOM, because Excel otherwise misreads Chinese in UTF-8. */
export function wordsToCsv(words: readonly SavedWord[]): string {
  const rows = words.map((word) => {
    const encounter = encounterForReview(word);
    const cue = encounter?.cues[encounter.currentCue];
    return [
      word.lemma,
      word.phonetic ?? '',
      word.senses.flatMap((sense) => splitMeaning(sense.meaning)).join('; '),
      cue?.original ?? '',
      encounter?.translation ?? '',
      encounter?.origin?.title ?? '',
      encounter?.origin ? jumpLink(encounter.origin, cue) : '',
      stageLabel(stageOf(word)),
      word.review.retired ? '' : isoDate(word.review.dueAt),
      isoDate(word.savedAt),
    ];
  });
  const lines = [HEADERS, ...rows].map((row) => row.map(csvField).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
