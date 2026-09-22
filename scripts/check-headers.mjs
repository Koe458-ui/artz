#!/usr/bin/env node
//
// Cloudflare validates _headers at deploy time, not at push time, so a line
// that grew too long fails the build after the assets have already uploaded --
// the site stays on the old version and the only sign is a line number in the
// Pages log. That is a slow way to find out, and it happened: the Report-Only
// policy reached 2,389 characters and took the deploy down with it.
//
// The limits are Cloudflare's, from the Pages _headers documentation:
//
//   - 2,000 characters per line
//   - 100 rules
//
// Both are easy to drift into, because the thing that grows is a CSP, and a
// CSP grows one vendor at a time. This fails the build here instead, where the
// fix is a commit rather than a rollback.
//
// If a policy is up against the limit again, the way down is not to delete
// origins that are still needed. It is, in order:
//
//   1. drop any host a wildcard in the same directive already covers
//      (https://checkout.razorpay.com under https://*.razorpay.com)
//   2. drop any directive the Report-Only policy merely copies from the
//      enforcing one -- it can only report what is already blocked, so it
//      costs bytes and reports nothing. The Report-Only policy states
//      script-src and img-src, which are the two it is actually testing, over
//      a default-src wide enough to keep the rest quiet.

import { readFileSync } from 'node:fs';

const LINE_LIMIT = 2000;
const RULE_LIMIT = 100;

const lines = readFileSync('_headers', 'utf8').split('\n');
let failed = 0;
const fail = (m) => { failed++; console.error(`::error file=_headers::${m}`); };
const ok = (m) => console.log(`ok    ${m}`);

const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
for (const [i, line] of lines.entries()) {
  if (line.length > LINE_LIMIT) {
    const name = line.trim().split(':')[0];
    fail(`line ${i + 1} is ${line.length} characters, ${line.length - LINE_LIMIT} over ` +
         `Cloudflare's ${LINE_LIMIT}-character limit. The deploy rejects the whole file ` +
         `for this. Shorten ${name} -- see the note at the top of this script.`);
  }
}
if (!failed) {
  const i = lines.indexOf(longest);
  ok(`every line is within ${LINE_LIMIT} characters (longest is line ${i + 1}, ` +
     `${longest.length}, ${LINE_LIMIT - longest.length} to spare)`);
}

const rules = lines.filter((l) => l.startsWith('/') || l.startsWith('http')).length;
if (rules > RULE_LIMIT) fail(`${rules} rules, over Cloudflare's limit of ${RULE_LIMIT}`);
else ok(`${rules} rules, within the limit of ${RULE_LIMIT}`);

// A header line outside a rule is silently dropped, which is the failure mode
// where the policy looks present in the file and is absent from the response.
let inRule = false;
for (const [i, line] of lines.entries()) {
  if (!line.trim() || line.startsWith('#')) { inRule = false; continue; }
  if (!/^\s/.test(line)) { inRule = true; continue; }
  if (!inRule) fail(`line ${i + 1} sets a header before any path rule, so it applies to nothing`);
}
if (!failed) ok('every header sits under a path rule');

console.log(failed ? `\n${failed} problem(s)` : '\nheaders ok');
process.exit(failed ? 1 : 0);
