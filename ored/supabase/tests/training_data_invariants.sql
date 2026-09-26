-- Invariant checks for ored_training_data, ored_datasets snapshots and the
-- session/dataset link after 20260926120000_ored_training_data.sql.
--
-- Everything runs in one transaction that is rolled back, so it is safe to
-- run against the real project:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ored/supabase/tests/training_data_invariants.sql
--
-- It uses its own tag and dataset names (invariant_test_*).

begin;

create function pg_temp.expect_error(statement text, fragment text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(fragment in sqlerrm) = 0 then
      raise exception 'expected an error containing "%", got: %', fragment, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected this to fail, it succeeded: %', statement;
end;
$$;

-- 1. shape and security --------------------------------------------------------

do $$ begin
  perform 1 from pg_class where relname = 'ored_training_data' and relrowsecurity and relforcerowsecurity;
  if not found then raise exception 'ored_training_data must have RLS enabled and forced'; end if;
  perform 1 from pg_policies where tablename = 'ored_training_data';
  if found then raise exception 'ored_training_data must carry no policy'; end if;
  perform 1 from information_schema.role_table_grants
   where table_name in ('ored_training_data', 'ored_training_data_summary', 'ored_checkpoint_lineage')
     and grantee in ('anon', 'authenticated');
  if found then raise exception 'anon/authenticated must hold no grant on the training data'; end if;
  perform 1 from pg_constraint where conname = 'ored_datasets_name_version_key';
  if not found then raise exception 'ored_datasets must be unique on (name, version)'; end if;
  perform 1 from pg_constraint where conname = 'ored_datasets_name_key';
  if found then raise exception 'the old unique (name) constraint should be gone'; end if;
end $$;

-- 2. existing datasets untouched -------------------------------------------------

do $$ begin
  if exists (select 1 from public.ored_datasets where name in ('bit_addition', 'char_corpus')
             and (source <> 'generated' or version <> 1 or sha256 is not null)) then
    raise exception 'existing generated datasets changed';
  end if;
end $$;

-- 3. trigger normalises and fingerprints -----------------------------------------

insert into public.ored_training_data (id, type, category, subject, topic, input, output, dataset_tag, verified)
values ('00000000-0000-4000-8000-000000000001', ' QnA ', 'Science', 'Physics', 'Kinematics',
        'What is force?', 'Force is a push or pull.', 'invariant_test_tag', true);

do $$
declare r public.ored_training_data;
begin
  select * into r from public.ored_training_data where id = '00000000-0000-4000-8000-000000000001';
  if r.type <> 'qna' or r.category <> 'science' or r.subject <> 'physics' or r.topic <> 'kinematics' then
    raise exception 'classification fields were not normalised: % % % %', r.type, r.category, r.subject, r.topic;
  end if;
  if r.fingerprint <> public.ored_training_data_fingerprint('qna', 'science', 'physics', 'kinematics',
                                                         'What is force?', 'Force is a push or pull.', 'en') then
    raise exception 'fingerprint was not computed by the trigger';
  end if;
  -- the same value Python computes for this record (tests/test_training_data.py)
  if public.ored_training_data_fingerprint('qna', 'science', 'physics', 'mechanics', 'What is force?',
       'Force is a push or pull that can change the motion of an object.', 'en')
     <> 'b12318e879961de0c32c3af54784d09237d72a0ea817299433720c765bedb13b' then
    raise exception 'SQL and Python fingerprints disagree';
  end if;
end $$;

do $$ begin
  -- slugging keeps every letter (a stray escape once trimmed the "v" of "vocabulary")
  if public.ored_training_data_slug(E' Vocabulary\x0b') <> 'vocabulary'
     or public.ored_training_data_slug('Acids / Bases') <> 'acids_bases'
     or public.ored_training_data_slug('Active-Passive  Voice') <> 'active_passive_voice'
     or public.ored_training_data_slug('   ') is not null then
    raise exception 'ored_training_data_slug does not match ored.data.training_data.slug';
  end if;
end $$;

insert into public.ored_training_data (id, type, category, subject, input, output, language, dataset_tag)
values ('00000000-0000-4000-8000-000000000002', 'Vocabulary', 'language_foundation', 'Vowels',
        'river', 'A large stream of water.', ' EN-GB ', '  invariant_test_tag  ');

do $$
declare r public.ored_training_data;
begin
  select * into r from public.ored_training_data where id = '00000000-0000-4000-8000-000000000002';
  if (r.type, r.subject, r.language, r.dataset_tag) is distinct from
     ('vocabulary', 'vowels', 'en-gb', 'invariant_test_tag') then
    raise exception 'row was not normalised as expected: % % % %', r.type, r.subject, r.language, r.dataset_tag;
  end if;
end $$;

-- 4. duplicates and bad rows are refused ------------------------------------------

select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, subject, topic, input, output)
     values ('qna', 'science', 'physics', 'kinematics', '  What   is force? ', 'Force is a push or pull.')$q$,
  'ored_training_data_fingerprint_idx');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output) values ('poem', 'science', 'a', 'b')$q$,
  'ored_training_data_type_check');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output) values ('qna', 'astrology', 'a', 'b')$q$,
  'ored_training_data_category_check');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output) values ('qna', 'science', '   ', 'b')$q$,
  'ored_training_data_input_check');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output) values ('qna', 'science', 'a', E'b\x01')$q$,
  'ored_training_data_output_check');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output, dataset_tag) values ('qna', 'science', 'a', 'b', 'all')$q$,
  'ored_training_data_dataset_tag_check');
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output, metadata) values ('qna', 'science', 'a', 'b', '[]')$q$,
  'ored_training_data_metadata_check');

