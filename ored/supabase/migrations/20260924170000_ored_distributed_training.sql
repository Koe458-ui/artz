-- Ored distributed training: sharded checkpoints, sessions and workers.
--
-- Builds on 20260924150000_ored_checkpoint_roles.sql. See
-- ored/model/docs/distributed-training.md for the design.
--
--   1. ored_checkpoints can describe one logical checkpoint made of many
--      files: part = file | manifest | shard, checkpoint_group_id, rank,
--      world_size, is_complete, upload_status. Existing rows become
--      part = 'file' (one complete, verified file each); nothing else changes
--      for them.
--   2. Shards are registered as 'uploading' by the rank that wrote them,
--      marked 'verified' (or 'failed') after their size and sha256 are
--      checked, and only ored_checkpoint_finalize_group() can complete a
--      group: it checks that every rank 0..world_size-1 has verified shards,
--      marks them complete and inserts the manifest row, which is the row
--      that can be current live / best.
--   3. ored_training_sessions gains session_key (the rendezvous id every
--      worker joins with) and run_name.
--   4. ored_training_workers: one row per worker process, with heartbeat.
--   5. Views for the dashboard: checkpoint groups, worker health, run overview.
--
-- Security: every table keeps RLS enabled and forced with no policy; views are
-- security_invoker; functions and views are granted to service_role only.

-- 1. checkpoint parts --------------------------------------------------------

alter table public.ored_checkpoints
  add column part text not null default 'file',
  add column checkpoint_group_id uuid,
  add column rank integer,
  add column world_size integer not null default 1,
  add column is_complete boolean not null default true,
  add column upload_status text not null default 'verified';

comment on column public.ored_checkpoints.part is
  'file = a whole checkpoint in one .pt; manifest = the logical row of a distributed '
  'checkpoint (manifest.json); shard = one file written by one rank of that checkpoint.';
comment on column public.ored_checkpoints.checkpoint_group_id is
  'Shared by the manifest and every shard of one distributed checkpoint. Null for part = file.';
comment on column public.ored_checkpoints.rank is 'The rank that wrote this shard.';
comment on column public.ored_checkpoints.world_size is 'How many ranks wrote the checkpoint.';
comment on column public.ored_checkpoints.is_complete is
  'True once every rank''s shards are verified and the manifest is recorded.';
comment on column public.ored_checkpoints.upload_status is 'uploading, verified or failed.';

alter table public.ored_checkpoints
  add constraint ored_checkpoints_part_check
    check (part in ('file', 'manifest', 'shard')),
  add constraint ored_checkpoints_upload_status_check
    check (upload_status in ('uploading', 'verified', 'failed')),
  add constraint ored_checkpoints_world_size_check check (world_size >= 1),
  add constraint ored_checkpoints_group_check
    check ((part = 'file') = (checkpoint_group_id is null)),
  add constraint ored_checkpoints_rank_check
    check ((part = 'shard' and rank is not null and rank >= 0 and rank < world_size)
           or (part <> 'shard' and rank is null)),
  add constraint ored_checkpoints_whole_file_check
    check (part = 'shard' or (is_complete and upload_status = 'verified')),
  add constraint ored_checkpoints_current_is_whole_check
    check (not is_current or (part in ('file', 'manifest') and is_complete));

create unique index ored_checkpoints_one_manifest_idx
  on public.ored_checkpoints (checkpoint_group_id) where part = 'manifest';
create index ored_checkpoints_group_rank_idx
  on public.ored_checkpoints (checkpoint_group_id, rank);

-- 2. guard and functions ------------------------------------------------------

