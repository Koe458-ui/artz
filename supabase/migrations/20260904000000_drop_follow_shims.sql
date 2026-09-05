-- The transition shims come out.
--
-- 20260903000000_follows.sql renamed profile_creds to follows and cred_received_count to follower_count, leaving the old
-- names answering so a visitor on the pre-follow bundle kept working: PostgREST answers an unknown column with a 400.
--
-- That overlap is over: the service worker is network-first for navigations and /sw.js is no-cache, so any online visit
-- since the deploy took the new bundle, and nothing in the database refers to either name.
--
-- Putting them back is the two statements this file removes; see "transition shims" in 20260903000000_follows.sql.

drop view if exists public.profile_creds;

alter table public.profiles drop column if exists cred_received_count;
