-- Follows: the artist -> audience edge the site was missing.
--
-- The relationship was already here under another name: public.profile_creds was a directed unique (giver, receiver)
-- edge with a counter cached on the profile — a follower graph wearing the word "cred". So: rename, not a second graph.
-- Renames keep rows, indexes, foreign keys and policies; only function bodies that spelled the old names are re-emitted.
--
-- Plus: a notification when someone follows you, and the follower/following facts and lists analytics reads.

set check_function_bodies = off;

-- ---------------------------------------------------------------- the edge ---

do $$
begin
  if to_regclass('public.profile_creds') is not null
     and to_regclass('public.follows') is null then
    alter table public.profile_creds rename to follows;
    alter table public.follows rename column giver_id    to follower_id;
    alter table public.follows rename column receiver_id to following_id;
  end if;
end $$;

create table if not exists public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.follows enable row level security;

-- constraints keep their old names through a rename; give them the new one so the next reader is not sent looking
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profile_creds_pkey' and conrelid = 'public.follows'::regclass) then
    alter table public.follows rename constraint profile_creds_pkey to follows_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'profile_creds_giver_id_receiver_id_key' and conrelid = 'public.follows'::regclass) then
    alter table public.follows rename constraint profile_creds_giver_id_receiver_id_key
      to follows_pair_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'profile_creds_check' and conrelid = 'public.follows'::regclass) then
    alter table public.follows rename constraint profile_creds_check to follows_not_self;
  end if;
  if exists (select 1 from pg_constraint where conname = 'profile_creds_giver_id_fkey' and conrelid = 'public.follows'::regclass) then
    alter table public.follows rename constraint profile_creds_giver_id_fkey
      to follows_follower_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'profile_creds_receiver_id_fkey' and conrelid = 'public.follows'::regclass) then
    alter table public.follows rename constraint profile_creds_receiver_id_fkey
      to follows_following_id_fkey;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'follows_not_self' and conrelid = 'public.follows'::regclass) then
    alter table public.follows add constraint follows_not_self
      CHECK (follower_id <> following_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'follows_pair_key' and conrelid = 'public.follows'::regclass) then
    alter table public.follows add constraint follows_pair_key
      UNIQUE (follower_id, following_id);
  end if;
end $$;

-- a feed reads "newest work from people I follow", a profile reads "who follows this artist" — one index each
create index if not exists follows_follower_idx  on public.follows (follower_id, created_at desc);
create index if not exists follows_following_idx on public.follows (following_id, created_at desc);

-- --------------------------------------------------------------- counters ---

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles'
                and column_name = 'cred_received_count')
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'profiles'
                        and column_name = 'follower_count') then
    alter table public.profiles rename column cred_received_count to follower_count;
  end if;
end $$;

alter table public.profiles add column if not exists follower_count  integer not null default 0;
alter table public.profiles add column if not exists following_count integer not null default 0;

CREATE OR REPLACE FUNCTION public.sync_follow_counts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform set_config('app.allow_follow_count_write', '1', true);
  if TG_OP = 'INSERT' then
    update public.profiles set follower_count = coalesce(follower_count, 0) + 1
     where id = NEW.following_id;
    update public.profiles set following_count = coalesce(following_count, 0) + 1
     where id = NEW.follower_id;
    perform set_config('app.allow_follow_count_write', '0', true);
    return NEW;
  else
    update public.profiles set follower_count = greatest(coalesce(follower_count, 0) - 1, 0)
     where id = OLD.following_id;
    update public.profiles set following_count = greatest(coalesce(following_count, 0) - 1, 0)
     where id = OLD.follower_id;
    perform set_config('app.allow_follow_count_write', '0', true);
    return OLD;
  end if;
end $function$;

drop trigger if exists trg_profile_creds_count on public.follows;
drop trigger if exists trg_follows_count       on public.follows;
create trigger trg_follows_count after insert or delete on public.follows
  for each row execute function public.sync_follow_counts();

drop function if exists public.sync_profile_cred_count();

