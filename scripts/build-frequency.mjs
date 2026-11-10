// Builds public/frequency/<language>.txt: the language's most common everyday words, one
// per line from the most common down, for new-word hints and the Word Check.
//
// Source: wordfreq (https://github.com/rspeer/wordfreq), whose data blends subtitles,
// Wikipedia, news, books, and web text, CC BY-SA 4.0. A Hunspell dictionary drops names
// and words that aren't everyday words; it is used only here and is not shipped. The
// output stays CC BY-SA 4.0, credited in public/frequency/README.md.
//
// Needs Python with wordfreq: pip install wordfreq==3.1.1
// Usage: node scripts/build-frequency.mjs [language ...]   (default: en)
// Set PYTHON to choose the interpreter, such as a virtual environment's.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import nspell from 'nspell';

const SIZE = 50_000;
/** wordfreq ranks taken before filtering; about half survive the dictionary. */
const CANDIDATES = 150_000;
/** Small Roman numerals, such as ii or xii, pass a dictionary but aren't words to learn. */
const NUMERAL = /^x{0,3}(ix|iv|v?i{0,3})$/u;

/** Each language's dictionary package and the letters its words use. */
const LANGUAGES = {
  en: { dictionary: 'dictionary-en', letters: /^[a-z]+$/u },
};

async function speller(name) {
  const base = new URL(`../node_modules/${name}/`, import.meta.url);
  const [aff, dic] = await Promise.all([
    readFile(new URL('index.aff', base)),
    readFile(new URL('index.dic', base)),
  ]);
  return nspell(aff, dic);
}

/** wordfreq's most common tokens for a language, most common first. */
function candidates(language) {
  const python = process.env.PYTHON ?? 'python3';
  const code = [
    'import sys',
    'from wordfreq import top_n_list',
    `sys.stdout.write("\\n".join(top_n_list("${language}", ${String(CANDIDATES)}, wordlist="large")))`,
  ].join('\n');
  return execFileSync(python, ['-c', code], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).split('\n');
}

async function build(language) {
  const config = LANGUAGES[language];
  if (!config) throw new Error(`No frequency setup for ${language}`);
  const spell = await speller(config.dictionary);
  const words = [];
  for (const word of candidates(language)) {
    const numeral = word.length > 1 && NUMERAL.test(word);
    // Lowercase only passes when the dictionary knows it uncapitalised, which drops names.
    if (config.letters.test(word) && !numeral && spell.correct(word)) {
      words.push(word);
    }
    if (words.length === SIZE) break;
  }
  if (words.length < SIZE) {
    throw new Error(`${language}: only ${String(words.length)} words`);
  }
  await mkdir(new URL('../public/frequency/', import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(`../public/frequency/${language}.txt`, import.meta.url),
    `${words.join('\n')}\n`,
  );
  console.log(`${language}: ${String(words.length)} words`);
}

const requested = process.argv.slice(2);
for (const language of requested.length ? requested : ['en']) {
  await build(language);
}
