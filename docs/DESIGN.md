# Zhupi: global UI style

Subtitles, panels, and the Dashboard all use this style. Zhupi (朱批) means annotating text with a vermilion brush: content is ink, and the word the user is looking at is vermilion. Token values live in [`src/lib/ui/tokens.css`](../src/lib/ui/tokens.css). [`prototype/style.html`](../prototype/style.html) shows them applied to a page.

## Principles

1. **One vermilion brush:** over video and on the Review Card, `accent` marks only the word the user is looking at: the selected token, and the pronunciation being played. Primary buttons, navigation, and switches use `ink`. Errors use `alert`. The Dashboard has its own wider rule below.
2. **Couplets:** language content always puts the original above the translation. The translation is smaller and lighter. Subtitles, examples, the vocabulary list, and review all share this structure.
3. **Video first:** anything over the video is small, closes immediately, and keeps the subtitle being studied visible.
4. **Content over decoration:** build hierarchy with type, spacing, and `line`.

## Tokens

| Type      | Tokens                                                                                                                                | Use                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Surfaces  | `ground`, `surface`                                                                                                                   | Page background; panels and content blocks                       |
| Text      | `ink`, `ink-muted`                                                                                                                    | Primary text; secondary text                                     |
| Lines     | `line`, `line-strong`                                                                                                                 | Decorative dividers; control borders                             |
| Accent    | `accent`, `on-accent`, `accent-soft`                                                                                                  | Follow principle 1; `accent-soft` is for hover                   |
| Chips     | `chip`                                                                                                                                | Meaning backgrounds                                              |
| Status    | `alert`, `skeleton`, `saved`, `known`                                                                                                 | Errors and warnings; loading skeletons; Saved Words; Known words |
| AI        | `ai`, `ai-outline`                                                                                                                    | The sparkles on Explain with AI; `ai` is the same in both themes |
| Subtitles | `subtitle-scrim`, `subtitle-original`, `subtitle-translation`, `subtitle-context`, `subtitle-mark`, `subtitle-saved`, `subtitle-hint` | Over video only; identical in light and dark themes              |
| Spacing   | `space-1` 4px, `space-2` 8px, `space-3` 12px, `space-4` 16px, `space-5` 20px, `space-6` 32px                                          | Components and layout                                            |
| Radius    | `radius-sm` 4px, `radius-md` 8px, `radius-lg` 14px                                                                                    | Tokens and labels; buttons and inputs; panels                    |
| Shadow    | `shadow-panel`                                                                                                                        | Panels over video only; pages separate with borders              |

## Type

| Style                 | Family | Size/line height    | Weight | Use                           |
| --------------------- | ------ | ------------------- | ------ | ----------------------------- |
| `card-word`           | `sans` | 32/40, 24/32 narrow | 600    | The Review Card's title       |
| `card-cue`            | `sans` | 20/30               | 500    | The Review Card's current cue |
| `word`                | `sans` | 20/28               | 600    | The Lookup Panel's word       |
| `phonetics`           | `sans` | 13/20               | 400    | Phonetics and readings        |
| `title`               | `sans` | 20/28               | 600    | Page and section titles       |
| `meaning`             | `sans` | 16/24               | 500    | Word translations             |
| `phrase`              | `sans` | 16/24               | 600    | Selected text in panels       |
| `couplet-original`    | `sans` | 15/22               | 500    | Couplet originals             |
| `couplet-translation` | `sans` | 14/21               | 400    | Couplet translations          |
| `label`               | `sans` | 12/16               | 500    | Short labels                  |

Everything uses one neutral `sans` stack, so type carries hierarchy through size and weight. It names IBM Plex Sans, which the extension does not bundle yet, so it currently renders with the system fallbacks. CJK text always uses system fonts.

## Themes

- Panels over video default to `dark`. The Lookup panel setting switches the Lookup Panel to `light`; the Settings Panel stays `dark`.
- Extension pages follow the system until the user picks light or dark.
- `data-theme` switches themes, and components use only tokens.

## Subtitles

The Subtitle Strip is one background fitted to its longest line, holding the original above the translation.

- The strip uses `subtitle-scrim` and `radius-md`, spans at most 86% of the player width, and balances wrapped lines.
- Type scales with the player: the original is `clamp(14px, 2.4cqw, 34px)` and the translation is `clamp(13px, 2.1cqw, 30px)`, both multiplied by the subtitle size setting: small 0.68, medium 0.8 (default), large 0.96.
- The strip sits 6% from the bottom while the controls are hidden, and moves above the controls when they show.
- Token hover, selected, and focus shapes hug the word: at most 1em tall, shorter than the line, and inside the strip. The hit area keeps the line's full height.
- The selected token has a `subtitle-mark` underline and a line of the same color connecting it to the Lookup Panel. Below the strip, the underline alone marks it.
- While a translation loads, its line shows a skeleton, so the original stays in place.
- `dir="auto"` decides text direction.

