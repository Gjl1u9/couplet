-- Cloud storage for docs/SYNC.md.

create table public.words (
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  word_id           text not null,
  doc               jsonb not null,
  rev               bigint not null default 1,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, word_id),
  check (pg_column_size(doc) < 65536),
  check (doc ->> 'id' = word_id)
);

create table public.review_events (
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  id                text not null,
  word_id           text not null,
  word_birth        text not null,
  doc               jsonb not null,
  undone            boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  check (pg_column_size(doc) < 4096)
);

create index words_pull on public.words (user_id, server_updated_at, word_id);
create index review_events_pull on public.review_events (user_id, server_updated_at, id);
create index review_events_word on public.review_events (user_id, word_id);

alter table public.words enable row level security;
alter table public.review_events enable row level security;

create policy "own words" on public.words
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own review events" on public.review_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.words, public.review_events from anon;

-- The time devices correct their clocks against.
create function public.sync_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select clock_timestamp() $$;

-- Stores each word only if it was built on the current version. Otherwise it returns the
-- current version for the caller to merge, so no push can lose what the server holds.
create function public.push_words(items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item jsonb;
  results jsonb := '[]'::jsonb;
  new_rev bigint;
  current_doc jsonb;
  current_rev bigint;
  tombstone text;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_array_length(items) > 100 then
    raise exception 'Too many words' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(items) loop
    begin
      new_rev := null;
      if (item ->> 'base_rev')::bigint = 0 then
        insert into public.words (user_id, word_id, doc)
        values (caller, item ->> 'word_id', item -> 'doc')
        on conflict (user_id, word_id) do nothing
        returning rev into new_rev;
      else
        update public.words
        set doc = item -> 'doc',
            rev = rev + 1,
            server_updated_at = clock_timestamp()
        where user_id = caller
          and word_id = item ->> 'word_id'
          and rev = (item ->> 'base_rev')::bigint
        returning rev into new_rev;
      end if;

      if new_rev is not null then
        tombstone := item -> 'doc' ->> 'deleted';
        if tombstone is not null then
          delete from public.review_events
          where user_id = caller
            and word_id = item ->> 'word_id'
            and word_birth collate "C" <= tombstone collate "C";
        end if;
        results := results || jsonb_build_object(
          'word_id', item ->> 'word_id', 'status', 'stored', 'rev', new_rev
        );
      else
        select w.doc, w.rev into current_doc, current_rev
        from public.words w
        where w.user_id = caller and w.word_id = item ->> 'word_id';
        results := results || jsonb_build_object(
          'word_id', item ->> 'word_id',
          'status', 'conflict',
          'rev', coalesce(current_rev, 0),
          'doc', current_doc
        );
      end if;
    -- One bad row must not block the rest. It stays queued on the device.
    exception when others then
      results := results || jsonb_build_object(
        'word_id', item ->> 'word_id', 'status', 'rejected'
      );
    end;
  end loop;

  return jsonb_build_object('results', results, 'server_time', clock_timestamp());
end;
$$;

-- Events only grow, and undone only turns on. Events a tombstone covers are dropped.
create function public.push_events(items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item jsonb;
  tombstone text;
  rejected jsonb := '[]'::jsonb;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_array_length(items) > 500 then
    raise exception 'Too many events' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(items) loop
    begin
      select w.doc ->> 'deleted' into tombstone
      from public.words w
      where w.user_id = caller and w.word_id = item ->> 'word_id';

      -- Stamps compare as the app compares them, whatever the database's locale.
      if tombstone is null or (item ->> 'word_birth') collate "C" > tombstone collate "C" then
        insert into public.review_events (user_id, id, word_id, word_birth, doc, undone)
        values (
          caller,
          item ->> 'id',
          item ->> 'word_id',
          item ->> 'word_birth',
          item -> 'doc',
          coalesce((item ->> 'undone')::boolean, false)
        )
        on conflict (user_id, id) do update
        set undone = public.review_events.undone or excluded.undone,
            server_updated_at = case
              when public.review_events.undone or not excluded.undone
                then public.review_events.server_updated_at
              else clock_timestamp()
            end;
      end if;
    -- One bad row must not block the rest. It stays queued on the device.
    exception when others then
      rejected := rejected || to_jsonb(item ->> 'id');
    end;
  end loop;

  return jsonb_build_object('rejected', rejected, 'server_time', clock_timestamp());
end;
$$;

revoke all on function public.sync_now(), public.push_words(jsonb), public.push_events(jsonb)
  from public, anon;
grant execute on function public.sync_now(), public.push_words(jsonb), public.push_events(jsonb)
  to authenticated;
