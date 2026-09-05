import { underLimit } from './sb.js';

const LIMITS = [
  ['/api/rzp',               20],
  ['/api/paypal',            20],
  ['/api/payouts',           20],
  ['/api/subscription',      20],
  ['/api/collab',            30],
  ['/api/admin',             30],
  ['/api/moderation',        30],
  ['/api/moderate-upload',   20],
  ['/api/ops',               30],
  ['/api/csp-report',        30],
  ['/api/store',             60],
  ['/api/download',         120],
  ['/api/market-download',  120],
  ['/api/resource-download',120],
  ['/api/',                  90]
];

const NO_LIMIT = ['/api/rzp-webhook', '/api/paypal-webhook'];

export function limitFor(pathname) {
  for (const skip of NO_LIMIT) if (pathname.startsWith(skip)) return null;
  let best = null;
  for (const [prefix, n] of LIMITS) {
    if (!pathname.startsWith(prefix)) continue;
    if (!best || prefix.length > best[0].length) best = [prefix, n];
  }
  return best ? { bucket: best[0], limit: best[1] } : null;
}

// The bucket is keyed on the connecting address, never on the bearer token.
// Nothing at the edge verifies a token's signature, so a token-derived key is
// attacker-chosen: sending a fresh random Bearer on every request would mint a
// fresh bucket each time and the limit would never bind. The address is the one
// identifier the caller cannot rotate at will. Per-member fairness is enforced
// further in, by the handlers that limit on user.id after Supabase has actually
// verified the token.
export function actorKey(request) {
  const ip = request.headers.get('CF-Connecting-IP')
          || request.headers.get('X-Real-IP')
          || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  return ip ? 'ip:' + ip.slice(0, 64) : 'anon';
}

// One address can carry several people -- an office, a campus, a phone network
// behind carrier NAT -- so the address bucket is widened to hold a handful of
// them at once. It is still a bound, which is the whole point: the numbers in
// LIMITS are what one person should need, and SHARED is how many of them an
// address is assumed to speak for. What each member may do individually is
// still counted per user.id inside the handlers that care, on a token Supabase
// has verified.
export const SHARED = 3;

export async function underEdgeLimit(env, request, pathname) {
  const rule = limitFor(pathname);
  if (!rule) return true;

  const actor = actorKey(request);
  return underLimit(env, 'edge:' + rule.bucket + ':' + actor, rule.limit * SHARED, 60);
}

export function tooManyRequests() {
  return new Response(
    JSON.stringify({ error: 'Too many requests — slow down and try again.' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '60',
        'x-content-type-options': 'nosniff'
      }
    }
  );
}
