-- A private community's member list was readable by every signed-in account.
--
-- community_members carried `SELECT USING (true)` for authenticated, so anyone
-- with a session could ask PostgREST for the roster of any community, public or
-- not, and get user_id, role, banned and timeout_until for every member -- and
-- through the embedded profiles join, their names and avatars too. `communities`
-- itself is properly gated (`is_public OR owner_id = auth.uid() OR
-- can_read_community(id)`), so the community could be invisible while its
-- membership was not.
--
-- Not a dramatic leak on its own -- profiles are world-readable by design -- but
-- it says who is in a room that was meant to be closed, which is the one fact a
-- private community exists to keep. It also hands an attacker a ready-made list
-- of a community's moderators, sorted by rank, to aim at.
--
-- can_read_community(cid) already encodes the rule the communities table uses:
-- public, or a member who is not banned. It is SECURITY DEFINER, so its own
-- read of community_members runs as the owner and does not re-enter this
-- policy -- no recursion.
--
-- The `user_id = auth.uid()` arm keeps a member's own row visible whatever
-- happens to the community around them. The client reads it in two places to
-- decide whether it is looking at a member (js/mywork.js, around lines 452 and
-- 599) and both would otherwise go blank for a private community the caller
-- has, in fact, joined.

drop policy if exists cm_read on public.community_members;

create policy cm_read
  on public.community_members
  for select
  to authenticated
  using (user_id = auth.uid() or public.can_read_community(community_id));
