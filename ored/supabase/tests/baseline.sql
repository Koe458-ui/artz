-- The checkpoint-related part of the Ored.ai schema as it stood before
-- 20260924150000_ored_checkpoint_roles.sql, read from the live project's
-- catalog. Used only to test that migration on a throwaway local Postgres;
-- never apply it to the real project.

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create table public.ored_training_sessions (
  id uuid primary key default gen_random_uuid(),
  dataset_tag text not null,
  base_version text,
  status text not null default 'queued'
    check (status = any (array['queued', 'running', 'evaluated', 'failed', 'cancelled'])),
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  example_count integer not null default 0,
  conversation_count integer not null default 0,
  error text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index ored_training_sessions_status_created_idx
  on public.ored_training_sessions (status, created_at);

create table public.ored_model_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'candidate'
    check (status = any (array['candidate', 'production', 'retired'])),
  session_id uuid references public.ored_training_sessions (id) on delete set null,
  checkpoint_path text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  notes text not null default '',
  promoted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index ored_model_versions_one_production_idx
  on public.ored_model_versions (status) where status = 'production';
create index ored_model_versions_session_idx on public.ored_model_versions (session_id);

create table public.ored_checkpoints (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references public.ored_model_versions (id) on delete set null,
  session_id uuid references public.ored_training_sessions (id) on delete set null,
  kind text not null default 'best',
  run_name text not null default '',
  bucket_id text not null default 'ored-checkpoints',
  object_path text not null unique,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text not null default '',
  format_version integer not null default 1,
  torch_version text not null default '',
  epoch integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  constraint ored_checkpoints_kind_check
    check (kind = any (array['base', 'best', 'live', 'export']))
);
create index ored_checkpoints_version_idx on public.ored_checkpoints (version_id);
create index ored_checkpoints_session_idx on public.ored_checkpoints (session_id);
create index ored_checkpoints_run_created_idx
  on public.ored_checkpoints (run_name, created_at desc);
create unique index ored_checkpoints_one_live_idx
  on public.ored_checkpoints (kind) where kind = 'live';

alter table public.ored_training_sessions enable row level security;
alter table public.ored_training_sessions force row level security;
alter table public.ored_model_versions enable row level security;
alter table public.ored_model_versions force row level security;
alter table public.ored_checkpoints enable row level security;
alter table public.ored_checkpoints force row level security;

revoke all on public.ored_training_sessions, public.ored_model_versions,
  public.ored_checkpoints from public, anon, authenticated;
grant all on public.ored_training_sessions, public.ored_model_versions,
  public.ored_checkpoints to service_role;

-- The rows that were in the table when the migration was written (metrics
-- trimmed to the keys that matter).
insert into public.ored_checkpoints
  (id, kind, run_name, object_path, size_bytes, sha256, torch_version, epoch, metrics, created_at)
values
  ('2110a793-f4f0-44e0-ae69-3570ff6ed692', 'best', 'char_transformer_v2',
   'best/char_transformer_v2/2110a793-f4f0-44e0-ae69-3570ff6ed692.pt', 9845919,
   'bf590f51fbbbc6b0ddc3654a5b117b3f0281d6a42ac9f89d3f0b7cb42d2fe42f', '2.11.0+cu128', 8,
   '{"bpc": 0.5881445056100556, "ppl": 1.5033303343892022, "loss": 0.40767070582543297}',
   '2026-09-22 15:58:30+00'),
  ('19b248e8-dac8-408c-96f6-b8efbf3b10c6', 'live', 'live',
   'live/live/19b248e8-dac8-408c-96f6-b8efbf3b10c6.pt', 3282119,
   '1ef85e20f0547299a09c9f6f4ae619dffd3c23afc884f0eb5a390a60a756eed1', '2.11.0+cu128', 0,
   '{"last_loss": 0}', '2026-09-22 16:06:54+00'),
  ('05315ffe-12f4-4252-bf75-894e9616d310', 'best', 'cap50',
   'best/cap50/05315ffe-12f4-4252-bf75-894e9616d310.pt', 9796127,
   '1c989ee41f6230cf54388e036731e12dc638c14440c4331c93894dfe1b24c3f5', '2.11.0+cu128', 21,
   '{"loss": 0.4167892819848554}', '2026-09-22 18:52:57+00'),
  ('6e8bfa27-3b63-49d4-8657-f86d2f0c5963', 'best', 'cap50',
   'best/cap50/6e8bfa27-3b63-49d4-8657-f86d2f0c5963.pt', 9796127,
   '1c989ee41f6230cf54388e036731e12dc638c14440c4331c93894dfe1b24c3f5', '2.11.0+cu128', 21,
   '{"loss": 0.4167892819848554}', '2026-09-22 18:55:27+00'),
  ('a5bef417-7854-45be-8db8-392f543a30e6', 'best', 'ored_v2',
   'best/ored_v2/a5bef417-7854-45be-8db8-392f543a30e6.pt', 10097567,
   '20a65600f11f62ca4827ea1b2cdf6fd73a2b15c21a8546d6c93c51768e5926a8', '2.11.0+cu128', 50,
   '{"loss": 0.4319347128791681}', '2026-09-23 16:49:22+00'),
  ('dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2', 'best', 'ored_v2',
   'best/ored_v2/dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2.pt', 10097567,
   '29ee68ae2028bce99b7b30b646cd5900bf04caeddb949a0b952a9fe90bbf37ea', '2.11.0+cu128', 100,
   '{"loss": 0.3266009567572029}', '2026-09-24 10:57:02+00');

-- ored_datasets as it stood before 20260926120000_ored_training_data.sql
-- (samples trimmed).
create table public.ored_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind = any (array['tabular', 'text'])),
  summary text not null default '',
  generator text not null default '',
  spec jsonb not null default '{}'::jsonb,
  samples jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ored_datasets_name_version_idx on public.ored_datasets (name, version desc);

alter table public.ored_datasets enable row level security;
alter table public.ored_datasets force row level security;
revoke all on public.ored_datasets from public, anon, authenticated;
grant all on public.ored_datasets to service_role;

insert into public.ored_datasets (id, name, kind, generator, spec, created_at)
values
  ('d80b9f60-0f08-4912-a4c0-b076819c8553', 'bit_addition', 'tabular', 'scripts/generate_dataset.py',
   '{"path": "data/raw/bit_addition.csv", "rows": 256}', '2026-09-20 18:13:19+00'),
  ('3823f83e-8965-4d91-baf0-eaf1ab7c2b61', 'char_corpus', 'text', 'scripts/generate_corpus.py',
   '{"path": "data/raw/corpus", "operand_pairs": 961}', '2026-09-20 18:13:19+00');
