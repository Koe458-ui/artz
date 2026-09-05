create table if not exists public.rate_hits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_hits enable row level security;

create index if not exists rate_hits_window_idx on public.rate_hits (window_start);

create or replace function public.dz_rate_ok(p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  if p_bucket is null or p_window_seconds is null or p_window_seconds < 1 then
    return true;
  end if;
  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_hits (bucket, window_start, hits)
  values (left(p_bucket, 200), v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_hits.hits + 1
  returning hits into v_hits;

  if random() < 0.005 then
    delete from public.rate_hits where window_start < now() - interval '1 hour';
  end if;

  return v_hits <= p_max;
end $$;

revoke all on function public.dz_rate_ok(text, int, int) from anon, authenticated, public;

create or replace function public.dz_download_limit(p_tier text)
returns int
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case lower(coalesce(p_tier, 'guest'))
    when 'dev'     then 100000
    when 'max'     then 20
    when 'premium' then 15
    when 'lite'    then 10
    else 5
  end;
$$;

create or replace function public.dz_request_download(p_artwork uuid, p_ip text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid    uuid := auth.uid();
  v_key    text;
  v_tier   text;
  v_limit  int;
  v_used   int;
  v_full   boolean;
  v_owner  uuid;
  v_status text;
  v_day    timestamptz := date_trunc('day', now());
begin
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth');
  end if;

  if not public.dz_rate_ok('dl:u:' || v_uid::text, 30, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;
  if p_ip is not null and p_ip <> ''
     and not public.dz_rate_ok('dl:ip:' || left(p_ip, 64), 60, 60) then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'retry_after', 60);
  end if;

  select user_id, status into v_owner, v_status
    from public.artworks where id = p_artwork;
  if v_owner is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  if v_owner = v_uid then
    return jsonb_build_object('allowed', true, 'full', true, 'own', true);
  end if;

  if v_status is distinct from 'approved' then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  v_key   := 'u:' || v_uid::text;
  v_tier  := coalesce(public.dz_effective_tier(v_uid), 'guest');
  v_limit := public.dz_download_limit(v_tier);
  v_full  := v_tier in ('premium', 'max', 'dev');

  perform pg_advisory_xact_lock(hashtext(v_key));

  select count(*) into v_used from public.download_events
   where viewer_key = v_key
     and created_at >= v_day;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'limit',
                              'limit', v_limit, 'used', v_used, 'remaining', 0,
                              'tier', v_tier, 'resets_at', v_day + interval '1 day');
  end if;

  insert into public.download_events (viewer_key, artwork_id)
  values (v_key, p_artwork);

  return jsonb_build_object('allowed', true, 'full', v_full,
                            'used', v_used + 1,
                            'remaining', v_limit - v_used - 1,
                            'limit', v_limit, 'tier', v_tier,
                            'resets_at', v_day + interval '1 day');
end $$;

create or replace function public.dz_download_quota()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid   uuid := auth.uid();
  v_tier  text;
  v_limit int;
  v_used  int;
  v_day   timestamptz := date_trunc('day', now());
begin
  if v_uid is null then
    return jsonb_build_object('signed_in', false);
  end if;
  if not public.dz_rate_ok('dq:u:' || v_uid::text, 120, 60) then
    return jsonb_build_object('signed_in', true, 'reason', 'rate');
  end if;
  v_tier  := coalesce(public.dz_effective_tier(v_uid), 'guest');
  v_limit := public.dz_download_limit(v_tier);
  select count(*) into v_used from public.download_events
   where viewer_key = 'u:' || v_uid::text
     and created_at >= v_day;
  return jsonb_build_object('signed_in', true, 'tier', v_tier,
                            'limit', v_limit, 'used', v_used,
                            'remaining', greatest(v_limit - v_used, 0),
                            'resets_at', v_day + interval '1 day');
end $$;

grant execute on function public.dz_request_download(uuid, text) to anon, authenticated;
grant execute on function public.dz_download_quota()             to anon, authenticated;
grant execute on function public.dz_download_limit(text)         to anon, authenticated;
