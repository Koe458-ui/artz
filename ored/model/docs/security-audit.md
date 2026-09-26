# Ored security audit

| | |
|---|---|
| Date | 2026-09-26 |
| Branch | `albaze777/supabase-training-pipeline-efqpgi` |
| Scope | the whole Ored system: browser → `ored.digiartz.net` → Cloudflare Worker → `/api/ored` → model server (`serve.py`) → Supabase (tables, RPCs, Storage) → training data → sessions → distributed workers → checkpoints → model versions → inference, and the DigiArtz → Ored sign-in hand-off |
| Method | defensive and non-destructive: code review, Git-history scan, catalog queries and role-switched probes on the live database inside transactions that were rolled back, a local harness running the real Worker code, a local model server, and local Postgres + PostgREST for the Python REST client |
| Not done | no secret was read, printed, rotated or changed; no production data, configuration or running training was touched; no load or brute-force test |

No secret value appears in this document.

## Summary

| Severity | Count | Fixed on this branch | Open |
|---|---|---|---|
| CRITICAL | 0 | – | – |
| HIGH | 2 | 0 fully, 2 partly | 2 (need an operator action or decision) |
| MEDIUM | 3 | 2 | 1 |
| LOW | 8 | 2 | 6 |
| INFO | 8 | – | – |

## Findings

### H1 — HIGH — The model-server API key was committed to the public repository

* **Where:** `wrangler.jsonc`, `vars.ORED_API_KEY`. Current tree until this branch; in Git history from commit `ce83bc49` (2026-09-22) onward. One value, 100+ characters.
* **Scenario:** anyone reading the public repository gets the bearer key that `serve.py` checks. Anyone who also finds the model server's address (`ORED_API_URL` is not in the repository) can call it directly. That bypasses the Worker's same-origin check and rate limits, and, with online learning on (H2), sends training input straight into the served model at any rate.
* **Evidence:** the secret scan of the tree and of all 155 commits (types and locations only, values masked). The README documents `ORED_API_KEY` as a secret.
* **Impact:** loss of the model server's only access control. It gives no access to Supabase data: the service key was never committed.
* **Fixed here:** the value is removed from `wrangler.jsonc`, and the README now says both secrets must be Worker secrets.
* **Still open (operator):** the old value stays in Git history forever, so it must be replaced:
  1. Generate a new key: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
  2. Deploy this branch. That drops the plaintext var; Cloudflare will not accept a secret while a var of the same name exists.
  3. Immediately run `npx wrangler secret put ORED_API_KEY` with the new key.
  4. Restart `serve.py` with `ORED_API_KEY=<new key>`.

  Until steps 3 and 4 are done, chat answers fail with "could not answer". Nothing leaks during that window.

### H2 — HIGH — Online learning trains the served model on raw public chat input

* **Where:** `src/ored/serving/server.py` (`OredHandler.do_POST`) → `src/ored/learning/online.py` (`OnlineLearner.respond` → `learn` → `_step`). With `--remote-checkpoints`, the result is pushed to Supabase as run `live`. `checkpoints.py merge-live` can then promote it to best.
* **Scenario:** every message from any visitor, signed in or not, takes a gradient step on the live model. The only limits are 8 messages a minute per IP for guests and 20 per account, and IP limits are easy to rotate around. An attacker can repeat a crafted text to steer what Ored says to everyone. A visitor who pastes a password, token or e-mail address has it trained into weights that other people then sample from. None of this passes the review step that the candidate pipeline (`ored_learning_candidates` → approval → `ored_training_examples`) and the new `ored_training_data` (`verified = true`) both require.
* **Evidence:** code path above; `tests/test_online.py` shows one message moves the weights.
* **Fixed here, in part:**
  * Messages are passed through the same `redact()` the candidate pipeline uses (tokens, keys, e-mails, card and phone numbers, URL credentials) before any gradient step (`OnlinePolicy.redact`). Tested in `test_online_learning_never_sees_credentials`.
  * `--no-learning` now really turns learning off (see M1).
