# Review spec

Status: built. The interface is in English; [`prototype/dashboard.html`](../prototype/dashboard.html) is where its design was worked out.

## Goal

A word saved from a video comes back later in the sentence where the user met it. They try to recall it, check the translation or dictionary, and grade themselves. Words they know eventually leave the schedule and stay in the Vocabulary.

## Save flow

Saving must not interrupt the video. The star fills, the save chime plays, and the video and Lookup Panel stay as they are.

Saving needs an account, and looking up does not. Without one, the star opens the Sign-in Toast instead of filling. Signing in saves that word at once, even if the panel has closed. Closing the toast or leaving it for 10 seconds leaves the word unsaved. Removing a word never asks.

A save records:

| Data                                  | Used for                  |
| ------------------------------------- | ------------------------- |
| Word Entry: lemma, phonetics, senses  | Card, Vocabulary list     |
| Previous, current, and next cue       | Card context              |
| Google translation of those cues      | Card, behind the toggle   |
| The word as written in the subtitle   | Card title, marking       |
| Site, video ID, title, cue start time | Jumping back to the video |
| Level 0, due now                      | Schedule                  |

- The cues go to Google as one text, joined with `joinText` into continuous words. Cues split sentences anywhere, so translating them apart gave broken results, and joining with line breaks gave the same broken results. In 8 hand-written examples, `get | rid of all the old stuff in the | garage` became 「不得不得到 | 丟掉裡面所有的舊東西 | 車庫」 cue by cue, but read correctly when joined.
- This request runs once in the background after the save. If it fails, it runs again when the toggle is first opened on that Card.
- A new word enters today's Review Queue immediately. Nothing notifies the user; they see it when they open the Dashboard.
- Clicking the star again in the same open panel undoes the save and restores the earlier state. Deleting from the Vocabulary list asks for confirmation, because it also deletes review progress.

### Saved phrases

A Selection has the same star, once its translation has loaded, because the meaning often spans several tokens: `give up`, Korean `-을 수 없다`, or Japanese that Intl.Segmenter cuts into fragments such as `食 | べら | れ`.

| Decision                              | Why                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| It is a Saved Word                    | It has the same Encounters, schedule, Card, list, and sync, so there is nothing separate to keep in step    |
| At most 80 characters                 | The same limit as a word in Lookup and Explain with AI. Longer text can be translated, but shows no star    |
| No model call                         | Google's translation is already on screen. It is the one meaning, with no Phonetics or example, and is free |
| The lemma is lowercase, single-spaced | `Give Up` and `give  up` are one Saved Word. The Encounter keeps the text as written, for the Card's title  |
| A translation's commas stay           | A word's meaning splits into chips at commas, but a phrase's translation is one chip                        |
| A phrase can cross cues               | Cues split sentences anywhere. It belongs to the cue where it starts, and the Card shows that cue unmarked  |

If a phrase's lemma matches a word saved from a Lookup, they are one Saved Word, and the first save's Word Entry stays.

A title over 24 characters uses smaller type, list rows stop at two lines, and messages shorten the phrase to 24 characters.

Subtitles don't mark saved phrases yet, because marks compare one token at a time.

## Review Card

A Card has one face and never flips. [`prototype/review.html`](../prototype/review.html) shows it working.

From top to bottom:

1. **Source row:** at the top, 「Back to video」 with the timestamp, the video title, and the dictionary button at the corner. The jump opens the video in a new tab about two seconds before the cue. It does not grade the Card, and the Card stays where it was.
2. **Card title:** the word as written in the subtitle, such as `observing`, in the largest type on the page, followed by the Pronunciation button, which speaks this form. The Level Track sits below it.
3. **Context:** the previous, current, and next cue in the original language. The current cue is emphasized and holds the marked word; neighbours are muted. 「Nearby lines」 beside the translation toggle collapses and restores the neighbours, and that choice carries across Cards. It has the icon of the subtitles' own context switch and shows its key, `C`, because a bare arrow after the cue went unnoticed.
4. **Toggle:** directly under the context, with its content opening below it, so it stays under the pointer. Its text says what it will do: 「Show translation」 or 「Hide translation」. Its arrow points right when closed and down when open. It starts closed on every Card.
5. **Translation:** one paragraph for the whole context, behind the toggle.
6. **Actions:** 「I know this」 and 「Remove」, at the bottom.

The three grade buttons, each showing its next interval, stay fixed to the bottom of the window. The user can grade without opening anything, so a known word takes one key.

### Dictionary

The dictionary is separate from both the translation and the marked word, because its senses may not include what the word means in this sentence. The marked word is plain text and opens nothing.

A button at the Card's top-right corner opens the panel directly under it, with the panel's right edge on the icon's right edge. The panel may cover the context while open.

