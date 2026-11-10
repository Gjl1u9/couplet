# Dashboard spec

The Dashboard is an extension page in React with Home, Review, Words, Progress, and Settings. Review behaviour is in [`REVIEW.md`](REVIEW.md), and visual rules are in [`DESIGN.md`](DESIGN.md). The interface is in English, and the whole product is free for launch.

A feature belongs here only if removing it causes a problem nothing else solves. Each one states that problem, what it does, and what it touches.

## Shell

| Feature      | Without it                                        | What it does                                                   | Interacts with                                             |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Side rail    | Pages can only be reached by URL                  | Home, Review with its due count, Words, Progress, and Settings | Stays during Review; moves to the bottom on narrow windows |
| Theme switch | The page cannot match a dark room or a preference | Flips light and dark; Settings also offers System              | Saved in settings and applied on every page                |

The Learning Language in Settings filters every page, because each language has its own list. Only the review streak spans languages, because it measures the habit.

**Done when:** every destination is reachable by keyboard, and no page scrolls sideways at 360px.

## Home

| Feature        | Without it                                  | What it does                                                                                                                                 | Interacts with                     |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Ready count    | The user has to work out what to do         | States what is due and starts Review                                                                                                         | Falls as words are graded          |
| Three numbers  | Progress cannot be felt at a glance         | Review streak, under it the best streak; Known words as a ring of those saved; words reviewed today, under it the reviews of the last 7 days | Read the Vocabulary and review log |
| Recently saved | A word just saved cannot be checked quickly | The eight newest saves, about one video's worth, linking to their details                                                                    | Opens the word in Words            |

**Done when:** a new user sees how to start, and a user with due words starts Review in one click.

## Progress

| Feature          | Without it                                                  | What it does                                                      | Interacts with                           |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| Words you know   | The user cannot tell whether saved words are becoming known | Known out of saved, with New, Learning, and Known in one bar      | Each stage links to that filter in Words |
| Review intervals | A word's place on the schedule is invisible                 | Counts words on each interval                                     | Moved by grades                          |
| Next 7 days      | A pile of due words arrives without warning                 | One bar per day. Today includes overdue words                     | Reads `dueAt`; grades reshape it         |
| Review activity  | A habit stays invisible, so a missed day costs nothing      | Twelve weeks of squares, darker for more reviews, plus the streak | Reads the review log                     |
| Hard words       | The words needing most help look like all the others        | Up to five, with how often they were forgotten                    | Opens the word in Words                  |

### Definitions

- **Stages:** New has never been reviewed. Learning has been reviewed and its interval is under 30 days. Known has an interval of at least 30 days, or is Retired. A word reaches Known by surviving the 14-day wait: at best, the fourth review on day 24. Forgetting a Known word moves it back, so the count can fall.
- **Review intervals:** a word's current interval, not a countdown. A word on the 3-day interval stays in that row when two days remain. Next 7 days shows actual dates.
- **Hard Word:** on the schedule, graded Forgot at least twice in the last 30 days, and below level 3.
- **Today in Next 7 days:** words due now plus words due later today. Its tooltip separates the two.

**Done when:** every number comes from stored data, and each list explains itself when empty.

## Words

