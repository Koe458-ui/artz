-- ===========================================================================
-- Audit remediation, 2026-09 — database half
--
-- RUN THIS ONLY AFTER the matching branch is deployed to production.
--
-- Step 1 arms the moderation gate for blog posts, marketplace listings and
-- resources. Until the deployed js/sections.js sends `mod_token` with the row,
-- arming it means every one of those publishes lands in `pending` instead of
-- going live — the gate fails safe, but nothing publishes. The wiring that
-- sends the ticket is in the same branch as this file. Deploy first, then run
-- this, then publish one listing to confirm.
--
-- Read-only pre-flight and verification queries are included. Nothing here
-- drops a table, a column or a row.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Run this on its own and read it before going further.
-- ---------------------------------------------------------------------------
--   Expect: secret_set = true (the artwork gate is already armed),
--           sections_enforced = false (this file is what changes it).
--
-- select id,
--        (secret is not null and secret <> '') as secret_set,
--        sections_enforced
--   from private.mod_config;


-- ---------------------------------------------------------------------------
-- 1. Arm the moderation gate for the three section types.        [Audit H-1]
-- ---------------------------------------------------------------------------
-- dz_section_mod_gate() returns the row untouched — status='approved' and all
-- — whenever this flag is false. Every other control that might have caught an
-- unmoderated publish is open by design: the insert policy asks only for
-- merit >= 80, profiles.merit defaults to 100 so a brand-new account already
-- passes, and the status CHECK permits 'approved'. The flag is the gate.
update private.mod_config
   set sections_enforced = true
 where id = true;


-- ---------------------------------------------------------------------------
-- 2. Let a member delete their own uploads.                      [Audit L-7]
-- ---------------------------------------------------------------------------
-- koe-media had DELETE policies for avatars, banners and dev templates only.
-- Everything else a member uploads — artwork derivatives, previews, gallery
-- images — had no path to deletion at all, so removing a piece of work left
-- its objects behind forever and the storage bill only ever went up.
--
-- Scoped exactly like the INSERT policy it mirrors: the second path segment is
-- the owner's uid, so this grants deletion inside a member's own folder and
-- nowhere else. koe-originals already has its own equivalent.
drop policy if exists "media delete own folder" on storage.objects;

create policy "media delete own folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'koe-media'
    and (
      (storage.foldername(name))[2] = (auth.uid())::text
      or public.is_dev()
    )
  );


-- ---------------------------------------------------------------------------
-- 3. Let the moderation sweep re-read what was published.        [Audit H-2]
-- ---------------------------------------------------------------------------
-- The approval ticket is signed over the member's id, an expiry and a nonce --
-- not over the thing it approved. It therefore says "this member passed a
-- check", not "this row is what passed", and a member could pass a clean image
-- and then insert a row whose image_url points somewhere else. The bytes the
-- moderator saw and the bytes the site serves were never tied together.
--
-- Binding the ticket to the content cannot fix that on its own: the public
-- image is a derivative the browser produces and uploads after the check, so
-- there is nothing at insert time to compare against. What does fix it is
-- reading what actually got published. functions/api/moderation/recheck.js
-- already downloads a row's public image and moderates it -- that is how the
-- pending queue drains -- so it now also walks approved rows that have never
-- been re-read, and demotes any whose published image fails.
--
-- This column is the marker for "already re-read". Null means the sweep has
-- not looked at this row yet, which is why every existing approved row gets
-- checked once after this runs.
alter table public.artworks          add column if not exists mod_verified_at timestamptz;
alter table public.blog_posts        add column if not exists mod_verified_at timestamptz;
alter table public.resources         add column if not exists mod_verified_at timestamptz;
alter table public.marketplace_items add column if not exists mod_verified_at timestamptz;

-- A member must not be able to stamp their own row as already verified -- that
-- would take it straight back out of the sweep's sight and hand back the very
-- bypass this closes.
--
-- Done with a trigger rather than a column grant, matching protect_privileged_cols
-- and dz_status_gate next door. Revoking the column would mean revoking INSERT
-- and UPDATE at table level and re-granting every other column by name, which
-- silently breaks the moment someone adds a column; pinning the value costs
-- nothing and cannot lock anyone out of a publish.
create or replace function public.dz_protect_mod_verified()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  -- No jwt is the sweep itself, running as the service role.
  if auth.uid() is null then return NEW; end if;
  if TG_OP = 'INSERT' then
    NEW.mod_verified_at := null;
  else
    NEW.mod_verified_at := OLD.mod_verified_at;
  end if;
  return NEW;
end $fn$;

revoke all on function public.dz_protect_mod_verified() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['artworks', 'blog_posts', 'resources', 'marketplace_items']
  loop
    execute format('drop trigger if exists zz_protect_mod_verified on public.%I', t);
    execute format(
      'create trigger zz_protect_mod_verified before insert or update on public.%I '
      'for each row execute function public.dz_protect_mod_verified()', t);
  end loop;
