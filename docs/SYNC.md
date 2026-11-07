# Sync

Words are saved on the device first, then synced to Supabase. Every screen reads the device's copy, so saving and reviewing never wait for the network.

**Status:** built in the extension. The website Dashboard is not built. See [Verification](#verification).

## Core rules

1. **Local first.** A write commits to the local database and updates the screen. Sync follows in the background.
2. **Sign-in pulls first.** On sign-in, the device pulls the cloud's data into the local database, then renders.
3. **Merge, never overwrite.** Local and cloud copies always merge by the rules below, in both directions.
4. **Every device ends up the same.** Once all devices have synced, they hold identical data, whatever order the changes arrived in.
5. **A failed sync costs nothing.** Unsent changes stay queued and retry, and the user keeps working.

## What must always hold

The simulation checks each of these. Each needs a matching test in the real code.

| #   | Invariant                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| I1  | **Convergence:** after everyone syncs, all devices and the server hold byte-identical word documents and the same visible reviews. |
| I2  | **Merge laws:** merging is commutative, associative, and idempotent, so order and repeats cannot change the result.                |
| I3  | **No lost reviews:** a review survives unless it was undone or its word's life was deleted.                                        |
| I4  | **No resurrection:** a deleted word stays deleted unless saved again after the deletion.                                           |
| I5  | **No lost re-save:** a word saved after its deletion stays saved, unless deleted again.                                            |
| I6  | **The server never loses data:** an accepted push contains everything the server already held.                                     |
| I7  | **Nothing unqueued:** with an empty outbox, the server already holds everything the device has.                                    |
| I8  | **Cause before effect:** anything written after seeing a change sorts after it, however wrong the clocks are.                      |
| I9  | **Undo sticks:** an undone review never returns.                                                                                   |
| I10 | **Limits:** a live word has one to three Encounters, with no two from the same moment.                                             |

## Identity

- **User:** the Supabase user ID. Each user has their own local database, `couplet-<userId>`, so two accounts on one browser never see each other's words.
- **Device:** a random ID, stored once per install and per website.
- **Word:** `wordId`, the existing `<language>:<lemma>`. The same word saved on two devices is one word.
- **Review event:** a new random `id`. Existing events get `<wordId>:<at>`.

## Stamps

Device clocks can be wrong, so ordering uses a **stamp**, a hybrid logical clock that sorts as text:

```text
<milliseconds, 14 digits>-<counter, 5 digits>-<deviceId>
```

- A new stamp uses `max(corrected clock, newest stamp seen)`, and increases the counter on a tie.
- Reading a stamp from the cloud updates "newest stamp seen". This gives I8.
- **Corrected clock** is the device clock plus the offset measured from the server's time on each sync. It narrows the wrong-clock window in the next section.

## The word document

A word is stored as one document. It is built to merge, then read through a **view** that gives the app the `SavedWord` it uses today.

```ts
interface WordDoc {
  schema: 3;
  id: string;
  /** The newest deletion. It kills every life with a birth at or before it. */
  deleted: Stamp | null;
  /** Keyed by birth stamp. Usually one; two when two devices first save it offline. */
  lives: Record<Stamp, WordLife>;
}

interface WordLife {
  birth: Stamp;
  savedAt: number;
  entry: { stamp: Stamp; value: WordContent }; // lemma, phonetic, senses, source, target
  review: { stamp: Stamp; value: ReviewState };
  forms: string[]; // Sorted
  encounters: Encounter[]; // Newest first, at most three
}

interface ReviewEventDoc extends ReviewEvent {
  id: string;
  /** The life this review belongs to. */
  wordBirth: Stamp;
  undone: boolean;
}
```

## Merge rules

To merge two copies of a word:

| Part          | Rule                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `deleted`     | The later stamp                                                                                                  |
| `lives`       | Union by birth, dropping every life with a birth at or before `deleted`                                          |
| `savedAt`     | The earlier time, within a life                                                                                  |
| `entry`       | The later stamp, within a life                                                                                   |
| `review`      | The later stamp, within a life                                                                                   |
| `forms`       | Union, sorted                                                                                                    |
| `encounters`  | Union by ID, then one per moment (video and cue text) keeping the newest, then the newest three. Ties sort by ID |
| `translation` | Per Encounter: any value beats `null`; two values keep the greater as text                                       |

To merge two copies of a review event, `undone` is true if either copy says so. An event is **visible** when it is not undone and its `wordBirth` is after the word's `deleted`.

**View:** a word is live when it has a life. Across its lives, the view takes the latest `review` and `entry`, the union of `forms`, the earliest `savedAt`, and Encounters by the rule above. If the winning Encounter has no translation and another from that moment does, the view shows that one.

Keeping lives separate is what makes deletion safe. A single merged word could not tell which parts a deletion should remove, and the merge laws broke when tried.

### What this means for the user

| Situation                                              | Result                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Both devices save the same new word offline            | One word, with both sentences, up to three                        |
| Both devices grade the same word offline               | The later grade sets the schedule. Both reviews count in Progress |
| One deletes while another grades offline               | Deleted. The grade is discarded                                   |
| One deletes, then another that has seen it saves again | A new word from level 0, without the old history                  |
| One retires while another grades offline               | The later action wins                                             |
| A word met in a new sentence on another device         | The sentence is added, and the schedule stays                     |

## Every write

Each write runs in one local transaction with its outbox entry, so a crash cannot separate them.

| Operation         | Today's method            | Change to the document                                                 | Event                     |
| ----------------- | ------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| Save a new word   | `save`                    | New life, born with a new stamp. Keeps `deleted`                       | None                      |
| Save a known word | `save`                    | As Add Encounter                                                       | None                      |
| Add Encounter     | `addEncounter`            | Add to the newest life's `encounters` and `forms`                      | None                      |
| Fill translation  | `setTranslation`          | Set on that Encounter, in whichever life holds it                      | None                      |
| Grade             | `grade`                   | New `review` with a new stamp, on the newest life                      | New event                 |
| Retire            | `retire`                  | New `review` with a new stamp                                          | None                      |
| Restore           | `restore`                 | New `review` with a new stamp                                          | None                      |
| Undo              | `revert`                  | Earlier `review` with a **new** stamp. Refused if the word has changed | Sets `undone`, if a grade |
| Delete            | `remove`, `removeByLemma` | `deleted` set to a new stamp, `lives` emptied                          | Removed locally           |

These change current behaviour on purpose:

- `setTranslation` and `revert` must enter the outbox. Today they do not change `updatedAt`, so a timestamp-based sync would miss them.
- Undo only applies when the word's review stamp is still the one its grade wrote. Otherwise another device has moved on, and Review shows 「Changed on another device」 instead of overwriting it.
- Undo marks the event `undone` instead of removing it, because a removed event would return from another device.
- Encounters may not exceed three after a merge, as today. An Encounter pushed out is gone.

## Local storage

IndexedDB, one database per user, because it has per-record writes and transactions across stores. Today's model rewrites the whole word list on every save.

| Store    | Key           | Holds                                     |
| -------- | ------------- | ----------------------------------------- |
| `words`  | `id`          | `WordDoc`, plus the cloud's last `rev`    |
| `events` | `id`          | `ReviewEventDoc`                          |
| `outbox` | kind and `id` | What to push, with a version number       |
| `meta`   | key           | Pull cursor, newest stamp seen, last sync |

- The background script is the only writer, as it is today. Pages and video tabs use messages.
- Content scripts cannot read IndexedDB, so each commit also writes a `vocabularyRevision` counter to `chrome.storage.local`. Existing listeners use that to refresh subtitle marks and pages.
- The extension needs the `unlimitedStorage` and `alarms` permissions.
- **Signed out:** no database is open. Lists are empty, subtitles have no Saved Word marks, and the star offers sign-in.

### Moving existing data

On the first sign-in on a browser, the `vocabulary` and `reviewLog` keys in `chrome.storage.local` move into that user's database, then are deleted, in one retryable step. Later accounts on that browser start empty.

## Cloud storage

```sql
create table words (
  user_id           uuid not null references auth.users on delete cascade,
  word_id           text not null,
  doc               jsonb not null,
  rev               bigint not null default 1,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, word_id),
  check (pg_column_size(doc) < 65536)
);

create table review_events (
  user_id           uuid not null references auth.users on delete cascade,
  id                text not null,
  word_id           text not null,
  word_birth        text not null,
  doc               jsonb not null,
  undone            boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (pg_column_size(doc) < 4096)
);

create index on words (user_id, server_updated_at);
create index on review_events (user_id, server_updated_at);
```

Row Level Security limits both tables to `auth.uid() = user_id`. Clients change data only through these functions, which run as the caller:

**`push_words(items)`** handles up to 100 `{ word_id, doc, base_rev }`, each in turn:

- If the row's `rev` equals `base_rev`, or there is no row and `base_rev` is 0, it stores `doc` and increases `rev`.
- Otherwise it returns the current `doc` and `rev`, and stores nothing. This gives I6.
- When `doc.deleted` is set, it deletes the user's events for that word with `word_birth <= doc.deleted`. Deleted content must not stay on the server.

**`push_events(items)`** handles up to 500 events:

- New events are inserted. On a repeat, `undone` becomes `old OR new`.
- An event already covered by the word's tombstone is dropped.

Both return the server's time. Row size checks stop a bug or a modified client from filling the database. A modified client can only damage its own account's rows, so clients still validate documents they read.

Stamps compare with `collate "C"`, as JavaScript compares them. The database's locale, `en_US`, sorts differently, and the two sides must agree on what a deletion covers.

One bad row is rejected on its own, so it cannot block the rest. NUL is removed before saving, because Postgres cannot store it, and the API would refuse the whole request.

A tombstone stays forever in v1, so a device that was offline for months still learns of the deletion. Deleting the account removes everything.

## The sync cycle

One cycle runs at a time, in the background script:

1. **Pull.** Fetch rows with `server_updated_at >= cursor - 5 minutes`, in pages, ordered by time and ID.
2. **Merge** each row into the local database in its own transaction, comparing by content and not key order, because Postgres reorders `jsonb` keys. Record its `rev`. If the result differs from the cloud's copy, queue it to push.
3. **Save the cursor** only after the last page. A crash repeats the pull, which is harmless.
4. **Push** the outbox, words first, then events.
5. **On a conflict,** merge the returned `doc`, record its `rev`, and retry up to five times in that cycle.
6. **On success,** clear an outbox entry only if its version is unchanged. A write that arrived during the push stays queued. This gives I7.

The five-minute overlap covers transactions that commit out of timestamp order. It costs only repeated merges, which change nothing.

### When a cycle runs

| Trigger                  | Timing                              |
| ------------------------ | ----------------------------------- |
| Sign-in                  | At once, and rendering waits for it |
| A local write            | Two seconds later, so bursts batch  |
| Dashboard or popup opens | At once, without waiting to render  |
| Background script starts | At once, if signed in               |
| Alarm                    | Every five minutes, if signed in    |

Failures back off through 30 seconds, 2 minutes, and 10 minutes, to the alarm's schedule. Any write or page open resets this.

### Failure handling

| Failure                   | Behaviour                                                                             | Status in Settings                        |
| ------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Background not answering  | The failure screen names the reason. Reloading the extension fixes a stale background | None                                      |
| Offline or server error   | Keep the outbox and retry                                                             | 「Offline. Changes will sync later.」     |
| Token expired             | Refresh it and retry                                                                  | None                                      |
| Refresh refused           | Sign out, keeping the local database and outbox                                       | The sign-in page                          |
| Row too large or rejected | Skip that row and keep syncing the rest                                               | 「Couldn't sync some words.」             |
| Newer `schema` from cloud | Stop syncing this user and overwrite nothing                                          | 「Update the extension to keep syncing.」 |
| Local database full       | The write fails, and the screen says so                                               | The existing save error                   |

## Flows

### Signing in

1. Open the user's database, and move existing data if this is the first sign-in on the browser.
2. **First sign-in for this user on this device:** show 「Loading your words…」 and run a full pull.
   - On failure, show 「Couldn't load your words.」 and 「Try again」. An empty list would look like lost words.
3. **Returning user:** pull too, for up to three seconds, then show local data and let the pull finish behind it.
4. Render, then push the outbox.

A later visit while still signed in renders local data at once and syncs behind it.

### Saving from the Sign-in Toast

The user signs in, then the word saves through the normal path. The merge rules make this safe while the first pull is running: if the word is already in the cloud, it becomes one word.

### Signing out

1. Try one sync, for up to five seconds.
2. Clear the session. The local database stays, closed.
3. If changes remain unsent, say 「Some changes haven't synced. They'll sync when you sign in here again.」

Signing back in as that user sends them.

### Reviewing while a sync arrives

A Card keeps showing. Grading uses the word's latest local state. A word deleted elsewhere is handled as today: 「bank was deleted」, and the session moves on.

### Dashboard on the website

The website runs the same sync engine with its own IndexedDB and device ID, so it follows every rule here. It reaches the extension through the cloud, so a change appears elsewhere on that device's next cycle, at most five minutes later, or at once when its page opens.

## Decisions made

- **Sign-in waits for the pull,** as the product owner specified, with a three-second limit for returning users so a slow network cannot lock them out of their own words.
- **One document per word, with conditional writes.** A merge on the server would need the rules twice, in SQL and TypeScript.
- **Polling instead of Realtime.** Words rarely change on two devices within minutes, and it needs no open connection.
- **IndexedDB instead of `chrome.storage.local`.**
- **Delete beats a concurrent grade.** Deleting is an explicit choice, and grading an unwanted word is not a reason to keep it.
- **Signed-out data stays on the device.** Removing it could destroy unsynced work. A shared computer needs a "remove from this device" action, which is left for later.

## Known limits

- **A badly wrong clock.** If a device's clock is ahead when it deletes offline, and another device saves the word before seeing that, the deletion can win. The corrected clock narrows this but cannot close it for a device that never reached the server.
- **Concurrent grades.** The later grade sets the schedule, and the other only counts in Progress. Replaying both would be fairer, but retire and restore are not events.
- **Tombstones are never removed.** Each costs a small row.
- **Uninstalling with unsent changes loses them.** Only synced data can return.

## Verification

Each layer checks what the others cannot.

| Layer         | Run                                                                         | Covers                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design model  | `node prototype/sync-simulation.mjs`                                        | The merge rules, before any code existed                                                                                                                          |
| Real code     | `npx vitest run src/lib/sync`                                               | Three devices with random writes, skewed clocks, going offline, lost requests and responses, and racing cycles, against a stand-in with the same rules as the SQL |
| Real database | [`supabase/tests/rules.sql`](../supabase/tests/rules.sql) in the SQL Editor | Row Level Security between two accounts, conditional writes, deletion, stamp order, bad rows, and a real document. It rolls itself back                           |

**To trust a pass, it must also fail when the code is wrong.** Removing each of these made the real-code tests fail: comparing by content, the outbox version check, merging on pull, reading stamps from the cloud, filtering old lives, sticky `undone`, queuing Undo, conditional writes, re-pushing merged results, keeping tombstones on re-save, and keeping the newest per moment.

### Checked by hand on 2026-11-07

- **Real account, real Supabase:** a save reached the cloud, removing left a tombstone with no content, saving again kept the tombstone with a new life, and restarting the background script did not raise `rev`.
- **Two real browser profiles, against a stand-in for the API** ([`sync-e2e`](../prototype/sync-e2e/run.mjs))**:** real IndexedDB and background script, covering a second device's first sign-in, offline writes on both, delete against an offline grade, re-saving, stopping the background script with unsent work, two accounts on one browser, and signing out with unsent work.

### Not yet checked

- Two devices on a real account. Pull has only run against a real account with this device's own rows.
- Grading and Undo on a real account. The database tests cover their rows.
- The alarm firing over a long period, and a list of thousands of words.

## Out of scope

Realtime updates, sharing, restoring deleted words, version history, removing tombstones, and syncing settings. Settings stay per device.
