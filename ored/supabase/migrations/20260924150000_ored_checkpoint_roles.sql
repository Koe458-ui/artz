-- Ored checkpoint roles: base / live / best / history / export.
--
-- Extends the existing public.ored_checkpoints table; no new checkpoint table.
-- See ored/model/CHECKPOINTS.md for the full design.
--
-- What this migration does
--   1. allows kind = 'history'
--   2. adds global_step, is_current, parent_checkpoint_id, promotion_metric,
--      promotion_mode, verified_at
--   3. replaces the global "one live row" index with one current row per
--      (run_name, kind), and adds the indexes the common questions need
--   4. marks which existing row is the current live / best of each run
--      (no row and no Storage object is deleted or moved)
--   5. makes checkpoint rows immutable, history append-only, and routes every
--      promotion and deletion through two functions
--   6. adds three read-only views for looking things up from a phone
--
-- Security: RLS stays enabled and forced; no policy is added, so the table,
-- views and functions stay reachable by the service role only. anon and
-- authenticated get no grant on anything created here.

-- 1. roles ------------------------------------------------------------------

alter table public.ored_checkpoints drop constraint ored_checkpoints_kind_check;
alter table public.ored_checkpoints
  add constraint ored_checkpoints_kind_check
  check (kind in ('base', 'live', 'best', 'history', 'export'));

-- 2. columns ----------------------------------------------------------------

alter table public.ored_checkpoints
  add column global_step bigint not null default 0,
  add column is_current boolean not null default false,
  add column parent_checkpoint_id uuid
    references public.ored_checkpoints (id) on delete set null,
  add column promotion_metric text,
  add column promotion_mode text,
  add column verified_at timestamptz;

comment on column public.ored_checkpoints.kind is
  'base = starting point, live = latest resumable state, best = best validation '
  'result, history = append-only snapshot, export = inference-only artifact';
comment on column public.ored_checkpoints.run_name is
  'The model version the checkpoint belongs to; also the first segment of object_path.';
comment on column public.ored_checkpoints.global_step is
  'Optimizer steps taken when the checkpoint was written.';
comment on column public.ored_checkpoints.is_current is
  'True for the one current base/live/best/export row of a run. Never true for history.';
comment on column public.ored_checkpoints.parent_checkpoint_id is
  'The checkpoint this one was derived from (an export''s source, a resumed run''s base).';
comment on column public.ored_checkpoints.promotion_metric is
  'Metric that decided a best promotion, e.g. val_loss.';
comment on column public.ored_checkpoints.promotion_mode is
  'min = lower is better, max = higher is better.';
comment on column public.ored_checkpoints.verified_at is
  'Last time the Storage object was downloaded and its sha256 matched.';

alter table public.ored_checkpoints
  add constraint ored_checkpoints_global_step_check check (global_step >= 0),
  add constraint ored_checkpoints_epoch_check check (epoch >= 0),
  add constraint ored_checkpoints_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  add constraint ored_checkpoints_history_not_current_check
    check (kind <> 'history' or not is_current),
  add constraint ored_checkpoints_promotion_mode_check
    check (promotion_mode is null or promotion_mode in ('min', 'max')),
  add constraint ored_checkpoints_not_own_parent_check
    check (parent_checkpoint_id is null or parent_checkpoint_id <> id);

-- 3. indexes ----------------------------------------------------------------

drop index public.ored_checkpoints_one_live_idx;

create unique index ored_checkpoints_one_current_idx
  on public.ored_checkpoints (run_name, kind) where is_current;

-- (session_id, kind) and (version_id, kind) cover the old single-column
-- indexes, which are dropped rather than kept as duplicates.
drop index public.ored_checkpoints_session_idx;
drop index public.ored_checkpoints_version_idx;
create index ored_checkpoints_session_kind_idx on public.ored_checkpoints (session_id, kind);
create index ored_checkpoints_version_kind_idx on public.ored_checkpoints (version_id, kind);
create index ored_checkpoints_run_kind_created_idx
  on public.ored_checkpoints (run_name, kind, created_at desc);
