# Word frequency lists

Each `<language>.txt` holds a language's 50,000 most common everyday words, one per line, the most common first. Couplet uses them for new-word hints and the Word Check, as [`docs/HINTS.md`](../../docs/HINTS.md) describes.

The ranks come from [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer, whose data blends subtitles, Wikipedia, news, books, and web text, and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Couplet removed names and words that aren't everyday words, using a Hunspell dictionary ([wooorm/dictionaries](https://github.com/wooorm/dictionaries)) that is only used while building the lists and is not included, and kept the first 50,000 words. These modified lists are likewise licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [`scripts/build-frequency.mjs`](../../scripts/build-frequency.mjs) rebuilds them.