end $$;

-- Only the sweep finds unverified rows, and it does so constantly.
create index if not exists artworks_unverified_idx
  on public.artworks (created_at) where status = 'approved' and mod_verified_at is null;
create index if not exists blog_posts_unverified_idx
  on public.blog_posts (created_at) where status = 'approved' and mod_verified_at is null;
create index if not exists resources_unverified_idx
  on public.resources (created_at) where status = 'approved' and mod_verified_at is null;
create index if not exists marketplace_items_unverified_idx
  on public.marketplace_items (created_at) where status = 'approved' and mod_verified_at is null;


-- ---------------------------------------------------------------------------
-- 4. Verification. Run after the statements above.
-- ---------------------------------------------------------------------------
--   Expect: 'enforcing: artworks + sections'
--
-- select case when coalesce(secret, '') = '' then 'inert'
--             else 'enforcing: artworks' end
--        || case when coalesce(sections_enforced, false)
--                then ' + sections' else ' ONLY (sections NOT enforced)' end
--   from private.mod_config where id = true;
--
--   Expect: one row, cmd = DELETE, for koe-media.
--
-- select policyname, cmd from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and policyname = 'media delete own folder';
--
--   Expect: four rows, one per table.
--
-- select table_name from information_schema.columns
--  where table_schema = 'public' and column_name = 'mod_verified_at'
--  order by table_name;
--
--   Expect: four triggers named zz_protect_mod_verified.
--
-- select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where t.tgname = 'zz_protect_mod_verified' and not t.tgisinternal
--  order by c.relname;
--
--   The backlog the sweep will work through (every row published before this
--   ran). It drains at one row per tick; expect it to reach zero, and expect
--   the count to stay near zero afterwards.
--
-- select 'artworks' t, count(*) from public.artworks
--   where status = 'approved' and mod_verified_at is null
-- union all select 'blog_posts', count(*) from public.blog_posts
--   where status = 'approved' and mod_verified_at is null
-- union all select 'resources', count(*) from public.resources
--   where status = 'approved' and mod_verified_at is null
-- union all select 'marketplace_items', count(*) from public.marketplace_items
--   where status = 'approved' and mod_verified_at is null;
--
--   Smoke test, as a normal member, after deploying:
--     - publish a marketplace listing through the site  -> status 'approved'
--     - POST /rest/v1/blog_posts directly with
--       {"status":"approved", ...} and no mod_token      -> lands 'pending'
--   The second is the whole point of this file.


-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- update private.mod_config set sections_enforced = false where id = true;
-- drop policy if exists "media delete own folder" on storage.objects;
--
-- The verify sweep stops as soon as the deploy is rolled back, because nothing
-- reads mod_verified_at then. The column and its trigger are harmless if left:
--   drop trigger if exists zz_protect_mod_verified on public.artworks;
--   drop trigger if exists zz_protect_mod_verified on public.blog_posts;
--   drop trigger if exists zz_protect_mod_verified on public.resources;
--   drop trigger if exists zz_protect_mod_verified on public.marketplace_items;
--   drop function if exists public.dz_protect_mod_verified();
-- Dropping the column itself is not necessary and loses which rows were checked.


-- ===========================================================================
-- Deliberately NOT changed, and why
-- ===========================================================================
--
-- * The INSERT grant on `status` stays with `authenticated`.
--   The audit suggested revoking it as defence in depth. It cannot be revoked
--   as the code stands: both upload paths send `status` explicitly
--   (js/upqueue.js sends 'pending' or 'approved' depending on whether
--   moderation deferred; js/sections.js sends 'approved'), so revoking the
--   column grant makes PostgREST reject every publish outright rather than
--   quietly downgrade it. It also buys nothing today — dz_section_mod_gate and
--   dz_artwork_mod_gate are BEFORE INSERT triggers, so they overwrite whatever
--   the client sent. The client would have to stop sending `status` first;
--   only then is the revoke free.
--
-- * `application/octet-stream` stays in both bucket MIME allowlists.
--   The audit called it a hole in the allowlist, and it is — but removing it
--   breaks real uploads. Procreate, Clip Studio, Photoshop brush and Substance
--   files have no registered MIME type, so browsers send them as
--   octet-stream; dropping it would refuse the formats the marketplace exists
--   to sell. The exposure it leaves is bounded: octet-stream is served as a
--   download rather than rendered, images are separately held to
--   IMG_TYPES, and the public bucket is a different origin from the site, so
--   nothing stored there can reach a session on digiartz.net. The branch
--   narrows it further by forcing every non-image asset into the private
--   bucket regardless of what the client asks for.
--
-- * `originals update own folder` stays.
--   Overwriting an object in koe-originals only ever reaches the owner's own
--   files, and the upload path uses signed uploads rather than updates.
