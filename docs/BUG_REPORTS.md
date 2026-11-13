# Bug reports

People report a problem from inside the extension. The report goes through our Worker into Supabase, and we get an email.

**Status:** planned, not built. Decided on 9 November 2026 and put off for now.

## Flow

1. **Form.** A "Report a problem" form in the extension. The person picks a category, describes the problem, and may leave an email if signed out.
2. **Diagnostics.** The form attaches diagnostics and lists them, and the person can untick any of them.
3. **Send.** The background script posts to `https://api.coupletapp.com/v1/reports`. It sends the Supabase token when signed in, or the install ID when not.
4. **Worker.** It handles the report in this order:
   1. Verify the token with `jwt.ts` to get the user ID.
   2. Check the shape and lengths.
   3. Limit each subject to 5 reports a day, with the `Quota` Durable Object keyed `report:<subject>`.
   4. Insert the row with the service role key.
   5. Send an email notice in `waitUntil`.
5. **Reply.** The Worker returns `201` with the report ID, and the form shows it.

Reports are read in Supabase's Table Editor, filtered to `status = 'new'`. An admin page waits until there are enough reports to need one.

## Why through the Worker

- Writing from the extension straight to Supabase needs an insert policy for `anon`. Anyone with the public key could then flood the table, with no way to limit them.
- The Worker already verifies tokens and limits use, so the service role key stays on the server.

## Table

```sql
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users on delete cascade,
  contact_email text,
  category text not null check (category in ('subtitles', 'lookup', 'sign_in', 'sync', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  video_id text,
  diagnostics jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'triaged', 'fixed', 'wontfix'))
);
alter table public.bug_reports enable row level security;
-- No policies: only the Worker, with the service role, reads and writes.
```

`on delete cascade` keeps the privacy policy's promise that a person can ask us to delete everything.

## Diagnostics

The form collects only what helps reproduce a problem:

- Extension version, Chrome version, and interface language
- Learning and translation languages
- When opened from YouTube: the video ID, the current time, and whether the subtitle track is automatic or human-made

The first version takes no screenshots. They can show unrelated personal data, and they would need storage of their own.

## Before launch

- **Privacy policy:** add a row saying reports keep the message, the diagnostics, and an optional email in Supabase. They are deleted once resolved, or after a year.
- **Chrome Web Store:** check whether the Privacy tab needs another data type.
- **Worker:**
  - Add the `SUPABASE_SERVICE_ROLE_KEY` secret, and deploy.
  - For the email notice, add a `send_email` binding to a verified address.
- **Product page:** later, a form on the site can post to the same endpoint, signed out, limited by the network address hash. That needs CORS. The extension comes first, because only it can attach the video and subtitle details.