-- 5. an edit refingerprints and keeps created_at ----------------------------------

do $$
declare before public.ored_training_data; after public.ored_training_data;
begin
  select * into before from public.ored_training_data where id = '00000000-0000-4000-8000-000000000001';
  update public.ored_training_data set output = 'Force is a push or a pull.', created_at = now() - interval '1 day'
   where id = before.id;
  select * into after from public.ored_training_data where id = before.id;
  if after.fingerprint = before.fingerprint then raise exception 'editing output must change the fingerprint'; end if;
  if after.created_at <> before.created_at then raise exception 'created_at must not change on update'; end if;
end $$;

-- 6. snapshots: versioned, idempotent, immutable ------------------------------------

do $$
declare a public.ored_datasets; b public.ored_datasets; c public.ored_datasets;
begin
  a := public.ored_dataset_register(jsonb_build_object('name', 'invariant_test_ds', 'kind', 'text',
         'sha256', repeat('a', 64), 'record_count', 3, 'split_counts', '{"train": 2, "val": 1, "test": 0}'::jsonb));
  b := public.ored_dataset_register(jsonb_build_object('name', 'invariant_test_ds', 'kind', 'text',
         'sha256', repeat('a', 64), 'record_count', 3));
  c := public.ored_dataset_register(jsonb_build_object('name', 'invariant_test_ds', 'kind', 'text',
         'sha256', repeat('b', 64), 'record_count', 4));
  if a.id <> b.id then raise exception 'registering the same content twice must return the same row'; end if;
  if a.version <> 1 or c.version <> 2 then raise exception 'versions should be 1 then 2, got % and %', a.version, c.version; end if;
  if a.source <> 'supabase' then raise exception 'a registered snapshot is source supabase'; end if;

  update public.ored_datasets set storage_path = 'invariant_test_ds/' || repeat('a', 64) where id = a.id;
  perform pg_temp.expect_error(format(
    'update public.ored_datasets set record_count = 99 where id = %L', a.id), 'immutable');
  perform pg_temp.expect_error(format(
    'update public.ored_datasets set storage_path = %L where id = %L', 'elsewhere', a.id), 'already records');
  perform pg_temp.expect_error(
    $q$select public.ored_dataset_register('{"name": "char_corpus", "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb)$q$,
    'belongs to a generated dataset');
end $$;

-- 7. sessions link to snapshots, and lineage reads through ------------------------

do $$
declare ds uuid; s uuid; ck uuid := gen_random_uuid();
begin
  select id into ds from public.ored_datasets where name = 'invariant_test_ds' and version = 1;
  insert into public.ored_training_sessions (dataset_tag, dataset_id, run_name, status, config)
  values ('invariant_test_ds', ds, 'invariant_test_run', 'running', '{"dataset": {"git_commit": "abc"}}')
  returning id into s;
  perform public.ored_checkpoint_register(jsonb_build_object(
    'id', ck, 'run_name', 'invariant_test_run', 'kind', 'history', 'session_id', s,
    'object_path', 'invariant_test_run/history/x.pt', 'size_bytes', 1,
    'sha256', repeat('c', 64), 'format_version', 2, 'epoch', 1, 'global_step', 2));
  perform 1 from public.ored_checkpoint_lineage
   where checkpoint_id = ck and dataset_id = ds and dataset_version = 1 and git_commit = 'abc';
  if not found then raise exception 'lineage view does not lead from the checkpoint to its dataset'; end if;
  perform pg_temp.expect_error(format('delete from public.ored_datasets where id = %L', ds), 'violates foreign key');
end $$;

-- 8. the browser roles are refused ---------------------------------------------------

set local role anon;
select pg_temp.expect_error('select * from public.ored_training_data', 'permission denied');
select pg_temp.expect_error('select * from public.ored_training_data_summary', 'permission denied');
select pg_temp.expect_error($q$select public.ored_dataset_register('{}'::jsonb)$q$, 'permission denied');
reset role;

set local role authenticated;
select pg_temp.expect_error(
  $q$insert into public.ored_training_data (type, category, input, output) values ('qna', 'science', 'a', 'b')$q$,
  'permission denied');
select pg_temp.expect_error('select * from public.ored_checkpoint_lineage', 'permission denied');
reset role;

select 'ored training data invariants: all checks passed' as result;

rollback;
