# DigiArtz — Security Hardening

Summary of the security review and the changes made.

---

## Audit — 2026-09-05 (second pass: database, GitHub, dependencies)

The first pass read the JavaScript. This one went at the database the way an
attacker with a signed-in account would, by running the attacks rather than
reading the policies, and it found the worst thing in the codebase.

**Note on this file.** The repository is public. Everything below is fixed and
verified, which is why it can be written down in this much detail. Anything
still open is recorded in the operator's notes, not here.

### CRITICAL — moderation was a gate on the way in with no wall around it

Covered in full by `20260908000000_status_is_not_the_authors_to_set.sql`. In
short: every mod gate is `BEFORE INSERT`, `status` is an ordinary column, and
the RLS on artworks, blog_posts, marketplace_items, resources and jobs lets the
owner update their own row. One `PATCH` with `{"status":"approved"}` took a
pending or rejected row live and skipped Gemini, the HMAC ticket and the replay
table entirely. Proven against production and rolled back.

Fixed by a `BEFORE UPDATE` trigger on all five tables that pins `status` for any
write with a member behind it. Re-verified after applying: self-approval pins at
`pending` on all four tables that have rows, an edit carrying `status` still
saves the edit and holds the status, `visibility` still moves so members are not
over-blocked, the service-role drain still approves, and staff still approve by
hand.

The first cut of that trigger was itself wrong and the re-run is what caught it:
`current_user` inside a `SECURITY DEFINER` function is the function's owner, not
the caller, so the `current_user not in ('authenticated','anon')` test that
`dz_protect_social_counters` uses correctly would have read `postgres` every
time and exempted everybody. The trigger tests `auth.uid()` instead. Every other
`current_user` test in the schema was then checked: all four are in
`SECURITY INVOKER` functions, so all four are right.

### HIGH — two dashboard helpers answered questions about anybody, to anybody

`dz_an_achievements` and `dz_an_goal_progress` take the user to report on as a
parameter, are `SECURITY DEFINER`, and were granted to `anon`. Neither checked
who was asking, and the `sales` metric reads `marketplace_earnings`, whose
SELECT policy is deliberately `auth.uid() = seller_id`. An anonymous caller
could read any seller's sales count for any period, and any account's uploads,
views, likes, bookmarks, downloads and comments per section.

They are internals of the four readers the dashboard actually calls
(`dz_analytics_overview`, `_content`, `_reach`, `_activity`), which take no user
parameter and scope to `auth.uid()`. Nothing else referenced them -- checked
against every policy expression, every check constraint, every other function
body, and every `sb.rpc()` call in the client. Their only callers are other
`SECURITY DEFINER` functions, which execute as the owner and need no grant.
`20260909000000` revokes them, along with `dz_an_viewer_key`, `dz_an_country`
and `dz_actor_key` for the same reason.

Verified: `anon` and `authenticated` can no longer execute either; the four
public readers are still callable; `dz_analytics_overview` still returns an
object for the calling member, which proves the helpers still run internally.

### MEDIUM — jobs had no counter guard

`register_item_view` only knows `marketplace`, `blog` and `resource`, so nothing
ever incremented `jobs.view_count` and its poster could write it directly. The
same guard the other three sections use is now on jobs.

### What the attack suite found already correct

Run as a real member against production, all rolled back: a member cannot edit
another member's artwork, promote themselves to admin, grant themselves Max,
inflate a like, view, bookmark, download or sales counter, self-accept a friend
request (`friendships_guard` requires the addressee), or forge a payment, payout
or earning. `dz_admin_notify` checks `dz_is_staff` on its first line.
`dz_analytics_track` ignores the caller's `p_owner` and derives the owner from
the subject's own table, so analytics cannot be poisoned onto someone else.
`get_user_liked_artworks` and its siblings honour `likes_public`.

Every write policy in the schema is ownership-scoped -- there is no `USING
(true)` on any INSERT, UPDATE or DELETE -- and every UPDATE policy's WITH CHECK
matches its USING. `payments`, `payout_requests`, `payout_methods`,
`marketplace_earnings`, `seller_tax`, `ledger_entries`, `direct_messages`,
`analytics_events`, `cart_items` and `scheduled_uploads` are all
`auth.uid()`-bound for SELECT, and `authenticated` holds no UPDATE on any of the
money tables at all. `profiles` is world-readable by policy but `email`,
`currency`, `max_claimed` and `partner_since` are withheld at the column grant.

### GitHub

The repository is **public**, with one write collaborator besides the owner and
one fork. No secret has ever been committed -- the full history is clean of JWT,
`rzp_live_*`, `sk_live_*`, `AIzaSy*`, `sb_secret_*`, AWS and PEM shapes, and
`config.js` has never been tracked. The single workflow declares
`permissions: contents: read`, uses `pull_request` rather than
`pull_request_target`, and consumes no secrets, so a pull request from a fork
gets a read-only token and nothing to steal.

`main` carries **no branch protection**: no required review, no required status
check, and force-push is not blocked. The eight CI jobs therefore advise but do
not gate, and `main` deploys to production.

### Dependencies

There are none. No `package.json`, no lockfile, no `node_modules` -- the entire
runtime is hand-written JavaScript plus one vendored file,
`js/vendor/supabase-js-2.112.2.min.js`, served from our own origin rather than a
CDN, so there is no third-party fetch to compromise and no SRI to get wrong.
Scanned for tampering: no `eval`, no `new Function`, no dynamic `import`, and
the only absolute URLs in it are documentation links and a localhost default.
That is close to the best supply-chain position a site like this can be in.

### Not verifiable from this environment

The network policy denies egress to both `digiartz.net` and
`tmqzqlrpjpydiftlrzmj.supabase.co`; only the Postgres connection is reachable.
So nothing in this pass tested live HTTP. **Unverified, and still worth
checking by hand:** the response headers Cloudflare actually serves against what
`_headers` says, CORS on the deployed API routes, whether anything unintended is
reachable under the web root, and the two Supabase Auth dashboard settings
(captcha enforcement and leaked-password protection -- the advisor still reports
the latter disabled).

---

## Audit — 2026-09-05

A full pass over the repository and, again, over the live catalogue rather than
over what the migrations say about it. Five things were wrong. Four are fixed
and one needs the edge function redeployed before its fix means anything.

The database changes are **applied to production** (remote migration
`20260905055547 restore_function_hardening`) and re-read from the catalogue
afterwards rather than taken from the tool's success message. The JavaScript
changes are on the branch and go out with the next Pages deploy. The
smart-function change is **not deployed** and is inert until it is.

### The edge rate limit did not limit anyone who did not want it to