### Which subtitles show

The learning language decides what can be learned, not whether anything shows, so a video with captions shows something useful to people learning and to people who only want a translation. [`chooseTrack`](../src/lib/youtube/captions.ts) takes the first that fits:

1. **Learning:** a track in the learning language, with lookups, selection, and saving.
2. **Translation:** otherwise, the video's own language with a translation, as plain text with nothing to click. Learning stays in the learning language, so saved words never mix languages and no other language needs a dictionary or word segmentation. The video's language is its default track, or else its automatic captions.
3. **Native:** a video in the native language, in any script, shows nothing of ours, and YouTube's own captions stay as the user left them.
4. **None:** a video without captions shows the Track Notice.

The Settings Panel says which case applies under the language rows, except for Learning. Only None is an alert.

### Context Lines

The previous and next cues can appear above and below the couplet, inside the strip. They are off by default, because the video comes first. A button outside the strip's right edge turns them on and off; it appears on hover or focus, and the choice is saved. Its icon changes with the state, and its `aria-label` says what it will do. They are `subtitle-context`, 88% of the translation's size, and originals only, so the strip stays small. Their words are tokens like any other.

### Marks on Saved Words

A token matching a Saved Word still on the schedule has a dotted `subtitle-saved` underline. It stays quiet and clicks like any other token.

### New-word hints

Why it works this way is in [`HINTS.md`](HINTS.md).

In each original line, at most one word worth learning now has a dashed `subtitle-hint` underline: dashes, not the Saved Word's dots, so the two read apart by shape. It stays quiet and clicks like any other token.

- A hinted word comes from a band of the learning language's frequency list ([`public/frequency`](../public/frequency/README.md)): from where the user's known words end to two and a half times that. The band starts at the higher of the Word Check and, once 20 words are on review, the rank a quarter of them sit above. So saving harder words and learning easy ones moves it up, and a higher Word Check takes effect at once; a lower one cannot pull it below the saved words.
- The 200 most common words, and every word in the Vocabulary, saved or known, are never hinted. A line hints its most common candidate, and a video hints each word, with its simple inflections, only once.
- New word hints in the Settings Panel and the Dashboard's Settings turns them off. Only English has a list so far; for other learning languages, both say "New word hints are English only for now." under the switch.

### Selecting text

Dragging from one token to another selects every token between them, including across Context Lines. Selected tokens use the same mark as a selected token, and releasing opens the Lookup Panel with the text and its Google translation. A drag that returns to its first token cancels. Selecting pauses the video, because a new cue would replace the tokens under the pointer.

### Moving the strip

A six-dot grip outside the strip's left edge moves it. It appears on hover or focus and takes no space, so showing it never moves the words. Only the grip moves the strip, because the words must stay clickable.

- Drag anywhere inside the player. The place is saved as fractions of the player, so it carries across videos and player sizes.
- Near a side, the strip narrows to stay inside the player.
- The strip stays where it was placed, and only moves up when the controls would cover it.
- Double-clicking the grip, pressing Home on it, or "Reset" in the Settings Panel restores the default place. Arrow keys move it by 2%.

## Lookup Panel

The Lookup Panel shows the word and its one or two most common senses, each as a couplet example, and stays as small as its content.

- The first row holds the word, its phonetics, a save button, and a play button. The word becomes its lemma once the entry loads, and the save button appears then. 8px separates this row from the senses.
- A saved word's button is a star filled with `saved`; an unsaved one is an `ink-muted` outline.
- Under a word's senses, after a `line` divider, a quiet text button says **I know this**, with a circled check. It saves the word with this line and Retires it at once, so the word is never marked in subtitles or reviewed. The row then shows a `known` filled check with "Known", an Undo, and "Won't be marked or reviewed." Undo returns the word to where it was. Saving and knowing replace each other: I know this on a saved word Retires it, and the star on a known word puts it back on the schedule. A phrase has no I know this.
- Beside it, **Explain with AI** asks only when clicked, and needs a sign-in. Its answer sits between the senses and the foot, set off by a 2px `line-strong` rule on its left like a quotation, with "AI can make mistakes · 48 left today" under it in `ink-muted`. While it loads, three `skeleton` bars hold its place. The button then reads Hide explanation, and asking again in the same panel shows the same answer without a new request. Failures, such as the daily limit, are `alert` text in the same place. A phrase has a foot with Explain only.
- Each sense is its meaning, then an example couplet. A `line` divider separates two senses.
- Its width follows its content, from 180px to 360px.
- The word stays on one line: phonetics move to their own line first, and only a word wider than the row breaks.
- It sits above the strip, so the subtitle stays readable, connected to the token by a line. It stays 16px inside the player, opens below the strip when the strip is too high for it, and scrolls in a small player rather than leaving the player.
- For selected text, the first row holds the text in `phrase` style, a save button once it has a translation, and a play button. The translation sits in one meaning chip.
- Clicking the token again, clicking outside, or pressing Esc closes it, so it needs no close button.
- While loading, the clicked word shows immediately and a skeleton holds the senses' place.
- Phonetics are optional: the row simply omits them when the source has none.