-- counters stay the trigger's to write, exactly as the cred one was
CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  cooldown CONSTANT interval := interval '90 days';
BEGIN
  IF coalesce(current_setting('app.allow_follow_count_write', true), '') <> '1'
     AND NOT public.dz_is_privileged() THEN
    NEW.follower_count  := OLD.follower_count;
    NEW.following_count := OLD.following_count;
  END IF;
  IF coalesce(current_setting('app.allow_merit_write', true), '') <> '1'
     AND NOT public.dz_is_privileged() THEN
    NEW.merit            := OLD.merit;
    NEW.merit_updated_at := OLD.merit_updated_at;
  END IF;
  IF NOT public.dz_is_privileged() THEN
    NEW.role                := OLD.role;
    NEW.subscription_tier   := OLD.subscription_tier;
    NEW.username_changed_at := OLD.username_changed_at;
    IF NEW.username IS DISTINCT FROM OLD.username THEN
      IF OLD.username_changed_at IS NOT NULL
         AND (now() - OLD.username_changed_at) < cooldown THEN
        RAISE EXCEPTION 'USERNAME_COOLDOWN until %',
          (OLD.username_changed_at + cooldown) USING errcode = 'P0001';
      END IF;
      NEW.username_changed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.dz_profiles_guard_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is not null or new.max_claimed or new.partner_since is not null then
      raise exception 'role, max_claimed and partner_since are not yours to set';
    end if;
    if new.subscription_tier is distinct from 'guest'
       or new.subscription_expires_at is not null then
      raise exception 'subscription_tier and subscription_expires_at are not yours to set';
    end if;
    if new.merit is distinct from 100
       or new.follower_count is distinct from 0
       or new.following_count is distinct from 0 then
      raise exception 'merit and the follow counters are not yours to set';
    end if;
  end if;
  return new;
end $function$;

-- Both counters cache the same table. Recount once, so a partly applied history cannot leave a profile claiming an
-- audience it does not have.
select set_config('app.allow_follow_count_write', '1', false);

with n as (
  select p.id,
         (select count(*) from public.follows f where f.following_id = p.id) as followers,
         (select count(*) from public.follows f where f.follower_id  = p.id) as following
    from public.profiles p
)
update public.profiles p
   set follower_count  = n.followers,
       following_count = n.following
  from n
 where n.id = p.id
   and (p.follower_count is distinct from n.followers::integer
     or p.following_count is distinct from n.following::integer);

select set_config('app.allow_follow_count_write', '0', false);

-- ------------------------------------------------------ transition shims ---

-- A rename is only safe while both names answer. A visitor on the pre-follow bundle still asks for cred_received_count,
-- and the service worker holds that bundle a while. PostgREST answers an unknown column with a 400, and the old profile
-- page treats that as fatal and closes itself — so the old names keep working until those clients are gone.
--
-- Both drop-on-sight once the site has been on the follow bundle for a release: the new bundle references neither.

-- read-only and impossible to write: a generated column rejects an INSERT naming it, so the counter stays the trigger's
alter table public.profiles
  add column if not exists cred_received_count integer
  generated always as (follower_count) stored;

grant select (cred_received_count) on public.profiles to anon, authenticated;

-- old Cred button reads/writes the old column names. A view over one table is auto-updatable, and security_invoker
-- keeps the follows row policies in force rather than the view owner's rights.
create or replace view public.profile_creds
  with (security_invoker = true) as
  select f.id,
         f.follower_id  as giver_id,
         f.following_id as receiver_id,
         f.created_at
    from public.follows f;

grant select, insert, delete on public.profile_creds to authenticated;

-- ------------------------------------------------------------------- rls ---

drop policy if exists creds_delete_own       on public.follows;
drop policy if exists creds_insert_own       on public.follows;
drop policy if exists creds_select_own_given on public.follows;
drop policy if exists follows_delete_own     on public.follows;
drop policy if exists follows_insert_own     on public.follows;
drop policy if exists follows_select_mine    on public.follows;

create policy follows_insert_own on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and follower_id <> following_id);
create policy follows_delete_own on public.follows for delete to authenticated
  using (follower_id = auth.uid());
