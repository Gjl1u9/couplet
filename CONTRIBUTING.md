# Contributing

Thanks for helping with Couplet.

## Before you start

- For a bug, open an issue with the video link, the subtitle languages, and what you saw.
- For a feature or a larger change, open an issue first so we can agree on it before you write code.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Set up as the [README](README.md#development) describes.
3. For UI work, read [`docs/DESIGN.md`](docs/DESIGN.md) and use the terms in [`docs/GLOSSARY.md`](docs/GLOSSARY.md).
4. If users would notice the change, add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
5. Run `npm run check`, which matches CI, then open a pull request.

Lookups need our Cloudflare Worker, which holds the AI key. You can work on everything else without it.

By contributing, you agree that your work is licensed under the [MIT License](LICENSE).