* **Still open (decision):** redaction does not stop deliberate poisoning. Recommended: run the public server with `--no-learning`, and let the model change only through reviewed data (`ored_training_data` with `verified = true`, or approved candidates) trained by an operator. If online learning stays on, do not promote `live` to `best` without evaluating it, and treat the `live` run as untrusted.

### M1 — MEDIUM — `serve.py --no-learning` still trained on every message (fixed)

* **Where:** `src/ored/serving/server.py` `main()`. The flag set `steps_per_message = 1` and `save_every = 0`, so the model kept learning in memory and only stopped saving.
* **Impact:** an operator who believed learning was off still had the model changing with every public message (see H2).
* **Fix:** `OnlinePolicy.enabled`; `--no-learning` sets it to false, and `learn()` refuses with "learning is off". Tests: `test_no_learning_really_means_no_learning` and `test_serve_no_learning_flag_turns_learning_off`.

### M2 — MEDIUM — The model server was open when no key was set (fixed)

* **Where:** `OredHandler._authorised` and `main()` in `src/ored/serving/server.py`. With `ORED_API_KEY` unset, every request was authorised; the default host is `0.0.0.0`; the key was compared with `==`.
* **Fix:** `serve.py` now refuses to start on a non-loopback address without a key (use `--insecure-no-key` to override deliberately), and the key is compared with `hmac.compare_digest`. Tests: `test_model_server_refuses_to_run_open_to_the_network` and `test_model_server_requires_the_key` (no key, wrong key, one character short or long: 401; right key: 200).

### M3 — MEDIUM — Dependency ranges allow `torch` versions whose `weights_only=True` loader can be bypassed (open, proposed)

* **Where:** `ored/model/requirements.txt` and `pyproject.toml` allow `torch>=2.2,<3.0`.
* **Why it matters here:** every checkpoint load uses `torch.load(..., weights_only=True)` as its protection against a malicious file. `pip-audit` reports RCE bypasses of that loader in versions before 2.6.0 (PYSEC-2025-41, CVE-2025-32434) and before 2.10.0 (PYSEC-2026-2286), plus other `torch` advisories below 2.13. The installed 2.14.0 is not affected, and `pip-audit` of the requirements as they resolve today reports nothing. A training PC or server still on an old `torch` is exposed to any checkpoint file from an untrusted source.
* **Proposed (not applied, per the no-automatic-upgrades rule):** raise the bound to `torch>=2.10` (ideally `>=2.13`) after confirming every training PC's CUDA build supports it.

### L1 — LOW — A guest can add messages to another guest's stored conversation

* **Where:** `functions/api/ored.js` `owns()` / `remember()`. An anonymous conversation is "owned" by `user_id IS NULL`, so any guest who sends the same `conversation_id` passes the check.
* **Limits:** write-only (there is no read endpoint); the id is a browser-generated UUIDv4, which cannot be guessed. Signed-in conversations are safe: user B and guests cannot write into user A's conversation (tested).
* **Recommendation:** bind a guest conversation to a server-issued secret (for example an HMAC of the id returned on first write), or do not persist guest conversations.

### L2 — LOW — The rate limiter fails open

* **Where:** `functions/lib/ored-sb.js` `oredUnderLimit()` returns "allowed" when the `ored_rate_take` RPC errors or cannot be reached (the missing-key branch is unreachable: `/api/ored` already answers 503 without the key).
* **Recommendation:** fail closed for guests (return 503) and keep failing open only for signed-in users, if availability matters more there.

### L3 — LOW — Guest limits are per IP only

* **Where:** `functions/api/ored.js` (`ored:send:guest:<IP>`). Behind Cloudflare, `CF-Connecting-IP` cannot be spoofed; a forged `X-Forwarded-For` is ignored when it is present (tested). But IPv6 prefixes and proxies make per-IP limits easy to multiply.
* **Recommendation:** add a global guest budget per minute, or a Turnstile challenge for guests. It matters most while H2 is open.