## Welcome Page

A language sheet using the shared settings rows, then four Paper sheets, two to a row when the column fits them. Each holds a demonstration above its number, title, and one line of text.

- A demonstration is drawn in HTML and CSS rather than recorded, using the Lookup Panel's real styles, so it stays sharp, adds no media, and follows the design. Its scene keeps video colours in every theme.
- Each loops every 8 or 10 seconds and has its own Pause button. Under reduced motion, it rests on its finished state with no button.
- Under the languages, the **Word Check** asks how many of the learning language's common words the user knows. A button names the language, so a wrong guess shows before anything is asked. It opens rows of six words, from the 500 most common to 20,000, each with its size and a rough CEFR level; the user picks the last row where they know every word, and every row up to it shows Known. Save keeps one size per language, which starts the new-word hints. The Dashboard's Settings show the same check, to change it later. For a language without a list, the check isn't shown.

## Sign-in Toast

At the player's top right, in dark paper colours, 320px wide, so it clears the subtitle and most Lookup Panels. One line and one button, with the Google mark on a white tile. It fades in over 200ms, or appears at once under reduced motion. It leaves after 10 seconds, unless pointed at, focused, or signing in.

## Track Notice

Only a video with no captions at all shows nothing, so only then does the Track Notice say why. It shares the Sign-in Toast's place and paper: an `alert` icon with "This video has no subtitles", and a close button, with nothing to choose, because no setting would help. It appears once per video, never while the Settings Panel is open, and leaves after 8 seconds unless pointed at or focused. It closes when the video changes.

## Player controls

Two buttons in our own frosted pill, just left of YouTube's right controls and apart from them: a translucent ink background over a blur, with a thin white border, at YouTube's control height.

- **Subtitle Switch:** the product mark, which turns Dual Subtitles on and off in one click. Off, it turns grey, a line strikes it, and the label says what a click will do.
- **Settings:** white sliders with vermilion knobs, so it reads apart from YouTube's own white gear. It opens the Settings Panel.

Neither button changes on hover, so the pill stays still under the pointer. The product's colour marks these two buttons as ours, which is the one use of vermilion over video beyond principle 1.

## Settings menu

The Settings Panel and the Dashboard's Settings page share one compact menu, in [`settings-menu.css`](../src/lib/ui/settings-menu.css): titled groups of 34px rows at 13px, with 26px selects, 30×18px switches, and 24px segmented controls. Rows use the same labels and order on both.

- Over video it is a popup in the middle of the player, 300px wide, in dark paper colours. It scrolls when the player is too short.
- Selects are our own control, in [`select-menu.ts`](../src/lib/ui/select-menu.ts): a 132×26px button and a list of 28px rows, at most 272px tall, with a check on the current one. The list keeps its parents' colours and opens in the top layer, so scrolling and fullscreen cannot clip it.
- A row is the hit area for its switch or select, so these controls may be smaller than 44px. Segmented options and actions are at least 24px tall.

## Dashboard: Paper

Matte and tactile, like sheets on a desk. Behaviour and the features' reasons are in [`DASHBOARD.md`](DASHBOARD.md). Its tokens are in [`dashboard.css`](../src/lib/dashboard/dashboard.css), because they replace the ones used over video.

- **Sheets:** light `surface` cards with a `line-strong` border, on a darker `ground` with a fine grain. Corners are 5px, and pages have no shadows.
- **Answer pill:** what an action did, as a fully rounded ink pill: the word in bold, a middle dot, what happened, and 「Undo」 in a lighter pill inside it. Review centres it just above the grade buttons, and it leaves after 2.5 seconds. Words floats it at the bottom of the column, clear of the rail, for 6 seconds, since Undo has no key there. It stays while pointed at or focused. A problem stays 6 seconds and which uses `danger` on `danger-soft`. It fades in over 160ms, without motion when reduced motion is asked for.
- **Type:** serif for page titles, large numbers, and the word; sans-serif for the rest.
- **Layout:** an 84px rail with named icons beside a single centered column, 880px at most. Below 720px, the rail moves to the bottom.
- **Colour:** `accent` marks primary actions, the current page, progress, and the word being looked at. Stages use their own colours, always with a text label. `danger` marks Remove's confirmation and hard-word counts. Remove itself stays grey until it asks. The check on I know this is green.
- **Review activity:** one 15px square per day, in four shades of `accent` by the day's share of the busiest day.
- **Level Track:** seven 6px dots, then the current interval.
- **Lists:** rows divided by `line`. A row is the hit area, but only its word reacts to hover, so nothing touches the dividers.

