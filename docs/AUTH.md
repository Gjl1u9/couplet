# Sign-in

Google sign-in through Supabase Auth. The background script owns the session, in `chrome.storage.local`, and pages and video tabs ask it through [`messages.ts`](../src/lib/auth/messages.ts).

## Flow

1. Supabase returns Google's address, using a PKCE challenge.
2. `chrome.identity.launchWebAuthFlow` opens it. Closing the window is not an error.
3. Google returns to Supabase, which returns to `https://<extension-id>.chromiumapp.org/` with a code.
4. The background script exchanges the code for a session. Tokens refresh when read, because timers stop with the background script.

Signing out clears this device only, and keeps its words, which stay out of sight until someone signs in again. They are not tied to an account until words move to the cloud, so any account signed in on this browser sees them.

## Where it asks

| Place         | Needs an account                       | Sign-in entry                                |
| ------------- | -------------------------------------- | -------------------------------------------- |
| Subtitles     | No                                     | None                                         |
| Lookup        | No                                     | None. See [`LOOKUP.md`](LOOKUP.md)           |
| Saving a word | Yes                                    | The Sign-in Toast, at the player's top right |
| Dashboard     | Yes                                    | A sign-in page in place of every route       |
| Toolbar popup | Only for review and the Dashboard link | Account row                                  |

## Accounts and addresses

| Item              | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Extension ID      | `pnjdidlglcbbnfhcnhmhndoakdphhckj`, pinned by `key` in `wxt.config.ts` |
| Supabase project  | `pfgymrsdimvrhaevndtk`                                                 |
| GCP project       | `project-nov-513914`, OAuth client `Couplet Web`                       |
| Google redirect   | `https://pfgymrsdimvrhaevndtk.supabase.co/auth/v1/callback`            |
| Supabase redirect | `https://pnjdidlglcbbnfhcnhmhndoakdphhckj.chromiumapp.org/`            |

The Supabase URL and publishable key are public. The Google Client Secret lives only in Supabase. A Supabase secret key must never enter the extension.

## Before launch

- Keep the Google Cloud project active after its trial ends. The trial is due to end around 2026-11-16, and this project holds the OAuth client.

The Google app has been In production since 2026-11-07. Only non-sensitive scopes and no logo mean it needs no verification. Its branding isn't verified, so the consent screen shows the Supabase address rather than Couplet's name until the domain is verified and the branding submitted.
