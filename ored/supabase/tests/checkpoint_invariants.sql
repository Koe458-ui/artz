-- Invariant checks for public.ored_checkpoints after
-- 20260924150000_ored_checkpoint_roles.sql.
--
-- Everything runs in one transaction that is rolled back, so it is safe to
-- run against the real project:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ored/supabase/tests/checkpoint_invariants.sql
--
-- Any failed check raises, psql stops, and nothing is kept either way.
-- It uses its own run names (invariant_test_*), so existing rows only take
-- part in the "existing data was repaired" checks.

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

create function pg_temp.row(run text, kind text, path text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', gen_random_uuid(), 'run_name', run, 'kind', kind, 'object_path', path,
    'size_bytes', 10, 'sha256', encode(sha256(convert_to(path, 'utf8')), 'hex'),
    'format_version', 2, 'torch_version', 'test', 'epoch', 1, 'global_step', 10,
    'metrics', '{"val_loss": 1.0}'::jsonb) || extra;
$$;

-- 1. schema shape -----------------------------------------------------------

do $$ begin
  perform 1 from pg_constraint
   where conname = 'ored_checkpoints_kind_check'
     and pg_get_constraintdef(oid) like '%history%';
  if not found then raise exception 'kind check does not allow history'; end if;

  perform 1 from pg_indexes where indexname = 'ored_checkpoints_one_live_idx';
  if found then raise exception 'the global one-live index should be gone'; end if;

  perform 1 from pg_class where relname = 'ored_checkpoints' and relrowsecurity and relforcerowsecurity;
  if not found then raise exception 'RLS is no longer enabled and forced'; end if;
end $$;

-- 2. existing rows were repaired, not deleted --------------------------------

do $$
declare n int;
begin
  -- These ids exist in the real project (and in baseline.sql).
  if exists (select 1 from public.ored_checkpoints where id = 'dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2') then
    if not (select is_current from public.ored_checkpoints where id = 'dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2') then
      raise exception 'ored_v2 epoch 100 (lowest loss) should be the current best';
    end if;
    if (select is_current from public.ored_checkpoints where id = 'a5bef417-7854-45be-8db8-392f543a30e6') then
      raise exception 'ored_v2 epoch 50 should no longer be current';
    end if;
    if not (select is_current from public.ored_checkpoints where id = '05315ffe-12f4-4252-bf75-894e9616d310') then
      raise exception 'the earliest cap50 upload is the canonical current best';
    end if;
    if not (select is_current from public.ored_checkpoints where id = '19b248e8-dac8-408c-96f6-b8efbf3b10c6') then
      raise exception 'the existing live row should be current';
    end if;
    if (select canonical_id from public.ored_checkpoint_duplicates
         where sha256 = '1c989ee41f6230cf54388e036731e12dc638c14440c4331c93894dfe1b24c3f5')
       <> '05315ffe-12f4-4252-bf75-894e9616d310' then
      raise exception 'duplicate view picks the wrong canonical row';
    end if;
  end if;

  select count(*) into n from public.ored_checkpoints where kind = 'best' and promotion_metric is null;
  if n > 0 then raise exception '% best rows have no promotion metric', n; end if;

  select count(*) into n from (
    select run_name, kind from public.ored_checkpoints where is_current
    group by run_name, kind having count(*) > 1) d;
  if n > 0 then raise exception 'a run has two current rows of one kind'; end if;
end $$;

-- 3. live: one current per run, replaced atomically --------------------------

do $$
declare a public.ored_checkpoints; b public.ored_checkpoints; other public.ored_checkpoints;
begin
  a := public.ored_checkpoint_register(pg_temp.row('invariant_test_a', 'live', 'invariant_test_a/live/1.pt'), true, null);
  b := public.ored_checkpoint_register(pg_temp.row('invariant_test_a', 'live', 'invariant_test_a/live/2.pt'), true, a.id);
  if (select is_current from public.ored_checkpoints where id = a.id) then
    raise exception 'old live still current';
  end if;
  if not b.is_current then raise exception 'new live not current'; end if;

  -- A different run keeps its own live.
  other := public.ored_checkpoint_register(pg_temp.row('invariant_test_b', 'live', 'invariant_test_b/live/1.pt'), true, null);
  if not (select is_current from public.ored_checkpoints where id = b.id) then
    raise exception 'another run''s live replaced this one';
  end if;

  -- A stale comparison is refused.
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb, true, %L::uuid)',
    pg_temp.row('invariant_test_a', 'live', 'invariant_test_a/live/3.pt'), a.id), 'it changed');
end $$;

-- 4. is_current only moves through the functions ------------------------------

do $$
declare r public.ored_checkpoints;
begin
  perform pg_temp.expect_error(
    $q$insert into public.ored_checkpoints (run_name, kind, object_path, sha256, is_current)
       values ('invariant_test_c', 'live', 'invariant_test_c/live/x.pt', repeat('a', 64), true)$q$,
    'ored_checkpoint_register');

  r := public.ored_checkpoint_register(pg_temp.row('invariant_test_c', 'export', 'invariant_test_c/export/1.pt'), false, null);
  perform pg_temp.expect_error(format(
    'update public.ored_checkpoints set is_current = true where id = %L', r.id), 'ored_checkpoint_register');

  r := public.ored_checkpoint_make_current(r.id, null);
  if not r.is_current then raise exception 'make_current did not promote'; end if;
end $$;

-- 5. rows are immutable ------------------------------------------------------