| Feature                   | Without it                                                                    | What it does                                                             | Interacts with                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search                    | A long list cannot be used to find one word                                   | Matches words, saved forms, and video titles                             | Combines with the stage filter                                                                                                                    |
| Stage filter              | The user cannot separate what they are learning from what they know           | All, New, Learning, Known                                                | Same definitions as Progress                                                                                                                      |
| By date or by video       | Words cannot be recalled through the video they came from                     | Today, Yesterday, Earlier; or by the newest sentence's video             | Uses each word's Encounter                                                                                                                        |
| Word row                  | Nothing shows what is saved or when it returns                                | Word or phrase, video, stage, and next review. Meanings stay hidden      | Clicking opens its details. A phrase stops at two lines                                                                                           |
| Level Track               | The user cannot see how far a word has come                                   | Seven dots and the current interval                                      | Same as the Review Card                                                                                                                           |
| Dictionary button         | Meanings would crowd the list                                                 | Opens the senses and Pronunciation on demand                             | Same senses as the Lookup Panel                                                                                                                   |
| Sentences                 | The word loses the context it was met in                                      | Up to three, each with translation and video link                        | Nearby lines collapse, and start collapsed                                                                                                        |
| I know this, Review again | A known word keeps returning, and a retired one can never return              | Retires or restores the word, then shows the Answer pill with Undo       | Changes the queue, stages, and subtitle marks                                                                                                     |
| Remove                    | A mistaken save stays in the list and statistics forever                      | Removes the word and its reviews after a confirmation                    | Removes it from Home, Review, and subtitle marks                                                                                                  |
| Explain with AI           | A sentence stays unclear when the translation and dictionary don't explain it | Two or three sentences on meaning, part of speech, and grammar, 50 a day | Sends up to three lines to the AI service, as the Lookup Panel does, so either one's answer is cached for the other. See [`LOOKUP.md`](LOOKUP.md) |
| Export                    | Users cannot take their words elsewhere                                       | Downloads the words shown as CSV, in UTF-8 with a BOM                    | Respects search and filter; formulas are neutralized                                                                                              |

**Done when:** a saved word can be found, inspected, retired, restored, removed, and exported with the keyboard.

## Settings

| Feature               | Without it                                                         | What it does                        | Interacts with                       |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------- | ------------------------------------ |
| Account               | Saved words and reviews need to know whose they are                | Signs in or out with Google         | Words stay on the device either way  |
| Learning language     | Another language's words stay out of reach without opening a video | Selects the list and subtitle track | Shared with the Settings Panel       |
| Native language       | Translations stay in the wrong language                            | Selects translations for new saves  | Saved words keep theirs              |
| Theme                 | The Dashboard cannot be set apart from the system                  | System, Light, or Dark              | Same value as the rail's switch      |
| Lookup panel on video | The panel cannot match the user's video setting from here          | Dark or Light                       | Used only over video                 |
| Sounds                | The chime can only be changed while a video is open                | On or off, previewed when turned on | The save chime, and Review's answers |

Video-only options, such as subtitle size, stay in the Settings Panel.

The page uses the same compact menu as the Settings Panel, grouped as Account, Language, Appearance, and Lookup.

**Done when:** a change here reaches an open video tab without a reload.

## Toolbar popup

| Feature        | Without it                                            | What it does                                        | Interacts with                     |
| -------------- | ----------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Review count   | Due words stay out of sight until the Dashboard opens | Shows what is due and starts Review, once signed in | Follows the Learning Language      |
| Dual subtitles | Turning subtitles off needs a video open              | On or off for every video                           | Same setting as the Settings Panel |
| Product name   | Nothing in the extension leads to the product page    | Links to coupletapp.com in a new tab                | None                               |
| Account        | Signing in means finding Settings                     | The same Account group as Settings                  | Stays in step across pages         |
| Open Dashboard | The toolbar no longer opens it directly               | Opens the Dashboard in a new tab, once signed in    | Closes the popup                   |

**Done when:** a due word reaches Review in two clicks from the toolbar.

## Welcome Page

| Problem without it                                                                                     | What it does                                                                                                                                                                                                                                    | Interacts with                           |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A new user has wrong languages, and nothing tells them that subtitle words respond to clicks and drags | Opens once after install, with Native and Learning Language selects filled in from the browser, then four looping demonstrations: click a word, drag across a phrase, show nearby lines and drag across them, and start a review from the Popup | The install event, and language settings |

Saving has no demonstration of its own; the review step says it needs a Google sign-in. Updates and browser restarts don't open it, and nothing links back to it yet.

## Every state

| State        | Behaviour                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Signed out   | A sign-in page replaces every route, with no rail                                                                     |
| New          | Home explains the three steps: open a video, click a word, press the star                                             |
| New language | Every page except Settings says this language has no words, that the others are still here, and offers to switch back |
| Loading      | The shell holds its place and content appears when ready, without a flash of empty copy                               |
| Empty        | Each list says why it is empty and what to do                                                                         |
| Error        | Says what failed and what to do; a failed write keeps the screen and offers another try                               |

