#!/usr/bin/env node
//
// The Report-Only policy in _headers names every inline script in index.html by
// SHA-256. That list is only useful while it is exact: one edit to an inline
// block and the report fills with violations for a script that is ours and
// fine, which is how a reporting channel becomes noise and then becomes
// ignored. This fails the build instead, and prints the line to paste.
//
// It also holds the two policies apart. The enforcing Content-Security-Policy
// keeps 'unsafe-inline' and 'unsafe-eval' because removing either on a guess
// could break checkout or the ad stack; the Report-Only one exists precisely to
// find out whether they are still needed. If the strict policy ever grows them
// back it is testing nothing, so that is an error too.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync('index.html', 'utf8');
const headers = readFileSync('_headers', 'utf8');

const line = (name) => {
  const m = headers.match(new RegExp('^\\s*' + name + ':\\s*(.+)$', 'm'));
  return m ? m[1].trim() : null;
};

const enforcing = line('Content-Security-Policy');
const strict = line('Content-Security-Policy-Report-Only');

let failed = 0;
const fail = (msg) => { failed++; console.error(`::error::${msg}`); };
const ok = (msg) => console.log(`ok    ${msg}`);

if (!enforcing) fail('_headers has no Content-Security-Policy');
if (!strict) fail('_headers has no Content-Security-Policy-Report-Only');
if (!enforcing || !strict) process.exit(1);

const scriptSrc = (csp) => {
  const m = csp.match(/(?:^|;)\s*script-src\s([^;]*)/);
  return m ? m[1].trim() : '';
};

// 1. every inline script in index.html is named by the strict policy
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
const want = inline.map(([, , body]) =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);

const missing = want.filter((h) => !strict.includes(h));
if (missing.length) {
  fail(`${missing.length} of ${want.length} inline scripts in index.html are not in the ` +
       'Report-Only policy. Rebuild its script-src with:\n' +
       `      script-src 'self' blob: ${want.join(' ')} <the same hosts as the enforcing policy>`);
} else {
  ok(`all ${want.length} inline scripts in index.html are named by the Report-Only policy`);
}

// 2. and nothing stale is left behind
const named = [...strict.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
const stale = named.filter((h) => !want.includes(h));
if (stale.length) fail(`${stale.length} hash(es) in the Report-Only policy match no inline script: ${stale.join(' ')}`);
else ok('no stale hashes');

// 3. the strict policy is actually strict
for (const relaxation of ["'unsafe-inline'", "'unsafe-eval'"]) {
  if (scriptSrc(strict).includes(relaxation)) {
    fail(`the Report-Only policy still allows ${relaxation} in script-src, so it tests nothing`);
  } else {
    ok(`the Report-Only policy withholds ${relaxation}`);
  }
}

// 4. and the enforcing one has not been tightened by accident, which is the
//    change that breaks checkout rather than reporting it
for (const relaxation of ["'unsafe-inline'", "'unsafe-eval'"]) {
  if (!scriptSrc(enforcing).includes(relaxation)) {
    fail(`the ENFORCING policy no longer allows ${relaxation}. That is the change the ` +
         'Report-Only policy exists to justify — read the csp reports first, and if they ' +
         'are clean, delete this check along with the relaxation.');
  } else {
    ok(`the enforcing policy still allows ${relaxation} (deliberate, pending report data)`);
  }
}

// 5. reports have somewhere to go
if (!/report-uri\s+\/api\/csp-report/.test(strict)) fail('the Report-Only policy names no report-uri');
else ok('reports are routed to /api/csp-report');

console.log(failed ? `\n${failed} problem(s)` : '\ncsp ok');
process.exit(failed ? 1 : 0);
