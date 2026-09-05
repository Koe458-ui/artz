-- Two hardening invariants the codebase asserts had quietly stopped holding.
--
-- Applied to production 2026-09-05 as remote migration
-- 20260905055547 restore_function_hardening.
--
-- security/rls-regression.sql runs both of these as counts that must be zero.
-- Against the live catalogue on 2026-09-05 they read 1 and 1.

-- 1. An unpinned search_path.
--
-- 20260906000000_xp_curve_to_10k.sql rewrote this function with CREATE OR
-- REPLACE and did not carry the SET search_path across, so the setting was
-- dropped. The body only returns a constant array and the function is SECURITY
-- INVOKER, so nothing was exploitable through it -- but "every function in
-- public pins its search_path" is the rule the suite checks, and a rule with
-- one exception is not a rule. Restored, with the same body.

CREATE OR REPLACE FUNCTION public.xp_level_thresholds()
RETURNS integer[] LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT ARRAY[0,40,80,120,160,205,250,295,340,390,440,490,540,595,650,705,760,820,880,940,
           1000,1065,1130,1195,1260,1330,1400,1470,1540,1615,1690,1765,1840,1920,2000,2080,2160,2245,2330,2415,
           2500,2590,2680,2770,2860,2955,3050,3145,3240,3340,3440,3540,3640,3745,3850,3955,4060,4170,4280,4390,
           4500,4615,4730,4845,4960,5080,5200,5320,5445,5575,5705,5835,5965,6100,6235,6370,6505,6645,6785,6925,
           7065,7210,7355,7500,7645,7795,7945,8095,8245,8400,8555,8710,8865,9025,9185,9345,9505,9670,9835,10000]
$function$;

-- 2. A trigger function members could call.
--
-- The baseline revokes EXECUTE on every function in public and then re-grants
-- the ones clients actually call. dz_mod_token_clear() -- a BEFORE UPDATE
-- trigger that blanks mod_token on member writes -- was swept into that grant
-- list alongside the real RPCs. Firing a trigger does not check EXECUTE on its
-- function, so this grant bought nothing and only widened what a member can
-- reach. Every other trigger function in the schema is service_role only.
--
-- The grant is on PUBLIC as well as on anon and authenticated, and revoking the
-- two roles alone would leave PUBLIC conferring it on both.

revoke execute on function public.dz_mod_token_clear() from public, anon, authenticated;
grant  execute on function public.dz_mod_token_clear() to service_role;