### L4 — LOW — No request size cap at the Worker; long chats exceed the model server's limit

* **Where:** `functions/api/ored.js` `onRequestPost` parses any JSON body (a 2 MB body was accepted in the harness). It forwards up to 20 × 4,000-character turns plus the message, about 85 KB, which is more than `serve.py`'s `MAX_BODY_BYTES` of 64 KiB. Long conversations then fail with "could not answer".
* **Recommendation:** reject bodies above a small limit before parsing (check `content-length`), and stop sending `history`, which `serve.py` does not read.

### L5 — LOW — Sign-in tokens were accepted from the query string (fixed)

* **Where:** `public/app.js` `landing()` read `access_token` / `refresh_token` from the fragment **or** the query. A token in a query ends up in server and proxy logs and in `Referer`.
* **Fix:** tokens are taken from the fragment only. A token found in the query is stripped from the address bar and refused. `state` handling is unchanged. The real `landing()` source was exercised in 10 cases (see Tests).

### L6 — LOW — File names from downloaded manifests were joined to local paths unchecked (fixed)

* **Where:** `src/ored/data/snapshot.py` `download_snapshot`, `Snapshot.verify`; `src/ored/distributed/checkpoint.py` `_ensure_local`.
* **Scenario:** needs write access to Storage (the service key). A tampered manifest could name `../../x` and write outside the snapshot or checkpoint folder.
* **Fix:** a snapshot manifest must list exactly `train.txt`, `val.txt`, `test.txt`, `records.jsonl`. Shard names must be plain file names (no separators, `..`, drive letters or NUL). Tests: `test_downloaded_snapshot_cannot_name_files_outside_its_folder`, `test_shard_names_must_be_plain`.

### L7 — LOW — "Is the new best better?" is decided by the client, not the database

* **Where:** `public.ored_checkpoint_register` / `ored_checkpoint_make_current`. The database enforces one current row per run and role, stale-write protection (`p_replaces`), immutability, history never current, and the manifest-only-via-finalize rule. It does not compare metrics, so a caller with the service key that passes the correct current id can install a worse best.
* **Evidence:** live, rolled-back simulation. 10 of 11 abuse attempts were refused (see Tests); the 11th, a worse best with the correct current id, was accepted. There was never more than one current row.
* **Why not changed:** `promote-best --force` (rollback) depends on it, and only `service_role` can call the RPC at all. Recommendation: add an explicit `p_force` argument and compare `promotion_metric` / `promotion_mode` inside the function otherwise.

### L8 — LOW — Distributed training traffic is unauthenticated

* **Where:** `torchrun` c10d rendezvous, gloo/NCCL collectives, and `all_gather_object` / `broadcast_object` (pickle) in `src/ored/distributed/`.
* **Scenario:** a machine that can reach the master port can join or disrupt a run, and object collectives deserialize pickles from peers. The session key (`--rdzv-id`) is a label, not a credential. Supabase-side session and worker rows are service-role only, so an internet client cannot touch those (tested).
* **Mitigation in place:** `docs/distributed-training.md` requires a private network or VPN (Tailscale, ZeroTier) and says never to open these ports. Treat every training PC as fully trusted.

### INFO