create index ored_checkpoints_created_idx on public.ored_checkpoints (created_at desc);
create index ored_checkpoints_sha256_idx on public.ored_checkpoints (sha256);
create index ored_checkpoints_parent_idx on public.ored_checkpoints (parent_checkpoint_id);

-- 4. repair existing rows ---------------------------------------------------

-- Every best row so far was chosen by the trainer's "val loss went down" rule.
update public.ored_checkpoints
   set promotion_metric = 'val_loss', promotion_mode = 'min'
 where kind = 'best';

alter table public.ored_checkpoints
  add constraint ored_checkpoints_best_metric_check
  check (kind <> 'best' or (promotion_metric is not null and promotion_mode is not null));

-- Current live of each run: the newest row.
update public.ored_checkpoints c
   set is_current = true
  from (select distinct on (run_name) id
          from public.ored_checkpoints
         where kind = 'live'
         order by run_name, created_at desc, id) pick
 where c.id = pick.id;

-- Current best of each run: lowest validation loss (format 1 rows call it
-- "loss"), ties going to the earliest upload, which is the canonical copy
-- of a duplicated file.
update public.ored_checkpoints c
   set is_current = true
  from (select distinct on (run_name) id
          from public.ored_checkpoints
         where kind = 'best'
         order by run_name,
                  coalesce((metrics ->> 'val_loss')::float8,
                           (metrics ->> 'loss')::float8,
                           'infinity'::float8),
                  created_at, id) pick
 where c.id = pick.id;

-- Base and export rows (none exist today) would each get their newest row.
update public.ored_checkpoints c
   set is_current = true
  from (select distinct on (run_name, kind) id
          from public.ored_checkpoints
         where kind in ('base', 'export')
         order by run_name, kind, created_at desc, id) pick
 where c.id = pick.id;

-- 5. guard: immutable rows, append-only history, gated promotion/deletion ----

create function public.ored_checkpoints_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  op text := coalesce(current_setting('ored.checkpoint_op', true), '');
begin
  if tg_op = 'INSERT' then
    if new.is_current and op <> 'promote' then
      raise exception 'a checkpoint becomes current only through public.ored_checkpoint_register()'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if op <> 'cleanup' then
      raise exception 'checkpoint % (%) can only be removed through public.ored_checkpoint_delete()',
        old.id, old.kind using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- UPDATE: the row describes an immutable Storage object.
  if (new.id, new.kind, new.run_name, new.bucket_id, new.object_path, new.size_bytes,
      new.sha256, new.format_version, new.torch_version, new.epoch, new.global_step,
      new.metrics, new.created_at, new.promotion_metric, new.promotion_mode)
     is distinct from
     (old.id, old.kind, old.run_name, old.bucket_id, old.object_path, old.size_bytes,
      old.sha256, old.format_version, old.torch_version, old.epoch, old.global_step,
      old.metrics, old.created_at, old.promotion_metric, old.promotion_mode)
     or new.uploaded_by is distinct from old.uploaded_by
  then
    raise exception 'checkpoint % (%) is immutable: write a new checkpoint instead of editing it',
      old.id, old.kind using errcode = 'check_violation';
  end if;

  if new.parent_checkpoint_id is distinct from old.parent_checkpoint_id
     and new.parent_checkpoint_id is not null then
    raise exception 'checkpoint % already records where it came from', old.id
      using errcode = 'check_violation';
  end if;

  if new.is_current is distinct from old.is_current then
    if op not in ('promote', 'cleanup') then
      raise exception 'is_current changes only through public.ored_checkpoint_register()'
        using errcode = 'check_violation';
    end if;
    if old.kind = 'base' and old.is_current and op <> 'cleanup' then
      raise exception 'run % already has a base checkpoint; base is immutable', old.run_name
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger ored_checkpoints_guard
  before insert or update or delete on public.ored_checkpoints
  for each row execute function public.ored_checkpoints_guard();

-- Register a checkpoint whose object is already uploaded and verified.
-- With p_make_current it also becomes the run's current row of its kind, in
-- the same transaction that retires the previous one. p_replaces must name
-- the row the caller compared against (null when there was none); if someone
-- else promoted in between, the call fails instead of overwriting.
create function public.ored_checkpoint_register(
  p_row jsonb,
  p_make_current boolean default false,
  p_replaces uuid default null
)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  incoming public.ored_checkpoints;
  current_row public.ored_checkpoints;
  stored public.ored_checkpoints;
