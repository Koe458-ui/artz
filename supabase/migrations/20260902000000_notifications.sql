-- Notifications, widened.
--
-- The table, the read table and the bell existed; what was missing was everywhere a notification should come from.
-- This adds the target columns, one helper every event goes through, and a trigger per event. Nothing writes to
-- public.notifications from the client: every insert below runs inside a SECURITY DEFINER function attached to a
-- trusted row change, and the admin path checks staff itself.

set check_function_bodies = off;

-- ---------------------------------------------------------------- columns ---

alter table public.notifications
  add column if not exists actor_id              uuid,
  add column if not exists artwork_id            uuid,
  add column if not exists comment_id            bigint,
  add column if not exists community_id          uuid,
  add column if not exists conversation_id       uuid,
  add column if not exists marketplace_order_id  uuid,
  add column if not exists target_url            text,
  add column if not exists group_key             text,
  add column if not exists group_count           integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_actor_id_fkey') then
    alter table public.notifications add constraint notifications_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_artwork_id_fkey') then
    alter table public.notifications add constraint notifications_artwork_id_fkey
      FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_community_id_fkey') then
    alter table public.notifications add constraint notifications_community_id_fkey
      FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_conversation_id_fkey') then
    alter table public.notifications add constraint notifications_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_order_id_fkey') then
    alter table public.notifications add constraint notifications_order_id_fkey
      FOREIGN KEY (marketplace_order_id) REFERENCES public.payments(id) ON DELETE SET NULL;
  end if;
end $$;

-- every type the app can raise, plus the four legacy ones the scheduler writes
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check CHECK (type = ANY (ARRAY[
  'like', 'comment', 'comment_reply', 'friend_request', 'friend_accepted', 'mention',
  'community_join', 'community_post', 'community_comment', 'message',
  'artwork_featured', 'artwork_approved', 'artwork_rejected',
  'marketplace_sale', 'marketplace_purchase', 'payment', 'subscription',
  'system', 'admin',
  'comic_approved', 'comic_rejected', 'post_published', 'post_rejected'
]::text[]));

-- one live row per (reader, group_key): grouping key and retry guard at once
create unique index if not exists notifications_group_uniq
  on public.notifications (user_id, group_key) where group_key is not null;
create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_broadcast_idx
  on public.notifications (created_at desc) where user_id is null;

-- ----------------------------------------------------------------- helper ---

