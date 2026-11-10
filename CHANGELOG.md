# Changelog

All notable changes to Couplet are in this file, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with versions that follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). A release is a tag on `main` whose section here becomes the
GitHub release. See [`docs/RELEASING.md`](docs/RELEASING.md).

## [Unreleased]

### Added

- New-word hints in English: one word per subtitle line worth learning at your level gets a dashed underline. Turn them off in the subtitle settings.
- A word check on the Welcome Page and in Settings: pick the last row of common words you know, and hints start from your level.
- "I know this" in a word's card: the word is kept but never marked in subtitles or reviewed. Undo is right there, and saving the word again puts it back on review.
- Review answers have their own sounds: Got it rises, Unsure is one even note, and Forgot falls softly. The "Save sound" setting is now "Sounds" and covers them too.
- Explain with AI in a word's or phrase's card on YouTube, beside "I know this". It shares the 50 a day with Words, and a line explained in one place costs nothing to open in the other.

### Changed

- Review says what each answer did in a small pill just above the grade buttons, with Undo, instead of in the top corner. Words uses the same pill instead of the large notice at the top.
- "Stop reviewing" is now "I know this", in Review and Words, the same as in a word's card on video.
- "Delete" is now "Remove", grey until it asks, and the question says what is cleared and that saving the word again brings it back.
- The button that shows the lines around a Review sentence is now labelled "Nearby lines", beside "Show translation", with its key, C.

## [0.3.0] - 2026-11-09

### Added

- Videos without subtitles in your learning language now show the video's own language with a translation, so any video
  with subtitles is easier to follow. Words in them aren't clickable: looking up and saving stay with your learning
  language.
- A note at the player's top right says when a video has no subtitles at all, instead of showing nothing.

### Changed

- On a video in your native language, Couplet leaves YouTube's own subtitles as they are.
- The settings panel says which subtitles a video shows when it lacks your learning language.

## [0.2.1] - 2026-11-08

### Changed

- Word lookups answer sooner: the connection opens when the pointer reaches the subtitles, and a lookup no longer waits
  for the account's sign-in to refresh.

### Fixed

- Pronunciation no longer falls back to an unrelated system voice when a listed voice fails, or on the first click on a
  page.
- Automatic captions no longer sometimes show a whole paragraph as one subtitle until the page is refreshed. Long lines
  now break at sentence and clause ends, and punctuation no longer gets a stray space before it.

## [0.2.0] - 2026-11-07

### Added

- Save a phrase: drag across words, then press the star. Phrases come back for review like any other word, up to 80
  characters.
- A Traditional Chinese name and summary in the Chrome Web Store.

### Changed

- The extension is now named Couplet: Dual Subtitles to Learn Languages on YouTube, with a clearer summary.
- Explain with AI now allows 50 explanations a day per account, up from 20.
- Couplet has a new logo: two overlapping squares, the original and its translation. It shows on the toolbar, in the popup,
  on the Welcome Page, and on the player's subtitle switch.

## [0.1.1] - 2026-11-07

### Changed

- The extension is now named Couplet: Learn Languages on YouTube.

## [0.1.0] - 2026-11-07

The first release: learn a language from YouTube videos with dual subtitles, word lookup, and review.

### Added

- Dual Subtitles on YouTube: the original above a translation into any of 22 languages, with eight languages to learn.
- Click a word for its meaning, phonetics, and examples, or drag across words to translate a phrase. Neither needs an
  account.
- Show the lines before and after a subtitle, and select across them.
- Turn subtitles on or off from the player's controls, and move or resize them.
- Sign in with Google to save words, keep them on your device, and sync them across computers.
- Review saved words on a schedule, in the sentence where you met them, with a link back to that moment in the video.
- Explain with AI in Words: two or three sentences on a word's meaning, part of speech, and grammar in its sentence, 20
  times a day.
- A Dashboard with your words, progress, and settings, in light or dark, and export to CSV.
- A Welcome Page after install, for picking languages and seeing what to try.