begin
  incoming := jsonb_populate_record(null::public.ored_checkpoints, p_row);
  incoming.is_current := false;
  incoming.bucket_id := coalesce(incoming.bucket_id, 'ored-checkpoints');
  incoming.epoch := coalesce(incoming.epoch, 0);
  incoming.global_step := coalesce(incoming.global_step, 0);
  incoming.metrics := coalesce(incoming.metrics, '{}'::jsonb);
  incoming.format_version := coalesce(incoming.format_version, 1);
  incoming.torch_version := coalesce(incoming.torch_version, '');
  incoming.size_bytes := coalesce(incoming.size_bytes, 0);
  incoming.created_at := coalesce(incoming.created_at, now());

  if incoming.id is null or incoming.run_name is null or incoming.kind is null
     or coalesce(incoming.object_path, '') = '' then
    raise exception 'a checkpoint needs id, run_name, kind and object_path'
      using errcode = 'not_null_violation';
  end if;

  if p_make_current then
    if incoming.kind = 'history' then
      raise exception 'history checkpoints are never current' using errcode = 'check_violation';
    end if;

    select * into current_row
      from public.ored_checkpoints
     where run_name = incoming.run_name and kind = incoming.kind and is_current
       for update;

    if found and incoming.kind = 'base' then
      raise exception 'run % already has a base checkpoint (%); base is immutable',
        incoming.run_name, current_row.id using errcode = 'check_violation';
    end if;

    if current_row.id is distinct from p_replaces then
      raise exception 'current % of run % is %, not %: it changed, compare again',
        incoming.kind, incoming.run_name, coalesce(current_row.id::text, 'none'),
        coalesce(p_replaces::text, 'none')
        using errcode = 'serialization_failure';
    end if;

    perform set_config('ored.checkpoint_op', 'promote', true);
    if current_row.id is not null then
      update public.ored_checkpoints set is_current = false where id = current_row.id;
    end if;
    incoming.is_current := true;
  end if;

  insert into public.ored_checkpoints select incoming.* returning * into stored;
  perform set_config('ored.checkpoint_op', '', true);
  return stored;
end;
$$;

-- Promote an already-registered row (e.g. a best chosen by hand) to current.
create function public.ored_checkpoint_make_current(p_id uuid, p_replaces uuid default null)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  target public.ored_checkpoints;
  current_row public.ored_checkpoints;
  stored public.ored_checkpoints;
begin
  select * into target from public.ored_checkpoints where id = p_id for update;
  if not found then
    raise exception 'no checkpoint %', p_id using errcode = 'no_data_found';
  end if;
  if target.kind in ('history', 'base') then
    raise exception 'a % checkpoint cannot be promoted in place', target.kind
      using errcode = 'check_violation';
  end if;
  if target.is_current then
    return target;
  end if;

  select * into current_row
    from public.ored_checkpoints
   where run_name = target.run_name and kind = target.kind and is_current
     for update;

  if current_row.id is distinct from p_replaces then
    raise exception 'current % of run % is %, not %: it changed, compare again',
      target.kind, target.run_name, coalesce(current_row.id::text, 'none'),
      coalesce(p_replaces::text, 'none')
      using errcode = 'serialization_failure';
  end if;

  perform set_config('ored.checkpoint_op', 'promote', true);
  if current_row.id is not null then
    update public.ored_checkpoints set is_current = false where id = current_row.id;
  end if;
  update public.ored_checkpoints set is_current = true where id = p_id returning * into stored;
  perform set_config('ored.checkpoint_op', '', true);
  return stored;
end;
$$;

-- The only way a checkpoint row is removed. A current row needs
-- p_allow_current. The caller deletes the Storage object afterwards, so the
-- table never points at an object that is gone.
create function public.ored_checkpoint_delete(p_id uuid, p_allow_current boolean default false)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  target public.ored_checkpoints;
begin
  select * into target from public.ored_checkpoints where id = p_id for update;
  if not found then
    raise exception 'no checkpoint %', p_id using errcode = 'no_data_found';
  end if;
  if target.is_current and not p_allow_current then
    raise exception 'checkpoint % is the current % of run %; pass p_allow_current to remove it',
      p_id, target.kind, target.run_name using errcode = 'check_violation';
  end if;

  perform set_config('ored.checkpoint_op', 'cleanup', true);
  delete from public.ored_checkpoints where id = p_id;
  perform set_config('ored.checkpoint_op', '', true);
  return target;