- It has the Lookup Panel's styles and content, and follows the Panel Theme setting: lemma, Phonetics, senses, and examples.
- It has Pronunciation in Words. On the Card, Pronunciation stays beside the title.
- It has no save button. On video the filled star removes a word at once, which here would bypass the confirmation on 「Remove」.
- Clicking the button again, clicking outside, or pressing Esc closes it. It also closes when the Card changes.

The panel floats over page content, so it keeps `shadow-panel`, as it does over video.

### Why each button exists

A button stays only if removing it causes a problem nothing else solves.

| Button        | Without it                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Forgot        | A forgotten word has no way back to level 0 or a same-day retry. It returns days later and is forgotten again.               |
| Unsure        | A half-remembered word must either restart at 10 minutes or advance as if known, so honest grading is punished.              |
| Got it        | Intervals never grow and nothing graduates, so the queue only gets longer.                                                   |
| Back to video | The Card has text and a browser voice only. The speaker's real voice and the scene that made the word stick are lost.        |
| I know this   | A word the user already knows still takes 6 reviews over 114 days to leave.                                                  |
| Remove        | A word saved by mistake stays in the Vocabulary list and statistics forever, or the user must leave the review to remove it. |
| Pronunciation | Listening needs a trip back to the video, and words saved before this feature have no video.                                 |
| Undo          | A mispressed key cannot be reversed: a word can vanish for 60 days or lose all its progress.                                 |
| End review    | The session has no way back to the Dashboard except browser navigation.                                                      |

### Other behaviour

Each grade shows what happened in a pill just above the grade buttons, such as 「**bank** · back in 3 days」 with 「Undo」, because a keyboard grade is easy to press by accident and the eyes are already there. It leaves after 2.5 seconds unless pointed at, and the next answer replaces it; `Z` still undoes after it leaves. Grades are not coloured, so the buttons do not suggest an answer.

Each grade also plays its own short sound while Sounds is on: Got it rises, Unsure is one even note, and Forgot falls softly. Forgot is never a wrong-answer buzz, because forgetting is part of learning and a punishing sound makes people press Unsure instead.

A line under the grade buttons always lists the shortcuts, and each grade button shows its number. Touch screens hide both. Keyboard: Space toggles, `D` opens the dictionary, `1` `2` `3` grade, `P` plays Pronunciation, `C` collapses the neighbouring cues, `Z` undoes, Esc closes.

A failed translation shows 「Couldn't load the translation.」 and 「Try again」 in its place. Words saved before this feature have only their sentence, so their Card has no neighbours or jump.

## Schedule

A Card has a level. Each level has an interval.

| Level    | 0      | 1     | 2      | 3      | 4       | 5       | 6       |
| -------- | ------ | ----- | ------ | ------ | ------- | ------- | ------- |
| Interval | 10 min | 1 day | 3 days | 7 days | 14 days | 30 days | 60 days |

| Grade  | New level           | Intent                                   |
| ------ | ------------------- | ---------------------------------------- |
| Forgot | 0                   | See it again soon                        |
| Unsure | `max(level - 1, 1)` | Step back, but never again today         |
| Got it | `max(level + 1, 2)` | Move on. At level 6, the word is Retired |

What each button shows on a Card at each level:

| Level | Forgot | Unsure  | Got it  |
| ----- | ------ | ------- | ------- |
| 0     | 10 min | 1 day   | 3 days  |
| 1     | 10 min | 1 day   | 3 days  |
| 2     | 10 min | 1 day   | 7 days  |
| 3     | 10 min | 3 days  | 14 days |
| 4     | 10 min | 7 days  | 30 days |
| 5     | 10 min | 14 days | 60 days |
| 6     | 10 min | 30 days | Done    |

The floors keep the three buttons different at every level. Answering Got it every time retires a new word after 6 reviews over 114 days.

### Review session

- The Review Queue holds Cards with `dueAt <= now`, oldest first.
- A Card graded Forgot is not shown early. If the page stays open, it rejoins the queue when due.
- When the queue is empty, the page shows how many were reviewed and when the next Card is due.

### Leaving the schedule

A Retired word stays in the Vocabulary, with its star filled, but never enters the Review Queue.

| Way out   | Trigger                                                   | Reason in data |
| --------- | --------------------------------------------------------- | -------------- |
| Mastered  | Got it at level 6                                         | `mastered`     |
| By choice | 「I know this」 on the Card, in Words, or on video        | `manual`       |
| Way back  | 「Review again」 in the Vocabulary list: level 0, due now | `null`         |

Meeting a Retired word in a video does not bring it back automatically.

It says 「I know this」, as the Lookup Panel does, because both Retire the word and one name is easier to learn than two. A hover hint says what follows before the click. Afterwards the pill says 「**bank** · Known. Won't be reviewed again」 with 「Undo」; Words shows the same pill at the bottom of the page. It does not ask first, because Undo makes the action safe and a question on every word would slow a review.

