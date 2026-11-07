# dual-subtitles

A Chrome extension that shows dual-language subtitles on YouTube, with word lookup.

Current stage: free tier, with dual subtitles, the Lookup Panel, and the Settings Panel.

## Development

Requires Node 22 or later; see `.nvmrc` for the version.

```bash
npm install
npm run dev
```

Lookups use the DeepSeek API. For now this is a prototype: development builds read `DEEPSEEK_API_KEY` from `.env` and embed it in the service worker, so never share a development build. Release builds contain no key, and their lookups show an error until lookups go through a server.

Run the full check before committing. It matches CI:

```bash
npm run check
```

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