end;
$$;

-- Record a successful re-hash of the Storage object.
create function public.ored_checkpoint_mark_verified(p_id uuid, p_sha256 text)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  stored public.ored_checkpoints;
begin
  update public.ored_checkpoints
     set verified_at = now()
   where id = p_id and sha256 = p_sha256
  returning * into stored;
  if not found then
    raise exception 'checkpoint % does not have sha256 %', p_id, p_sha256
      using errcode = 'check_violation';
  end if;
  return stored;
end;
$$;

-- 6. views ------------------------------------------------------------------

create view public.ored_checkpoint_overview
with (security_invoker = true) as
select
  c.run_name,
  c.kind as role,
  c.is_current,
  c.epoch,
  c.global_step,
  coalesce((c.metrics ->> 'val_loss')::float8, (c.metrics ->> 'loss')::float8) as val_loss,
  coalesce((c.metrics ->> 'val_bpc')::float8, (c.metrics ->> 'bpc')::float8) as val_bpc,
  coalesce((c.metrics ->> 'val_ppl')::float8, (c.metrics ->> 'ppl')::float8) as val_ppl,
  (c.metrics ->> 'train_loss')::float8 as train_loss,
  c.promotion_metric,
  c.promotion_mode,
  round(c.size_bytes / 1000000.0, 2) as size_mb,
  c.sha256,
  c.format_version,
  c.torch_version,
  c.bucket_id,
  c.object_path,
  c.verified_at,
  c.created_at,
  c.uploaded_by,
  c.session_id,
  s.status as session_status,
  c.version_id,
  v.version as model_version,
  v.status as model_version_status,
  c.parent_checkpoint_id,
  c.id,
  c.metrics
from public.ored_checkpoints c
left join public.ored_training_sessions s on s.id = c.session_id
left join public.ored_model_versions v on v.id = c.version_id;

comment on view public.ored_checkpoint_overview is
  'Every checkpoint with its metrics pulled out. Filter by run_name / role / is_current.';

create view public.ored_checkpoint_current
with (security_invoker = true) as
select * from public.ored_checkpoint_overview where is_current;

comment on view public.ored_checkpoint_current is
  'One row per run and role: the current base, live, best and export.';

create view public.ored_checkpoint_duplicates
with (security_invoker = true) as
select
  sha256,
  count(*) as copies,
  (array_agg(id order by is_current desc, created_at, id))[1] as canonical_id,
  array_agg(id order by created_at, id) as ids,
  array_agg(run_name || ':' || kind || ':' || object_path order by created_at, id) as objects,
  sum(size_bytes) - max(size_bytes) as reclaimable_bytes
from public.ored_checkpoints
group by sha256
having count(*) > 1;

comment on view public.ored_checkpoint_duplicates is
  'Rows whose files are byte-identical. Report only: remove extras with ored_checkpoint_delete().';

-- 7. privileges ---------------------------------------------------------------

revoke all on public.ored_checkpoint_overview, public.ored_checkpoint_current,
  public.ored_checkpoint_duplicates from public, anon, authenticated;
grant select on public.ored_checkpoint_overview, public.ored_checkpoint_current,
  public.ored_checkpoint_duplicates to service_role;

revoke all on function public.ored_checkpoints_guard() from public, anon, authenticated;
revoke all on function public.ored_checkpoint_register(jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.ored_checkpoint_make_current(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ored_checkpoint_delete(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ored_checkpoint_mark_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.ored_checkpoint_register(jsonb, boolean, uuid) to service_role;
grant execute on function public.ored_checkpoint_make_current(uuid, uuid) to service_role;
grant execute on function public.ored_checkpoint_delete(uuid, boolean) to service_role;
grant execute on function public.ored_checkpoint_mark_verified(uuid, text) to service_role;