-- Every event funnels through here. A repeat under the same group_key updates the row in place and bumps the count
-- instead of adding a line — grouping ("Zeo and 4 others") and duplicate guard in one move; a regrouped line goes back
-- to unread. p_regroup is the message from the second one on: {n} others besides the newest actor, {t} total,
-- {s} plural 's' for {n}. Nothing here raises — a notification is never worth failing the action that caused it.
CREATE OR REPLACE FUNCTION public.dz_notify(
  p_user uuid, p_type text, p_title text, p_message text,
  p_actor uuid DEFAULT NULL, p_group_key text DEFAULT NULL,
  p_artwork uuid DEFAULT NULL, p_comment bigint DEFAULT NULL,
  p_community uuid DEFAULT NULL, p_conversation uuid DEFAULT NULL,
  p_order uuid DEFAULT NULL, p_url text DEFAULT NULL,
  p_regroup text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_id bigint;
  v_count integer;
  v_grouped boolean := false;
begin
  if p_user is null or p_title is null then return null; end if;
  if p_actor is not null and p_actor = p_user then return null; end if;

  if p_group_key is null then
    insert into public.notifications
      (user_id, type, title, message, actor_id, artwork_id, comment_id,
       community_id, conversation_id, marketplace_order_id, target_url)
    values (p_user, p_type, left(p_title, 120), left(coalesce(p_message, ''), 500),
            p_actor, p_artwork, p_comment, p_community, p_conversation, p_order, p_url)
    returning id into v_id;
    return v_id;
  end if;

  insert into public.notifications
    (user_id, type, title, message, actor_id, artwork_id, comment_id,
     community_id, conversation_id, marketplace_order_id, target_url, group_key)
  values (p_user, p_type, left(p_title, 120), left(coalesce(p_message, ''), 500),
          p_actor, p_artwork, p_comment, p_community, p_conversation, p_order, p_url,
          p_group_key)
    -- index is partial, so the predicate must be repeated for inference
  on conflict (user_id, group_key) where group_key is not null do update
    set group_count          = public.notifications.group_count + 1,
        actor_id             = excluded.actor_id,
        type                 = excluded.type,
        title                = excluded.title,
        message              = excluded.message,
        artwork_id           = excluded.artwork_id,
        comment_id           = excluded.comment_id,
        community_id         = excluded.community_id,
        conversation_id      = excluded.conversation_id,
        marketplace_order_id = excluded.marketplace_order_id,
        target_url           = excluded.target_url,
        created_at           = now()
  returning id, group_count, (xmax <> 0) into v_id, v_count, v_grouped;

  if v_grouped then
    if p_regroup is not null then
      update public.notifications
         set message = left(
               replace(replace(replace(p_regroup,
                 '{n}', (v_count - 1)::text),
                 '{t}', v_count::text),
                 '{s}', case when v_count - 1 = 1 then '' else 's' end), 500)
       where id = v_id;
    end if;
    delete from public.notification_reads
     where notification_id = v_id and user_id = p_user;
  end if;
  return v_id;
exception when others then
  return null;
end;
$function$;

revoke all on function public.dz_notify(uuid, text, text, text, uuid, text, uuid, bigint, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

-- who an event is about, in the words the bell shows
CREATE OR REPLACE FUNCTION public.dz_notif_who(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select coalesce(nullif((select username from public.profiles where id = p_user), ''), 'Someone');
$function$;

-- "@handle" mentions in a body, capped so one comment cannot fan out
CREATE OR REPLACE FUNCTION public.dz_notif_mentions(p_body text)
RETURNS setof uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select p.id from public.profiles p
  where p.username is not null
    and lower(p.username) in (
      select distinct lower(substring(m[1] from 2))
      from regexp_matches(coalesce(p_body, ''), '(@[A-Za-z0-9_.-]{2,32})', 'g') m)
  limit 5;
$function$;

-- ---------------------------------------------------------------- artwork ---

CREATE OR REPLACE FUNCTION public.dz_notify_artwork_like() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_owner uuid; v_name text; v_who text;
begin
  select user_id, coalesce(nullif(name, ''), 'your artwork')
    into v_owner, v_name from public.artworks where id = new.artwork_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  v_who := public.dz_notif_who(new.user_id);
  perform public.dz_notify(v_owner, 'like', 'New like',
    v_who || ' liked ' || v_name,
    p_actor     => new.user_id,
    p_group_key => 'like:' || new.artwork_id::text,
    p_artwork   => new.artwork_id,
    p_url       => '/artwork/' || new.artwork_id::text,
    p_regroup   => v_who || ' and {n} other{s} liked ' || v_name);
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_like on public.artwork_likes;
create trigger dz_notify_like after insert on public.artwork_likes
  for each row execute function public.dz_notify_artwork_like();

CREATE OR REPLACE FUNCTION public.dz_notify_artwork_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_name text := coalesce(nullif(new.name, ''), 'Your artwork');
begin
  if new.user_id is null then return new; end if;
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform public.dz_notify(new.user_id, 'artwork_approved', 'Artwork approved',
        v_name || ' is live on DigiArtz.',
        p_group_key => 'artstate:' || new.id::text,
        p_artwork   => new.id,
        p_url       => '/artwork/' || new.id::text);
    elsif new.status = 'rejected' then
      perform public.dz_notify(new.user_id, 'artwork_rejected', 'Artwork not approved',
        v_name || ' did not pass review.',
        p_group_key => 'artstate:' || new.id::text,
        p_artwork   => new.id);
    end if;
  end if;
  if new.featured and not old.featured then
    perform public.dz_notify(new.user_id, 'artwork_featured', 'Featured artwork',
      v_name || ' has been featured on DigiArtz.',
      p_group_key => 'artfeat:' || new.id::text,
      p_artwork   => new.id,
      p_url       => '/artwork/' || new.id::text);
  end if;
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_artwork_state on public.artworks;
create trigger dz_notify_artwork_state after update on public.artworks
  for each row execute function public.dz_notify_artwork_state();

-- --------------------------------------------------------------- comments ---

-- item_comments carries every section's comments (artwork, blog, marketplace, resource, job). Owner gets COMMENT,
-- one line per comment because the text is the point. An @handle who already commented on the same subject gets
-- COMMENT_REPLY; anyone else mentioned gets MENTION.
CREATE OR REPLACE FUNCTION public.dz_notify_item_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_owner uuid; v_title text; v_url text; v_who text; v_target uuid; v_replied boolean;
begin
  v_who := public.dz_notif_who(new.user_id);
  select case new.kind
           when 'artwork'     then (select user_id from public.artworks          where id = new.subject_id)
           when 'blog'        then (select user_id from public.blog_posts        where id = new.subject_id)
           when 'marketplace' then (select user_id from public.marketplace_items where id = new.subject_id)
           when 'resource'    then (select user_id from public.resources         where id = new.subject_id)
           when 'job'         then (select user_id from public.jobs              where id = new.subject_id)
         end into v_owner;
  select case new.kind
           when 'artwork'     then (select coalesce(nullif(name, ''), 'your artwork')    from public.artworks where id = new.subject_id)
           when 'blog'        then (select coalesce(nullif(title, ''), 'your post')      from public.blog_posts where id = new.subject_id)
           when 'marketplace' then (select coalesce(nullif(title, ''), 'your listing')   from public.marketplace_items where id = new.subject_id)
           when 'resource'    then (select coalesce(nullif(title, ''), 'your resource')  from public.resources where id = new.subject_id)
           when 'job'         then (select coalesce(nullif(title, ''), 'your posting')   from public.jobs where id = new.subject_id)
         end into v_title;
    -- deep-link segments the router knows (marketplace items live at /listing/)
  v_url := case new.kind
             when 'artwork'     then '/artwork/'
             when 'marketplace' then '/listing/'
             else '/' || new.kind || '/' end || new.subject_id::text;

  if v_owner is not null and v_owner <> new.user_id then
    perform public.dz_notify(v_owner, 'comment', 'New comment',
      v_who || ' commented on ' || coalesce(v_title, 'your work') || ': ' || new.body,
      p_actor     => new.user_id,
      p_group_key => 'comment:' || new.id::text,
      p_artwork   => case when new.kind = 'artwork' then new.subject_id end,
      p_comment   => new.id,
      p_url       => v_url);
  end if;

  for v_target in select * from public.dz_notif_mentions(new.body) loop
    if v_target = new.user_id or v_target = v_owner then continue; end if;
    select exists(select 1 from public.item_comments c
                  where c.kind = new.kind and c.subject_id = new.subject_id
                    and c.user_id = v_target and c.id < new.id)
      into v_replied;
    perform public.dz_notify(v_target,
      case when v_replied then 'comment_reply' else 'mention' end,
      case when v_replied then 'New reply' else 'You were mentioned' end,
      v_who || (case when v_replied then ' replied to you on ' else ' mentioned you on ' end)
             || coalesce(v_title, 'DigiArtz') || ': ' || new.body,
      p_actor     => new.user_id,
      p_group_key => 'cmention:' || new.id::text || ':' || v_target::text,
      p_artwork   => case when new.kind = 'artwork' then new.subject_id end,
      p_comment   => new.id,
      p_url       => v_url);
  end loop;
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_item_comment on public.item_comments;
create trigger dz_notify_item_comment after insert on public.item_comments
  for each row execute function public.dz_notify_item_comment();

-- -------------------------------------------------------------- community ---

-- public.comments = community chat. A message in a user community tells the other members, one grouped line each,
-- at most one refresh per ten minutes, so a busy channel cannot flood a bell. An @handle is addressed to a person,
-- so that one is its own line.
CREATE OR REPLACE FUNCTION public.dz_notify_community_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_cid uuid; v_name text; v_who text; v_member uuid; v_target uuid; v_seen timestamptz;
begin
  if new.channel !~ '^c:' then return new; end if;
  begin
    v_cid := substring(new.channel from 3)::uuid;
  exception when others then return new;
  end;
  select coalesce(nullif(name, ''), 'a community') into v_name
    from public.communities where id = v_cid;
  if v_name is null then return new; end if;
  v_who := public.dz_notif_who(new.user_id);

  for v_member in
    select user_id from public.community_members
    where community_id = v_cid and user_id <> new.user_id and not banned
    limit 500
  loop
    select created_at into v_seen from public.notifications
     where user_id = v_member and group_key = 'cpost:' || v_cid::text;
    if v_seen is not null and v_seen > now() - interval '10 minutes' then continue; end if;
    perform public.dz_notify(v_member, 'community_post', v_name,
      v_who || ' posted in ' || v_name,
      p_actor     => new.user_id,
      p_group_key => 'cpost:' || v_cid::text,
      p_community => v_cid,
      p_regroup   => '{t} new posts in ' || v_name);
  end loop;

  for v_target in select * from public.dz_notif_mentions(new.comment_text) loop
    if v_target = new.user_id then continue; end if;
    perform public.dz_notify(v_target, 'community_comment', 'Mentioned in ' || v_name,
      v_who || ' mentioned you in ' || v_name || ': ' || new.comment_text,
      p_actor     => new.user_id,
      p_group_key => 'cmsg:' || new.id::text || ':' || v_target::text,
      p_comment   => new.id,
      p_community => v_cid);
  end loop;
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_community_post on public.comments;
create trigger dz_notify_community_post after insert on public.comments
  for each row execute function public.dz_notify_community_post();

CREATE OR REPLACE FUNCTION public.dz_notify_community_join() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_owner uuid; v_name text;
begin
  select owner_id, coalesce(nullif(name, ''), 'your community')
    into v_owner, v_name from public.communities where id = new.community_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  perform public.dz_notify(v_owner, 'community_join', 'New member',
    public.dz_notif_who(new.user_id) || ' joined ' || v_name,
    p_actor     => new.user_id,
    p_group_key => 'cjoin:' || new.community_id::text,
    p_community => new.community_id,
    p_regroup   => '{t} new members joined ' || v_name);
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_community_join on public.community_members;
create trigger dz_notify_community_join after insert on public.community_members
  for each row execute function public.dz_notify_community_join();

-- ------------------------------------------------------------ friends, DMs ---

CREATE OR REPLACE FUNCTION public.dz_notify_friend_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if new.status <> 'pending' then return new; end if;
  perform public.dz_notify(new.addressee_id, 'friend_request', 'Friend request',
    public.dz_notif_who(new.requester_id) || ' wants to be friends',
    p_actor        => new.requester_id,
    p_group_key    => 'friendreq:' || new.requester_id::text,
    p_conversation => new.requester_id);
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_friend_request on public.friendships;
create trigger dz_notify_friend_request after insert on public.friendships
  for each row execute function public.dz_notify_friend_request();

CREATE OR REPLACE FUNCTION public.dz_notify_friend_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
      -- request answered; its line has done its job
    delete from public.notifications
     where user_id = new.addressee_id
       and group_key = 'friendreq:' || new.requester_id::text;
    perform public.dz_notify(new.requester_id, 'friend_accepted', 'Request accepted',
      public.dz_notif_who(new.addressee_id) || ' accepted your friend request',
      p_actor        => new.addressee_id,
      p_group_key    => 'friendok:' || new.addressee_id::text,
      p_conversation => new.addressee_id);
  elsif new.status = 'blocked' and old.status <> 'blocked' then
    delete from public.notifications
     where user_id in (new.requester_id, new.addressee_id)
       and group_key in ('friendreq:' || new.requester_id::text,
                         'friendreq:' || new.addressee_id::text);
  end if;
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_friend_change on public.friendships;
create trigger dz_notify_friend_change after update on public.friendships
  for each row execute function public.dz_notify_friend_change();

-- a declined request deletes the friendship row; take its line with it
CREATE OR REPLACE FUNCTION public.dz_notify_friend_gone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  delete from public.notifications
   where user_id = old.addressee_id
     and group_key = 'friendreq:' || old.requester_id::text;
  return old;
exception when others then return old;
end;
$function$;

drop trigger if exists dz_notify_friend_gone on public.friendships;
create trigger dz_notify_friend_gone after delete on public.friendships
  for each row execute function public.dz_notify_friend_gone();

-- One line per sender, carrying the latest message and how many wait. The thread is the transcript; the bell only
-- says who is waiting.
CREATE OR REPLACE FUNCTION public.dz_notify_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_who text := public.dz_notif_who(new.sender_id);
begin
  perform public.dz_notify(new.recipient_id, 'message', v_who, new.content,
    p_actor        => new.sender_id,
    p_group_key    => 'msg:' || new.sender_id::text,
    p_conversation => new.sender_id,
    p_regroup      => '{t} new messages');
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_message on public.direct_messages;
create trigger dz_notify_message after insert on public.direct_messages
  for each row execute function public.dz_notify_message();

-- ------------------------------------------------- marketplace, payments ---

CREATE OR REPLACE FUNCTION public.dz_notify_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_title text; v_earned text;
begin
  select coalesce(nullif(title, ''), 'your listing') into v_title
    from public.marketplace_items where id = new.item_id;
  v_earned := upper(new.currency) || ' ' || to_char(new.net_amount / 100.0, 'FM999999990.00');
  perform public.dz_notify(new.seller_id, 'marketplace_sale', 'You made a sale',
    coalesce(v_title, 'Your listing') || ' sold. You earned ' || v_earned || '.',
    p_group_key => 'sale:' || new.id::text,
    p_order     => new.payment_id,
    p_url       => '/listing/' || new.item_id::text);
  perform public.dz_notify(new.buyer_id, 'marketplace_purchase', 'Purchase complete',
    coalesce(v_title, 'Your purchase') || ' is ready in your downloads.',
    p_group_key => 'purchase:' || new.id::text,
    p_order     => new.payment_id,
    p_url       => '/listing/' || new.item_id::text);
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_sale on public.marketplace_earnings;
create trigger dz_notify_sale after insert on public.marketplace_earnings
  for each row execute function public.dz_notify_sale();

CREATE OR REPLACE FUNCTION public.dz_notify_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_amount text;
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;
  v_amount := upper(new.currency) || ' ' || to_char(new.amount / 100.0, 'FM999999990.00');
  if new.kind = 'subscription' then
    perform public.dz_notify(new.user_id, 'subscription', 'Membership active',
      'Your ' || coalesce(new.plan, 'DigiArtz') || ' membership is active. Paid ' || v_amount || '.',
      p_group_key => 'pay:' || new.id::text,
      p_order     => new.id);
  else
    perform public.dz_notify(new.user_id, 'payment', 'Payment received',
      'We received your payment of ' || v_amount || '.',
      p_group_key => 'pay:' || new.id::text,
      p_order     => new.id);
  end if;
  return new;
exception when others then return new;
end;
$function$;

drop trigger if exists dz_notify_payment on public.payments;
create trigger dz_notify_payment after update on public.payments
  for each row execute function public.dz_notify_payment();

-- ---------------------------------------------------- what the bell reads ---

-- One round trip: rows, actor name and avatar, and whether this reader has read each. No per-row profile lookup.
CREATE OR REPLACE FUNCTION public.dz_notifications(p_limit integer DEFAULT 40)
RETURNS TABLE (
  id bigint, type text, title text, message text, created_at timestamptz,
  group_count integer, target_url text, artwork_id uuid, comment_id bigint,
  community_id uuid, conversation_id uuid, marketplace_order_id uuid,
  actor_id uuid, actor_name text, actor_avatar text, is_read boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select n.id, n.type, n.title, n.message, n.created_at,
         n.group_count, n.target_url, n.artwork_id, n.comment_id,
         n.community_id, n.conversation_id, n.marketplace_order_id,
         n.actor_id, p.username, p.avatar_url,
         (r.notification_id is not null)
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.notification_reads r
         on r.notification_id = n.id and r.user_id = auth.uid()
  where auth.uid() is not null
    and (n.user_id = auth.uid() or n.user_id is null)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.dz_notif_unread()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  select count(*)::int from (
    select n.id from public.notifications n
    where auth.uid() is not null
      and (n.user_id = auth.uid() or n.user_id is null)
    order by n.created_at desc
    limit 100
  ) w
  where not exists (
    select 1 from public.notification_reads r
    where r.notification_id = w.id and r.user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.dz_notif_read_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_n integer;
begin
  if auth.uid() is null then return 0; end if;
  insert into public.notification_reads (user_id, notification_id)
  select auth.uid(), w.id from (
    select n.id from public.notifications n
    where n.user_id = auth.uid() or n.user_id is null
    order by n.created_at desc
    limit 500) w
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- SECURITY DEFINER is EXECUTE-able by PUBLIC unless told otherwise, which would put every one of these on
-- /rest/v1/rpc for a signed-out caller. Trigger bodies belong to their triggers, helpers to those; only the three
-- the bell calls are a member's to reach.
revoke all on function public.dz_notif_who(uuid)            from public, anon, authenticated;
revoke all on function public.dz_notif_mentions(text)       from public, anon, authenticated;
revoke all on function public.dz_notifications(integer)     from public, anon, authenticated;
revoke all on function public.dz_notif_unread()             from public, anon, authenticated;
revoke all on function public.dz_notif_read_all()           from public, anon, authenticated;
revoke all on function public.dz_notify_artwork_like()      from public, anon, authenticated;
revoke all on function public.dz_notify_artwork_state()     from public, anon, authenticated;
revoke all on function public.dz_notify_item_comment()      from public, anon, authenticated;
revoke all on function public.dz_notify_community_post()    from public, anon, authenticated;
revoke all on function public.dz_notify_community_join()    from public, anon, authenticated;
revoke all on function public.dz_notify_friend_request()    from public, anon, authenticated;
revoke all on function public.dz_notify_friend_change()     from public, anon, authenticated;
revoke all on function public.dz_notify_friend_gone()       from public, anon, authenticated;
revoke all on function public.dz_notify_message()           from public, anon, authenticated;
revoke all on function public.dz_notify_sale()              from public, anon, authenticated;
revoke all on function public.dz_notify_payment()           from public, anon, authenticated;

grant execute on function public.dz_notifications(integer)  to authenticated;
grant execute on function public.dz_notif_unread()          to authenticated;
grant execute on function public.dz_notif_read_all()        to authenticated;

-- Staff-only fan-out for the admin NOTIFY tab. Broadcast = one row, null user_id; targeted = one row per recipient.
CREATE OR REPLACE FUNCTION public.dz_admin_notify(
  p_title text, p_message text, p_url text DEFAULT NULL, p_users uuid[] DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare v_n integer := 0; v_u uuid;
begin
  if not public.dz_is_staff(auth.uid()) then raise exception 'Not allowed'; end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'A title and a message, please';
  end if;
  if p_users is null or array_length(p_users, 1) is null then
    insert into public.notifications (user_id, type, title, message, target_url)
    values (null, 'admin', left(p_title, 120), left(p_message, 500), p_url);
    return 1;
  end if;
  foreach v_u in array p_users loop
    insert into public.notifications (user_id, type, title, message, target_url)
    values (v_u, 'admin', left(p_title, 120), left(p_message, 500), p_url);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.dz_admin_notify(text, text, text, uuid[]) from public, anon;
grant execute on function public.dz_admin_notify(text, text, text, uuid[]) to authenticated;

-- ------------------------------------------------------------------- RLS ---

-- Reading stays "mine, or everyone's"; read marks stay "mine only". No client may insert a notification: the triggers
-- run as definer, and the admin path goes through dz_admin_notify, which checks staff.
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists notifications_insert_dev_only on public.notifications;
revoke insert on public.notifications from authenticated, anon;

drop policy if exists notification_reads_delete_own on public.notification_reads;
create policy notification_reads_delete_own on public.notification_reads
  as PERMISSIVE for DELETE to public using (user_id = auth.uid());
