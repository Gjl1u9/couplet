# Debugging

## Which build is loaded

Each local build names itself on its card in `chrome://extensions`:

| Card says                         | Built with                           | Folder                   |
| --------------------------------- | ------------------------------------ | ------------------------ |
| `Couplet (dev) 0.2.1 (abc1234)`   | `npm run dev`, `npm run build:dev`   | `dist/chrome-mv3-dev`    |
| `Couplet (local) 0.2.1 (abc1234)` | `npm run build`                      | `dist/chrome-mv3`        |
| `Couplet: Dual Subtitles…`        | The GitHub release zip, or the store | Wherever it was unzipped |

The hash in brackets is the commit the build came from, with `+` when tracked files had changed since. A card without `(dev)` or `(local)` is the store package: loaded unpacked, it has another extension ID, so Google sign-in fails.

### When a change doesn't show in the dev build

`npm run dev` rebuilds on save and tells the extension over a websocket, which swaps in the new content script and refreshes YouTube tabs. The extension connects once, when it loads, and never reconnects. After the `wxt` server restarts, the terminal still prints `Reloaded: youtube` for every change, but no one receives it, and YouTube keeps running the old code, even after a refresh.

So after each server restart, reload the extension once: press reload on the card, press `Alt+R` (WXT's dev shortcut), or post `{ __dualSubtitlesDevReload: true }` from a YouTube tab. Hot reload then works until the next restart.

## Subtitles on real YouTube

Automated browsers get empty captions from YouTube, so reproduce in the person's own Chrome profile, with a development build loaded.

A development build answers a dump request with what it made of the current video's subtitles. Run this in the YouTube tab:

```js
await new Promise((resolve) => {
  addEventListener('message', function listen(event) {
    if (!event.data?.__dualSubtitlesDevDumpResult) return;
    removeEventListener('message', listen);
    resolve(event.data.__dualSubtitlesDevDumpResult);
  });
  postMessage({ __dualSubtitlesDevDump: true }, location.origin);
});
```

The result names the settings, `trackStatus` (which of the four cases in [`DESIGN.md`](DESIGN.md#which-subtitles-show) applies, and the shown track's language), and for the captions the page agent forwarded:

- `kind`: `asr` for automatic captions.
- `segments` and `multiWordSegments`: YouTube sends automatic captions one word per segment, or sometimes whole lines per segment. Mostly multi-word segments means the line-level form.
- `cues`, `medianCueChars`, `maxCueChars`, `longestCue`: what the parser made of them.

`captions` is `null` until the page agent forwards a track. The page agent forwards only the first track it sees for each video and language, so a refresh can fetch a different form of the same track.

Send `{ __dualSubtitlesDevDump: 'body' }` instead to include the raw json3 `body`.

## Caption fixtures

[`src/lib/youtube/fixtures`](../src/lib/youtube/fixtures) holds real automatic captions, which [`captions.fixtures.test.ts`](../src/lib/youtube/captions.fixtures.test.ts) parses. When a video shows a parsing bug, dump its `body`, keep the first minute or so of events with only `tStartMs`, `dDurationMs`, `aAppend`, and `segs` (`utf8`, `tOffsetMs`), and add a test that fails on it.

## Japanese splitting benchmark

[`tokenize.benchmark.test.ts`](../src/lib/ui/tokenize.benchmark.test.ts) scores how Japanese subtitles split, against a hand-made reference for every line of [one video](https://www.youtube.com/watch?v=BMqqIz7H8Bg). The goal is that at least 95% of tokens are meaningful units: a word with its endings, or a particle. The test fails below 98%, just under today's score, so a change that breaks old splits shows up.

In [`japanese-yakushima.gold.txt`](../src/lib/ui/fixtures/japanese-yakushima.gold.txt), `|` marks a boundary a split must have, and `¦` one it may have, such as between a noun and です, or inside a compound like 世界¦自然¦遺産. When a failure names a line, decide whether the split or the reference is wrong before changing either. To score a new video, dump its captions as described above, write each line's reference, and add the pair beside the first.
