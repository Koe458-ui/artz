alter table public.payments
  add column if not exists provider      text not null default 'razorpay',
  add column if not exists pp_order_id   text,
  add column if not exists pp_capture_id text;

alter table public.payments alter column rzp_order_id drop not null;

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('razorpay', 'paypal'));

alter table public.payments drop constraint if exists payments_provider_ref_check;
alter table public.payments add constraint payments_provider_ref_check check (
  (provider = 'razorpay' and rzp_order_id is not null and pp_order_id  is null) or
  (provider = 'paypal'   and pp_order_id  is not null and rzp_order_id is null)
);

create unique index if not exists payments_pp_order_id_key
  on public.payments (pp_order_id);

revoke select (price_cents) on public.marketplace_items from anon;

revoke select on public.profiles from anon, authenticated;
grant select (
  id, role, created_at, subscription_tier, subscription_expires_at,
  username, bio, avatar_url, avatar_storage_path, avatar_updated_at,
  banner_url, banner_storage_path, banner_updated_at, social_links,
  display_name, username_changed_at, follower_count, following_count,
  merit, merit_updated_at, likes_public, bookmarks_public
) on public.profiles to anon, authenticated;

revoke update on public.profiles from anon, authenticated;
grant update (
  username, display_name, bio, social_links,
  avatar_url, avatar_storage_path, avatar_updated_at,
  banner_url, banner_storage_path, banner_updated_at,
  likes_public, bookmarks_public
) on public.profiles to authenticated;

revoke all on function public.publish_due_scheduled_sections() from public, anon, authenticated;
revoke all on function public.albums_cap_guard()         from public, anon, authenticated;
revoke all on function public.user_tag_prefs_cap_guard() from public, anon, authenticated;
revoke all on function public.dz_fill_comment_username() from public, anon, authenticated;
revoke all on function public.dz_artwork_mod_gate()      from public, anon, authenticated;
revoke all on function public.is_dev()                   from public, anon;
revoke all on function public.dz_is_privileged()         from public, anon;
