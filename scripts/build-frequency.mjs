// Builds public/frequency/<language>.txt: the language's most common everyday words, one
// per line from the most common down, for new-word hints and the Word Check.
//
// Source: FrequencyWords by hermitdave, counted from OpenSubtitles 2018, CC BY-SA 4.0.
// A Hunspell dictionary drops names and words that aren't everyday words; it is used
// only here and is not shipped. The output stays CC BY-SA 4.0, credited in
// public/frequency/README.md.
//
// Usage: node scripts/build-frequency.mjs [language ...]   (default: en)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import nspell from 'nspell';

const SOURCE =
  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018';
const SIZE = 20_000;
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

async function build(language) {
  const config = LANGUAGES[language];
  if (!config) throw new Error(`No frequency setup for ${language}`);
  const response = await fetch(`${SOURCE}/${language}/${language}_50k.txt`);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const spell = await speller(config.dictionary);
  const words = [];
  for (const line of (await response.text()).split('\n')) {
    const word = line.split(' ')[0]?.trim() ?? '';
    // Lowercase only passes when the dictionary knows it uncapitalised, which drops names.
    const numeral = word.length > 1 && NUMERAL.test(word);
    if (config.letters.test(word) && !numeral && spell.correct(word)) {
      words.push(word);
    }
    if (words.length === SIZE) break;
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
