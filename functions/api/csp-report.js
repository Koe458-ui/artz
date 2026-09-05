// Where the Report-Only policy in _headers sends what it would have blocked.
//
// The enforcing policy still carries 'unsafe-inline' and 'unsafe-eval' in
// script-src, and neither can be removed on a guess: 'unsafe-inline' is wanted
// by whatever Google Tag Manager and AdSense inject at runtime, and
// 'unsafe-eval' is most likely wanted by the Razorpay or PayPal SDK. Breaking
// checkout to tidy a header would be a poor trade.
//
// So the strict policy ships alongside as Content-Security-Policy-Report-Only,
// which enforces nothing and reports everything. After a few days of real
// traffic the log says which of the two relaxations is actually load-bearing
// and which can go. That is the difference between removing them and hoping,
// and removing them and knowing.
//
// This endpoint is deliberately dull: it never trusts the body, never stores
// it, never echoes it, and always answers 204 so a browser has nothing to
// retry. Reports arrive unauthenticated and cross-origin by design, so the
// only defences that matter are the size cap here and the rate limit the
// middleware applies to /api/ before this runs.

import { json } from '../lib/http.js';

const MAX_BYTES = 8 * 1024;

const NO_CONTENT = () => new Response(null, {
  status: 204,
  headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
});

// Reports name a URL that a page tried to load. Keep the origin and the path,
// drop query and fragment: a blocked URL can carry someone's session in it.
function place(u) {
  const raw = String(u || '').slice(0, 300);
  if (!raw || raw === 'inline' || raw === 'eval' || raw === 'self') return raw || '-';
  try {
    const url = new URL(raw);
    return url.origin + url.pathname;
  } catch { return raw.split(/[?#]/)[0]; }
}

export async function onRequestPost({ request }) {
  const body = await request.text().catch(() => '');
  if (!body || body.length > MAX_BYTES) return NO_CONTENT();

  let parsed;
  try { parsed = JSON.parse(body); } catch { return NO_CONTENT(); }

  // Two wire formats: the old report-uri envelope and the Reporting API array.
  const items = Array.isArray(parsed)
    ? parsed.map((r) => (r && r.body) || {})
    : [(parsed && parsed['csp-report']) || parsed || {}];

  for (const r of items.slice(0, 10)) {
    const directive = String(
      r['effective-directive'] || r.effectiveDirective ||
      r['violated-directive'] || r.violatedDirective || '?'
    ).slice(0, 60);

    // 'inline' and 'eval' in blockedURL are what tell the two relaxations apart.
    console.error(
      '[csp] ' + directive +
      ' blocked=' + place(r['blocked-uri'] || r.blockedURL) +
      ' on=' + place(r['document-uri'] || r.documentURL) +
      ' line=' + String(r['line-number'] || r.lineNumber || '-').slice(0, 8)
    );
  }

  return NO_CONTENT();
}

// A GET here is a scanner or a misconfiguration, not a browser.
export const onRequestGet = () => json({ error: 'Not found' }, 404);
