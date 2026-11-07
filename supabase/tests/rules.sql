-- Checks the rules in docs/SYNC.md against the real database. Run it in the SQL Editor.
-- It always ends with an exception, which rolls back its fake users and every row:
-- "ALL PASSED" in that message is the good result.
do $test$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  r jsonb;
  n int;
  passed text[] := '{}';
  d jsonb := '{"schema":3,"id":"en:bank","deleted":null,"lives":{}}';
  real_doc jsonb := $json${"schema":3,"id":"en:real","deleted":null,"lives":{"01793983820185-00000-local":{"birth":"01793983820185-00000-local","savedAt":1793983820184,"entry":{"stamp":"01793983820185-00000-local","value":{"lemma":"real","phonetic":"/bæŋk/","senses":[{"meaning":"河岸","example":"It's a \"bank\".","translation":"這是河岸。"}],"source":"en","target":"zh-TW"}},"review":{"stamp":"01793983820186-00000-local","value":{"scheduler":"ladder-v1","level":2,"dueAt":1794243020186,"lastReviewedAt":1793983820186,"reviewCount":1,"retired":null}},"forms":["bank"],"encounters":[{"id":"fd9591c0","cues":[{"original":"before","startMs":1000},{"original":"the bank's edge 🙂","startMs":2000}],"currentCue":1,"translation":null,"form":"bank","formOffset":4,"origin":{"site":"youtube","videoId":"abc","title":"A \"title\" with 'quotes'"},"meaning":null,"savedAt":1793983820184}]}}}$json$;
  real_event jsonb := $json${"id":"ev-real","wordId":"en:real","wordBirth":"01793983820185-00000-local","undone":false,"encounterId":"fd9591c0","grade":"good","levelBefore":0,"levelAfter":2,"at":1793983820186}$json$;
  blocked boolean;