### Removing a word

Retiring and removing are different actions with different labels:

| Action          | Word and history | Undo                         | Confirmation |
| --------------- | ---------------- | ---------------------------- | ------------ |
| 「I know this」 | Kept             | 「Undo」 or 「Review again」 | None         |
| 「Remove」      | Removed          | None                         | Required     |

「Remove」 is grey until it asks, in place: 「Remove bank from Words? Its progress and saved lines are cleared. Save it again from any video to bring it back.」, with 「Cancel」 focused and a red 「Remove」 beside it. Esc cancels, and grade keys do nothing meanwhile. It deletes every Encounter and `ReviewEvent` of the word. The question doesn't promise the word is gone for good, because saving it again on video brings it back.

The Dashboard pages are specified in [`DASHBOARD.md`](DASHBOARD.md).

## Marks in subtitles

Tokens matching a word still in the schedule get a quiet mark, without changing how they behave on click. Retired words have no mark, so subtitles do not fill up with known words.

v1 matches a normalized token against the word's lemma and every form the user saved it from. `banks` is marked if the lemma or a saved form is `banks`, and is otherwise missed. No stemming: it differs by language, and a missed mark costs less than a wrong one. The word set is held in memory and refreshed on storage changes, so subtitles never read storage per token.

## Data

```ts
interface SavedWord extends WordEntry {
  id: string;
  source: string; // Learning Language; with the lemma, identifies the word
  target: string;
  forms: string[]; // Spellings met in subtitles, for marks
  encounters: Encounter[]; // Newest first, at most three
  review: ReviewState;
  savedAt: number;
  updatedAt: number;
}

interface Encounter {
  id: string;
  cues: ContextCue[]; // Previous, current, next; any neighbour may be absent
  currentCue: number;
  formOffset: number | null; // Where the form starts in the current cue
  translation: string | null; // All cues translated together, as one text
  form: string; // The word as written in the current cue
  origin: VideoOrigin | null; // null for words saved before this feature
  meaning: ContextMeaning | null; // Unused until an AI feature exists
  savedAt: number;
}

interface ContextCue {
  original: string;
  startMs: number | null;
}

interface VideoOrigin {
  site: 'youtube'; // A union that gains 'netflix'
  videoId: string;
  title: string;
}

interface ContextMeaning {
  text: string;
  model: string;
  createdAt: number;
}

interface ReviewState {
  scheduler: 'ladder-v1';
  level: number;
  dueAt: number;
  lastReviewedAt: number | null;
  reviewCount: number; // Picks which Encounter the next Card shows
  retired: { reason: 'mastered' | 'manual'; at: number } | null;
}

interface ReviewEvent {
  wordId: string;
  encounterId: string;
  grade: 'again' | 'hard' | 'good';
  levelBefore: number;
  levelAfter: number;
  at: number;
}
```

`ReviewEvent`s go in their own append-only storage key, so saving a word never rewrites the history.

### Storage rules

Cloud sync changes where these live and adds rules to every write. See [`SYNC.md`](SYNC.md).

- **One writer.** The background script performs all writes. Today each page has its own write queue, so a video tab and the Dashboard could overwrite each other.
- **Versioned.** Stored data carries a schema version. The first migration turns each existing Saved Word into one Encounter, at level 0 and due now.

## Extension points

| Later change                   | What already allows it                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Better algorithm, such as FSRS | `schedule(state, grade, now)` is one pure function, `scheduler` names the rule, and the event log can replay history |
| Netflix and other sites        | `VideoOrigin` is a union, and one function per site builds the jump link                                             |
| Sync between devices           | Stable IDs, `updatedAt`, and an append-only event log                                                                |
| Other Card contents            | Cards render from `Encounter`, and optional fields just hide their row                                               |

## Out of v1

- Saving a Selection as a Card
- Grading by typing or listening
- Notifications, and a due count on the toolbar icon
- Premium payment and the server proxy
- Netflix
- Stemming for marks

## Decided

- Translations start hidden behind a button.
- A save keeps three cues: previous, current, and next, as in the Subtitle Strip.
- One Card per lemma and Learning Language, with up to three Encounters shown in rotation. The schedule belongs to the word.
- Opening a saved word in a new sentence adds an Encounter automatically, without changing its schedule.
- Free users see Word Entry senses. They were already paid for at lookup, and Premium still adds the Meaning.
- A Card has one face.
- The Card title is the marked word.
- The dictionary opens on demand from the Card's top-right corner, separately from the translation and the marked word.
- Learned and permanent deletion are two separate actions.
- The context is translated as one text and shown as one paragraph.