`underEdgeLimit` keyed its bucket on a SHA-256 of the `Authorization` header.
Nothing at the edge verifies a token — `sbUser` does that later, and the webhook
paths never do — so the key was attacker-chosen. A fresh random `Bearer` on
every request minted a fresh bucket every time, and *every* `/api/` limit in
`LIMITS` fell away: 20/min on `/api/rzp`, 20 on `/api/moderate-upload` (which
forwards up to six 10 MB images to Gemini per call), 90 on the catch-all. The
address fallback only ran when no token was sent at all, so sending one was the
whole bypass.

**Severity: HIGH.** Not a data-disclosure bug — an abuse-control bug that made
every other number in that file decorative.

Fixed: the bucket is the connecting address, which the caller cannot rotate.
Because one address can carry several people, the per-route number is multiplied
by `SHARED` (3) before it is applied. It is still a bound, which is the point.
Per-member limits are unaffected — those are counted on `user.id` inside the
handlers, on a token Supabase has actually verified, and that is where fairness
between members belongs. `scripts/security-test.mjs` now asserts that two
different bearers from one address land in one bucket.

### A failed payout handed back money that had already been paid

`payoutItem` in the PayPal webhook, on FAILED / BLOCKED / RETURNED / DENIED /
REFUNDED, ran:

```
marketplace_earnings?seller_id=eq.<seller>&currency=eq.<cur>&status=eq.paid_out
  → status = available
```

Every `paid_out` earning the seller had in that currency, not the ones this
payout retired. `admin-send` retires earnings oldest-first and stores no link
back to the request, so a seller with one successful payout behind them and one
that PayPal bounced would have had *both* sets returned — and could withdraw the
first a second time.

**Severity: HIGH, exposure nil so far.** `payout_requests` and
`marketplace_earnings` are both empty in production, so no payout has ever run.
It would have bitten on the first bounce after a first success.

Fixed: the request is reopened first and the return only proceeds if that PATCH
claimed the row, so a retried webhook cannot return the same earnings twice.
The set is then reconstructed the way `admin-send` built it — newest-first until
the amount is covered — which returns what this payout took and leaves earlier
payouts alone. Returning earnings also appends an `adjustment` credit for
exactly what went back: sending the payout wrote a `payout_debit`, and without
the matching credit `dz_reconcile` would see more balance than the ledger
accounts for and freeze the seller's withdrawals over PayPal's failure.

The real fix is a `payout_request_id` on `marketplace_earnings`. That is a
schema change and is not in this pass; the reconstruction above is exact under
the ordering `admin-send` actually uses.

### Yen, forint and Taiwan dollars were recorded at a hundred times their value

Both PayPal capture paths turned the provider's decimal string into minor units
with `Math.round(parseFloat(value) * 100)`. JPY, HUF and TWD have no minor unit
— `toValue` already knew that, and `ppFee` already handled it — so a ¥1000 sale
was written to the ledger as `provider_amount = 100000`.

**Severity: MEDIUM.** Ledger accuracy, not money movement: the charge itself is
built from `subscription_prices` and `price_cents`, and the amount check against
`toValue(row.amount, row.currency)` was already correct, so nobody was over- or
under-charged. The wrong number is the one the ledger keeps for reconciliation.

Fixed: `money.js` grows `toMinor` as the stated inverse of `toValue`, both
capture paths use it, and `ppFee` now shares it instead of restating the rule.

### Two catalogue invariants the suite checks had stopped holding

`security/rls-regression.sql` asserts both as counts that must be zero. Against
the live catalogue on 2026-09-05 they read 1 and 1:

| invariant | observed | why |
|---|---|---|
| `functions_without_pinned_search_path_expect_0` | `xp_level_thresholds` | `20260906000000_xp_curve_to_10k.sql` rewrote it with `CREATE OR REPLACE` and did not carry `SET search_path` across. `CREATE OR REPLACE` drops settings the new statement omits. |
| `trigger_fns_executable_expect_0` | `dz_mod_token_clear` | the baseline's grant list at line 5573 swept this trigger function in beside the real RPCs, on `PUBLIC` as well as `anon` and `authenticated`. |

Neither was exploitable. `xp_level_thresholds` is SECURITY INVOKER and its body
is a constant array — it resolves no objects, so there is nothing for a
search_path to redirect. Firing a trigger does not check `EXECUTE` on its
function, so that grant conferred nothing a member could use; every other
trigger function in the schema is `service_role` only.

Both are restored by `20260907000000_restore_function_hardening.sql`, applied on
2026-09-05. The revoke names `PUBLIC` as well as the two roles, because revoking
the roles alone would leave `PUBLIC` still conferring it on both.

Re-read from the catalogue after applying:

| | before | after |
|---|---|---|
| functions with no pinned `search_path` | `xp_level_thresholds` | none |
| trigger functions executable by `anon`/`authenticated` | 1 | 0 |
| `dz_mod_token_clear` ACL | `{=X, postgres=X, anon=X, authenticated=X, service_role=X}` | `{postgres=X, service_role=X}` |
| `function_search_path_mutable` advisor | 1 | 0 |

And the curve itself is untouched, which is the part that would have mattered
if the replace had gone wrong: `xp_level_thresholds()` still returns 100 levels,
`[100]` is still 10000, `xp_to_level(0)=1`, `xp_to_level(10000)=100`, and
`get_xp_leaderboard(5)` still returns five rows.

This is the second time this pair has regressed — remote migration
`20260710074623` is named `verification_cleanup_xp_search_path_and_trigger_grants`.
Which is the argument for the CI job below rather than for a third fix.

The lesson is the same one as 2026-08-30, one level up: the suite that would
have caught these is not wired into CI. Every CI job tested the JavaScript; the
SQL suite is run by hand. Nothing failed here because nothing ran.

`rls-regression.sql` cannot be wired in — it needs a live database and
credentials CI has no business holding. But the mistake is made in the
migrations, not in the catalogue, and that can be read statically.
`scripts/check-sql-functions.mjs` replays the migrations in filename order and
judges only the state they add up to, so a later migration that re-pins or
revokes settles an earlier one instead of being shouted at for history. It fails
on both of today's regressions with `20260907` removed and passes with it back,
which is the only evidence a new check is worth having. It runs as the `sql` job.

### smart-function signed uploads into folders it never checked

`action: "upload"` validated the path's shape and its `koe-media/` prefix and
nothing else, then minted signed upload URLs for it. `action: "delete"` beside
it has always checked that the second path segment is the caller's id.

**Severity: LOW.** Storage RLS carries the same rule as a `WITH CHECK` on both
buckets (`(storage.foldername(name))[2] = auth.uid()::text`), and a signed
upload URL is created through the caller's own client, so the write was refused
at the storage layer. Nothing was reachable — but the check belongs here too,
which is the whole argument for the layer below not being the only one.

