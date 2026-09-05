-- Moderation was a gate on the way in with no wall around it.
--
-- Every mod gate is BEFORE INSERT. `dz_artwork_mod_gate` on artworks,
-- `dz_section_mod_gate` on blog_posts, marketplace_items and resources -- all
-- of them INSERT only, and jobs never had one at all. An insert claiming
-- `status = 'approved'` has to carry an HMAC ticket minted by
-- /api/moderate-upload after Gemini has actually seen the image, the ticket is
-- burned in `private.used_mod_tokens` so it cannot be replayed, and without a
-- good one the row is written `pending` and waits for the queue.
--
-- None of which does anything on UPDATE. `status` is an ordinary column on
-- tables whose RLS lets the owner update their own row, so:
--
--   PATCH /rest/v1/artworks?id=eq.<mine>   {"status":"approved"}
--
-- takes a rejected or pending row straight to live. Verified against
-- production on 2026-09-05 and rolled back: artworks, jobs and
-- marketplace_items all read back 'approved' afterwards. That defeats the
-- whole moderation pipeline -- the Gemini call, the ticket, the replay
-- table, the drain queue -- from a single request anyone signed in can send.
--
-- The fix is not another gate. Nothing in the client ever sends `status` on an
-- update: js/sections.js only inserts (line ~2990), and the artwork edit patch
-- in js/drafts.js lists its columns explicitly and `status` is not among them.
-- So status simply is not a member's column to write, and the guard says that
-- rather than trying to re-judge the content.
--
-- Pinning rather than raising, to match dz_protect_social_counters and
-- protect_artwork_like_count: an artist editing a description still saves, the
-- one field they may not move just does not move.
--
-- Exempt, deliberately:
--   * writes with no member behind them -- the moderation drain in
--     functions/api/moderation/recheck.js goes through PostgREST with the
--     service key and no user JWT, and the scheduled publishers run under cron
--     as the database owner. Neither presents a `sub` claim, so auth.uid() is
--     null for both.
--   * staff, so a moderator can still approve and reject by hand.
--
-- The exemption tests auth.uid(), NOT current_user, and that distinction is the
-- whole reason this trigger works. `current_user` inside a SECURITY DEFINER
-- function is the function's owner, never the caller -- so the
-- `current_user not in ('authenticated','anon')` test that
-- dz_protect_social_counters and dz_profiles_guard_privileged use correctly
-- would, in a DEFINER function, read 'postgres' every single time and exempt
-- the world. Those three are all SECURITY INVOKER, which is why theirs is
-- right. This one has to be DEFINER to read profiles for the staff check, so
-- it uses the signal the mod gates already use: whether a JWT was presented.

CREATE OR REPLACE FUNCTION public.dz_status_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if auth.uid() is null then return NEW; end if;
  if public.dz_is_staff() then return NEW; end if;
  NEW.status := OLD.status;
  return NEW;
end $function$;

revoke execute on function public.dz_status_gate() from public, anon, authenticated;
grant  execute on function public.dz_status_gate() to service_role;

drop trigger if exists zz_status_gate on public.artworks;
drop trigger if exists zz_status_gate on public.blog_posts;
drop trigger if exists zz_status_gate on public.marketplace_items;
drop trigger if exists zz_status_gate on public.resources;
drop trigger if exists zz_status_gate on public.jobs;

create trigger zz_status_gate before update on public.artworks
  for each row execute function public.dz_status_gate();
create trigger zz_status_gate before update on public.blog_posts
  for each row execute function public.dz_status_gate();
create trigger zz_status_gate before update on public.marketplace_items
  for each row execute function public.dz_status_gate();
create trigger zz_status_gate before update on public.resources
  for each row execute function public.dz_status_gate();
create trigger zz_status_gate before update on public.jobs
  for each row execute function public.dz_status_gate();

-- jobs was also the one section table with no counter guard. Nothing
-- increments jobs.view_count -- register_item_view only knows 'marketplace',
-- 'blog' and 'resource' -- so the number a job posting shows is whatever its
-- poster last wrote there. The same guard the other three use applies here; it
-- reads OLD.view_count and needs nothing job-specific.

drop trigger if exists zz_protect_view_count on public.jobs;
create trigger zz_protect_view_count before insert or update on public.jobs
  for each row execute function public.dz_protect_item_view_count();
