# Things only an operator can do

Four security items are outside what a database connection or a repository
checkout can reach. They are listed here because "we could not do it from the
audit environment" is a reason to write it down, not a reason to drop it.

Each one says what it is, why it cannot be automated from here, and exactly what
to click or run.

---

## 1. Branch protection on `main` — HIGH

`main` has none. No required review, no required status check, force-push not
blocked — and `main` is what Cloudflare Pages deploys. So the ten CI jobs
advise and gate nothing: a pull request with every check red can be merged, and
history on the branch that becomes production can be rewritten.

**Why not automated:** the GitHub MCP server exposes no branch-protection or
repository-settings endpoint. Every tool it offers was searched; there is no
route to repository settings from here.

**Do this:** Settings → Branches → Add branch ruleset, target `main`:

- Require a pull request before merging — **1 approval**, or 0 if you are
  routinely the only committer. Even at 0, the PR requirement is what makes the
  status checks below able to block.
- Require status checks to pass. Add all ten: `precache`, `cachebust`,
  `overlays`, `sections`, `cache`, `security`, `csp`, `sql`, `syntax`, and the
  emitted-module step inside `syntax`.
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

## Not doing, and why

**Removing `'unsafe-inline'` / `'unsafe-eval'` from the enforcing CSP — yet.**
Both are real weaknesses and neither can be removed on a guess: `'unsafe-eval'`
is most likely wanted by the Razorpay or PayPal SDK, and breaking checkout to
tidy a header is a poor trade. Rather than guess, the strict policy now ships
beside the enforcing one as `Content-Security-Policy-Report-Only`, which
enforces nothing and reports to `/api/csp-report`. Read the reports, then
remove whichever relaxation the data says is unused. That is the one step
still outstanding here, and it needs live traffic rather than a decision.

**Making the repository private.** It is public, and that is a choice rather
than a defect: no secret has ever been committed, and the security of this
system does not rest on anyone not reading it. Worth knowing that it means
attackers read every policy, every guard and every rate limit — which is the
correct assumption to design under anyway.
