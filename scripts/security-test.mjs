import { readFileSync } from 'node:fs';
import { limitFor, actorKey, SHARED } from '../functions/lib/ratelimit.js';
import { sameOrigin, allowedHost, storedFileName, storedFileNameAscii } from '../functions/lib/http.js';
import { toMinor, toValue, ppFee } from '../functions/lib/money.js';

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.error(`FAIL  ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${name}`);
}
function truthy(name, got) { check(name, !!got, true); }
function falsy(name, got)  { check(name, !!got, false); }

const routes = [
  '/api/store', '/api/ops', '/api/collab', '/api/collab/promo-code',
  '/api/rzp', '/api/paypal', '/api/payouts', '/api/download',
  '/api/market-download', '/api/resource-download', '/api/moderate-upload',
  '/api/moderation/ban-user', '/api/admin/collab/add-partner',
  '/api/subscription/claim-max', '/api/something-added-tomorrow',
];
for (const r of routes) truthy(`rate limit covers ${r}`, limitFor(r));
check('webhook rzp exempt',    limitFor('/api/rzp-webhook'), null);
check('webhook paypal exempt', limitFor('/api/paypal-webhook'), null);
check('most specific prefix wins', limitFor('/api/download').bucket, '/api/download');

{
  const from = (headers) => ({ headers: new Headers(headers) });
  const ip = { 'CF-Connecting-IP': '203.0.113.9' };

  check('the bucket is the connecting address', actorKey(from(ip)), 'ip:203.0.113.9');
  check('a rotating bearer cannot mint a fresh bucket',
        actorKey(from({ ...ip, Authorization: 'Bearer ' + 'a'.repeat(40) })),
        actorKey(from({ ...ip, Authorization: 'Bearer ' + 'b'.repeat(40) })));
  check('a bearer cannot escape the address bucket',
        actorKey(from({ ...ip, Authorization: 'Bearer ' + 'a'.repeat(40) })), 'ip:203.0.113.9');
  check('X-Forwarded-For is read when Cloudflare has not spoken',
        actorKey(from({ 'X-Forwarded-For': '198.51.100.4, 203.0.113.1' })), 'ip:198.51.100.4');
  check('no address at all still shares one bucket', actorKey(from({})), 'anon');
  falsy('no address does not mean no limit', actorKey(from({})) === '');

  truthy('the shared-address allowance is finite', SHARED >= 1 && SHARED <= 10);
}

const req = (headers) => ({ url: 'https://digiartz.net/api/download', headers: new Headers(headers) });

falsy('no origin, no referer, no fetch metadata', sameOrigin(req({}), {}));
falsy('Sec-Fetch-Site: none (address bar)',       sameOrigin(req({ 'Sec-Fetch-Site': 'none' }), {}));
falsy('cross-site Origin',       sameOrigin(req({ Origin: 'https://evil.example' }), {}));
falsy('cross-site Referer',      sameOrigin(req({ Referer: 'https://evil.example/x' }), {}));
falsy('lookalike host',          sameOrigin(req({ Origin: 'https://digiartz.net.evil.example' }), {}));
truthy('same Origin',            sameOrigin(req({ Origin: 'https://digiartz.net' }), {}));
truthy('Sec-Fetch-Site: same-origin', sameOrigin(req({ 'Sec-Fetch-Site': 'same-origin' }), {}));
truthy('ALLOWED_ORIGINS entry',  sameOrigin(req({ Origin: 'https://staging.digiartz.net' }),
                                            { ALLOWED_ORIGINS: 'https://staging.digiartz.net' }));
falsy('ALLOWED_ORIGINS does not open the door to others',
      sameOrigin(req({ Origin: 'https://evil.example' }),
                 { ALLOWED_ORIGINS: 'https://staging.digiartz.net' }));