create or replace function public.ored_checkpoints_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  op text := coalesce(current_setting('ored.checkpoint_op', true), '');
begin
  if tg_op = 'INSERT' then
    if new.is_current and op not in ('promote', 'finalize') then
      raise exception 'a checkpoint becomes current only through public.ored_checkpoint_register()'
        using errcode = 'check_violation';
    end if;
    if new.part = 'manifest' and op <> 'finalize' then
      raise exception 'a manifest row is written only by public.ored_checkpoint_finalize_group()'
        using errcode = 'check_violation';
    end if;
    if new.part = 'shard' and (new.is_complete or new.upload_status <> 'uploading') then
      raise exception 'a shard is registered as uploading and incomplete, then verified, then finalized'
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

  if (new.id, new.kind, new.run_name, new.bucket_id, new.object_path, new.size_bytes,
      new.sha256, new.format_version, new.torch_version, new.epoch, new.global_step,
      new.metrics, new.created_at, new.promotion_metric, new.promotion_mode,
      new.part, new.checkpoint_group_id, new.rank, new.world_size)
     is distinct from
     (old.id, old.kind, old.run_name, old.bucket_id, old.object_path, old.size_bytes,
      old.sha256, old.format_version, old.torch_version, old.epoch, old.global_step,
      old.metrics, old.created_at, old.promotion_metric, old.promotion_mode,
      old.part, old.checkpoint_group_id, old.rank, old.world_size)
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

  if new.upload_status is distinct from old.upload_status then
    if op <> 'shard' or old.upload_status <> 'uploading' then
      raise exception 'upload_status moves once, from uploading, through public.ored_checkpoint_shard_status()'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.is_complete is distinct from old.is_complete then
    if op <> 'finalize' or old.is_complete then
      raise exception 'a checkpoint group is completed only by public.ored_checkpoint_finalize_group()'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.is_current is distinct from old.is_current then
    if op not in ('promote', 'finalize', 'cleanup') then
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