-- both ends of an edge you are on. Someone else's follower list stays a count on the profile.
create policy follows_select_mine on public.follows for select to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
grant select (follower_count, following_count) on public.profiles to anon, authenticated;

-- the abuse gates the cred table carried, under the new name
drop trigger if exists dz_ban_insert_profile_creds    on public.follows;
drop trigger if exists dz_rate_insert_profile_creds   on public.follows;
drop trigger if exists dz_rate_delete_profile_creds   on public.follows;
drop trigger if exists dz_ban_insert_follows          on public.follows;
drop trigger if exists dz_rate_insert_follows         on public.follows;
drop trigger if exists dz_rate_delete_follows         on public.follows;
create trigger dz_ban_insert_follows before insert on public.follows
  for each row execute function public.dz_ban_gate();
create trigger dz_rate_insert_follows before insert on public.follows
  for each row execute function public.dz_write_rate('follows', '120', '3600');
create trigger dz_rate_delete_follows before delete on public.follows
  for each row execute function public.dz_write_rate('deletions', '200', '300');

-- --------------------------------------------------------- notifications ---

-- 'follow' joins the types the bell accepts
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check CHECK (type = ANY (ARRAY[
  'like', 'comment', 'comment_reply', 'follow', 'friend_request', 'friend_accepted', 'mention',
  'community_join', 'community_post', 'community_comment', 'message',
  'artwork_featured', 'artwork_approved', 'artwork_rejected',
  'marketplace_sale', 'marketplace_purchase', 'payment', 'subscription',
  'system', 'admin',
  'comic_approved', 'comic_rejected', 'post_published', 'post_rejected'
]::text[]));

CREATE OR REPLACE FUNCTION public.dz_notify_follow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_who text; v_handle text;
begin
  if new.following_id = new.follower_id then return new; end if;
  v_who    := public.dz_notif_who(new.follower_id);
  v_handle := (select username from public.profiles where id = new.follower_id);
  perform public.dz_notify(new.following_id, 'follow', 'New follower',
    v_who || ' started following you.',
    p_actor     => new.follower_id,
    p_group_key => 'follow:' || new.following_id::text,
    p_url       => case when v_handle is null then '/' else '/profile/' || v_handle end,
    p_regroup   => v_who || ' and {n} other{s} started following you.');
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_follow on public.follows;
create trigger dz_notify_follow after insert on public.follows
  for each row execute function public.dz_notify_follow();

revoke all on function public.dz_notify_follow()    from public, anon, authenticated;
revoke all on function public.sync_follow_counts()  from public, anon, authenticated;
grant execute on function public.dz_notify_follow(), public.sync_follow_counts(),
  public.guard_profile_update(), public.dz_profiles_guard_insert() to service_role;

-- ------------------------------------------------- the last of the cred ---

