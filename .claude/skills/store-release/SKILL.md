---
name: store-release
description: Cut a release, load a build in Chrome to test it, or submit to the Chrome Web Store. Use for version bumps, tags, deploys, unpacked builds, store listing text, review, and promo videos.
---

# Store release

[`docs/RELEASING.md`](../../../docs/RELEASING.md) holds the release commands, and [`docs/STORE_LISTING.md`](../../../docs/STORE_LISTING.md) holds every word and image the dashboard takes. For a promo video, read [`VIDEO.md`](VIDEO.md).

A change reaches people through four **gates**, and passing one says nothing about the next. Name the gate whenever you report progress.

| Gate      | Means                             | Proved by                               |
| --------- | --------------------------------- | --------------------------------------- |
| Merged    | It is on `main`                   | `git log origin/main`                   |
| Deployed  | The Worker and website run it     | Live responses match `main`             |
| Released  | A `v<version>` tag and GitHub zip | `gh release view`                       |
| Published | The store serves it, after review | The public store page shows the product |

## 1. Find where things stand

Check all four gates, and the shared folder:

- `git status`, and whether another session is working here. If one is, ask the person before branching or switching in this folder.
- The public page: `curl -sL -A "Mozilla/5.0" https://chromewebstore.google.com/detail/pnjdidlglcbbnfhcnhmhndoakdphhckj | grep -c Couplet`. Zero, or a redirect to `empty-title`, means it isn't public. The dashboard's `Draft` status means the same.

Done when you can name the furthest gate each change has passed.

## 2. Test on real YouTube

Automation gets empty captions, so the person runs this part, from the build table below. Give them the exact folder and the steps to load it.

Done when the person confirms the feature works in their Chrome. Name anything still untested, such as a call that needs a real account.

## 3. Cut the release

Follow `RELEASING.md`. A new feature bumps the minor version.

- Auto-merge is off for this repo, so merge once CI passes on the head commit: `gh pr merge --merge --match-head-commit <sha>`. The person may have merged already, so read the PR's state first.
- Before tagging, confirm the merged tree matches the head you checked, and that the tag doesn't exist.

Done when `gh release view v<version>` shows the zip.

## 4. Deploy what changed

Merging deploys nothing. Deploy the Worker when `worker/` or `src/lib/lookup/` changed, and the website when `site/` changed, with the commands in [`docs/LOOKUP.md`](../../../docs/LOOKUP.md).

Done when live pages hash the same as `site/public`, and the Worker's version shows the expected settings.

## 5. Hand over the store steps

Only the person can upload, paste, and submit. Give them one ordered list, with the text ready to copy. Afterwards, the public page has to show the product before anything is announced.

Done when the person has submitted, and you have said what stays unavailable until review passes.

## Builds

| Folder                | Build with      | Card name         | Use                         | Catch                                      |
| --------------------- | --------------- | ----------------- | --------------------------- | ------------------------------------------ |
| `dist/chrome-mv3-dev` | `npm run dev`   | `Couplet (dev)`   | Testing while changing code | Its pages turn blank when the server stops |
| `dist/chrome-mv3`     | `npm run build` | `Couplet (local)` | Testing without a server    | Rebuild to see changes                     |

The store package is the zip on the GitHub release, which CI builds. Loaded unpacked, it has another extension ID, so Google sign-in fails.

## Loading a build

- Pressing reload on the extension's card reloads its old folder. To change folders, use **Load unpacked**.
- The folder picker hides `.claude`. For a build in a worktree, press `Cmd + Shift + G` and paste the path.
- A build's folder name repeats in every checkout, so give the full path.
- Each Chrome profile keeps its own folder. Load it in the profile the person is watching in, then refresh the YouTube tab.
- The extension's **Loaded from** line is the truth. Chrome's preference files lag behind it.
- If a feature seems missing, compare the commit on the card's version line with `git log` first, then `grep -c "<a string from the feature>"` on the build the card names.

## Store text

| Field                     | Lives in                    | Changing it takes          |
| ------------------------- | --------------------------- | -------------------------- |
| Name, summary             | `public/_locales`           | A new package              |
| Description, per language | The dashboard               | A paste, and review        |
| Language menu             | Locales in the uploaded zip | A package with that locale |

- Keep where data goes and the non-affiliation sentence in every description, because the rejection table in `STORE_LISTING.md` relies on them.
- List only features you can point to in the code. Other products' listings can suggest a structure, never claims or wording.
- Before saying what the dashboard can do, read [the store's documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), or ask for a screenshot.

## Testing languages

`--lang` is ignored on macOS, where Chromium follows the system language. Local builds show a fixed name, so test the store's name and summary on an unzipped copy of the release zip: to test the default locale, remove the other locales from it first.