const SB = 'https://tmqzqlrpjpydiftlrzmj.supabase.co';
truthy('project host allowed',      allowedHost(SB + '/storage/v1/object/x', SB));
// Anyone can create a project on supabase.co, so "ends with .supabase.co" is
// not a statement about us. A legacy file_url pointing at someone else's
// project was fetched by the edge and streamed to the member as ours; only this
// project's own hostname is the origin we mean.
falsy('sibling supabase host refused', allowedHost('https://other.supabase.co/x', SB));
falsy('plain http refused',         allowedHost('http://tmqzqlrpjpydiftlrzmj.supabase.co/x', SB));
falsy('attacker host refused',      allowedHost('https://evil.example/x', SB));
falsy('suffix-glued host refused',  allowedHost('https://evil-supabase.co/x', SB));
falsy('userinfo trick refused',     allowedHost('https://tmqzqlrpjpydiftlrzmj.supabase.co@evil.example/x', SB));
falsy('file: refused',              allowedHost('file:///etc/passwd', SB));
falsy('garbage refused',            allowedHost('not a url', SB));

{
  check('a decimal currency comes back in cents', toMinor('12.34', 'USD'), 1234);
  check('a whole amount still comes back in cents', toMinor('12', 'EUR'), 1200);
  check('a zero-decimal currency has no cents', toMinor('1000', 'JPY'), 1000);
  check('and is not multiplied by a hundred', toMinor('1000', 'TWD'), 1000);
  check('nor is the Hungarian forint', toMinor('4500', 'HUF'), 4500);
  check('nonsense is zero, not NaN', toMinor('not a number', 'USD'), 0);
  check('missing is zero', toMinor(undefined, 'USD'), 0);

  for (const cur of ['USD', 'INR', 'JPY', 'HUF', 'TWD', 'GBP']) {
    check(`${cur} survives the round trip`, toMinor(toValue(2500, cur), cur), 2500);
  }

  const fee = (v, code, cur) =>
    ppFee({ seller_receivable_breakdown: { paypal_fee: { value: v, currency_code: code } } }, cur);
  check('the PayPal fee follows the same scale', fee('0.59', 'USD', 'USD'), 59);
  check('and the yen fee is not inflated either', fee('45', 'JPY', 'JPY'), 45);
  check('a fee in another currency is not counted', fee('0.59', 'EUR', 'USD'), 0);
}

check('path separators stripped', storedFileName('../../etc/passwd'), '....etcpasswd');
check('quote stripped from the ascii form', storedFileNameAscii('a"; x="y'), 'a; x=y');
check('non-ascii folded in the ascii form', storedFileNameAscii('naïve.png'), 'na_ve.png');
check('empty name has a fallback', storedFileName(''), 'file');

{
  const collab = readFileSync('functions/api/collab.js', 'utf8');
  truthy('collab dispatch checks hasOwnProperty', /hasOwnProperty\.call\(\s*obj\s*,\s*key\s*\)/.test(collab));
  truthy('collab dispatch guards ACTIONS', /has\(ACTIONS,\s*name\)/.test(collab));
  truthy('collab dispatch guards LIMITS',  /has\(LIMITS,\s*name\)/.test(collab));
  truthy('collab dispatch requires a function', /typeof fn !== 'function'/.test(collab));
}

for (const f of ['download', 'market-download', 'resource-download', 'moderate-upload',
                 'rzp', 'paypal', 'payouts', 'collab', 'ops', 'store']) {
  const src = readFileSync(`functions/api/${f}.js`, 'utf8');
  falsy(`${f}.js does not return String(err) to the caller`, /detail:\s*String\(err\)/.test(src));
}

