# Things only an operator can do

Some security items are outside what a database connection or a repository
checkout can reach. They are listed here because "we could not do it from the
audit environment" is a reason to write it down, not a reason to drop it.

Each one says what it is, why it cannot be automated from here, and exactly what
to click or run.

**Updated 2026-09-06.** The remediation pass closed eight findings in code and in
four applied migrations — the per-member limit on `/api/moderate-upload`,
`visibility` in the five SELECT policies, the `resources`/`artworks` column
grants, `rank_scores` revoked from `anon`, the notification-link guard at both
ends, and `get_artist_progress` honouring the privacy flags. What follows is what
is left, and it is all console work or work that needs live traffic.

Two corrections to this file, both of which would have cost someone an hour:
the repository is **private**, not public — item 1 below said otherwise — and
the CI job named `sql` no longer exists. Requiring it as a status check would
have left `main` permanently unmergeable, waiting for a job that never runs.

---

## 1. Branch protection on `main` — HIGH

`main` has none. No required review, no required status check, force-push not
blocked — and `main` is what Cloudflare Pages deploys. So the nine CI jobs
advise and gate nothing: a pull request with every check red can be merged, and
history on the branch that becomes production can be rewritten.

**Why not automated:** the GitHub MCP server exposes no branch-protection or
repository-settings endpoint. Every tool it offers was searched; there is no
route to repository settings from here.

**Do this:** Settings → Branches → Add branch ruleset, target `main`:

- Require a pull request before merging — **1 approval**, or 0 if you are
  routinely the only committer. Even at 0, the PR requirement is what makes the
  status checks below able to block.
- Require status checks to pass. There are **nine**, and GitHub lists them by
  their display name, not their job id:

  | job id | shows up in the ruleset as |
  |---|---|
  | `precache` | service worker precaches what index.html loads |
  | `cachebust` | a changed stylesheet or script carries a new ?v= |
  | `overlays` | every dialog renders over the page, not in it |
  | `sections` | one table of panels, one writer for the address bar |
  | `cache` | cache keeps one member's data out of another's session |
  | `security` | the security controls still refuse what they refused |
  | `deferredcss` | no first-screen stylesheet has been pushed off the critical path |
  | `csp` | the report-only policy still names every inline script |
  | `syntax` | changed javascript parses |

  There is no `sql` job — it was removed in `306de06` when the migrations left
  this repository. `deferredcss` was missing from the old list. The emitted-module
  check is a step inside `syntax` and is not separately selectable.
- Block force pushes.
- Do **not** tick "Allow specified actors to bypass" for yourself. A rule you
  can walk past is a rule that will be walked past on the day it matters.

With two collaborators this costs one extra click per change and buys the thing
CI was written for.

---

## 2. Supabase Auth settings — MEDIUM

Two toggles, both dashboard-only. The Management API surface available here does
not expose Auth configuration.

**Leaked password protection** is **off** — the `auth_leaked_password_protection`
advisor reports it on every run of this audit. Turning it on makes Supabase check
new passwords against HaveIBeenPwned. Authentication → Providers → Email →
enable "Prevent use of leaked passwords".

**Captcha enforcement is unverified.** `js/auth.js` obtains a Turnstile token and
passes it to Supabase as `captchaToken`, which is the right place to verify it —
but if the toggle is off, Supabase ignores the token and the widget is
decoration. Authentication → Settings → Bot and Abuse Protection → confirm
Turnstile is enabled and the secret key is set. Also confirm
`TURNSTILE_SITE_KEY` is non-empty in the deployed `config.js`; it is generated at
deploy from Pages environment variables and is gitignored, so it cannot be
checked from the repository.

---

## 3. Storage quota — MEDIUM

See `security/STORAGE-QUOTA.md`, which now carries the evidence: trigger,
policy, policy-alter and self-grant were each attempted against the live
project and each refused by the same ownership check, with the storage schema
re-read afterwards to confirm nothing was left behind. The quota function
itself is `public` schema and applies normally; only the two policy edits need
the Dashboard.

---

## 4. Live HTTP verification — UNKNOWN, not a finding

The audit environment's network policy denies egress to `digiartz.net` **and**
`tmqzqlrpjpydiftlrzmj.supabase.co`; only the Postgres connection is reachable.
So nothing in this audit tested live HTTP. `_headers` was read as a statement of
intent, not confirmed as behaviour.