Fixed: both actions now share one `ownsPath()`, with the same admin/dev
exception `delete` already had (dev template uploads land outside any member
folder). Its signing failure also stops returning the storage error, which can
name the policy that refused. **Needs redeploying to Supabase** — editing the
file in the repo does not change what is running.

### Looked at and found sound

No secret has ever been committed: the working tree and the full history are
clean of JWT, `rzp_live_*`, `sk_live_*`, `AIzaSy*`, `sb_secret_*`, AWS and PEM
shapes, and `config.js` has never been tracked. The publishable key in
`config.example.js` and `lib/sb.js` is the anon key and is meant to be public.

Every HTML sink in `js/` was traced: 248 assignments, and every interpolation
that could carry member text goes through `esc`, `dzThumbAttrs` (which escapes
both `src` and `srcset`), or `safeHref` (which requires `^https?://`, so
`javascript:` cannot survive it). The unescaped interpolations that remain are
icon constants, integers and ids the code itself generates.

`dz_market_file_grant` scopes the file to `and f.item_id = p_item`, so knowing
another listing's file id buys nothing. The analytics RPCs take no user
parameter at all and read `auth.uid()`, so there is no id to tamper with. Every
`collab` and `payouts` action delegates to a SECURITY DEFINER RPC called with
the member's own JWT. The service worker caches only
`/storage/v1/object/public/`, never a signed URL. No `eval`, no `new Function`,
no `document.write`, no `console.log` outside `scripts/` and the deliberate
cache inspector, no TODO/FIXME, no duplicate ids and no dangling `for`,
`aria-labelledby` or `aria-controls` target in `index.html`.

### Left alone, and why

- **`'unsafe-inline'` and `'unsafe-eval'` in `script-src`.** Real weaknesses.
  The first needs every inline `onclick=` in `index.html` replaced before a
  nonce would mean anything; the second is likely there for the Razorpay and
  PayPal SDKs, and removing it blind would break checkout for everyone. Both
  want a staged test, not a guess.
- **Supabase Auth captcha and leaked-password protection.** `js/auth.js` passes
  `captchaToken` to Supabase, which is the right place to verify it — but if the
  captcha toggle is off in the Auth settings the token is ignored and the widget
  is decoration. The `auth_leaked_password_protection` advisor still reports
  disabled. Both are dashboard settings; neither can be fixed from the
  repository. **Confirm both in the Supabase dashboard.**
- **Three dead CSS declarations** (`hero.css:462` ×2, `overrides.css:181`).
  Removing them means a new `?v=` on two stylesheets, so every visitor
  re-downloads 2,276 lines of CSS to drop three lines nobody was reading. Not
  worth the invalidation.
- **`underLimit` fails open** when `dz_rate_take` is unreachable. Deliberate:
  the alternative is that a database blip takes the API down.

---

## Deployment check — 2026-08-30

Run against the branch before merge: git state, every CI job, both regression
suites, and — the part that mattered — a reconciliation of what the two
migration files *claim* against what the live catalogue actually says.

Sixteen of the seventeen claims reconciled. One did not.

### The one that did not: a revoke that returned success and changed nothing

Round 3 item 6 said INSERT on the entitlement columns of `profiles` was revoked
at the grant layer. It was not. The statement was:

```sql
revoke insert (role, max_claimed, partner_since, subscription_tier, ...)
  on public.profiles from anon, authenticated;
```

**A column-level `REVOKE` cannot subtract from a table-level `GRANT`.** Postgres
keeps conferring the privilege on every column, the statement reports success,
and nothing changes. `authenticated` held table-level INSERT on `profiles`, so
all eight columns were still grantable:

```
subscription_tier   has_column_privilege(authenticated, INSERT) = true
role                has_column_privilege(authenticated, INSERT) = true
merit               has_column_privilege(authenticated, INSERT) = true    (all 8)
```

`anon` was clean, but only by accident — Round 3b's table-level sweep over inert
grants happened to catch it, which is also why the discrepancy was one-sided and
easy to miss.

**Exposure: none.** `dz_profiles_guard_insert` refuses every member-side insert
into `profiles` regardless, and the attack suite proved it throughout
(`member inserts a privileged profile → refused P0001`). What was missing was
the second layer — the one whose entire purpose is to not depend on the first.
The documentation asserted defence in depth that was one deep.

### Fixed

Drop the table-level grant, then re-grant per column, with the safe set built
from the catalogue rather than typed out:

```sql
revoke insert on public.profiles from anon, authenticated;
grant insert (<every column except the eight>) on public.profiles to authenticated;
```

The two layers are now independently observable, which is the test that they are
in fact two:

| attempt | refused by | code |
|---|---|---|
| `insert (id, username, subscription_tier)` | the **grant** | `42501 permission denied for table profiles` |
| `insert (id, username, role)` | the **grant** | `42501 permission denied for table profiles` |
| `insert (id, username)` — the app's own fallback shape | the **trigger**, as before | `P0001 role, max_claimed and partner_since are not yours to set` |
| `update` own `display_name` / `bio` | nothing — still accepted | — |

Before the fix the first two rows also read `P0001`: the trigger was doing all
the work and the grant layer was decorative.

`security/rls-regression.sql` now asserts the column grants directly, so this
cannot silently revert.

### Why it was caught

Not by re-reading the diff — the SQL looks right, and it runs without error. It
was caught by asking the live catalogue whether each claim in the migration was
true, one claim at a time. A migration that runs cleanly is not evidence that it
did what it says.

### Everything else reconciled

profiles guard ✓ · `dz_market_owns` visibility gate ✓ · `dz_market_download`
delegation ✓ · 3 counter triggers ✓ · `payments.pp_order_id` unique index ✓ ·
0 unpinned `search_path` ✓ · 0 `TRUNCATE`/`REFERENCES`/`TRIGGER` ✓ · 0
trigger-function `EXECUTE` ✓ · default ACL narrowed to `arwd` ✓ · both buckets
size- and MIME-bounded with no html/svg/pdf ✓ · single deliberate inert grant
(`notification_reads/authenticated/UPDATE`) ✓.

Suites at the time of the check: **122/122** JS checks, **22/22** attack cases,
**23/23** client write paths, 7/7 CI jobs.

### Not verifiable from the audit environment

Recorded as manual, not as outstanding work:

- **Leaked Password Protection** and **Email Confirmation** — enabled by the
  operator and taken as such. The `auth_leaked_password_protection` advisor
  still appears, but it is the only one of 150 lints carrying no `observed_at`
  timestamp, so it cannot be dated and is not evidence either way. No signup has
  occurred since the toggles (18 users, all confirmed, newest 2026-08-26), so
  the data says nothing either. **MANUALLY VERIFIED.**