| # | Item | Where |
|---|---|---|
| I1 | Publishable keys and project URLs are committed on purpose; they are public by design | `wrangler.jsonc`, `public/_headers`, `/config.js` |
| I2 | `GET /health` needs no key and reveals the online-learning counters (seen / learned / steps / loss) | `serve.py` `do_GET` |
| I3 | The DigiArtz `/authorize` endpoint (redirect allow-list, which session's tokens it hands over) lives in another project and could not be checked from this repository. Ored itself always sends its own origin as `redirect_uri` | `public/app.js` `handoff()` |
| I4 | Sign-out calls `supabase.auth.signOut()` with the library's default global scope, which also revokes the member's other sessions, including DigiArtz. That is safe, but contradicts "You are still signed in on DigiArtz". Use `{ scope: 'local' }` if the message is the intent | `public/app.js` sign-out handler |
| I5 | `oredIsStaff()` is unused and would put an unvalidated id into a filter if it were ever used | `functions/lib/ored-sb.js` |
| I6 | `ored_messages` keeps raw chat text and `ored_rate_hits` keeps client IPs; service-role only. Consider a retention period | Supabase |
| I7 | Advisors: security — only "RLS enabled, no policy" (INFO) on all 12 tables, which is the intended design; performance — unused indexes only | Supabase |
| I8 | The PyTorch distributed checkpoint's `.metadata` file is a pickle. It is loaded only after its sha256 matches the manifest, whose sha256 matches the row in `ored_checkpoints` | `distributed/checkpoint.py` |

## What was checked and held

* **Secrets:** no service-role key, JWT secret, database password, private key, Cloudflare credential or `.env`/`.dev.vars`/`config.js` file is in the tree or anywhere in history. The historical "password" hit was a login-form field; README hits are placeholders. The only secret found is H1.
* **Database (live):** RLS is enabled and forced on all 12 `ored_*` tables, with no policies and no `anon` or `authenticated` grant on any table, view or function. The three `SECURITY DEFINER` functions (`ored_rate_take`, `ored_touch_conversation`, `rls_auto_enable`) have fixed `search_path` and are not executable by the browser roles. Every other function uses `search_path = ''`; the only dynamic SQL is in the DDL event trigger. Storage buckets are private with no policies: `anon` sees 0 of the 12 stored objects and cannot insert. 23 role-switched probes (read, write, `verified = true`, promotion, finalize, delete, register, claim, rate RPC, lineage, staff) were all refused.
* **Authentication:** the Worker validates every bearer token by calling `/auth/v1/user` on the DigiArtz project. A token from any other project, or an invalid or expired one, is treated as anonymous and never trusted. `user_id` and `visitor` come only from the verified token; client-supplied values are ignored (tested). `state` is a random UUID kept in `sessionStorage`, required, compared and consumed once. `redirect_uri` is always this origin. Tokens are stripped from the URL at once and never logged. `supabase-js` stores the session in `localStorage`; the CSP (`script-src 'self'`, no inline script) and `textContent`-only rendering are what protect it.
* **Authorization / IDOR:** there is no read endpoint for conversations or messages (history lives in the browser). Writes check ownership: user B or a guest cannot write into user A's conversation (tested); see L1 for guest-to-guest. No endpoint exposes training data, sessions, workers, checkpoints, versions, configuration or staff functions; only `state` and `send` exist, and unknown actions (including `__proto__` and `constructor`) return 404.
* **Injection:** ids that reach PostgREST from the web are checked against a UUID pattern. Python filters use `urllib.parse.quote`. Training-data filters are validated slugs and tags before any query (hostile tags and filters tested). SQL uses parameters or `format(%L/%I)`. `subprocess` is used only with argument lists and no shell (hostile `torchrun` values stay single arguments, tested).
* **File system:** snapshot folders are `safe_tag(tag)/<hex>` under `snapshot_dir`; Storage paths use `safe_name(run_name)`. The `--run-name` and config paths an operator types are trusted input. Traversal-shaped tags, run names, snapshot references and shard names were tested.
* **Checkpoints:** see L7 for the one gap. `torch.load` always uses `weights_only=True` (see M3), and every download is sha256-checked against the database row.
* **Training-data poisoning:** only `service_role` can insert, edit, enable or verify rows, or change dataset rows (which are immutable once written as snapshots). The snapshot code applies `enabled AND verified` itself. Unverified, disabled, oversized, control-character and forged-fingerprint rows never reach a corpus (tested).
* **Resource abuse:** a chat user cannot set epochs, batch size, block size, dataset size, workers, checkpoint frequency or uploads; no endpoint starts training. Generation is bounded (160 new tokens) and so is learning (fixed learning rate, one step, 2,000 characters). The remaining public influence is H2 and L2–L4.
* **Browser and headers:** no CORS headers anywhere (a cross-origin read is impossible); `OPTIONS` returns 405. The Worker sets nosniff, `DENY` framing, HSTS, `no-store` and the permissions policy on API replies. The page has a strict CSP. No cookies are set.
* **Errors and logs:** clients get fixed messages ("Something went wrong"); internal addresses and paths from upstream errors do not reach them (tested). No log line contains a key, token or authorization header (code search). `serve.py` logs the request line and client address only.
* **Public repository:** no internal hostnames or live infrastructure; the `100.64.0.1` addresses in the docs are examples.

## Tests performed

| Test | Where | Result |
|---|---|---|
| Secret scan, current tree | `git ls-files`, 14 patterns | 1 secret (H1), 1 publishable key (I1) |
| Secret scan, full history (155 commits, 3 branches) | `git log -p --all` | the same, plus false positives |
| Role-switched privilege probes on the live DB | 23 statements as `anon` / `authenticated`, rolled back | 23 refused |
| Storage visibility on the live DB | owner 12 objects, `anon` 0 | as intended |
| Checkpoint abuse simulation on the live DB | 11 cases, rolled back | 10 refused, 1 accepted (L7) |
| Training-data invariants on the live DB | `ored/supabase/tests/training_data_invariants.sql`, rolled back | all passed |
| Checkpoint invariants | `ored/supabase/tests/checkpoint_invariants.sql` on local Postgres | all passed |
| Worker / `/api/ored` harness | real `worker.js` in Node 22, stubbed DigiArtz auth, PostgREST and model server | 34 / 34 as expected |
| Sign-in hand-off | real `landing()` from `public/app.js`, 10 cases | 10 / 10 |
| Model server, training data, traversal, injection, redaction | `tests/test_security.py` | all passed |
| Whole Python suite after the fixes | `pytest` (390 tests) | 388 passed, 2 skipped (need Postgres binaries as a non-root user; skipped before this audit too) |
| Dependencies | `pip-audit` of `requirements.txt` (clean) and of the lowest allowed versions | M3 |
| Supabase advisors | security and performance | I7 |

Harness cases: methods (GET 404, PUT/OPTIONS 405, no CORS headers); origin (none, cross-site, look-alike host, `Sec-Fetch-Site: none` → 403); malformed JSON; prototype-named actions; invalid token and wrong-project token; spoofed `user_id`; cross-user and guest writes; filter injection in `conversation_id`; rate limit with a spoofed `X-Forwarded-For`; rate-limit failure; oversized message and history; role coercion; upstream failure leakage; log contents; 2 MB body; `/config.js` contents; `/ored/model/*` and `/api/*` 404; response headers; cookies.

## Limits of this audit

* The container's network policy blocks `*.supabase.co` and `ored.digiartz.net`, so no HTTP request reached the live Worker, PostgREST, GraphQL or Storage APIs. The live checks ran inside Postgres as the same roles those APIs use; the HTTP layers were exercised locally with the real code.
* The model server that `ORED_API_URL` points to, the Cloudflare account settings, and the DigiArtz project (including `/authorize`) were not reachable and were not inspected.
* No load, fuzzing or timing test was run, by design.

## Remaining recommendations, in order

1. Replace the leaked `ORED_API_KEY` (H1, steps above).
2. Decide on online learning; recommended: `serve.py --no-learning` in production (H2).
3. Raise the `torch` lower bound (M3).
4. Fail closed and add a global guest budget in the Worker (L2, L3), and cap request size (L4).
5. Bind guest conversations to a server-issued secret (L1).
6. Compare metrics inside `ored_checkpoint_register` unless forced (L7).
