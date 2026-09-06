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
-- 3. Verification. Run after the two statements above.
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