- **Turnstile in production** — `config.js` is generated at deploy from Pages
  environment variables and is gitignored; outbound egress to `digiartz.net` is
  blocked from the audit environment. Confirm `TURNSTILE_SITE_KEY` is non-empty
  in the deployed file.
- **The bucket MIME rule end to end** — configuration is asserted in the suite,
  but no real `PUT` was performed: egress to `supabase.co` is blocked and there
  is no user JWT to sign one with. Upload a webp, a `.pdf` and a `.svg` after
  deploy.

### Deploy ordering, which is live right now

The database and storage changes are **already applied to production**. The two
JavaScript changes are **not** — they are on the branch, and `main` does not
have them.

That means the bucket MIME allowlist is enforcing while the deployed client
still sends the raw `file.type`. A `.svg` or `.pdf` **asset** upload would be
refused until the branch merges. koe-media held 152 objects, every one
`image/webp`, and the asset path had never been used against it, so nothing in
flight is affected — but the window is real and closes on merge.

---

## Round 3b — 2026-08-30, the grant layer and the storage content types

Round 3 left two things open and named them. This closes both, and in going
after the second one properly it opened a layer nobody had audited: Postgres
**grants**, which sit underneath RLS rather than beside it.

A policy decides which *rows* a role may touch. A grant decides whether the role
may touch the table at all — and two of the privileges found here are not
row-filtered by RLS in the first place.

### The finding that mattered

**`anon` held `TRUNCATE` on 51 tables. `authenticated` held it on 54.**

`TRUNCATE` is not filtered by row-level security. There is no policy that
narrows it, no `USING` clause it consults; holding the privilege *is* the whole
check. Every control in this schema is built on RLS, and this is a
delete-every-row primitive that RLS does not see.

It was not reachable through PostgREST — which speaks SELECT/INSERT/UPDATE/
DELETE and RPC, and has no TRUNCATE verb — so this was a latent privilege
rather than an open door, and it is scored MEDIUM for that reason. But it sat on
the **anonymous** role, on almost every table in the database, exempt from the
one control everything else relies on.

The cause is not a mistake anyone made. Supabase's default privileges grant
`ALL` on new tables to `anon` and `authenticated`, and `ALL` includes `TRUNCATE`,
`REFERENCES` and `TRIGGER`. Every table created since the project started
inherited them silently. Fixed on the existing 73 tables, and the default
narrowed to `SELECT, INSERT, UPDATE, DELETE` so the next one does not inherit
them either — a new table still works behind its policies exactly as before.

| # | What | Severity | Where |
|---|------|----------|-------|
| 13 | `TRUNCATE`, `REFERENCES`, `TRIGGER` on all 73 public tables, held by both roles; `TRUNCATE` is RLS-exempt | **MEDIUM** | the grants section of `20260901000000_baseline.sql` |
| 14 | 80 further (table, role, privilege) triples held where RLS has no matching policy. Inert today — the grant reaches the table, the missing policy refuses every row — and removed because "inert" is a property of the current policy set, not of the grant. The day somebody adds a convenience `FOR ALL` policy, the write privilege is already sitting there | LOW | §2 |
| 15 | `EXECUTE` on all 43 trigger functions, held by both roles, making each one an addressable `/rest/v1/rpc` name | LOW | §3 |
| 16 | **`koe-media` accepted any content type** — the item Round 3 left open. See below | MEDIUM | §4 |

### The storage content types, and why Round 3 did not just do it

Round 3 wrote: *"Not done blind: the list has to cover every extension in
`smart-function`'s `ASSET_EXT`, and one missing entry silently breaks that
upload."* That was the right call and it is still true — which is why the fix is
two halves, not one.

The half that made it safe: **every asset now declares
`application/octet-stream`**. Nothing was lost by doing that, because every
asset is fetched back through `/api/market-download` or
`/api/resource-download`, and both set their own `Content-Type` and
`Content-Disposition: attachment` from the database row. *The type stored beside
the bytes is never read on the way out.* Checked before relying on it: no
`file_url` is ever used as an `<img src>` — everything rendered inline is a webp
derivative from `preview_url`, `cover_url` or `image_url`.

So the only content types the app can now produce are five image types and
`application/octet-stream`, and the bucket list can be closed against renderable
types without a `.blend` or a `.procreate` ever being caught by it.

Not on the allowlist, on purpose: `text/html`, `application/xhtml+xml`, every
other `text/*`, `image/svg+xml`, `application/xml`, `application/pdf`. Each
renders in a browser window rather than landing in a downloads folder. SVG is
the one worth naming — it is an image by extension and a script host by
behaviour, and `.svg` is a legitimate asset format here, so it still uploads
happily as a download and simply cannot be rendered from the storage origin any
more.

Ground truth when this was applied: koe-media held 152 objects, **every one of
them `image/webp`**. The asset path had never been used against that bucket, so
nothing was orphaned and nothing in flight was affected. Both buckets now carry
the list.

### The regression I caused, and how it was caught

Revoking the inert grants broke **marking notifications read**.

`js/auth.js` upserts `notification_reads`, and an upsert is
`INSERT … ON CONFLICT DO UPDATE`, which Postgres requires the `UPDATE`
privilege to *plan* — whether or not a row actually conflicts. The measurement
was right that no `UPDATE` policy exists; it did not follow that the privilege
was unused.

It was caught by running every one of the 23 direct client write paths against
the live database, not by reading the diff. The `UPDATE` grant is restored, and
`js/auth.js` now passes `ignoreDuplicates`, making it `ON CONFLICT DO NOTHING` —
which needs no `UPDATE` privilege and is what "mark read" actually means, so a
re-mark no longer throws either. The grant is deliberately left in place until
that ships, so neither deploy order can break production.

That is the one place in this audit where a change of mine broke something. It
is written down here rather than quietly fixed, because the lesson is the
useful part: an inert-looking grant is only inert for the statements you
thought of.

### Tests

Both suites grew, and both were re-verified by reverting each fix and watching
them go red.

- `scripts/security-test.mjs` — now **122 checks**. New: `safeUploadType` pulled
  out of the shipped `app-core.js` and executed (not re-implemented) against
  `text/html`, `image/svg+xml`, `application/xhtml+xml`, `application/pdf`,
  empty, `null`, `constructor` and `__proto__`; that no PUT still sends the raw
  `file.type`; that the notification upsert ignores duplicates.
