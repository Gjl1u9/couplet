# dual-subtitles

A Chrome extension that shows dual-language subtitles on YouTube, with word lookup.

Current stage: free tier, with dual subtitles, the Lookup Panel, and the Settings Panel.

## Development

Requires Node 22 or later; see `.nvmrc` for the version.

| Command             | Writes                | After a code change                         |
| ------------------- | --------------------- | ------------------------------------------- |
| `npm run dev`       | `dist/chrome-mv3-dev` | Updates itself; blank once the server stops |
| `npm run build:dev` | `dist/chrome-mv3-dev` | Rebuild and reload; unminified              |
| `npm run build`     | `dist/chrome-mv3`     | Rebuild and reload                          |

`dev` and `build:dev` overwrite each other, so use one at a time.

Lookups go through our Cloudflare Worker, which holds the AI key. See [`docs/LOOKUP.md`](docs/LOOKUP.md).

Run the full check before committing. It matches CI:

```bash
npm run check
```

## Releases

See [`docs/RELEASING.md`](docs/RELEASING.md). User-facing changes go in [`CHANGELOG.md`](CHANGELOG.md).

## Design

- [`docs/DESIGN.md`](docs/DESIGN.md): the global UI style.
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md): product terms.
- [`prototype/`](prototype): static HTML and CSS style references. Its Lookup Panel predates the current compact design.

## Recording YouTube events

`tools/recorder-extension` is a development extension that needs no build. It records event timing, video IDs, and DOM mutation counts. It does not record account data, signatures, or tokens.

1. Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select that folder.
2. Watch videos normally in a signed-out profile.
3. Click the extension icon and choose 「匯出 JSON」.

Record with a browser a person is operating. In browsers launched by automation tools such as Playwright, videos fail after about 50 seconds and captions are empty.