// A thrown error came from Razorpay, PayPal, PostgREST or the runtime. None of
// them write for our members, and their text describes our integration.
for (const f of ['functions/api/rzp.js', 'functions/api/paypal.js', 'functions/api/payouts.js',
                 'functions/api/rzp-webhook.js', 'functions/api/paypal-webhook.js']) {
  const src = readFileSync(f, 'utf8');
  falsy(`${f} never puts err.message in a response body`,
        /json\(\s*\{\s*error:\s*\(?\s*err\s*&&\s*err\.message/.test(src));
  falsy(`${f} never stores err.message where a member reads it`,
        /review_note:\s*String\(\s*\(?\s*err/.test(src));
  truthy(`${f} routes unexpected errors through safeError`, /\bsafeError\(/.test(src));
}

{
  const http = readFileSync('functions/lib/http.js', 'utf8');
  truthy('safeError logs the real error', /console\.error/.test(http));
  truthy('safeError answers with the fixed message only', /json\(\{ error: message \}, status\)/.test(http));

  const sb = readFileSync('functions/lib/sb.js', 'utf8');
  falsy('sbService no longer names the status in a throwable shown to members',
        /'Database error \(' \+ res\.status/.test(sb));
}

{
  const src = readFileSync('functions/api/paypal.js', 'utf8');
  truthy('capture select includes user_id', /select=id,user_id,kind,plan,item_id/.test(src));
}

for (const f of ['functions/api/paypal.js', 'functions/api/paypal-webhook.js']) {
  const src = readFileSync(f, 'utf8');
  falsy(`${f} does not scale a captured amount by hand`,
        /parseFloat\([^)]*\)\s*\*\s*100/.test(src));
  truthy(`${f} converts through toMinor`, /toMinor\(paidAmount\.value/.test(src));
}

{
  const src = readFileSync('functions/api/paypal-webhook.js', 'utf8');
  falsy('a failed payout does not sweep every paid_out earning back',
        /status=eq\.paid_out',\s*\{\s*\n?\s*method: 'PATCH'/.test(src));
  truthy('it reopens the request once and only then returns earnings',
         /if \(!\(Array\.isArray\(reopened\) && reopened\.length\)\) return 'already reopened'/.test(src));
  truthy('it returns only enough to cover the request',
         /let left = owed;[\s\S]{0,200}if \(left <= 0\) break;/.test(src));
  truthy('and credits the ledger for what went back',
         /p_type: 'adjustment', p_direction: 'credit'/.test(src));
}

{
  const src = readFileSync('functions/api/payouts.js', 'utf8');
  truthy('request re-reads after insert', /claimedTotal\(env, user\.id, currency/.test(src));
  truthy('approve counts other commitments', /claimedTotal\(env, req\.user_id, req\.currency,\s*\n?\s*\['approved', 'processing'\]/.test(src));
  truthy('send re-checks before paying', /pot < Number\(req\.amount\) \+ alsoInFlight/.test(src));
}

{
  const src = readFileSync('js/app-core.js', 'utf8');

  const list = src.match(/var UPLOAD_IMAGE_TYPES\s*=\s*\n?\s*(\[[^\]]*\]);/);
  const fn   = src.match(/function safeUploadType\(type\)\{[\s\S]*?\n  \}/);
  truthy('safeUploadType is present in app-core.js', list && fn);
  if (list && fn) {
    const safeUploadType = new Function(
      `var UPLOAD_IMAGE_TYPES = ${list[1]}; ${fn[0]} return safeUploadType;`)();

    check('webp passes through',      safeUploadType('image/webp'), 'image/webp');
    check('png passes through',       safeUploadType('image/png'), 'image/png');
    check('case is normalised',       safeUploadType('IMAGE/JPEG'), 'image/jpeg');
    for (const bad of ['text/html', 'image/svg+xml', 'application/xhtml+xml',
                       'application/pdf', 'text/xml', 'application/xml',
                       'text/plain', '', null, undefined, 'constructor', '__proto__']) {
      check(`${JSON.stringify(bad)} is declared as a download`,
            safeUploadType(bad), 'application/octet-stream');
    }
  }

  falsy('no PUT still sends the raw file.type',
        /'content-type'\s*:\s*(file|body)\.type/.test(src));
  truthy('the signed-target PUT normalises', /'content-type':\s*type,/.test(src));
  truthy('the legacy PUT normalises', /'content-type':safeUploadType\(file\.type\)/.test(src));
}

{
  const src = readFileSync('js/auth.js', 'utf8');
  truthy('notification_reads upsert ignores duplicates',
         /notification_reads'\)\s*\n?\s*\.upsert\([\s\S]{0,120}ignoreDuplicates:\s*true/.test(src));
}

{
  const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,})|(\brzp_(live|test)_[A-Za-z0-9]{10,})|(\bsk_live_[A-Za-z0-9]{10,})|(\bAIzaSy[A-Za-z0-9_-]{20,})|(\bsb_secret_[A-Za-z0-9_-]{10,})|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  const { readdirSync } = await import('node:fs');
  const served = ['index.html', 'sw.js', 'uploadVerifier.js', 'aiAssistantData.js', 'config.example.js']
    .concat(readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f));
  for (const f of served) falsy(`${f} carries no secret-shaped literal`, SECRET.test(readFileSync(f, 'utf8')));
}

// ---------------------------------------------------------------------------
// Regressions from the 2026-09 audit. Each one pins a fix that is invisible at
// runtime until the day it matters, which is exactly the kind that gets undone.
// ---------------------------------------------------------------------------

{
  const src = readFileSync('functions/lib/sb.js', 'utf8');
  truthy('underLimit takes a strict flag',
         /export async function underLimit\(env, bucket, limit, seconds, strict = false\)/.test(src));
  falsy('underLimit no longer returns true unconditionally on error',
        /catch \{ return true; \}/.test(src));
  truthy('an unanswerable limiter refuses a strict caller',
         /catch \{ return !strict; \}/.test(src));
}

for (const f of ['functions/api/rzp.js', 'functions/api/paypal.js',
                 'functions/api/payouts.js', 'functions/api/collab.js']) {
  const src = readFileSync(f, 'utf8');
  truthy(`${f} rate-limits strictly`, /underLimit\([^)]*,\s*true\)/.test(src));
}

{
  const src = readFileSync('functions/api/payouts.js', 'utf8');
  falsy('payout batch id does not carry a clock, so a resend is idempotent',
        /sender_batch_id[\s\S]{0,80}Date\.now\(\)|batchId = 'dzpo_' \+ req\.id\.slice\(0, 8\) \+ '_' \+ Date\.now\(\)/.test(src));
  truthy('payout batch id is derived from the request id',
         /const batchId = 'dzpo_' \+ req\.id;/.test(src));
  truthy('a payout that PayPal accepted is not returned to the approved queue',
         /if \(sent\) \{/.test(src));
  truthy('a sent-but-unrecorded payout is flagged for manual reconciliation',
         /SENT, BOOKKEEPING INCOMPLETE/.test(src));
}

{
  const src = readFileSync('functions/_middleware.js', 'utf8');
  falsy('JSON-LD no longer escapes only the closing sequence',
        /replace\(\/<\\\/\/g/.test(src));
  const hits = src.match(/replace\(\/<\/g, '\\\\u003c'\)/g) || [];
  check('every JSON-LD block escapes all of <', hits.length, 2);
}

{
  const src = readFileSync('functions/api/collab.js', 'utf8');
  const bc = src.slice(src.indexOf('async broadcast('));
  const guard = bc.indexOf('who.is_staff');
  const lookup = bc.indexOf('sbService(env');
  truthy('broadcast confirms staff before it spends the service role',
         guard !== -1 && lookup !== -1 && guard < lookup);
}

{
  const src = readFileSync('supabase/functions/smart-function/index.ts', 'utf8');
  falsy('the upload limiter no longer swallows its own failure',
        /\}\s*catch \(_e\) \{\s*\n\s*\}/.test(src));
  truthy('the upload limiter counts atomically in the database',
         /rpc\("dz_rate_take"/.test(src));
  truthy('a sell file cannot be talked into the public bucket',
         /const isPrivate = !isImage && \(asset \|\| body\.visibility === "private"\)/.test(src));
  falsy('the edge function no longer answers every origin',
        /"Access-Control-Allow-Origin": "\*"/.test(src));
}

{
  const src = readFileSync('js/sections.js', 'utf8');
  truthy('a section publish carries its approval ticket',
         /row\.mod_token = modToken;/.test(src));
  truthy('the ticket is only kept when a check actually passed',
         /modToken = mod\.token \|\| null;/.test(src));
}

{
  const src = readFileSync('functions/api/moderation/recheck.js', 'utf8');
  truthy('the sweep will not fetch an image url off our own host',
         /allowedHost\(String\(src\), sbUrl\(env\)\)/.test(src));
  truthy('a deterministic unreadable image is demoted, not waved through',
         /why\.startsWith\('type '\) \|\| why === 'empty' \|\| why === 'too large'/.test(src));
  truthy('only a genuinely missing image counts as nothing to check',
         /if \(why === 'no image'\) \{/.test(src));
  // The bug this replaces: any unreadable image stamped mod_verified_at, and
  // since dz_protect_mod_verified stops a member clearing it, that retired the
  // row from the sweep permanently -- while the uploader chose the bytes that
  // made it unreadable. A transient failure must leave the row unstamped.
  const verify = src.slice(src.indexOf("if (!image.ok && mode === 'verify')"),
                           src.indexOf('if (!image.ok) continue;'));
  check('a transient failure leaves the row unverified for the next tick',
        (verify.match(/markVerified/g) || []).length, 1);
  truthy('the one stamp left is the no-image case',
         /if \(why === 'no image'\) \{\s*await markVerified/.test(verify));
}

{
  const src = readFileSync('js/app-core.js', 'utf8');
  truthy('the gallery query is bounded', /\.limit\(GAL_MAX\)/.test(src));

  // escJs is exercised, not grepped. It sits at the seam between two parsers,
  // and the bug it shipped with was invisible in the source: it escaped the
  // double quote with a backslash, which JavaScript understands and the HTML
  // parser does not -- so the attribute it existed to protect closed on the
  // first quote of any value containing one.
  const m = src.match(/function escJs\(s\)\{[\s\S]*?\n  \}/);
  truthy('escJs is present and extractable', !!m);
  const escJs = new Function(m[0] + '; return escJs;')();

  // The HTML parser decodes entities before JavaScript sees anything.
  const decode = (t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  for (const [name, payload] of [
    ['a bare double quote',   '"'],
    ['an attribute breakout', '" onmouseover=alert(1) x="'],
    ['a script tag',          '"><script>alert(1)</script>'],
  ]) {
    falsy('escJs emits no raw double quote for ' + name, escJs(payload).includes('"'));
  }

  for (const [name, payload] of [
    ['a bare single quote',  "'"],
    ['a js string breakout', "'); alert(1);//"],
    ['a backslash feint',    "\\'); alert(1);//"],
  ]) {
    // After the parser has decoded, every string delimiter must still be escaped.
    falsy('escJs leaves no live single quote for ' + name,
          /(^|[^\\])'/.test(decode(escJs(payload))));
  }

  check('escJs encodes the attribute delimiter as an entity', escJs('"'), '&quot;');
  check('escJs escapes the string delimiter for javascript', escJs("'"), "\\'");
  check('escJs doubles a backslash', escJs('\\'), '\\\\');
  check('escJs does not double-encode an entity', escJs('&quot;'), '&amp;quot;');
}


{
  const src = readFileSync('functions/api/moderation/recheck.js', 'utf8');
  truthy('the sweep also re-reads what was published',
         /status=eq\.approved&mod_verified_at=is\.null/.test(src));
  truthy('a verified row is stamped so the sweep moves on',
         /mod_verified_at: new Date\(\)\.toISOString\(\)/.test(src));
  truthy('a verify verdict is applied to an approved row, not a pending one',
         /const was = mode === 'verify' \? 'approved' : 'pending';/.test(src));
  truthy('a published url that is not an image at all is demoted',
         /PUBLISHED_IMAGE_UNREADABLE/.test(src));
  truthy('queued rows are drained before verify rows',
         src.indexOf("filter(w => w.mode === 'queued')") <
         src.indexOf("filter(w => w.mode === 'verify')"));
}

{
  const sql = readFileSync('security/2026-09-audit-fixes.sql', 'utf8');
  truthy('the migration arms the section gate',
         /set sections_enforced = true/.test(sql));
  truthy('the migration adds the verify marker to all four tables',
         (sql.match(/add column if not exists mod_verified_at timestamptz/g) || []).length === 4);
  truthy('a member cannot stamp their own row as verified',
         /NEW\.mod_verified_at := OLD\.mod_verified_at;/.test(sql));
  truthy('the marker trigger is attached to the content tables',
         /create trigger zz_protect_mod_verified before insert or update/.test(sql));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