## AI

Explain with AI is a quiet text button, at 12px in Words and 13px in the Lookup Panel's foot, with a Beta label and a filled sparkles icon in bright yellow, `ai` (`#ffd60a`), the one filled icon on these pages. On light paper the icon has a thin amber `ai-outline`, because bright yellow alone fails 3:1 there.

## Review Card

Behaviour is in [`REVIEW.md`](REVIEW.md). The Card's title is the largest type on the page, and over 24 characters it is 24/32, or 22/30 when narrow, so a saved phrase leaves room for the sentence. Grade buttons are uncoloured, so they do not suggest an answer. Keys appear as small bordered caps: a number on each grade button, and a line of every shortcut under them, in `ink-muted`.

## Components

- **Buttons:** primary buttons have an `ink` background and `surface` text; secondary buttons have a `line-strong` border. Hit areas are at least 44×44px, and may overlap surrounding padding so compact rows stay compact. Adjacent icon buttons in the Lookup Panel are the one exception: 30×44px, so the icons sit close together.
- **Meaning chips:** each meaning sits on a `chip` background with `radius-sm`. Chips, never commas or semicolons, separate meanings.
- **Hover and focus shapes:** the shape hugs what it marks, separately from the hit area. Around borderless text it is at most 4px wider per side and 4px taller per side than the line. It never touches or overlaps a neighbouring control, text, or container edge. Grow the hit area with a transparent `::after`, and keep it inside the row. A bordered button fills its own border box.
- **Icon buttons:** hover and focus shapes are 25×25px around the 17px icon, whatever the hit area. On extension pages, icons are 20px and shapes 28×28px; the dictionary icon is 24px and its shape 32×32px.
- **Switches and segmented controls:** the selected state uses `ink`.
- **Form focus:** a form control's focus ring touches its edge, with `outline-offset: 0`, so no gap shows between them.
- **Video titles:** a 14px outline icon of the source site comes first, in the title's colour, so sites read apart without a brand colour competing with `accent`.
- **Panels and content blocks:** `surface` background, `line` border, `radius-lg`.
- **Lists and tables:** separated with `line`, with the word in the first column and source sentences as couplets.
- **Loading:** `skeleton` reserves the content's layout.

## Sound

Sounds are short, synthesized tones, all controlled by one "Sounds" switch, on by default. Saving a word plays a two-note chime. In Review, Got it rises, Unsure is one even note, and Forgot falls softly on a rounder tone, never a buzz. State is never carried by sound alone.

## Copy

- Interface copy is in English, in short sentences people actually say, such as "Couldn't reach the dictionary".
- Buttons state what happens, such as "Try again".
- Error messages say what happened and what to do.

## Logo

The mark is two rounded squares offset against each other, with the overlap left empty: the original in `ink` and its translation in `accent`. The wordmark is "Couplet" in `sans` 600. [`brand/`](../brand) holds the sources, and [`prototype/logo.html`](../prototype/logo.html) shows the options we weighed.

- **In pages:** draw it inline with `Logo` ([`Logo.tsx`](../src/lib/dashboard/Logo.tsx)), so `ink` and `accent` follow the theme. Never use a PNG in a page.
- **Toolbar and store:** the toolbar and extensions page ignore our theme, so these files use mid-tones: `#7a8087` and `#df4e35`. [`brand/toolbar.svg`](../brand/toolbar.svg) is drawn on a 16-grid so every edge is a whole pixel at 16, 32, and 48px; [`brand/store.svg`](../brand/store.svg) holds 96px of artwork inside the 128px file.
- **Over video:** the Subtitle Switch draws the 16-grid mark in white and `subtitle-mark`, or in grey when off.
- **PNGs:** `node scripts/build-icons.mjs` writes `public/icon/` from `brand/`. Edit the SVGs, never the PNGs.

## Icons

Use line icons: 24×24 canvas shown at 17px, or 20px on extension pages, stroke width 2 on that canvas, round caps, color inherited from text. The play, save, and dictionary icons come from Tabler Icons (MIT). Icon buttons have an `aria-label`.

The product icon is the Couplet: two rows on `ink`, the upper one ending in vermilion. Its 16, 32, and 48px files use a version drawn on a 16-unit grid. The 128px file holds 96px of artwork, as the Chrome Web Store asks. The source is in [`prototype/icon.html`](../prototype/icon.html).

## Accessibility

Text contrast is at least 4.5:1. Control borders, focus rings, and icons are at least 3:1. State is always carried by text or an icon as well as color.