do $$
declare r public.ored_checkpoints;
begin
  r := public.ored_checkpoint_register(pg_temp.row('invariant_test_d', 'history', 'invariant_test_d/history/epoch_0001.pt'), false, null);
  perform pg_temp.expect_error(format(
    'update public.ored_checkpoints set sha256 = repeat(''b'', 64) where id = %L', r.id), 'immutable');
  perform pg_temp.expect_error(format(
    'update public.ored_checkpoints set metrics = ''{"val_loss": 0}'' where id = %L', r.id), 'immutable');
  perform pg_temp.expect_error(format(
    'update public.ored_checkpoints set object_path = ''elsewhere.pt'' where id = %L', r.id), 'immutable');

  -- Linking to a model version later is allowed.
  update public.ored_checkpoints set verified_at = now() where id = r.id;
end $$;

-- 6. history is append-only and never current ---------------------------------

do $$
declare r public.ored_checkpoints;
begin
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb, true, null)',
    pg_temp.row('invariant_test_e', 'history', 'invariant_test_e/history/epoch_0001.pt')), 'never current');

  r := public.ored_checkpoint_register(pg_temp.row('invariant_test_e', 'history', 'invariant_test_e/history/epoch_0002.pt'), false, null);
  perform pg_temp.expect_error(format('delete from public.ored_checkpoints where id = %L', r.id),
    'ored_checkpoint_delete');
  perform pg_temp.expect_error(format('select public.ored_checkpoint_make_current(%L)', r.id),
    'cannot be promoted');

  -- Explicit cleanup works.
  perform public.ored_checkpoint_delete(r.id);
  if exists (select 1 from public.ored_checkpoints where id = r.id) then
    raise exception 'explicit delete did not remove the row';
  end if;
end $$;

-- 7. base is immutable once set ------------------------------------------------

do $$
declare r public.ored_checkpoints;
begin
  r := public.ored_checkpoint_register(pg_temp.row('invariant_test_f', 'base', 'invariant_test_f/base/base.pt'), true, null);
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb, true, %L::uuid)',
    pg_temp.row('invariant_test_f', 'base', 'invariant_test_f/base/base2.pt'), r.id), 'base is immutable');
end $$;

-- 8. best needs its promotion metric; current rows need explicit removal -----

do $$
declare r public.ored_checkpoints;
begin
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb, true, null)',
    pg_temp.row('invariant_test_g', 'best', 'invariant_test_g/best/1.pt')), 'ored_checkpoints_best_metric_check');

  r := public.ored_checkpoint_register(
    pg_temp.row('invariant_test_g', 'best', 'invariant_test_g/best/2.pt',
                '{"promotion_metric": "val_loss", "promotion_mode": "min"}'), true, null);
  perform pg_temp.expect_error(format('select public.ored_checkpoint_delete(%L)', r.id), 'p_allow_current');
  perform public.ored_checkpoint_delete(r.id, true);
end $$;

-- 9. other constraints --------------------------------------------------------

do $$
declare r public.ored_checkpoints;
begin
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb)',
    pg_temp.row('invariant_test_h', 'latest', 'invariant_test_h/latest.pt')), 'ored_checkpoints_kind_check');
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb)',
    pg_temp.row('invariant_test_h', 'history', 'invariant_test_h/h.pt', '{"sha256": "nope"}')), 'ored_checkpoints_sha256_check');
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb)',
    pg_temp.row('invariant_test_h', 'history', 'invariant_test_h/h.pt', '{"global_step": -1}')), 'ored_checkpoints_global_step_check');

  r := public.ored_checkpoint_register(pg_temp.row('invariant_test_h', 'history', 'invariant_test_h/h2.pt'));
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_register(%L::jsonb)',
    pg_temp.row('invariant_test_h', 'history', 'invariant_test_h/h2.pt')), 'ored_checkpoints_object_path_key');
  perform pg_temp.expect_error(format(
    'select public.ored_checkpoint_mark_verified(%L, %L)', r.id, repeat('0', 64)), 'does not have sha256');
  perform public.ored_checkpoint_mark_verified(r.id, r.sha256);
end $$;

-- 10. views answer the everyday questions ------------------------------------

do $$
declare n int;
begin
  select count(*) into n from public.ored_checkpoint_current
   where run_name = 'invariant_test_a' and role = 'live';
  if n <> 1 then raise exception 'current view should show one live for invariant_test_a, got %', n; end if;

  select count(*) into n from public.ored_checkpoint_overview where run_name = 'invariant_test_a';
  if n <> 2 then raise exception 'overview should list both lives of invariant_test_a, got %', n; end if;
end $$;

-- 11. the public roles still see nothing -------------------------------------

set local role anon;
select pg_temp.expect_error('select * from public.ored_checkpoints', 'permission denied');
select pg_temp.expect_error('select * from public.ored_checkpoint_current', 'permission denied');
select pg_temp.expect_error('select * from public.ored_checkpoint_duplicates', 'permission denied');
select pg_temp.expect_error(
  'select public.ored_checkpoint_delete(gen_random_uuid())', 'permission denied');
reset role;

set local role authenticated;
select pg_temp.expect_error('select * from public.ored_checkpoint_overview', 'permission denied');
select pg_temp.expect_error(
  $q$select public.ored_checkpoint_register('{}'::jsonb)$q$, 'permission denied');
reset role;

select 'ored checkpoint invariants: all checks passed' as result;

rollback;
