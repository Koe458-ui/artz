create extension if not exists pgcrypto;

create table public.ored_conversations (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  title          text        not null default '',
  message_count  integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index ored_conversations_user_updated_idx
  on public.ored_conversations (user_id, updated_at desc);

create table public.ored_messages (
  id               uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        not null references public.ored_conversations (id) on delete cascade,
  role             text        not null check (role in ('user', 'assistant')),
  content          text        not null,
  model_version    text,
  created_at       timestamptz not null default now()
);

create index ored_messages_conversation_created_idx
  on public.ored_messages (conversation_id, created_at);

create table public.ored_learning_candidates (
  id               uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        references public.ored_conversations (id) on delete set null,
  prompt           text        not null,
  response         text        not null,
  status           text        not null default 'pending'
                               check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  source           text        not null default 'conversation',
  fingerprint      text        not null,
  redacted         boolean     not null default false,
  quality          real,
  reviewed_by      uuid        references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text        not null default '',
  created_at       timestamptz not null default now()
);

create unique index ored_learning_candidates_fingerprint_idx
  on public.ored_learning_candidates (fingerprint);
create index ored_learning_candidates_status_created_idx
  on public.ored_learning_candidates (status, created_at);

create table public.ored_training_examples (
  id            uuid        primary key default gen_random_uuid(),
  candidate_id  uuid        not null references public.ored_learning_candidates (id) on delete cascade,
  dataset_tag   text        not null,
  prompt        text        not null,
  response      text        not null,
  approved_by   uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index ored_training_examples_candidate_tag_idx
  on public.ored_training_examples (candidate_id, dataset_tag);
create index ored_training_examples_tag_created_idx
  on public.ored_training_examples (dataset_tag, created_at);

create table public.ored_training_sessions (
  id                  uuid        primary key default gen_random_uuid(),
  dataset_tag         text        not null,
  base_version        text,
  status              text        not null default 'queued'
                                  check (status in ('queued', 'running', 'evaluated', 'failed', 'cancelled')),
  config              jsonb       not null default '{}'::jsonb,
  metrics             jsonb       not null default '{}'::jsonb,
  example_count       integer     not null default 0,
  conversation_count  integer     not null default 0,
  error               text        not null default '',
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index ored_training_sessions_status_created_idx
  on public.ored_training_sessions (status, created_at);

create table public.ored_model_versions (
  id               uuid        primary key default gen_random_uuid(),
  version          text        not null unique,
  status           text        not null default 'candidate'
                               check (status in ('candidate', 'production', 'retired')),
  session_id       uuid        references public.ored_training_sessions (id) on delete set null,
  checkpoint_path  text        not null default '',
  metrics          jsonb       not null default '{}'::jsonb,
  notes            text        not null default '',
  promoted_at      timestamptz,
  created_at       timestamptz not null default now()
);

create unique index ored_model_versions_one_production_idx
  on public.ored_model_versions ((status)) where status = 'production';

alter table public.ored_conversations       enable row level security;
alter table public.ored_messages            enable row level security;
alter table public.ored_learning_candidates enable row level security;
alter table public.ored_training_examples   enable row level security;
alter table public.ored_training_sessions   enable row level security;
alter table public.ored_model_versions      enable row level security;

create policy ored_conversations_own on public.ored_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy ored_messages_own on public.ored_messages
  for all to authenticated
  using (exists (
    select 1 from public.ored_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (
    select 1 from public.ored_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()));

grant select, insert, update, delete on public.ored_conversations to authenticated;
grant select, insert, update, delete on public.ored_messages to authenticated;

revoke all on public.ored_conversations       from anon;
revoke all on public.ored_messages            from anon;
revoke all on public.ored_learning_candidates from anon, authenticated;
revoke all on public.ored_training_examples   from anon, authenticated;
revoke all on public.ored_training_sessions   from anon, authenticated;
revoke all on public.ored_model_versions      from anon, authenticated;
