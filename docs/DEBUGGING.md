# Debugging

## Which build is loaded

Each local build names itself on its card in `chrome://extensions`:

| Card says                         | Built with                           | Folder                   |
| --------------------------------- | ------------------------------------ | ------------------------ |
| `Couplet (dev) 0.2.1 (abc1234)`   | `npm run dev`, `npm run build:dev`   | `dist/chrome-mv3-dev`    |
| `Couplet (local) 0.2.1 (abc1234)` | `npm run build`                      | `dist/chrome-mv3`        |
| `Couplet: Dual Subtitles…`        | The GitHub release zip, or the store | Wherever it was unzipped |

The hash in brackets is the commit the build came from, with `+` when tracked files had changed since. A card without `(dev)` or `(local)` is the store package: loaded unpacked, it has another extension ID, so Google sign-in fails.

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

The result names the settings, whether the video has a track in the learning language, and for the captions the page agent forwarded:

- `kind`: `asr` for automatic captions.
- `segments` and `multiWordSegments`: YouTube sends automatic captions one word per segment, or sometimes whole lines per segment. Mostly multi-word segments means the line-level form.
- `cues`, `medianCueChars`, `maxCueChars`, `longestCue`: what the parser made of them.

`captions` is `null` until the page agent forwards a track. The page agent forwards only the first track it sees for each video and language, so a refresh can fetch a different form of the same track.

Send `{ __dualSubtitlesDevDump: 'body' }` instead to include the raw json3 `body`.

## Caption fixtures

[`src/lib/youtube/fixtures`](../src/lib/youtube/fixtures) holds real automatic captions, which [`captions.fixtures.test.ts`](../src/lib/youtube/captions.fixtures.test.ts) parses. When a video shows a parsing bug, dump its `body`, keep the first minute or so of events with only `tStartMs`, `dDurationMs`, `aAppend`, and `segs` (`utf8`, `tOffsetMs`), and add a test that fails on it.
