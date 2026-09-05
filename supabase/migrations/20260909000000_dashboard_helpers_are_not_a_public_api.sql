-- Two analytics helpers answered questions about anybody, to anybody.
--
-- dz_an_achievements(p_user, p_scope) and dz_an_goal_progress(p_user, p_metric,
-- p_period, p_scope) both take the user to report on as a parameter, both are
-- SECURITY DEFINER, and both were granted to anon and authenticated. Neither
-- checks who is asking. So:
--
--   POST /rest/v1/rpc/dz_an_goal_progress
--   {"p_user":"<any uuid>","p_metric":"sales","p_period":"30d","p_scope":"marketplace"}
--
-- returns that seller's sales count for the period, to an anonymous caller.
-- marketplace_earnings is deliberately owner-only -- its SELECT policy is
-- `auth.uid() = seller_id` -- and a SECURITY DEFINER function reads straight
-- past that. Same shape for uploads, views, likes, bookmarks, downloads and
-- comments, per section, for any account.
--
-- The sibling readers the dashboard actually calls -- dz_analytics_overview,
-- _content, _reach, _activity -- take no user parameter at all and scope
-- themselves to auth.uid(). These two are the internals those four call, and
-- they took the parameter instead. Nothing else uses them: not a policy, not a
-- check constraint, and not the client, which never names either in an
-- sb.rpc() call. Their only callers are other SECURITY DEFINER functions, and
-- a DEFINER function executes as its owner, so it needs no grant of its own.
--
-- Fixing the grant rather than adding a check inside them, because the reason
-- they are reachable is the grant, and the four public readers are already the
-- right front door.
--
-- dz_an_viewer_key, dz_an_country and dz_actor_key go with them for the same
-- reason: request-shaping internals with no business being callable directly.
-- dz_an_viewer_key in particular derives the identity that analytics dedupes
-- on, which is not something a caller should be able to enumerate.

revoke execute on function public.dz_an_achievements(p_user uuid, p_scope text)
  from public, anon, authenticated;
revoke execute on function public.dz_an_goal_progress(p_user uuid, p_metric text, p_period text, p_scope text)
  from public, anon, authenticated;
revoke execute on function public.dz_an_viewer_key(p_anon_key text)
  from public, anon, authenticated;
revoke execute on function public.dz_an_country(p_hint text)
  from public, anon, authenticated;
revoke execute on function public.dz_actor_key()
  from public, anon, authenticated;

grant execute on function public.dz_an_achievements(p_user uuid, p_scope text) to service_role;
grant execute on function public.dz_an_goal_progress(p_user uuid, p_metric text, p_period text, p_scope text) to service_role;
grant execute on function public.dz_an_viewer_key(p_anon_key text) to service_role;
grant execute on function public.dz_an_country(p_hint text) to service_role;
grant execute on function public.dz_actor_key() to service_role;
