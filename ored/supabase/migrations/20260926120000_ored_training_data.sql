-- Ored manual training data and reproducible dataset snapshots.
--
-- Builds on 20260924170000_ored_distributed_training.sql. See
-- ored/model/docs/training-data.md for the design.
--
--   1. ored_training_data: manually managed training records (questions,
--      facts, vocabulary, conversations, ...). Separate from
--      ored_training_examples, which stays the conversation-learning table and
--      keeps requiring a candidate_id. A trigger normalises the classification
--      fields and computes the fingerprint, so a row typed into the dashboard
--      is fingerprinted exactly like one inserted by the trainer. The
--      fingerprint is unique: an exact duplicate is refused, never merged.
--   2. ored_training_data_summary: counts per tag / category / subject / type.
--   3. ored_datasets becomes the version record of a snapshot: one row per
--      (name, version), with the snapshot's content hash, record count,
--      selection and split counts. Rows written by a snapshot are immutable.
--      The two existing rows (bit_addition, char_corpus) are untouched apart
--      from receiving the column defaults (source = 'generated').
--   4. ored_dataset_register(): gives a snapshot the next version of its name,
--      or returns the existing row when the same content was registered before.
--   5. ored_training_sessions.dataset_id: which snapshot a session trained on.
--   6. ored_checkpoint_lineage: checkpoint -> session -> dataset, for answering
--      "which data produced this checkpoint?".
--   7. A private ored-datasets Storage bucket for snapshot files.
--
-- Nothing is dropped except the unique constraint on ored_datasets.name, which
-- is replaced by unique (name, version), and the (name, version desc) index
-- that the new constraint's index makes redundant. No existing row changes.
--
-- Security: every new table has RLS enabled and forced with no policy; views
-- are security_invoker; functions, views and tables are granted to
-- service_role only. anon and authenticated get nothing.

-- 1. ored_training_data --------------------------------------------------------

create function public.ored_training_data_slug(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(p_value, E' \t\n\r\f\x0b')), '[ /-]+', '_', 'g'), '');
$$;