- `security/rls-regression.sql` — the 22 attack cases, plus structural
  assertions that now fail loudly if the grant layer drifts: inert grants must
  be exactly the one documented exception, `TRUNCATE`/`REFERENCES`/`TRIGGER`
  must be 0, trigger-function `EXECUTE` must be 0, unpinned `search_path` must
  be 0, unbounded buckets must be 0, tables without RLS must be 0, and no bucket
  may allow html, svg or pdf.
- 23 direct client write paths re-run after every revoke: **23/23**.

### What was proven rather than assumed

Two things were tested inside a rolled-back transaction before being applied to
43 functions:

- a trigger function cannot be called as an RPC at all — Postgres refuses it
  itself with `0A000 trigger functions can only be called as triggers`, so the
  `EXECUTE` grant was never exploitable, only noisy;
- revoking `EXECUTE` does **not** stop a trigger firing. The privilege is
  checked at `CREATE TRIGGER`, not per row. An insert into `artwork_likes` was
  accepted with the ban gate, the write limiter and the content guard all
  revoked, and every one of them still ran.

### Also checked this round

- **No `pg_net`, no `http` extension** — the database cannot make outbound
  requests, so there is no SSRF primitive inside Postgres. Installed: `pg_cron`,
  `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.
- **`auth.users` is not reachable** by `anon` or `authenticated`. Neither is the
  `vault` schema. The `cron` schema has no grants to either role, and its four
  jobs are the expected ones (merit regen, scheduled publishing ×2, subscription
  expiry).
- **Statement timeouts are set**: `anon` 3s, `authenticated` 8s. That is a real
  application-DoS control and it was already correct.
- **Every table in `public` has RLS enabled** — 0 without.

### Advisor count

189 lints at the start of this audit, **150** now: all 9
`function_search_path_mutable` gone, and 30 of the
`security_definer_function_executable` warnings gone with the trigger-function
revokes. The remaining 128 are the intentional RPC API — every one that returns
member data gates on `auth.uid()` internally — and the 21
`rls_enabled_no_policy` are fail-closed tables whose grants are now stripped as
well, so they are closed twice.

### What is still open after this round

- **`'unsafe-inline'` in `script-src`.** Unchanged, and still the highest-value
  item left. It is why session tokens in `localStorage` matter.
- **Leaked-password protection** and **email confirmation before a first public
  write** — still two dashboard toggles nobody can set from the repository.
- **The `supabase_admin` default-privilege entry** still grants the full set
  including `TRUNCATE`. It could not be altered from the `postgres` role and
  applies only to tables created *by* `supabase_admin`, which migrations are
  not. The regression suite asserts the live count stays at zero, so if it ever
  comes back it will be visible.
- **`Access-Control-Allow-Origin: *` on the edge function.** Not exploitable —
  it authenticates by `Authorization` header, which a cross-origin caller cannot
  supply — but wider than it needs to be.
- **The bucket MIME rule was not exercised with a real upload.** It is enforced
  by Supabase Storage, and the configuration is verified in the suite, but no
  end-to-end PUT was performed from this session. Worth one manual upload of
  each kind after deploy.

---

## Round 3 — 2026-08-30, full-scope audit

A ground-up pass over the whole surface: every Pages Function, every RLS
policy, every column grant, every SECURITY DEFINER function, both storage
buckets, the service worker, the workflow file, and all 79 commits of history.
Round 2's fixes all still hold — this round is what was left, plus two things
that were never in scope before (Postgres **grants**, as distinct from
policies, and the **storage bucket settings**, as distinct from the storage
policies).

Nothing here removes a capability a member had. `featured` stays a member's own
checkbox: it is an advertised part of the upload form, not a hole.

### Fixed — money

| # | What | Severity | Where |
|---|------|----------|-------|
| 1 | **A payout could be requested twice against the same balance.** `withdrawable()` reads, then the insert writes: two requests fired together both passed the check and both got created. `admin-decide` then weighed each one against the balance *on its own*, so both could be approved, and `admin-send` re-checked nothing before calling PayPal. Three gates, and a concurrent pair walked all three. Now: the request re-reads the open set once its own row is in it and withdraws itself if the total is over, approval counts what is already approved or in flight, and the send re-checks coverage as the last act before the money leaves | **HIGH** | `functions/api/payouts.js` |
| 2 | **The PayPal capture path dropped the seller's credit.** `recordEarning()` reads `row.user_id` for `buyer_id`, which is `NOT NULL`, and the capture handler's select did not ask for it — so the insert failed and was swallowed by the `.catch()`. The webhook rescued it only when `PAYPAL_WEBHOOK_ID` was set and the event actually arrived | HIGH (money, correctness) | `functions/api/paypal.js` |
| 3 | `payments.rzp_order_id` was unique; `pp_order_id` was not, though both are the key a webhook settles on | LOW | migration §4 |

### Fixed — authorization

| # | What | Severity | Where |
|---|------|----------|-------|
| 4 | **A free listing was downloadable whatever its status.** `dz_market_owns()` let any signed-in member fetch the file of any `price_cents = 0` listing — including one pulled for moderation, or still a draft. A *paid* purchase is deliberately still honoured regardless of status: somebody who paid keeps their download if the listing is later withdrawn | MEDIUM | migration §2 |
| 5 | **A second, weaker copy of that same rule.** `dz_market_download()` — the older RPC, still reachable over `/rest/v1/rpc` though nothing calls it — carried its own owner/free/paid test, and the copy had already drifted (no visibility check, no `kind` check). It now asks `dz_market_owns()` instead of re-deciding | MEDIUM | migration §2b |
| 6 | **`profiles` INSERT was granted on every column, entitlement columns included.** The guard named only `role`, `max_claimed` and `partner_since`. Nothing exploits this today — `handle_new_user()` writes the row the moment the account exists, so a member's own insert always collides on the primary key, and an upsert would need UPDATE privilege on columns they do not hold — but both of those are accidents of ordering rather than decisions. The guard now names the tier and merit columns too, and INSERT on them is withheld at the grant layer, which does not depend on trigger ordering at all. **The grant half was initially written as a column-level `REVOKE` and did nothing** — see the deployment check below | MEDIUM | migration §1 |
| 7 | **The action router answered to `Object.prototype`.** `ACTIONS[name]` with a caller-supplied `name`: `constructor`, `__proto__`, `toString` all resolve to something truthy. Reaching the call with `fn = Object` would have returned `{ env, request, body, user }` — the service-role key inside it — straight into the JSON response. It never got that far only because `LIMITS[name]` is destructured first and throws on the same keys. That is one refactor away from being the real thing | MEDIUM | `functions/api/collab.js` |

### Fixed — abuse and disclosure

| # | What | Severity | Where |
|---|------|----------|-------|
| 8 | **The public bucket accepted an upload of any size.** `koe-media` had no `file_size_limit`, and the only size check anywhere is the one `smart-function` makes against the size the **client declares** before minting the signed URL. Declare one byte, `PUT` a gigabyte, 400 times a day per account. The bucket now carries the same 400MB ceiling as `koe-originals`, which is what a Max member is granted anyway, so no legitimate upload changes | **HIGH** (cost / exhaustion) | migration §6 |
| 9 | **Engagement counters were the seller's to write.** `view_count` was pinned on the item tables and all four counters on `artworks`, but `like_count`, `bookmark_count`, `download_count` and `sales_count` on `marketplace_items`, `resources` and `blog_posts` were not. A seller could write their own social proof. The client only ever reads these; the new guard fires for a direct PostgREST write only, so the SECURITY DEFINER counter paths are untouched | LOW | migration §3 |
| 10 | **Internal error text was returned to callers.** `detail: String(err).slice(0, 200)` on all three download endpoints and the moderation endpoint, and the Gemini error body echoed into the moderation audit the browser gets back | LOW | `download.js`, `market-download.js`, `resource-download.js`, `moderate-upload.js` |
| 11 | Nine functions still had a floating `search_path`. All nine are SECURITY INVOKER so this is not the classic escalation — but two of them are `dz_has_link` and `dz_phish_score`, and an anti-phishing guard whose operator resolution depends on the caller's `search_path` is a guard with a seam in it. Every function in `public` is now pinned, definer and invoker alike | LOW | migration §5 |
| 12 | The workflow had no `permissions:` block, so every job on every pull request ran with the repository's default token scope. Now `contents: read` | LOW | `.github/workflows/checks.yml` |

### Checked and found correct

Recorded because "we looked" is worth as much as "we changed", and because the
next audit should not have to re-derive it:

- **Razorpay webhook** verifies HMAC-SHA256 over the **raw** body before any
  parse, with a length check and `timingSafeEqual`. **PayPal webhook** verifies
  through PayPal's own `verify-webhook-signature` API. Neither trusts the event
  before the signature.
- **Fulfilment is idempotent.** Both webhooks and both client-side verify paths
  settle with a conditional `PATCH … &status=eq.created` and act on the
  entitlement only when that returns a row. `marketplace_earnings` carries
  `UNIQUE (payment_id)`, so a replayed event cannot double-credit a seller.
- **No price comes from the client.** Plan prices come from
  `subscription_prices`, item prices from `marketplace_items`, support amounts
  are bounded by `support_limits`, and the webhook compares the amount the
  provider reports against the stored row before settling.
- **RLS and grants agree.** Every money table (`payments`, `payout_requests`,
  `marketplace_earnings`, `payout_methods`, `seller_tax`,
  `reconciliation_flags`, `ledger_entries`) carries a SELECT-only policy, so the
  broad `anon`/`authenticated` grants on them are inert — INSERT/UPDATE/DELETE
  have no policy and fail closed. Verified by attack, not by reading:
  `security/rls-regression.sql`.
- **`profiles` column grants are right.** `email`, `currency`, `max_claimed`
  and `partner_since` are not in the SELECT grant, so an anonymous read cannot
  reach them; UPDATE is granted on twelve display columns and nothing else.
- **`wallet_history` is `security_invoker=true`**, so the wide grants on the
  view resolve against the underlying policies rather than the view owner's
  rights. The `an_*` views are definer views and carry no grants at all.
- **Storage paths are owned.** Both buckets require `foldername(name)[2] =
  auth.uid()` to write, and `koe-originals` requires it to read. The edge
  function's upload signing does not check the path itself — it does not need
  to, because it signs through the caller's own token and RLS decides.
- **XSS.** Every innerHTML site that carries database text runs it through the
  local `esc`; every `href` built from a database column goes through
  `safeHref`, which requires `http:` or `https:` and so refuses `javascript:`.
  Swept `js/*.js` and `index.html` mechanically, not by eye.
- **Secrets.** All 79 commits scanned blob by blob for JWT shapes,
  `rzp_live_*`, `sk_live_*`, `AIzaSy*`, `sb_secret_*` and PEM private keys —
  nothing. `config.js` has never been tracked. `scripts/security-test.mjs` now
  re-runs that scan over every browser-served file on each push.
- **The service worker** never caches `/api/*` or the Supabase REST origin, so
  one member's response cannot be served to another.

### Tests

Two suites, both runnable, both of which fail if the fix is reverted — checked
by reverting each fix and watching them go red.

- `scripts/security-test.mjs` — 103 checks over the Pages Functions: rate-limit
  coverage of every route (including one that does not exist yet, so a new
  endpoint is covered the day it lands), the same-origin gate against seven
  forged-header cases, `allowedHost` against userinfo and suffix tricks,
  `Content-Disposition` filename escaping, the own-property dispatch guard, the
  absence of internal error text, the two payment fixes, and the secret scan.
  Wired into CI as its own job.
- `security/rls-regression.sql` — 22 checks against the live database,
  impersonating `anon` and two members the way PostgREST does. Every write
  attempt runs inside a PL/pgSQL sub-block that raises and catches its own
  exception, so an attack that *succeeds* is still rolled back and only the
  verdict survives; safe to run against production. Run 2026-08-30: 22/22 PASS,
  nothing left behind.

### Remaining risks

Honestly, and none of them newly introduced by this round:

| Risk | State | What closing it takes |
|---|---|---|
| ~~**`koe-media` accepts any content type.**~~ | **FIXED in Round 3b** — see above. Both buckets now carry an allowed_mime_types list that excludes html, xhtml, every other text/*, svg, xml and pdf, and the client declares application/octet-stream for every non-image upload so no legitimate asset is caught by it | — |
| **`'unsafe-inline'` and `'unsafe-eval'` in `script-src`** | NOT FIXED — carried from round 2 | `index.html` has inline scripts and a static `_headers` file cannot mint a nonce. `functions/_middleware.js` already rewrites the HTML and could |
| **Session tokens live in `localStorage`** (Supabase JS default) | ACCEPTED | Inherent to the SPA + PostgREST design. It is why the CSP item above matters more than it looks |
| **Leaked-password protection is still off** | NOT FIXED — **requires human action** | Supabase → Authentication → Passwords. Third round of asking |
| **Email confirmation before a first public write is still off** | NOT FIXED — **requires human action** | Supabase → Authentication → Providers → Email. The 2026-08-20 attacker posted two minutes after signup from an unverified throwaway |
| **No CDN/WAF rate limiting in front of the edge limiter** | ACCEPTED | The limiter in `_middleware.js` costs a Supabase round trip per request, so a volumetric flood still costs money before it is refused. Cloudflare WAF rate-limiting rules on `/api/*` would refuse at the edge for free |
| **`dz_rate_take` uses fixed windows** | ACCEPTED | A caller straddling a boundary gets up to 2× the limit in a burst. Sliding windows cost a table scan per call; not worth it at this scale |
| **158 SECURITY DEFINER functions are `anon`/`authenticated` executable** | REVIEWED, not changed | This is the RPC API — the surface is intentional. Every one that returns member data gates on `auth.uid()` internally; spot-checked the analytics, download, entitlement and profile families. About fifteen of them are trigger functions that Postgres will not let anyone call directly anyway; revoking EXECUTE would quiet the advisor without changing anything, and is not worth touching every write path to do |
| **Turnstile** is wired up but `TURNSTILE_SITE_KEY` is empty in `config.example.js` | UNKNOWN — check production | If the deployed `config.js` also leaves it empty, signup and sign-in have no bot control beyond the rate limiter |

### Verdict

**GO**, with two caveats that are not code:

- Both HIGH findings (the payout race, the unbounded public bucket) are fixed
  and tested. The one HIGH-adjacent money bug (the dropped PayPal earning) is
  fixed.
- The two dashboard settings — leaked-password protection and email
  confirmation — are the only findings in this round that nobody can fix from
  the repository. Both are one toggle each.
- Nothing here is "100% secure". The CSP still carries `'unsafe-inline'`, and
  while that is true, an XSS anywhere in the page reaches the session token.
  That is the single highest-value thing left to do.

---

## Round 2 — 2026-08-21, after the phishing incident

An account named **DigiArtzSupport** posted phishing comments under two
artworks on 2026-08-20. The full write-up — what was posted, how it evaded the
filters, and the cleanup — is in
[`INCIDENT-2026-08-phishing.md`](INCIDENT-2026-08-phishing.md). The short
version: `item_comments` had no content check of any kind, and the check that
existed elsewhere read the text as typed, so `https:5347567%2eshop/…` walked
past it.

### Live on production now

| # | Fix | Where |
|---|-----|-------|
| 1 | The attacker's account, profile and all 4 comments deleted; footprint verified empty across every table and storage | production |
| 2 | `dz_deobfuscate()` — decodes percent-escapes, homoglyphs, fullwidth and invisible characters, `[dot]`/` dot `, `hxxp` before anything is matched | `20260901000000_baseline.sql` |
| 3 | `dz_has_link()` / `dz_phish_score()` — link and scam-prose detection, matched against the decoded form | same |
| 4 | Content guard on `item_comments` (insert **and** update), the community rooms, direct messages, and ten description/body columns — 23 triggers | same |
| 5 | `dz_abuse_events` — **phishing attempts** logged with actor, IP, rule and sample; `dz_abuse_recent()` for staff | same |
| 6 | `item_comments.body` capped at 1000 characters | same |
| 7 | Reserved names — nobody can register or rename to anything containing "digiartz", or to `support`/`admin`/`verify`/… as a whole name. Checked on the folded form, so `D1giArtz_Support` is refused too | `20260901000000_baseline.sql` |
| 8 | Anonymous writes are rate limited — `dz_write_rate` used to return early whenever `auth.uid()` was null, which is every anon caller, not just cron | `20260901000000_baseline.sql` |
| 9 | A global per-actor write ceiling above the per-table ones (240 / 5 min) | same |
| 10 | Limiters auto-attached to every member-writable table, found by asking `pg_policy` rather than by remembering — **27 previously unlimited write paths**, plus 23 delete paths | same |
| 11 | Signup limited to 6 accounts per hour per address | same |

### In this branch, live on deploy

| # | Fix | Where |
|---|-----|-------|
| 12 | Edge rate limit in front of **every** `/api/*` route, ahead of the router — ten of sixteen endpoints had none. Webhooks exempt (they verify signatures instead) | `functions/lib/ratelimit.js`, `functions/_middleware.js` |
| 13 | A real CSP: `script-src`, `connect-src`, `worker-src`, `frame-src`, `form-action` allowlists. This is the anti-crypto-miner control — a miner is a script from an unknown host plus a socket to a pool, and both halves are now refused | `_headers` |
| 14 | `Cross-Origin-Opener-Policy`, `X-Permitted-Cross-Domain-Policies`, tightened `Permissions-Policy` | `_headers` |
| 15 | Client filter catches the obfuscated link forms too, so a member sees their link starred rather than being refused by the server for something the page let them type | `js/badwords.js` (v2) |

### Two kinds of refusal, and why they differ

Postgres has no autonomous transactions, so a trigger that writes an audit row
and then raises an exception **rolls back its own audit row**. Rather than
install `dblink` and store a database password to work around that, the guard
picks the right refusal per rule:

- **Phishing** → the row is *dropped* (the trigger returns `NULL`), so the
  transaction commits and the evidence in `dz_abuse_events` survives. The
  sender sees their message simply not appear, and gets no error text to tune
  the next attempt against. This is the pattern `dz_chat_gate_comments`
  already used.
- **A plain link** → refused with a visible message, not logged. Whoever typed
  it is almost always a member linking their portfolio, and they need to know
  why it did not post.

So `dz_abuse_events` is a record of *attacks*, not of every refusal — which is
also what keeps it short enough to read.

### Secrets audit — clean

Checked, not assumed:

- **No secret value has ever been committed.** All 115 commits scanned for JWT
  shapes, `rzp_live_*`, `sk_live_*`, `AIzaSy*`, `sb_secret_*` and PEM private
  keys. Nothing.
- **`config.js` has never been tracked** — it is gitignored and generated at
  deploy time from Pages environment variables.
- **No client-served file references a secret's value.** The only occurrences
  of `SERVICE_ROLE`, `CLIENT_SECRET`, `WEBHOOK_SECRET` etc. anywhere in the
  tree are the *names*, in `config.example.js` documentation and in the Pages
  Functions that read them from `env` at runtime.
- **The config-status responses in `rzp.js` and `paypal.js` emit the missing
  variable's NAME only**, never its value.

Two things in client code are public **by design** and are not leaks, despite
looking like credentials:

- `SB_URL` (`https://tmqzqlrpjpydiftlrzmj.supabase.co`) — the browser has to
  know which server to talk to. It cannot be hidden from a client that must
  connect to it; every request reveals it.
- `SB_KEY` (`sb_publishable_…`) — the publishable key. It is designed to be
  public and carries no authority of its own: **Row-Level Security is what
  stands behind it**, which is exactly why the fixes above went into the
  database rather than into the page.

The keys that would matter if leaked — `SUPABASE_SERVICE_ROLE_KEY`,
`PAYPAL_CLIENT_SECRET`, `RAZORPAY_KEY_SECRET`, `MOD_SIGNING_SECRET`,
`GEMINI_API_KEY` — are read from `env` inside Pages Functions and never reach
the browser. That is already correct and was not changed.

### Still worth doing

1. **Leaked-password protection** — Supabase → Authentication → Passwords.
   Still not enabled; it was already item 2 in the list below.
2. **Require email confirmation before a first public write.** The attacker
   posted two minutes after signup from an unverified throwaway address.
3. **A report button on comments.** Items can be reported, individual comments
   cannot, so a reader who spots one of these has no way to tell you.
4. **Nonce-based CSP.** `'unsafe-inline'` is still in `script-src` because
   `index.html` has inline scripts and a static `_headers` file cannot mint a
   per-request nonce. `functions/_middleware.js` already rewrites the HTML and
   could inject one.

---

## Round 1 — the original review

## Verdict
No exposed secrets, no leaked Razorpay keys, payments are server-verified,
Row-Level Security is on for every table, and no user can promote themselves to
admin. The site was already **above average**. These changes close the
remaining gaps.

## Done (live / in this branch)

| # | Fix | Where | Status |
|---|-----|-------|--------|
| 1 | Security headers (clickjacking, HSTS, nosniff, referrer, base-uri, plugin block) — no CSP that would break AdSense/Razorpay | `_headers` | ✅ in branch, live on deploy |
| 2 | Pinned search_path on `community_channel_id` | Supabase | ✅ live now |
| 3 | Fail-open per-user upload rate limit (storage-bill abuse guard) | `smart-function` edge fn + `upload_events` table | ✅ live now |
| 4 | Moderation-gate plumbing: server-signed approval token issued + forwarded | `moderate-upload.js`, `upqueue.js`, `mod_token` columns | ✅ in branch (inert until activated) |
| 5 | Second checkout provider (PayPal) beside Razorpay, same server-verified ledger | `functions/api/paypal.js`, `payments.provider` | ✅ in branch |
| 6 | Everything about money moved behind a session check — module, provider names, plan prices, buy controls, endpoint paths | `functions/api/store.js` | ✅ in branch |
| 7 | `marketplace_items.price_cents` revoked from `anon` at the column level | Supabase | ✅ live now |
| 8 | `/api/*` never cached: explicit service-worker bypass + `no-store` in `_headers` | `sw.js`, `_headers` | ✅ in branch |
| 10 | `profiles.email` was world-readable — revoked (table grant dropped, columns re-granted by name) | Supabase | ✅ live now |
| 11 | Members could self-grant `subscription_tier`/`role` — UPDATE now column-scoped | Supabase | ✅ live now |
| 12 | Immutable hash-chained ledger + reconciliation gate before every withdrawal | `ledger_entries`, `dz_reconcile` | ✅ live now |
| 13 | `publish_due_scheduled_sections` and trigger functions no longer callable over REST | Supabase | ✅ live now |
| 9 | `security/` no longer served — the repo root is the deploy output, so every `.sql` here was downloadable | `functions/security/[[path]].js` | ✅ in branch |

## What YOU need to do

### 🔴 1. Storage spend alarm (do today — this is your bill protection)
Media now lives in Supabase Storage, so the bill to watch is Supabase's, not
AWS's. Supabase Dashboard → **Organization → Billing → Usage / spend cap** →
keep the spend cap on so a traffic spike cannot run past the Free tier's
included egress. Egress is the metered part: the service worker caches the two
sizes the grid and lightbox actually request, which is what keeps it small.

### 🟠 2. Turn on leaked-password protection (30 seconds)
Supabase Dashboard → **Authentication → Policies / Passwords** →
enable **"Prevent use of compromised passwords."**

### 🟠 3. Activate the moderation gate (when ready to test)
1. Deploy this branch to production.
2. Cloudflare Pages → **Settings → Environment variables → Production** →
   add `MOD_SIGNING_SECRET` = the secret Claude gave you in chat → redeploy.
3. Upload one artwork to confirm it still publishes normally.
4. Only then, in the Supabase SQL editor, with the SAME value:

   ```sql
   update private.mod_config
      set secret = '<the same secret as MOD_SIGNING_SECRET>'
    where id = true;
   ```

   Order matters. Setting the secret before the Worker can mint a ticket means
   every insert fails the check and every upload silently lands in `pending`.
5. Test again: a normal upload still publishes; a direct insert without a valid
   token now lands in `status='pending'` instead of going public.

If anything looks off, the gate **fails safe** (uploads go to review, never
error) and rolls back instantly:

```sql
-- make it inert again, dropping nothing
update private.mod_config set secret = '' where id = true;

-- or remove it entirely
drop trigger  if exists trg_artwork_mod_gate on public.artworks;
drop function if exists public.dz_artwork_mod_gate();
drop table    if exists private.used_mod_tokens;
drop table    if exists private.mod_config;
```

To check which state it is in:

```sql
select case when secret = '' then 'inert' else 'enforcing' end
  from private.mod_config where id = true;
```

The secret is a credential: it belongs in the Cloudflare dashboard and the
database, never in git.

## Payment exposure — what is and is not hidden

Everything up to the moment a signed-in buyer opens the checkout sheet is
gated. A signed-out visitor, a crawler or anyone reading page source gets no
provider name, no plan price, no buy control, no `/api` checkout path, and
cannot read a listing's price off the API either. `index.html`, `sw.js`,
`js/sections.js` and `aiAssistantData.js` were all scrubbed, changelog
included.

What cannot be hidden, and should not be mistaken for a gap: once the sheet is
open, the module is running in the buyer's own browser and the provider's
public identifier (`PAYPAL_CLIENT_ID` / `RAZORPAY_KEY_ID`) is in the script URL
it loads. Both are designed to be public and are useless without their
secrets. `PAYPAL_CLIENT_SECRET`, `RAZORPAY_KEY_SECRET` and `SB_SERVICE_KEY`
never leave the Worker.

One thing was left public on purpose:
- The **seller-side price field** in the marketplace composer, and the
  `.subCard` / `.subGrid` style rules. Neither carries an amount or a provider;
  removing them would break listing creation and leave the injected plan grid
  unstyled.

### PayPal environment variables (Cloudflare Pages → Settings → Environment variables)
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_ENV` (`sandbox` for
testing; anything else, or unset, means live). Never put these in `config.js` —
that file is served to every visitor. With only these bound and the Razorpay
pair absent, PayPal is the only provider offered and the buyer sees no chooser.

## Known residual (lower priority)
- The `scheduled_uploads` path carries the token but is not yet gated (its
  columns differ). Handle it as a follow-up if scheduled posting needs the
  same enforcement.
- Full image-content binding (stopping a "moderate image A, upload image B"
  swap) needs an upload-first redesign — a larger change for later.
