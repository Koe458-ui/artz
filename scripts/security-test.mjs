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
truthy('sibling supabase host',     allowedHost('https://other.supabase.co/x', SB));
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
