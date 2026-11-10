# dual-subtitles

## Documentation

Write all project documentation in English.

## UI

Read [`docs/DESIGN.md`](docs/DESIGN.md) before any UI work, and derive every visual decision from its principles and tokens.

**Originality rule:** the UI must be our own design. Other products may inform features and data flows; design the layout, colors, component styles, copy, and assets ourselves instead of copying theirs.

Use the names in [`docs/GLOSSARY.md`](docs/GLOSSARY.md).

Before finalizing a design, run `design:design-critique`. When adding a component or token, check it with `design:design-system`.

## Changelog

When a commit changes something a user would notice, add its line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) in that same commit, following [`docs/RELEASING.md`](docs/RELEASING.md#changelog). A release only moves these lines under its version.

## Debugging

To see what the extension made of a video's subtitles on real YouTube, read [`docs/DEBUGGING.md`](docs/DEBUGGING.md).