**Do this** from any machine that can reach the site:

```sh
curl -sSI https://digiartz.net/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|x-frame'
curl -sSI https://digiartz.net/api/store            # expect 401, no-store, nosniff
curl -sSI https://digiartz.net/supabase/migrations/20260901000000_baseline.sql   # expect 404
curl -sSI https://digiartz.net/security/SECURITY.md                              # expect 404
curl -sSI https://digiartz.net/scripts/security-test.mjs                         # expect 404
curl -sS  -H 'Origin: https://evil.example' -I https://digiartz.net/api/download # expect no ACAO echo
```

Three `[[path]].js` catch-alls should make `/supabase/*`, `/security/*` and
`/scripts/*` return 404 rather than serving the schema, these notes and the
check scripts as files.

Once the site has taken real traffic for a few days, read the CSP reports —
Cloudflare Pages → Functions → Logs, filter `[csp]`. Each line names the
directive and what was blocked; `blocked=inline` means `'unsafe-inline'` is
still load-bearing, `blocked=eval` means `'unsafe-eval'` is. Whichever does
**not** appear can be deleted from the enforcing policy in `_headers`, and the
corresponding assertion in `scripts/check-csp-hashes.mjs` deleted with it. If
neither appears, both can go and the CSP becomes genuinely strict.

---

## 5. The other repository — UNKNOWN, and the highest-value thing on this list

Earlier revisions of `security/SECURITY.md` state: *"The repository is **public**,
with one write collaborator besides the owner and one fork."* That does not
describe this repository. `Koe458-ui/artz` was created 2026-09-05T18:09:06Z, is
private, has **zero** forks and exactly one collaborator — the owner. Confirmed
against the GitHub API, not inferred.

So the sentence was true of something. Either it described an earlier repository
that still exists, or it was carried over from a template and was never true. The
difference matters: if a public copy of this codebase exists, then the schema
baseline, every RLS policy, every guard, every rate limit and this entire audit
trail are public — and its fork is outside your control, because a fork survives
the deletion of its parent.

**Why not automated:** the fork, if it exists, is under an account this session
cannot see. Repository scope here is `Koe458-ui/artz` and nothing else.

**Do this:** search GitHub for `digiartz`, for `DigiArtz` and for distinctive
strings from the codebase — `dz_market_file_grant`, `koe-originals`,
`tmqzqlrpjpydiftlrzmj` are all specific enough to be conclusive. Check every
account you have ever pushed this code from. If a public copy exists: delete or
privatise it, then deal with the fork separately (GitHub does not remove forks
when the parent goes — one of them gets promoted to root). Then rotate nothing,
because no secret was ever committed to this history — 203 blobs were scanned
across every branch and every one of them was clean.

Nothing else on this list is worth doing before this one.

---

## Not doing, and why

**Removing `'unsafe-inline'` / `'unsafe-eval'` from the enforcing CSP — yet.**
Both are real weaknesses and neither can be removed on a guess: `'unsafe-eval'`
is most likely wanted by the Razorpay or PayPal SDK, and breaking checkout to
tidy a header is a poor trade. Rather than guess, the strict policy now ships
beside the enforcing one as `Content-Security-Policy-Report-Only`, which
enforces nothing and reports to `/api/csp-report`. Read the reports, then
remove whichever relaxation the data says is unused. That is the one step
still outstanding here, and it needs live traffic rather than a decision.

**Purging the deleted migrations from git history.** Commit `64139f7` removed ten
migration files, including the 5,769-line schema baseline. `git rm` is not
deletion: every blob is still reachable with a plain `git cat-file`, and the whole
schema — every policy, every SECURITY DEFINER body, every grant — comes back out
in one command.

Left alone deliberately. This repository is **private**, has no forks and one
collaborator, so those blobs are readable by exactly the people who can already
read the working tree. Rewriting history would force-push `main`, invalidate every
existing clone, and still not remove the objects from GitHub's side without
deleting and recreating the repository. The cost is real and the exposure is not.

That reasoning depends entirely on the repository staying private. If it is ever
made public, the history goes with it — purge first, and treat that as a
prerequisite rather than a follow-up.