create function public.ored_training_data_fingerprint(
  p_type text,
  p_category text,
  p_subject text,
  p_topic text,
  p_input text,
  p_output text,
  p_language text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws(chr(31),
    'v1',
    lower(btrim(regexp_replace(normalize(coalesce(p_type, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')),
    lower(btrim(regexp_replace(normalize(coalesce(p_category, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')),
    lower(btrim(regexp_replace(normalize(coalesce(p_subject, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')),
    lower(btrim(regexp_replace(normalize(coalesce(p_topic, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')),
    lower(btrim(regexp_replace(normalize(coalesce(p_language, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')),
    btrim(regexp_replace(normalize(coalesce(p_input, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' '),
    btrim(regexp_replace(normalize(coalesce(p_output, ''), nfc), E'[ \\t\\n\\r\\f\\v]+', ' ', 'g'), ' ')
  ), 'UTF8')), 'hex');
$$;

comment on function public.ored_training_data_fingerprint(text, text, text, text, text, text, text) is
  'sha256 of the normalised record (NFC, whitespace runs collapsed, keys lowercased). '
  'Mirrored by ored.data.training_data.fingerprint_of in Python; a test keeps them equal.';

create table public.ored_training_data (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  category text not null,
  subject text,
  topic text,
  input text not null,
  output text not null,
  difficulty text,
  language text not null default 'en',
  source text not null default 'manual',
  dataset_tag text,
  enabled boolean not null default true,
  verified boolean not null default false,
  fingerprint text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ored_training_data_type_check check (type in (
    'qna', 'fact', 'definition', 'vocabulary', 'sentence', 'conversation', 'instruction',
    'comprehension', 'correction', 'translation', 'math', 'reasoning', 'writing', 'classification')),
  constraint ored_training_data_category_check check (category in (
    'language_foundation', 'grammar', 'sentences', 'general_knowledge', 'qna', 'conversation',
    'mathematics', 'science', 'computer_science', 'engineering', 'reasoning', 'instructions',
    'reading', 'writing', 'language_skills', 'data', 'everyday', 'safety', 'ored')),
  constraint ored_training_data_subject_check
    check (subject is null or subject ~ '^[a-z0-9][a-z0-9_]{0,63}$'),
  constraint ored_training_data_topic_check
    check (topic is null or topic ~ '^[a-z0-9][a-z0-9_]{0,63}$'),
  constraint ored_training_data_difficulty_check
    check (difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),
  constraint ored_training_data_language_check
    check (language ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'),
  constraint ored_training_data_source_check
    check (source ~ '^[a-z0-9][a-z0-9_]{0,31}$'),
  constraint ored_training_data_dataset_tag_check
    check (dataset_tag is null or (dataset_tag ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' and dataset_tag <> 'all')),
  constraint ored_training_data_input_check
    check (input ~ '[^[:space:]]' and char_length(input) <= 10000
           and input !~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]'),
  constraint ored_training_data_output_check
    check (output ~ '[^[:space:]]' and char_length(output) <= 10000
           and output !~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]'),
  constraint ored_training_data_fingerprint_check check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ored_training_data_metadata_check check (jsonb_typeof(metadata) = 'object')
);

comment on table public.ored_training_data is
  'Manually managed training records. Trained on through an immutable snapshot '
  '(ored_datasets), never read batch by batch. Default selection: enabled and verified.';
comment on column public.ored_training_data.type is
  'The record''s shape, which decides its text form: qna, fact, vocabulary, conversation, ...';
comment on column public.ored_training_data.category is
  'Top-level area: language_foundation, grammar, science, mathematics, conversation, ...';
comment on column public.ored_training_data.fingerprint is
  'Set by the trigger from the normalised content. Unique: an exact duplicate is refused.';
comment on column public.ored_training_data.verified is
  'Only verified rows enter a training snapshot unless the run explicitly asks otherwise.';
comment on column public.ored_training_data.enabled is
  'false keeps the row out of every snapshot, whatever else is asked.';
comment on column public.ored_training_data.metadata is
  'Free-form. metadata.group keeps related rows in the same train/val/test split.';

create function public.ored_training_data_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.type := public.ored_training_data_slug(new.type);
  new.category := public.ored_training_data_slug(new.category);
  new.subject := public.ored_training_data_slug(new.subject);
  new.topic := public.ored_training_data_slug(new.topic);
  new.difficulty := public.ored_training_data_slug(new.difficulty);
  new.source := coalesce(public.ored_training_data_slug(new.source), 'manual');
  new.language := coalesce(nullif(lower(btrim(new.language, E' \t\n\r\f\x0b')), ''), 'en');
  new.dataset_tag := nullif(btrim(new.dataset_tag, E' \t\n\r\f\x0b'), '');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.fingerprint := public.ored_training_data_fingerprint(
    new.type, new.category, new.subject, new.topic, new.input, new.output, new.language);
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger ored_training_data_prepare
  before insert or update on public.ored_training_data
  for each row execute function public.ored_training_data_prepare();

create unique index ored_training_data_fingerprint_idx
  on public.ored_training_data (fingerprint);
create index ored_training_data_selection_idx
  on public.ored_training_data (dataset_tag, fingerprint) where enabled;
create index ored_training_data_category_idx
  on public.ored_training_data (category, subject, topic);
create index ored_training_data_updated_idx
  on public.ored_training_data (updated_at desc);

alter table public.ored_training_data enable row level security;
alter table public.ored_training_data force row level security;
revoke all on public.ored_training_data from public, anon, authenticated;
grant all on public.ored_training_data to service_role;

-- 2. summary -----------------------------------------------------------------

create view public.ored_training_data_summary
with (security_invoker = true) as
select
  coalesce(dataset_tag, '') as dataset_tag,
  category,
  coalesce(subject, '') as subject,
  type,
  language,
  count(*) as records,
  count(*) filter (where enabled and verified) as trainable,
  count(*) filter (where enabled and not verified) as awaiting_review,
  count(*) filter (where not enabled) as disabled,
  max(updated_at) as last_updated
from public.ored_training_data
group by 1, 2, 3, 4, 5;

comment on view public.ored_training_data_summary is
  'Rows per tag / category / subject / type / language. trainable = enabled and verified.';

-- 3. ored_datasets as snapshot versions ----------------------------------------

alter table public.ored_datasets
  add column source text not null default 'generated',
  add column sha256 text,
  add column record_count integer not null default 0,
  add column selection jsonb not null default '{}'::jsonb,
  add column split_counts jsonb not null default '{}'::jsonb,
  add column storage_path text;

comment on column public.ored_datasets.source is
  'generated = produced by a generator script; supabase = a snapshot of ored_training_data.';
comment on column public.ored_datasets.sha256 is
  'Content hash of the snapshot: every selected record''s fingerprint, split and text.';
comment on column public.ored_datasets.selection is
  'The rule that chose the records (tag, filters, enabled/verified, as_of).';
comment on column public.ored_datasets.split_counts is
  'Records per split: {"train": n, "val": n, "test": n}.';
comment on column public.ored_datasets.storage_path is
  'Folder in the ored-datasets bucket holding the snapshot files, once uploaded.';

alter table public.ored_datasets
  add constraint ored_datasets_source_check check (source in ('generated', 'supabase')),
  add constraint ored_datasets_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add constraint ored_datasets_record_count_check check (record_count >= 0),
  add constraint ored_datasets_selection_check check (jsonb_typeof(selection) = 'object'),
  add constraint ored_datasets_split_counts_check check (jsonb_typeof(split_counts) = 'object'),
  add constraint ored_datasets_snapshot_check check (source <> 'supabase' or sha256 is not null),
  add constraint ored_datasets_version_check check (version >= 1);

alter table public.ored_datasets drop constraint ored_datasets_name_key;
alter table public.ored_datasets
  add constraint ored_datasets_name_version_key unique (name, version);
drop index public.ored_datasets_name_version_idx;

create unique index ored_datasets_name_sha256_idx
  on public.ored_datasets (name, sha256) where sha256 is not null;

create function public.ored_datasets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source <> 'supabase' then
    return new;
  end if;
  if (new.id, new.name, new.version, new.kind, new.source, new.sha256, new.record_count,
      new.selection, new.split_counts, new.spec, new.samples, new.created_at)
     is distinct from
     (old.id, old.name, old.version, old.kind, old.source, old.sha256, old.record_count,
      old.selection, old.split_counts, old.spec, old.samples, old.created_at)
  then
    raise exception 'dataset % v% is a snapshot and immutable: take a new snapshot instead',
      old.name, old.version using errcode = 'check_violation';
  end if;
  if new.storage_path is distinct from old.storage_path and old.storage_path is not null then
    raise exception 'dataset % v% already records where its files are', old.name, old.version
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ored_datasets_guard
  before update on public.ored_datasets
  for each row execute function public.ored_datasets_guard();

-- 4. register ----------------------------------------------------------------

create function public.ored_dataset_register(p_row jsonb)
returns public.ored_datasets
language plpgsql
set search_path = ''
as $$
declare
  incoming public.ored_datasets;
  stored public.ored_datasets;
begin
  incoming := jsonb_populate_record(null::public.ored_datasets, p_row);
  if coalesce(incoming.name, '') = '' or incoming.sha256 is null then
    raise exception 'a snapshot needs a name and a sha256' using errcode = 'not_null_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('ored_datasets:' || incoming.name));

  select * into stored from public.ored_datasets
   where name = incoming.name and sha256 = incoming.sha256;
  if found then
    return stored;
  end if;

  perform 1 from public.ored_datasets where name = incoming.name and source <> 'supabase';
  if found then
    raise exception 'dataset name % belongs to a generated dataset; choose another tag', incoming.name
      using errcode = 'unique_violation';
  end if;

  insert into public.ored_datasets
    (id, name, kind, summary, generator, spec, samples, version, source, sha256,
     record_count, selection, split_counts, storage_path)
  values
    (coalesce(incoming.id, gen_random_uuid()), incoming.name, coalesce(incoming.kind, 'text'),
     coalesce(incoming.summary, ''), coalesce(incoming.generator, ''),
     coalesce(incoming.spec, '{}'::jsonb), coalesce(incoming.samples, '[]'::jsonb),
     (select coalesce(max(version), 0) + 1 from public.ored_datasets where name = incoming.name),
     'supabase', incoming.sha256, coalesce(incoming.record_count, 0),
     coalesce(incoming.selection, '{}'::jsonb), coalesce(incoming.split_counts, '{}'::jsonb),
     incoming.storage_path)
  returning * into stored;
  return stored;
end;
$$;

-- 5. sessions ----------------------------------------------------------------

alter table public.ored_training_sessions
  add column dataset_id uuid references public.ored_datasets (id) on delete restrict;

create index ored_training_sessions_dataset_idx on public.ored_training_sessions (dataset_id);

comment on column public.ored_training_sessions.dataset_id is
  'The ored_datasets snapshot this session trained on. Null for runs on a generated corpus.';

-- 6. lineage -----------------------------------------------------------------

create view public.ored_checkpoint_lineage
with (security_invoker = true) as
select
  c.id as checkpoint_id,
  c.run_name,
  c.kind as role,
  c.is_current,
  c.epoch,
  c.global_step,
  coalesce((c.metrics ->> 'val_loss')::float8, (c.metrics ->> 'loss')::float8) as val_loss,
  c.object_path,
  c.created_at,
  c.session_id,
  s.status as session_status,
  s.dataset_tag,
  s.example_count,
  d.id as dataset_id,
  d.name as dataset_name,
  d.version as dataset_version,
  d.sha256 as dataset_sha256,
  d.record_count,
  d.split_counts,
  d.selection,
  d.storage_path as dataset_storage_path,
  s.config -> 'dataset' ->> 'git_commit' as git_commit,
  c.version_id,
  v.version as model_version,
  v.status as model_version_status
from public.ored_checkpoints c
left join public.ored_training_sessions s on s.id = c.session_id
left join public.ored_datasets d on d.id = s.dataset_id
left join public.ored_model_versions v on v.id = c.version_id
where c.part <> 'shard';

comment on view public.ored_checkpoint_lineage is
  'Every checkpoint with the session and dataset snapshot that produced it. Checkpoints '
  'from before dataset tracking have null dataset columns.';

-- 7. storage -----------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ored-datasets', 'ored-datasets', false, 1073741824, array['application/octet-stream'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- 8. privileges ----------------------------------------------------------------

revoke all on public.ored_training_data_summary, public.ored_checkpoint_lineage
  from public, anon, authenticated;
grant select on public.ored_training_data_summary, public.ored_checkpoint_lineage to service_role;

revoke all on function public.ored_training_data_slug(text) from public, anon, authenticated;
revoke all on function public.ored_training_data_fingerprint(text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.ored_training_data_prepare() from public, anon, authenticated;
revoke all on function public.ored_datasets_guard() from public, anon, authenticated;
revoke all on function public.ored_dataset_register(jsonb) from public, anon, authenticated;
grant execute on function public.ored_training_data_slug(text) to service_role;
grant execute on function public.ored_training_data_fingerprint(text, text, text, text, text, text, text)
  to service_role;
grant execute on function public.ored_dataset_register(jsonb) to service_role;