## Out of scope

| Left out                                          | Why                                                            |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Premium, payment, explanations on the Review Card | The product launches free, to ship quickly                     |
| Tasks, achievements, and daily goals              | Home stays minimal                                             |
| Video catalog                                     | A different product, with content to maintain                  |
| Watch time and efficiency                         | Needs new tracking                                             |
| Review frequency targets                          | Those suit adaptive schedulers; the ladder has fixed intervals |
| Daily limits, manual word entry, review by video  | Useful later, once real lists are large enough                 |
| Reviewing Hard words early                        | It felt like a detour; due words already come back             |

## Original design

Other dashboards informed the features and the general airy feel. Layout, wording, and visuals are our own:

| Common elsewhere                 | Ours                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Glossy white with soft gradients | Matte paper: warm tones, grain, and hairlines                                                        |
| Rounded sans-serif headings      | Serif headings and 5px corners                                                                       |
| Progress ring                    | Stages as one labelled bar on Progress; one small ring only for Home's Known share, beside its count |
| Blue accent                      | Vermilion                                                                                            |
| Icon-only rail                   | Icons with their names                                                                               |

## Decisions made

- Words will sync through Supabase, by the rules in [`SYNC.md`](SYNC.md). Until that ships, they stay on the device.
- The Dashboard requires sign-in, by the user's choice, even while words stay on the device.
- The toolbar opens a popup instead of the Dashboard, so the account and due count are one click away.
- Login is Google only. Email would add mail delivery. See [`AUTH.md`](AUTH.md).
- Every video title carries its site's icon, so adding Netflix needs only a new entry in `VideoTitle.tsx`.
- Language selects replace the browser's own, which could not match Paper or show a current-value check. The same control runs in the Settings Panel and on this page.
- Each language keeps its own list instead of merging or moving words: a mixed queue would blur statistics and interrupt reviews.
- 「I know this」 everywhere, on video, in Review, and in Words, replacing 「Stop reviewing」: all three Retire the word, and one name is easier to learn than two. 「Stop reviewing」 named the effect more exactly, since a word can be Known while still scheduled, so the hover hint and the message afterwards now say it: Known, and won't be reviewed again. Undo keeps the word's level, while 「Review again」 restarts it.
- 「Remove」 replaced 「Delete」: it is gentler, and the confirmation says what is cleared and that saving the word again brings it back, instead of promising it is gone for good.
- Review's feedback is a pill above the grade buttons, not a status at the top right: the eyes are on the buttons while grading, and an answer comes every few seconds, so it must be short-lived and replace itself. Words uses the same pill, floating at the bottom, so I know this looks the same wherever it is pressed, and the rectangular Toast is gone.
- Explain with AI also sits in the Lookup Panel, because a line is unclear while it plays, not later in Words. It sends what a save stores, so the two share one cached answer, and it asks only on a click, so lookups stay free of the allowance. The answer isn't stored with the word: the service's cache already makes Words free to ask, for 30 days.
- Each of Home's numbers has one line of context under it, never a second card: the best streak, kept after a streak breaks so the work behind it still shows; the share known, as a ring; and the week's reviews under today's words. Today is the number to act on, so it leads; the week is its context, with its own unit, so the two counts never read as one. Due now stays in the card above.
- The product icon appears on the toolbar and in the store, not in the rail, where it did not suit Paper.
- Filters and grouping are not remembered between visits, except the Review Card's collapsed context.
- By-video grouping uses each word's newest sentence, so a word appears once.
- CSV exports the words on screen, because search and filter already express what the user wants.
- CSV's Sentence column holds every line of the context, because its translation covers them all and can't be split. The link still goes to the word's own line.
- The Dictionary uses the page's theme, while the Lookup Panel on video keeps its setting.
- Words has a Pronunciation button inside the Dictionary. The Review Card keeps it beside the title.
- v1 learning languages are English, Spanish, French, German, Portuguese, Italian, Japanese, and Korean. Native languages are the 22 in `settings.ts`, which match LinGlass's list.
