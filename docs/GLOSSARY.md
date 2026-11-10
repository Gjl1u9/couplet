# Glossary

The interface, designs, and code all use these names. Each thing has one name.

## Languages

| Term              | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Learning Language | The language the user is studying. Its track comes first, with lookups, and it selects the vocabulary list. |
| Native Language   | Selects the translation language. Changing it leaves saved words as they are.                               |

## Subtitles

| Term           | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| Dual Subtitles | The original and translated subtitles shown together on a video. `createOverlay` in code. |
| Original       | The text in the video's language. `SubtitleView.original` in code.                        |
| Translation    | The text in the user's native language. `SubtitleView.translation` in code.               |
| Couplet        | An original line above its translation. Subtitles and examples are both couplets.         |
| Subtitle Strip | The one background around a couplet and its Context Lines.                                |
| Context Line   | The previous or next cue, shown in the strip when turned on. `showContext` in code.       |
| Grip           | The six-dot handle that moves the strip.                                                  |
| Selection      | Text picked by dragging across tokens, translated by Google. It can be saved as a phrase. |

## Settings

| Term              | Meaning                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Popup             | The small page opened from the extension's toolbar icon.                                                                |
| Welcome Page      | The page opened once after install, with language settings and what to try first.                                       |
| Sign-in Toast     | The prompt at the player's top right when saving a word without an account.                                             |
| Track Notice      | The note at the player's top right when the video has no subtitles at all.                                              |
| Settings Panel    | The subtitle settings panel opened from the player's controls.                                                          |
| Subtitle Switch   | The player control that turns Dual Subtitles on and off. `enabled` in settings.                                         |
| Panel Theme       | Whether the Lookup Panel is dark or light. `panelTheme` in code.                                                        |
| Subtitle Position | Where the user placed the strip, or `null` for the default. `subtitlePosition` in code.                                 |
| Sounds            | The short tones for saving a word and for Review's answers, under one switch. `saveSound` in code.                      |
| Answer pill       | The one-line feedback with Undo, such as "bank · back in 3 days": above Review's grade buttons, at the bottom of Words. |

## Lookup

| Term          | Meaning                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token         | The smallest clickable unit in a subtitle: a single word, or a term such as `Navier-Stokes`. In Japanese, a word with its endings, such as `行きました`, or a particle on its own, such as `は`. |
| Lookup        | Finding a clicked token's Word Entry. It does not depend on the token's cue.                                                                                                                     |
| Word Entry    | A word's lemma, phonetics, and senses. `WordEntry` in code.                                                                                                                                      |
| Sense         | One meaning of a word, with a couplet example.                                                                                                                                                   |
| Lookup Panel  | The compact panel shown over the video after a token is clicked.                                                                                                                                 |
| Saved Word    | A word or phrase the user saved, with its Encounters and schedule. `SavedWord` in code.                                                                                                          |
| Vocabulary    | The user's Saved Words. `createVocabulary` in code.                                                                                                                                              |
| Pronunciation | The word spoken by a browser voice, from the play button.                                                                                                                                        |
| Phonetics     | A phonetic transcription or reading of the word, when the source has one.                                                                                                                        |

## Review

Specified in [`REVIEW.md`](REVIEW.md).

| Term          | Meaning                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Dashboard     | The extension page holding Home, Review, Words, Progress, and Settings.                         |
| Card          | One Saved Word as shown for review. `Review Card` in full.                                      |
| Encounter     | One time the user met a Saved Word: its cues, video, and moment.                                |
| Review Queue  | The Cards that are due now.                                                                     |
| Grade         | The user's answer on a Card: Forgot, Unsure, or Got it.                                         |
| Level         | A Card's step in the schedule, which sets its next interval.                                    |
| Retired       | Kept in the Vocabulary but no longer scheduled, by mastery or by choice.                        |
| New-word hint | A dashed underline on one word per line worth learning at the user's level.                     |
| Word Check    | The rows of common words where the user picks how many they know. Stored in `vocabularyLevels`. |
| I know this   | The Lookup Panel's action that saves a word and Retires it at once. Its status is `known`.      |
| Stage         | Where a word stands: New, Learning, or Known. Defined in [`DASHBOARD.md`](DASHBOARD.md).        |
| Level Track   | The seven dots showing a word's Level.                                                          |
| Hard Word     | A word on the schedule forgotten repeatedly and still low on it. Shown on Progress.             |
| Words         | The Dashboard page listing the Vocabulary.                                                      |
| Page Theme    | Whether Dashboard pages follow the system or stay light or dark. `pageTheme` in code.           |

## Naming rules

- "Card" is reserved for the review feature, so the Lookup Panel is never a "lookup card".
- Names stay independent of YouTube, so supporting other video sites needs no renaming.
