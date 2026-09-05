# Incident — phishing comments, 2026-08-20

## What happened

An account registered as **DigiArtzSupport** posted four identical phishing
comments under two artworks, telling readers their DigiArtz account had been
restricted and sending them to an attacker-controlled address to "verify" it.

| | |
|---|---|
| Account | `674a0bbd-575d-445c-8fb9-e32f37a67328` |
| Email | `fayedorothy92@gmail.com` (email signup, no OAuth) |
| Registered | 2026-08-20 21:58:54 UTC |
| First comment | 2026-08-20 22:00:53 UTC — **two minutes after signup** |
| Last comment | 2026-08-20 22:01:36 UTC |
| Comments | 4, on artworks `af795b3c…` (×3) and `7cd74497…` (×1) |
| Payload | `https:5347567%2eshop/227983727` |
| Other activity | none — no uploads, no direct messages, no storage objects, never signed in again |

The whole thing lasted 43 seconds.

## The payload, and why it worked

```
(This message was generated automatically and sent from DigiArtz) Complete
Verification. Your DigiArtz account has been temporarily restricted. […] To
verify your information and regain full access to your account, please use the
secure link: https:5347567%2eshop/227983727
```

Look at the address. It is not written the way a link is normally written, and
every deviation is deliberate:

- **No `//` after the scheme.** `js/badwords.js` matched
  `(?:https?:\/\/|www\.)`, which requires the slashes. `https:` alone missed.
- **The dot written `%2e`.** The bare-domain rule required a literal `.` before
  a known suffix. `5347567%2eshop` has no dot in it, so it missed too — and a
  browser decodes `%2e` back to `.` when the reader pastes it, which is the
  whole trick.

The stored rows show the attacker working this out live. Comments 12 and 13
came back with the address **masked to asterisks** — the client filter caught
those attempts. Comment 14 is where `%2e` appears, and it is stored intact.
They were A/B testing against the filter until something got through.

### Three failures, not one

1. **The link filter was never attached to this table.**
   `enforce_community_links` guarded `public.comments` (community rooms) and
   `dm_no_links` guarded direct messages. `item_comments` — every comment under
   every artwork, resource, blog post, listing and job — had a rate limiter and
   a ban gate and **no content check at all**. The most public surface on the
   site was the one links were legal on.

2. **The filter that existed was in the wrong place.** `js/badwords.js` wraps
   `supabase.createClient()` in the visitor's browser. The anon key is public
   by design and ships in `config.js`, so PostgREST answers `curl` directly and
   the filter is not in that path. Client-side filtering is a typo-catcher, not
   a control.

3. **Nothing stopped the name.** "DigiArtzSupport" was a username anyone could
   claim by typing it. The link was the payload; the name is what made a reader
   trust it.

## What was done

### Cleanup (applied to production 2026-08-21)

- All 4 comments deleted.
- `auth.users` row deleted; the profile went with it by cascade.
- Verified afterwards: 0 rows for that user in `item_comments`, `comments`,
  `direct_messages`, `artworks`, `resources`, `blog_posts`,
  `marketplace_items`, `jobs` and `storage.objects`; 0 comments anywhere still
  matching the phishing text; 0 profiles holding a name containing "digiartz".

No other account posted anything matching this campaign — the attacker was
working alone.

### Fixes

See `security/SECURITY.md` for the full list. In short: link and phishing
detection moved into the database where it cannot be bypassed, the detector
now decodes obfuscation before matching, impersonation names are reserved,
rate limiting was extended to every write surface, and the CSP now names where
script may come from.

## Useful queries

**Who is being refused, and for what** — the guard logs every block:

```sql
select created_at, surface, rule, detail, left(sample, 120), ip
  from public.dz_abuse_events
 order by created_at desc
 limit 100;
```

Or, as staff, over the API: `select * from dz_abuse_recent(24, 200);`

**Anything phishing-shaped still stored anywhere:**

```sql
select 'item_comments' as t, id::text, left(body, 160) from public.item_comments
 where dz_has_link(body) or dz_phish_score(body) >= 2
union all
select 'comments', id::text, left(comment_text, 160) from public.comments
 where dz_has_link(comment_text) or dz_phish_score(comment_text) >= 2
union all
select 'direct_messages', id::text, left(content, 160) from public.direct_messages
 where dz_has_link(content) or dz_phish_score(content) >= 2;
```

**Accounts holding a reserved name** (grandfathered until they rename):

```sql
select id, username, public.dz_name_reserved(username) as matched
  from public.profiles
 where public.dz_name_reserved(username) is not null;
```

**Signup bursts from one address:**

```sql
select * from public.dz_abuse_events where rule = 'signup' order by created_at desc;
```

## Removing an account, if this happens again

Check the footprint first — never delete before you know what you are deleting:

```sql
-- substitute the account id
with uid as (select '00000000-0000-0000-0000-000000000000'::uuid as id)
select 'item_comments' as surface, count(*) from public.item_comments, uid where user_id = uid.id
union all select 'comments',        count(*) from public.comments, uid where user_id = uid.id
union all select 'direct_messages', count(*) from public.direct_messages, uid where sender_id = uid.id
union all select 'artworks',        count(*) from public.artworks, uid where user_id = uid.id
union all select 'storage.objects', count(*) from storage.objects, uid where owner = uid.id;
```

Then, for a clear-cut impersonation account with no legitimate content:

```sql
delete from public.item_comments where user_id = '…';
delete from auth.users where id = '…';   -- profile cascades
```

Storage objects, if there are any, must go through the Storage API or the
dashboard — deleting the `storage.objects` row leaves the file on disk.

For a real member who misbehaved, prefer the ban path
(`/api/moderation/ban-user`) over deletion: it is reversible and it writes an
audit row.

## Still worth doing

- **Leaked-password protection** — Supabase Dashboard → Authentication →
  Passwords → "Prevent use of compromised passwords". Thirty seconds, still not
  enabled.
- **Email confirmation before posting.** This account posted two minutes after
  signup from an unverified address. Requiring a confirmed email before a
  member's first public write would have cost the attacker the throwaway inbox.
  Supabase Dashboard → Authentication → Providers → Email → "Confirm email".
- **A report button on comments.** Items can be reported; individual comments
  cannot. Right now a reader who spots one of these has no way to tell you.
- **Nonce-based CSP.** `'unsafe-inline'` is still in `script-src` because
  `index.html` carries inline scripts and a static `_headers` file cannot mint
  a per-request nonce. `functions/_middleware.js` already rewrites the HTML and
  could inject one.