create or replace function public.ored_checkpoint_register(
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
  incoming.part := coalesce(incoming.part, 'file');
  incoming.world_size := coalesce(incoming.world_size, 1);
  incoming.is_complete := coalesce(incoming.is_complete, incoming.part <> 'shard');
  incoming.upload_status := coalesce(incoming.upload_status,
                                     case when incoming.part = 'shard' then 'uploading' else 'verified' end);

  if incoming.id is null or incoming.run_name is null or incoming.kind is null
     or coalesce(incoming.object_path, '') = '' then
    raise exception 'a checkpoint needs id, run_name, kind and object_path'
      using errcode = 'not_null_violation';
  end if;

  if p_make_current then
    if incoming.kind = 'history' then
      raise exception 'history checkpoints are never current' using errcode = 'check_violation';
    end if;
    if incoming.part <> 'file' then
      raise exception 'a distributed checkpoint becomes current only through public.ored_checkpoint_finalize_group()'
        using errcode = 'check_violation';
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

create or replace function public.ored_checkpoint_make_current(p_id uuid, p_replaces uuid default null)
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
  if target.part = 'shard' then
    raise exception 'checkpoint % is one shard of group %; promote its manifest row',
      p_id, target.checkpoint_group_id using errcode = 'check_violation';
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

create or replace function public.ored_checkpoint_delete(p_id uuid, p_allow_current boolean default false)
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
  if target.part <> 'file' then
    raise exception 'checkpoint % belongs to group %; remove the whole group with public.ored_checkpoint_delete_group()',
      p_id, target.checkpoint_group_id using errcode = 'check_violation';
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

-- A rank reports the result of uploading one of its shards.
create function public.ored_checkpoint_shard_status(p_id uuid, p_status text)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  stored public.ored_checkpoints;
begin
  if p_status not in ('verified', 'failed') then
    raise exception 'a shard upload ends verified or failed, not %', p_status
      using errcode = 'check_violation';
  end if;
  perform set_config('ored.checkpoint_op', 'shard', true);
  update public.ored_checkpoints
     set upload_status = p_status,
         verified_at = case when p_status = 'verified' then now() else verified_at end
   where id = p_id and part = 'shard' and upload_status = 'uploading'
  returning * into stored;
  if stored.id is null then
    raise exception 'no uploading shard %', p_id using errcode = 'no_data_found';
  end if;
  perform set_config('ored.checkpoint_op', '', true);
  return stored;
end;
$$;

-- The coordinator completes a group: every rank has verified shards, so the
-- shards become complete and the manifest row is recorded, current or not,
-- in one transaction.
create function public.ored_checkpoint_finalize_group(
  p_group uuid,
  p_manifest jsonb,
  p_make_current boolean default false,
  p_replaces uuid default null
)
returns public.ored_checkpoints
language plpgsql
set search_path = ''
as $$
declare
  manifest public.ored_checkpoints;
  current_row public.ored_checkpoints;
  stored public.ored_checkpoints;
  shard_count int;
  verified_ranks int;
  not_verified text;
  mismatched int;
begin
  manifest := jsonb_populate_record(null::public.ored_checkpoints, p_manifest);
  manifest.part := 'manifest';
  manifest.checkpoint_group_id := p_group;
  manifest.rank := null;
  manifest.is_complete := true;
  manifest.upload_status := 'verified';
  manifest.is_current := false;
  manifest.bucket_id := coalesce(manifest.bucket_id, 'ored-checkpoints');
  manifest.epoch := coalesce(manifest.epoch, 0);
  manifest.global_step := coalesce(manifest.global_step, 0);
  manifest.metrics := coalesce(manifest.metrics, '{}'::jsonb);
  manifest.format_version := coalesce(manifest.format_version, 3);
  manifest.torch_version := coalesce(manifest.torch_version, '');
  manifest.size_bytes := coalesce(manifest.size_bytes, 0);
  manifest.created_at := coalesce(manifest.created_at, now());
  manifest.verified_at := coalesce(manifest.verified_at, now());

  if manifest.id is null or manifest.world_size is null or manifest.kind is null
     or coalesce(manifest.object_path, '') = '' then
    raise exception 'a manifest needs id, kind, world_size and object_path'
      using errcode = 'not_null_violation';
  end if;

  perform 1 from public.ored_checkpoints
   where checkpoint_group_id = p_group and part = 'manifest';
  if found then
    raise exception 'checkpoint group % is already finalized', p_group using errcode = 'unique_violation';
  end if;

  perform 1 from public.ored_checkpoints
   where checkpoint_group_id = p_group and part = 'shard' for update;

  select count(*),
         count(distinct rank) filter (where upload_status = 'verified'),
         string_agg(distinct rank::text || ':' || upload_status, ', ') filter (where upload_status <> 'verified'),
         count(*) filter (where kind <> manifest.kind or run_name <> manifest.run_name
                                or world_size <> manifest.world_size)
    into shard_count, verified_ranks, not_verified, mismatched
    from public.ored_checkpoints
   where checkpoint_group_id = p_group and part = 'shard';

  if shard_count = 0 then
    raise exception 'checkpoint group % has no shards', p_group using errcode = 'no_data_found';
  end if;
  if mismatched > 0 then
    raise exception 'checkpoint group % has shards from another run, role or world size', p_group
      using errcode = 'check_violation';
  end if;
  if not_verified is not null then
    raise exception 'checkpoint group % is not complete: shards not verified (rank:status) %',
      p_group, not_verified using errcode = 'check_violation';
  end if;
  if verified_ranks <> manifest.world_size then
    raise exception 'checkpoint group % is not complete: % of % ranks have verified shards',
      p_group, verified_ranks, manifest.world_size using errcode = 'check_violation';
  end if;

  if p_make_current then
    if manifest.kind = 'history' then
      raise exception 'history checkpoints are never current' using errcode = 'check_violation';
    end if;
    select * into current_row
      from public.ored_checkpoints
     where run_name = manifest.run_name and kind = manifest.kind and is_current
       for update;
    if found and manifest.kind = 'base' then
      raise exception 'run % already has a base checkpoint (%); base is immutable',
        manifest.run_name, current_row.id using errcode = 'check_violation';
    end if;
    if current_row.id is distinct from p_replaces then
      raise exception 'current % of run % is %, not %: it changed, compare again',
        manifest.kind, manifest.run_name, coalesce(current_row.id::text, 'none'),
        coalesce(p_replaces::text, 'none')
        using errcode = 'serialization_failure';
    end if;
  end if;

  perform set_config('ored.checkpoint_op', 'finalize', true);
  update public.ored_checkpoints set is_complete = true
   where checkpoint_group_id = p_group and part = 'shard';
  if p_make_current then
    if current_row.id is not null then
      update public.ored_checkpoints set is_current = false where id = current_row.id;
    end if;
    manifest.is_current := true;
  end if;
  insert into public.ored_checkpoints select manifest.* returning * into stored;
  perform set_config('ored.checkpoint_op', '', true);
  return stored;
end;
$$;

-- Remove every row of a group (complete or not). Objects are removed by the
-- caller afterwards.
create function public.ored_checkpoint_delete_group(p_group uuid, p_allow_current boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  perform 1 from public.ored_checkpoints where checkpoint_group_id = p_group for update;
  if not found then
    raise exception 'no checkpoint group %', p_group using errcode = 'no_data_found';
  end if;
  perform 1 from public.ored_checkpoints where checkpoint_group_id = p_group and is_current;
  if found and not p_allow_current then
    raise exception 'checkpoint group % is current; pass p_allow_current to remove it', p_group
      using errcode = 'check_violation';
  end if;
  perform set_config('ored.checkpoint_op', 'cleanup', true);
  delete from public.ored_checkpoints where checkpoint_group_id = p_group;
  get diagnostics removed = row_count;
  perform set_config('ored.checkpoint_op', '', true);
  return removed;
end;
$$;

-- 3. sessions ---------------------------------------------------------------

alter table public.ored_training_sessions
  add column session_key text,
  add column run_name text not null default '';

create unique index ored_training_sessions_session_key_idx
  on public.ored_training_sessions (session_key) where session_key is not null;

comment on column public.ored_training_sessions.session_key is
  'The rendezvous id every worker of a distributed run joins with (torchrun --rdzv-id).';

-- Rank 0 claims the session when a run starts or resumes.
create function public.ored_training_session_claim(
  p_session_key text,
  p_run_name text,
  p_dataset_tag text,
  p_config jsonb
)
returns public.ored_training_sessions
language plpgsql
set search_path = ''
as $$
declare
  stored public.ored_training_sessions;
begin
  if coalesce(p_session_key, '') = '' then
    raise exception 'a distributed session needs a session key' using errcode = 'not_null_violation';
  end if;
  insert into public.ored_training_sessions
    (session_key, run_name, dataset_tag, config, status, started_at)
  values (p_session_key, coalesce(p_run_name, ''), coalesce(p_dataset_tag, ''),
          coalesce(p_config, '{}'::jsonb), 'running', now())
  on conflict (session_key) where session_key is not null do update
    set status = 'running',
        config = excluded.config,
        run_name = excluded.run_name,
        error = '',
        finished_at = null,
        started_at = coalesce(public.ored_training_sessions.started_at, now())
  returning * into stored;
  return stored;
end;
$$;

-- 4. workers ----------------------------------------------------------------

create table public.ored_training_workers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ored_training_sessions (id) on delete cascade,
  worker_id text not null,
  rank integer check (rank is null or rank >= 0),
  node_rank integer check (node_rank is null or node_rank >= 0),
  local_rank integer check (local_rank is null or local_rank >= 0),
  hostname text not null default '',
  device text not null default '',
  gpu_name text not null default '',
  torch_version text not null default '',
  status text not null default 'joining'
    check (status in ('joining', 'ready', 'training', 'checkpointing',
                      'completed', 'failed', 'disconnected')),
  last_heartbeat timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text not null default '',
  created_at timestamptz not null default now(),
  unique (session_id, worker_id)
);

comment on table public.ored_training_workers is
  'One row per training process of a distributed session. last_heartbeat is refreshed '
  'while the process is alive; a stale heartbeat means "not heard from", not "dead".';

create index ored_training_workers_session_rank_idx on public.ored_training_workers (session_id, rank);
create index ored_training_workers_heartbeat_idx on public.ored_training_workers (last_heartbeat);

alter table public.ored_training_workers enable row level security;
alter table public.ored_training_workers force row level security;
revoke all on public.ored_training_workers from public, anon, authenticated;
grant all on public.ored_training_workers to service_role;

-- 5. views ------------------------------------------------------------------

create or replace view public.ored_checkpoint_overview
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
  c.metrics,
  c.part,
  c.checkpoint_group_id,
  c.rank,
  c.world_size,
  c.is_complete,
  c.upload_status,
  s.session_key
from public.ored_checkpoints c
left join public.ored_training_sessions s on s.id = c.session_id
left join public.ored_model_versions v on v.id = c.version_id;

create or replace view public.ored_checkpoint_current
with (security_invoker = true) as
select * from public.ored_checkpoint_overview where is_current;

create or replace view public.ored_checkpoint_duplicates
with (security_invoker = true) as
select
  sha256,
  count(*) as copies,
  (array_agg(id order by is_current desc, created_at, id))[1] as canonical_id,
  array_agg(id order by created_at, id) as ids,
  array_agg(run_name || ':' || kind || ':' || object_path order by created_at, id) as objects,
  sum(size_bytes) - max(size_bytes) as reclaimable_bytes
from public.ored_checkpoints
where part = 'file'
group by sha256
having count(*) > 1;

create view public.ored_checkpoint_groups
with (security_invoker = true) as
select
  s.checkpoint_group_id,
  min(s.run_name) as run_name,
  min(s.kind) as role,
  coalesce(m.is_current, false) as is_current,
  (m.id is not null) as is_complete,
  max(s.epoch) as epoch,
  max(s.global_step) as global_step,
  max(s.world_size) as world_size,
  count(distinct s.rank) filter (where s.upload_status = 'verified') as ranks_verified,
  count(*) filter (where s.upload_status = 'uploading') as files_uploading,
  count(*) filter (where s.upload_status = 'failed') as files_failed,
  (m.metrics ->> 'val_loss')::float8 as val_loss,
  (m.metrics ->> 'val_bpc')::float8 as val_bpc,
  round(sum(s.size_bytes) / 1000000.0, 2) as shards_mb,
  m.object_path as manifest_path,
  min(s.created_at) as started_at,
  m.created_at as completed_at,
  m.id as manifest_id,
  (array_agg(s.session_id))[1] as session_id
from public.ored_checkpoints s
left join public.ored_checkpoints m
  on m.checkpoint_group_id = s.checkpoint_group_id and m.part = 'manifest'
where s.part = 'shard'
group by s.checkpoint_group_id, m.id, m.is_current, m.metrics, m.object_path, m.created_at;

comment on view public.ored_checkpoint_groups is
  'One row per distributed checkpoint: how many ranks have verified shards, whether it is '
  'complete, and whether it is the current live/best.';

create view public.ored_training_worker_status
with (security_invoker = true) as
select
  s.session_key,
  s.run_name,
  w.rank,
  w.node_rank,
  w.local_rank,
  w.hostname,
  w.gpu_name,
  w.device,
  w.status,
  extract(epoch from now() - w.last_heartbeat)::int as seconds_since_heartbeat,
  case
    when w.status in ('completed', 'failed', 'disconnected') then w.status
    when now() - w.last_heartbeat
         > make_interval(secs => 3 * coalesce((s.config -> 'distributed' ->> 'heartbeat_seconds')::int, 30))
      then 'no heartbeat (unknown)'
    else 'alive'
  end as health,
  w.error,
  w.worker_id,
  w.torch_version,
  w.started_at,
  w.finished_at,
  w.last_heartbeat,
  w.session_id,
  w.id
from public.ored_training_workers w
join public.ored_training_sessions s on s.id = w.session_id;

comment on view public.ored_training_worker_status is
  'Workers with their heartbeat age. "no heartbeat (unknown)" means not heard from for three '
  'heartbeat intervals; it does not prove the machine is gone.';

create view public.ored_training_run_overview
with (security_invoker = true) as
select
  s.session_key,
  s.run_name,
  s.status,
  (s.config -> 'distributed' ->> 'world_size')::int as world_size,
  (s.config -> 'distributed' ->> 'backend') as backend,
  count(w.id) as workers,
  count(w.id) filter (where ws.health = 'alive') as workers_alive,
  count(w.id) filter (where ws.health = 'no heartbeat (unknown)') as workers_silent,
  count(w.id) filter (where w.status = 'failed') as workers_failed,
  live.epoch as live_epoch,
  live.global_step as live_step,
  live.val_loss as live_val_loss,
  best.epoch as best_epoch,
  best.val_loss as best_val_loss,
  best.val_bpc as best_val_bpc,
  s.started_at,
  s.finished_at,
  s.error,
  s.metrics,
  s.id as session_id
from public.ored_training_sessions s
left join public.ored_training_workers w on w.session_id = s.id
left join public.ored_training_worker_status ws on ws.id = w.id
left join public.ored_checkpoint_current live on live.run_name = s.run_name and live.role = 'live'
left join public.ored_checkpoint_current best on best.run_name = s.run_name and best.role = 'best'
where s.session_key is not null
group by s.id, live.epoch, live.global_step, live.val_loss, best.epoch, best.val_loss, best.val_bpc;

comment on view public.ored_training_run_overview is
  'One row per distributed session: workers alive / silent / failed, current live and best.';

-- 6. privileges ---------------------------------------------------------------

revoke all on public.ored_checkpoint_groups, public.ored_training_worker_status,
  public.ored_training_run_overview from public, anon, authenticated;
grant select on public.ored_checkpoint_groups, public.ored_training_worker_status,
  public.ored_training_run_overview to service_role;
revoke all on public.ored_checkpoint_overview, public.ored_checkpoint_current,
  public.ored_checkpoint_duplicates from public, anon, authenticated;
grant select on public.ored_checkpoint_overview, public.ored_checkpoint_current,
  public.ored_checkpoint_duplicates to service_role;

revoke all on function public.ored_checkpoint_shard_status(uuid, text) from public, anon, authenticated;
revoke all on function public.ored_checkpoint_finalize_group(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.ored_checkpoint_delete_group(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ored_training_session_claim(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ored_checkpoint_shard_status(uuid, text) to service_role;
grant execute on function public.ored_checkpoint_finalize_group(uuid, jsonb, boolean, uuid) to service_role;
grant execute on function public.ored_checkpoint_delete_group(uuid, boolean) to service_role;
grant execute on function public.ored_training_session_claim(text, text, text, jsonb) to service_role;