-- Nothing writes 'cred' now. Old rows say what a follow says, so rename — except where a follow for that
-- reader/artist/day exists, which the once-per-day unique index would refuse.
delete from public.analytics_events a
 where a.event = 'cred'
   and exists (
     select 1 from public.analytics_events b
      where b.event = 'follow'
        and b.owner_id = a.owner_id
        and coalesce(b.subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(a.subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and b.viewer_key = a.viewer_key
        and coalesce(b.term, '') = coalesce(a.term, '')
        and b.day = a.day);

update public.analytics_events set event = 'follow' where event = 'cred';

alter table public.analytics_events drop constraint if exists an_ev_event;
alter table public.analytics_events add constraint an_ev_event CHECK ((event = ANY (ARRAY[
  'view'::text, 'like'::text, 'unlike'::text, 'bookmark'::text, 'unbookmark'::text,
  'download'::text, 'comment'::text, 'share'::text, 'profile_view'::text,
  'search_impression'::text, 'search_click'::text, 'follow'::text, 'unfollow'::text])));

-- and the tracker stops accepting the word. Its old branch hashed the viewer key so a cred could not be traced back.
CREATE OR REPLACE FUNCTION public.dz_analytics_track(p_event text, p_subject uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'artwork'::text, p_owner uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text, p_ref text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_term text DEFAULT NULL::text, p_anon_key text DEFAULT NULL::text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_key    text;
  v_owner  uuid;
  v_source text;
  v_device text;
  v_term   text;
  v_ref    text;
  v_scope  text;
  v_actor  uuid;
begin
  if p_event is null then return; end if;

  if p_event not in ('like','unlike','bookmark','unbookmark','comment','share',
                     'profile_view','search_impression','search_click',
                     'follow','unfollow') then
    return;
  end if;

  v_key := public.dz_an_viewer_key(p_anon_key);
  if v_key is null then return; end if;

  if not public.dz_rate_ok('an:' || v_key, 240, 60) then return; end if;

    -- 'resources' = interface name, 'resource' = what every table stores. One spelling from here down.
  v_scope := lower(coalesce(p_scope, 'artwork'));
  if v_scope = 'resources' then v_scope := 'resource'; end if;

    -- Who this lands on. Each kind answers from its own table; only publicly reachable rows count.
  if p_subject is not null and v_scope = 'artwork' then
    select a.user_id into v_owner from public.artworks a
     where a.id = p_subject and a.status = 'approved';
  elsif p_subject is not null and v_scope = 'marketplace' then
    select m.user_id into v_owner from public.marketplace_items m
     where m.id = p_subject and m.status = 'approved' and m.visibility = 'published';
  elsif p_subject is not null and v_scope = 'blog' then
    select b.user_id into v_owner from public.blog_posts b
     where b.id = p_subject and b.status = 'approved' and b.visibility = 'published';
  elsif p_subject is not null and v_scope = 'resource' then
    select r.user_id into v_owner from public.resources r
     where r.id = p_subject and r.status = 'approved' and r.visibility = 'published';
  elsif p_event in ('profile_view','follow','unfollow') and p_owner is not null then
    select p.id into v_owner from public.profiles p where p.id = p_owner;
  end if;
  if v_owner is null then return; end if;

  if auth.uid() is not null and auth.uid() = v_owner then return; end if;

  v_source := lower(coalesce(p_source, 'direct'));
  if v_source not in ('direct','social','search','referral','internal') then
    v_source := 'direct';
  end if;

  v_device := lower(coalesce(p_device, 'unknown'));
  if v_device not in ('mobile','tablet','desktop') then
    v_device := 'unknown';
  end if;

  v_term := nullif(btrim(lower(coalesce(p_term, ''))), '');
  if v_term is not null then v_term := left(v_term, 80); end if;
  if p_event not in ('search_impression','search_click') then v_term := null; end if;

  v_ref := nullif(btrim(lower(coalesce(p_ref, ''))), '');
  if v_ref is not null then
    v_ref := nullif(left(regexp_replace(v_ref, '[^a-z0-9.:-]', '', 'g'), 120), '');
  end if;

  if p_event in ('profile_view','follow','unfollow') then
    v_scope := 'profile';
  end if;
  if v_scope not in ('artwork','marketplace','blog','resource','profile') then
    v_scope := 'artwork';
  end if;

    -- A follow is not anonymous (cred was): the artist is shown who followed, so this row carries its actor.
  v_actor := auth.uid();

  insert into public.analytics_events
    (owner_id, actor_id, viewer_key, scope, subject_id, event,
     source, referrer_host, country, device, term)
  values
    (v_owner, v_actor, v_key, v_scope, p_subject, p_event,
     v_source, v_ref, public.dz_an_country(p_country), v_device, v_term)
  on conflict do nothing;
end $function$;

-- ------------------------------------------------------------- rankings ---

-- cred column of the score set becomes followers = return type change: readers first, then the set
drop function if exists public.get_rank_board(text, integer, integer);
drop function if exists public.get_rank_me(text);
drop function if exists public.rank_scores();

CREATE FUNCTION public.rank_scores()
RETURNS TABLE(id uuid, username text, avatar_url text, lvl integer, xp bigint,
              followers bigint, likes bigint, bookmarks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with agg as (
    select
      p.id, p.username, p.avatar_url,
      coalesce(p.follower_count,0)::bigint as followers,
      coalesce(a.up,0)::bigint  as up,
      coalesce(a.lk,0)::bigint  as likes,
      coalesce(a.bm,0)::bigint  as bookmarks,
      coalesce(lg.c,0)::bigint  as likes_given,
      coalesce(bg.c,0)::bigint  as bm_given,
      coalesce(cm.c,0)::bigint  as comments
    from profiles p
    left join (
      select user_id,
             count(*)                        as up,
             coalesce(sum(like_count),0)     as lk,
             coalesce(sum(bookmark_count),0) as bm
      from artworks
      where status = 'approved' and user_id is not null
      group by 1
    ) a on a.user_id = p.id
    left join (select user_id, count(*) c from artwork_likes     group by 1) lg on lg.user_id = p.id
    left join (select user_id, count(*) c from artwork_bookmarks group by 1) bg on bg.user_id = p.id
    left join (select user_id, count(*) c from comments where user_id is not null group by 1) cm on cm.user_id = p.id
    where p.username is not null
  )
  select
    id, username, avatar_url,
    public.xp_to_level((up*10 + likes_given*2 + bm_given*2 + comments)::int) as lvl,
    (up*10 + likes_given*2 + bm_given*2 + comments)::bigint                  as xp,
    followers, likes, bookmarks
  from agg
$function$;

CREATE FUNCTION public.get_rank_board(board text, lim integer DEFAULT 20, off integer DEFAULT 0)
RETURNS TABLE(rnk bigint, uid uuid, username text, avatar_url text, score bigint, lvl integer, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with pick as (
    select s.id, s.username, s.avatar_url, s.lvl,
      case lower(coalesce(board,'level'))
        when 'followers' then s.followers
        when 'likes'     then s.likes
        when 'bookmarks' then s.bookmarks
        else s.xp
      end as score
    from public.rank_scores() s
  ),
  ranked as (
    select rank() over (order by score desc) as rnk,
           count(*) over ()                  as total,
           id, username, avatar_url, lvl, score
    from pick
    where score > 0
  )
  select rnk, id, username, avatar_url, score, lvl, total
  from ranked
  order by rnk asc, username asc
  limit  greatest(1, least(coalesce(lim,20), 50))
  offset greatest(0, coalesce(off,0))
$function$;

CREATE FUNCTION public.get_rank_me(board text)
RETURNS TABLE(rnk bigint, score bigint, lvl integer, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  with pick as (
    select s.id, s.lvl,
      case lower(coalesce(board,'level'))
        when 'followers' then s.followers
        when 'likes'     then s.likes
        when 'bookmarks' then s.bookmarks
        else s.xp
      end as score
    from public.rank_scores() s
  ),
  ranked as (
    select rank() over (order by score desc) as rnk,
           count(*) over ()                  as total,
           id, lvl, score
    from pick
    where score > 0
  )
  select r.rnk, r.score, r.lvl, r.total
  from ranked r
  where r.id = auth.uid()
$function$;

grant execute on function public.rank_scores() to service_role;
grant execute on function public.get_rank_board(board text, lim integer, off integer),
                          public.get_rank_me(board text)
  to PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------ analytics ---

-- same function, account block now reports followers/following + the two lists the Account section shows

CREATE OR REPLACE FUNCTION public.dz_analytics_activity(p_days integer DEFAULT 30, p_scope text DEFAULT 'artwork'::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_me   uuid := auth.uid();
  v_days int  := public.dz_an_days(p_days);
  v_sc   text := public.dz_an_scope(p_scope);
  v_to   date := current_date;
  v_from date := current_date - (v_days - 1);
  v_out  jsonb;
begin
  if v_me is null then return jsonb_build_object('error', 'auth'); end if;

  update public.analytics_goals g
     set achieved_at = now()
   where g.user_id = v_me
     and g.scope = v_sc
     and g.achieved_at is null
     and public.dz_an_goal_progress(v_me, g.metric, g.period, g.scope) >= g.target;

  with mine as (select i.id, i.title from public.an_item i
                 where i.user_id = v_me and i.kind = v_sc),
  eng as (
    select
      (select count(*) from public.an_view d join mine m on m.id = d.subject_id
        where d.kind = v_sc and d.day between v_from and v_to)::bigint as views,
      (select count(*) from public.an_like l join mine m on m.id = l.subject_id
        where l.kind = v_sc and l.created_at::date between v_from and v_to)::bigint as likes,
      (select count(*) from public.an_bookmark b join mine m on m.id = b.subject_id
        where b.kind = v_sc and b.created_at::date between v_from and v_to)::bigint as bookmarks,
      (select count(*) from public.item_comments c join mine m on m.id = c.subject_id
        where c.kind = v_sc and c.user_id <> v_me
          and c.created_at::date between v_from and v_to)::bigint as comments,
      (select count(*) from public.an_download d join mine m on m.id = d.subject_id
        where d.kind = v_sc and d.day between v_from and v_to)::bigint as downloads,
      (select count(*) from public.analytics_events e
        where e.owner_id = v_me and e.event = 'share' and e.scope = v_sc
          and e.day between v_from and v_to)::bigint as shares
  ),
  fseries as (
    select jsonb_agg(jsonb_build_object('d', cal.day, 'gained', coalesce(g.n, 0)) order by cal.day) as list
      from (select gs::date as day from generate_series(v_from, v_to, interval '1 day') gs) cal
      left join (
        select f.created_at::date as day, count(*)::bigint as n
          from public.follows f
         where f.following_id = v_me and f.created_at::date between v_from and v_to
         group by 1
      ) g on g.day = cal.day
  ),
  recent_followers as (
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', coalesce(nullif(p.display_name, ''), p.username, 'Artist'),
             'handle', p.username, 'avatar', p.avatar_url, 'at', f.at) order by f.at desc) as list
      from (
        select f.follower_id as other, f.created_at as at
          from public.follows f where f.following_id = v_me
         order by f.created_at desc limit 100
      ) f join public.profiles p on p.id = f.other
  ),
  recent_following as (
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', coalesce(nullif(p.display_name, ''), p.username, 'Artist'),
             'handle', p.username, 'avatar', p.avatar_url, 'at', f.at) order by f.at desc) as list
      from (
        select f.following_id as other, f.created_at as at
          from public.follows f where f.follower_id = v_me
         order by f.created_at desc limit 100
      ) f join public.profiles p on p.id = f.other
  ),
  goals as (
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'metric', g.metric, 'target', g.target, 'period', g.period,
             'progress', public.dz_an_goal_progress(v_me, g.metric, g.period, g.scope),
             'achieved_at', g.achieved_at, 'created_at', g.created_at)
             order by g.created_at) as list
      from public.analytics_goals g where g.user_id = v_me and g.scope = v_sc
  ),
  feed as (
    select jsonb_agg(jsonb_build_object('event', event, 'at', at, 'title', title, 'artwork', aid)
                     order by at desc) as list
      from (
        select 'like'::text as event, l.created_at as at, m.title, m.id as aid
          from public.an_like l join mine m on m.id = l.subject_id where l.kind = v_sc
        union all
        select 'bookmark', b.created_at, m.title, m.id
          from public.an_bookmark b join mine m on m.id = b.subject_id where b.kind = v_sc
        union all
        select 'comment', c.created_at, m.title, m.id
          from public.item_comments c join mine m on m.id = c.subject_id
         where c.kind = v_sc and c.user_id <> v_me
        order by at desc limit 100
      ) s
  ),
  money as (
    select
      coalesce(sum(e.net_amount), 0)::bigint   as net,
      coalesce(sum(e.gross_amount), 0)::bigint as gross,
      coalesce(sum(e.fee_amount), 0)::bigint   as fees,
      count(*)::bigint                         as sales,
      coalesce(max(e.currency), (select currency from public.profiles where id = v_me), 'USD') as currency
      from public.marketplace_earnings e
     where e.seller_id = v_me
       and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
       and e.created_at::date between v_from and v_to
  ),
  money_all as (
    select
      coalesce(sum(e.net_amount), 0)::bigint as net,
      coalesce(sum(e.net_amount) filter (where e.available_at is not null
                                           and e.available_at <= now()), 0)::bigint as available,
      coalesce(sum(e.net_amount) filter (where e.available_at is null
                                           or e.available_at > now()), 0)::bigint as pending
      from public.marketplace_earnings e
     where e.seller_id = v_me
       and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
  ),
  mseries as (
    select jsonb_agg(jsonb_build_object('d', cal.day, 'net', coalesce(s.n, 0), 'sales', coalesce(s.c, 0))
                     order by cal.day) as list
      from (select gs::date as day from generate_series(v_from, v_to, interval '1 day') gs) cal
      left join (
        select e.created_at::date as day, coalesce(sum(e.net_amount), 0)::bigint as n,
               count(*)::bigint as c
          from public.marketplace_earnings e
         where e.seller_id = v_me
           and coalesce(e.status, '') not in ('refunded','reversed','cancelled')
           and e.created_at::date between v_from and v_to
         group by 1
      ) s on s.day = cal.day
  )
  select jsonb_build_object(
    'scope', v_sc,
    'range', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_to),
    'engagement', (select jsonb_build_object(
        'views', views, 'likes', likes, 'bookmarks', bookmarks, 'comments', comments,
        'downloads', downloads, 'shares', shares,
        'rate', case when views > 0
                     then round(((likes + bookmarks + comments + shares)::numeric / views) * 100, 1)
                     else 0 end,
        'like_rate',    case when views > 0 then round((likes::numeric / views) * 100, 1) else 0 end,
        'save_rate',    case when views > 0 then round((bookmarks::numeric / views) * 100, 1) else 0 end,
        'comment_rate', case when views > 0 then round((comments::numeric / views) * 100, 1) else 0 end
      ) from eng),
    'activity', coalesce((select list from feed), '[]'::jsonb),
    'account', jsonb_build_object(
      'followers_total',  (select count(*) from public.follows f where f.following_id = v_me),
      'followers_gained', (select count(*) from public.follows f
                            where f.following_id = v_me and f.created_at::date between v_from and v_to),
      'followers_lost',   (select count(*) from public.analytics_events e
                            where e.owner_id = v_me and e.event = 'unfollow'
                              and e.day between v_from and v_to),
      'following_total',  (select count(*) from public.follows f where f.follower_id = v_me),
      'following_gained', (select count(*) from public.follows f
                            where f.follower_id = v_me and f.created_at::date between v_from and v_to),
      'followers_series', coalesce((select list from fseries), '[]'::jsonb),
      'followers_list',   coalesce((select list from recent_followers), '[]'::jsonb),
      'following_list',   coalesce((select list from recent_following), '[]'::jsonb),
      'profile_views', (select count(*) from public.analytics_events e
                         where e.owner_id = v_me and e.event = 'profile_view'
                           and e.day between v_from and v_to),
      'communities_owned',  (select count(*) from public.communities c where c.owner_id = v_me),
      'communities_joined', (select count(*) from public.community_members cm
                              where cm.user_id = v_me and coalesce(cm.banned, false) = false),
      'messages', (select count(*) from public.comments c
                    where c.user_id = v_me and c.created_at::date between v_from and v_to),
      'dms', (select count(*) from public.direct_messages d
               where d.sender_id = v_me and d.created_at::date between v_from and v_to),
      'comments_made', (select count(*) from public.item_comments c
                         where c.user_id = v_me and c.created_at::date between v_from and v_to),
      'friends', (select count(*) from public.friendships f
                   where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)),
      'merit', (select coalesce(merit, 100) from public.profiles where id = v_me)
    ),
    'revenue', case when v_sc = 'marketplace' then (
        select jsonb_build_object(
          'currency', m.currency, 'net', m.net, 'gross', m.gross, 'fees', m.fees,
          'sales', m.sales, 'net_all', ma.net,
          'available', ma.available, 'pending', ma.pending,
          'series', coalesce((select list from mseries), '[]'::jsonb))
          from money m, money_all ma
      ) else null end,
    'goals',        coalesce((select list from goals), '[]'::jsonb),
    'achievements', public.dz_an_achievements(v_me, v_sc)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end $function$;


grant execute on function public.dz_analytics_activity(p_days integer, p_scope text)
  to authenticated, service_role;
