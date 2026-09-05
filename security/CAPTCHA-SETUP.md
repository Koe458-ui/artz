# The three dashboard switches

Everything in this document has to be done by a human in a browser. There is no
API token for the Supabase Management API in the deploy environment and the
Supabase MCP server exposes no auth-config tool, so these three cannot be
scripted from here — the code that depends on them is already shipped and
waiting.

Nothing below breaks the site if you do it in the wrong order, with one
exception that is called out loudly under **Email confirmation**.

---

## 1. Leaked-password protection — 30 seconds, do this first

**Supabase Dashboard → Authentication → Sign In / Providers → Password →
"Prevent use of compromised passwords" → on.**

Checks new passwords against Have I Been Pwned's k-anonymity API — only a
five-character hash prefix leaves Supabase, never the password. Existing
members are unaffected until they next change their password.

There is no downside and nothing in the code depends on it. It has been on the
recommended list since the first security review and is still off.

---

## 2. Email confirmation — read the warning first

**Supabase Dashboard → Authentication → Sign In / Providers → Email →
"Confirm email" → on.**

The attacker signed up at 21:58 and posted at 22:00 from an address nobody had
verified. With this on, the account exists but has no session until the link in
the email is clicked, so a throwaway inbox stops being free.

`js/auth.js` already handles both outcomes — it checks whether `signUp`
returned a session and shows *"Check your email to confirm your account."*
when it did not. No code change is needed.

### ⚠️ The one thing that can break signups

**Supabase's built-in email service is rate limited to a handful of messages
per hour and is explicitly for testing only.** Turn on email confirmation while
still using it and new members will simply never receive the link — signup will
look broken, with nothing in any log that obviously says why.

So check this first:

**Dashboard → Project Settings → Authentication → SMTP Settings.**

- **Custom SMTP configured** (Resend, SendGrid, Postmark, Amazon SES, Brevo…)
  → safe, turn confirmation on.
- **Still on the built-in service** → set up SMTP *before* turning confirmation
  on. Resend's free tier is 3,000 emails a month and takes about ten minutes to
  wire up, including the DNS records.

While you are there, raise **Authentication → Rate Limits → "Emails per hour"**
to something that matches your signup volume.

### Checking it worked

Register a throwaway address, confirm the email arrives within a minute or two,
and confirm the account cannot comment until the link is clicked. If no email
arrives, turn confirmation back off until SMTP is sorted — do not leave signups
broken while you debug.

---

## 3. Turnstile — the CAPTCHA on repeated logins

This is the one you asked for: a challenge when the same address keeps signing
in and out of different accounts. Two halves, and **the code is already
deployed and inert** until both are done.

### ⚠️ DO THE STEPS IN ORDER. Step 3 before step 2 breaks sign-in for everyone.

This happened on 2026-08-21 and is worth spelling out, because the symptom does
not name its cause.

CAPTCHA protection in Supabase is enforced by **GoTrue**, not by this site. Turn
it on and GoTrue refuses every sign-in and sign-up that arrives without a valid
token — including from your own pages. `js/captcha.js` can only produce a token
once `TURNSTILE_SITE_KEY` is actually in `config.js`; with no key it stays inert
and sends nothing. So:

| State | Result |
|---|---|
| Step 2 done, step 3 not | Fine. Widget shows, token sent, nobody checks it yet. |
| **Step 3 done, step 2 not** | **Sign-in and sign-up fail for every member**, with `captcha protection: no captcha token found in request`. |
| Both done | Working as intended. |

**If you are seeing that error now:** turn CAPTCHA protection **off** in
Supabase → Authentication → Attack Protection. Sign-in recovers immediately.
Then finish step 2, confirm `config.js` on the live site contains a non-empty
`TURNSTILE_SITE_KEY`, and only then turn step 3 back on.

To confirm step 2 actually landed before you re-enable step 3, open
`https://digiartz.net/config.js` in a browser. You should see
`TURNSTILE_SITE_KEY: '0x4AAA...'` with a real value. If it is `''` or the field
is absent, the Pages build command is not emitting it and step 3 will break
sign-in again.

### What decides when to show it

`dz_captcha_required()` (in `20260901000000_baseline.sql`, live now)
returns true when, from one IP within the last hour, any of:

| Signal | Threshold |
|---|---|
| Different accounts attempting to sign in | **3 or more** |
| Failed passwords | **5 or more** |
| Signups | **2 or more** |

Attempts are recorded by `dz_note_auth()`, which `js/captcha.js` calls on every
login, signup and logout. No email address is stored — only a keyed HMAC of it,
so the log can count *how many* accounts without recording *which*.

### Step 1 — get the keys

1. **Cloudflare dashboard → Turnstile → Add widget.**
2. Domain `digiartz.net`, widget mode **Managed**.
3. You get a **site key** (public) and a **secret key** (private).

### Step 2 — the site key, into the page

**Cloudflare Pages → digiartz → Settings → Environment variables → Production**
→ add `TURNSTILE_SITE_KEY` = the site key.

Then make the build command emit it. The current one-liner is in
`config.example.js`; the only change is the extra field at the end:

```
[ "$T600_READY" = "true" ] && T6=true || T6=false; FN="${S3_FN_URL:-$SB_URL/functions/v1/smart-function}"; echo "window.KOE_CONFIG = { SB_URL: '$SB_URL', SB_KEY: '$SB_KEY', S3_FN_URL: '$FN', T600_READY: $T6, TURNSTILE_SITE_KEY: '$TURNSTILE_SITE_KEY' };" > config.js
```

Paste it as **one line** — the build field is single-line and a wrapped command
fails the deploy. `config.example.js` explains that trap in detail.

Redeploy.

### Step 3 — the secret key, into Supabase

**This is the step that makes it a real control — and the step that breaks
sign-in if step 2 is not finished first.** Confirm `TURNSTILE_SITE_KEY` is live
in `config.js` before you touch this.

**Supabase Dashboard → Authentication → Attack Protection → CAPTCHA protection**
→ on → provider **Cloudflare Turnstile** → paste the **secret key** → save.

The secret key does **not** go into Cloudflare Pages and never into
`config.js`.

### Why step 3 matters more than the rest

The sign-in call goes from the browser straight to GoTrue. `js/captcha.js`
cannot stand in front of that, so on its own it stops abuse *through the site*
and not abuse aimed at the auth API directly — someone who reads the page
source can call GoTrue themselves. With step 3 done, GoTrue refuses any signup
or sign-in whose captcha token is missing or invalid, and there is no path
around it.

Steps 1–2 without step 3 are still worth having (they stop scripted abuse
through the UI, and the DB-level signup limit of 6/hour/IP is unaffected either
way), but do not mistake it for the full control.

### What members will actually see

With **Managed** mode, Turnstile is invisible for traffic it is happy with —
most people will never see anything. Two things change that:

- Turnstile's own judgement (a datacentre IP, a headless browser).
- Our detector. When `dz_captcha_required()` returns true, `js/captcha.js`
  switches the widget to `appearance: 'always'`, so the challenge is shown
  whether Turnstile would have bothered or not.

### Checking it worked

1. Fail a login five times from the same connection.
2. Reload the sign-in page. The challenge should now be visible.
3. In the SQL editor, as a staff account:

```sql
select * from public.dz_auth_churn(24);
```

One row per address that has touched more than one account, worst first. The
email keys are hashes, so it answers "how many accounts" and never "whose".

---

## 4. Repeat-spam auto-ban — already on, nothing to configure

Listed here only so it is not a surprise. Post the **same message five times**
and the account is banned for **24 hours** — from writing anything, anywhere,
because `dz_ban_gate()` is already attached to 55 triggers and reads
`user_bans`. The ban lifts itself when `expires_at` passes.

The attacker posted the same message four times, which is what prompted it.

**Messages under 30 characters are deliberately exempt.** On an art site the
same member posts "nice!", "gorgeous" and "🔥" on ten artworks in a row, and
banning for that would be far worse than the spam. Matching is on the
deobfuscated, punctuation-stripped text, so changing a full stop to an
exclamation mark does not mint a fresh message.

To see automatic bans:

```sql
select user_id, reason, note, banned_at, expires_at
  from public.user_bans
 where banned_by is null            -- null means the system, not a moderator
 order by banned_at desc;
```

To lift one early:

```sql
update public.user_bans set lifted_at = now()
 where user_id = '…' and lifted_at is null;
```

To change the threshold from five, edit the trigger argument on
`dz_repeat_guard` in `20260901000000_baseline.sql` and re-run that statement.