begin
  insert into auth.users (id, aud, role, email) values
    (a, 'authenticated', 'authenticated', 'rules-a@test.invalid'),
    (b, 'authenticated', 'authenticated', 'rules-b@test.invalid');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  if public.sync_now() is null then raise exception 'FAIL sync_now'; end if;
  passed := passed || 'sync-now'::text;

  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', d, 'base_rev', 0)));
  if r #>> '{results,0,status}' <> 'stored' or (r #>> '{results,0,rev}')::int <> 1 then raise exception 'FAIL insert %', r; end if;
  passed := passed || 'insert'::text;

  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', d, 'base_rev', 0)));
  if r #>> '{results,0,status}' <> 'conflict' or r #>> '{results,0,doc,id}' <> 'en:bank' then raise exception 'FAIL insert conflict %', r; end if;
  passed := passed || 'insert-conflict'::text;

  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', d, 'base_rev', 1)));
  if r #>> '{results,0,status}' <> 'stored' or (r #>> '{results,0,rev}')::int <> 2 then raise exception 'FAIL update %', r; end if;
  passed := passed || 'update'::text;

  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', d, 'base_rev', 1)));
  if r #>> '{results,0,status}' <> 'conflict' or (r #>> '{results,0,rev}')::int <> 2 then raise exception 'FAIL stale %', r; end if;
  passed := passed || 'stale-conflict'::text;

  -- A bad row is rejected on its own, and the rest of the batch still lands.
  r := public.push_words(jsonb_build_array(
    jsonb_build_object('word_id', 'en:x', 'doc', d, 'base_rev', 0),
    jsonb_build_object('word_id', 'en:big', 'doc', jsonb_build_object('id', 'en:big', 'x', (select string_agg(md5(i::text), '') from generate_series(1, 4000) i)), 'base_rev', 0),
    jsonb_build_object('word_id', 'en:bad-rev', 'doc', '{"id":"en:bad-rev"}'::jsonb, 'base_rev', 'nope'),
    jsonb_build_object('word_id', 'en:ok', 'doc', '{"id":"en:ok","deleted":null,"lives":{}}'::jsonb, 'base_rev', 0)
  ));
  if r #>> '{results,0,status}' <> 'rejected' or r #>> '{results,1,status}' <> 'rejected' or r #>> '{results,2,status}' <> 'rejected' or r #>> '{results,3,status}' <> 'stored' then raise exception 'FAIL bad rows %', r; end if;
  passed := passed || 'bad-row-isolated'::text;

  -- A document from the real code comes back unchanged.
  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:real', 'doc', real_doc, 'base_rev', 0)));
  if r #>> '{results,0,status}' <> 'stored' then raise exception 'FAIL real doc %', r; end if;
  if (select doc from public.words where word_id = 'en:real') <> real_doc then raise exception 'FAIL real doc changed'; end if;
  r := public.push_events(jsonb_build_array(jsonb_build_object('id', 'ev-real', 'word_id', 'en:real', 'word_birth', real_event ->> 'wordBirth', 'doc', real_event, 'undone', false)));
  if (select doc from public.review_events where id = 'ev-real') <> real_event then raise exception 'FAIL real event changed %', r; end if;
  passed := passed || 'real-document'::text;

  r := public.push_events(jsonb_build_array(
    jsonb_build_object('id', 'e1', 'word_id', 'en:bank', 'word_birth', '0005', 'doc', '{}'::jsonb, 'undone', false),
    jsonb_build_object('id', 'e2', 'word_id', 'en:bank', 'word_birth', '0009', 'doc', '{}'::jsonb, 'undone', false),
    jsonb_build_object('id', 'e-bad', 'word_id', 'en:bank', 'doc', '{}'::jsonb)
  ));
  if r -> 'rejected' <> '["e-bad"]'::jsonb then raise exception 'FAIL event rejected %', r; end if;
  select count(*) into n from public.review_events where word_id = 'en:bank';
  if n <> 2 then raise exception 'FAIL events %', n; end if;
  passed := passed || 'events'::text;

  r := public.push_events(jsonb_build_array(jsonb_build_object('id', 'e1', 'word_id', 'en:bank', 'word_birth', '0005', 'doc', '{}'::jsonb, 'undone', true)));
  r := public.push_events(jsonb_build_array(jsonb_build_object('id', 'e1', 'word_id', 'en:bank', 'word_birth', '0005', 'doc', '{}'::jsonb, 'undone', false)));
  if not (select undone from public.review_events where id = 'e1') then raise exception 'FAIL undone not sticky'; end if;
  passed := passed || 'undone-sticky'::text;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.words;
  if n <> 0 then raise exception 'FAIL B reads A words %', n; end if;
  select count(*) into n from public.review_events;
  if n <> 0 then raise exception 'FAIL B reads A events %', n; end if;
  passed := passed || 'isolation-read'::text;

  update public.words set doc = d where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updates A'; end if;
  delete from public.words where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deletes A'; end if;
  passed := passed || 'isolation-write'::text;

  blocked := false;
  begin
    insert into public.words (user_id, word_id, doc) values (a, 'en:evil', '{"id":"en:evil"}');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL B inserted for A'; end if;
  passed := passed || 'isolation-insert'::text;

  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', d, 'base_rev', 0)));
  if r #>> '{results,0,status}' <> 'stored' or (r #>> '{results,0,rev}')::int <> 1 then raise exception 'FAIL B own row %', r; end if;
  passed := passed || 'same-word-separate'::text;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:bank', 'doc', '{"id":"en:bank","deleted":"0007","lives":{}}'::jsonb, 'base_rev', 2)));
  if r #>> '{results,0,status}' <> 'stored' then raise exception 'FAIL tombstone %', r; end if;
  if exists (select 1 from public.review_events where id = 'e1') then raise exception 'FAIL covered event kept'; end if;
  if not exists (select 1 from public.review_events where id = 'e2') then raise exception 'FAIL newer event removed'; end if;
  passed := passed || 'tombstone-purges'::text;

  r := public.push_events(jsonb_build_array(jsonb_build_object('id', 'e3', 'word_id', 'en:bank', 'word_birth', '0006', 'doc', '{}'::jsonb, 'undone', false)));
  if exists (select 1 from public.review_events where id = 'e3') then raise exception 'FAIL late event kept'; end if;
  passed := passed || 'late-event-dropped'::text;

  -- Order follows the app's comparison, in which 'A' sorts before 'a'. The locale disagrees.
  r := public.push_words(jsonb_build_array(jsonb_build_object('word_id', 'en:case', 'doc', '{"id":"en:case","deleted":"0001-a","lives":{}}'::jsonb, 'base_rev', 0)));
  r := public.push_events(jsonb_build_array(jsonb_build_object('id', 'e-case', 'word_id', 'en:case', 'word_birth', '0001-A', 'doc', '{}'::jsonb, 'undone', false)));
  if exists (select 1 from public.review_events where id = 'e-case') then raise exception 'FAIL stamps compared by locale'; end if;
  passed := passed || 'stamp-order'::text;

  perform set_config('request.jwt.claims', '{}', true);
  blocked := false;
  begin
    r := public.push_words('[]');
  exception when others then
    blocked := SQLSTATE = '28000';
  end;
  if not blocked then raise exception 'FAIL no session allowed'; end if;
  passed := passed || 'needs-session'::text;

  perform set_config('role', 'anon', true);
  blocked := false;
  begin
    select count(*) into n from public.words;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL anon reads'; end if;
  blocked := false;
  begin
    r := public.push_words('[]');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'FAIL anon pushes'; end if;
  passed := passed || 'anon-blocked'::text;

  raise exception 'ALL PASSED (rolled back): %', array_to_string(passed, ', ');
end $test$;
