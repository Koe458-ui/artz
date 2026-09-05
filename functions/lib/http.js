export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SITE = 'https://digiartz.net';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sameOrigin(request, env) {
  const h = request.headers;
  let host = '';
  try { host = new URL(request.url).host; } catch { return false; }

  const allowed = new Set([host]);
  for (const extra of String(env.ALLOWED_ORIGINS || '').split(',')) {
    const v = extra.trim();
    if (!v) continue;
    try { allowed.add(new URL(v.includes('://') ? v : 'https://' + v).host); }
    catch { allowed.add(v); }
  }

  const site = h.get('Sec-Fetch-Site');
  if (site === 'same-origin') return true;
  if (site === 'none') return false;

  for (const name of ['Origin', 'Referer']) {
    const raw = h.get(name);
    if (!raw) continue;
    try { return allowed.has(new URL(raw).host); } catch { return false; }
  }
  return false;
}

export function allowedHost(url, sbUrlStr) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  try { if (u.hostname === new URL(sbUrlStr).hostname) return true; } catch {   }
  return u.hostname.endsWith('.supabase.co');
}

export function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

export function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(extra || {}),
    },
  });
}

// Anything thrown past a handler's own checks came from a provider, the
// database or the runtime, and none of those write for our members. The
// handlers return every message they author early -- "Amount must be between
// ...", "Listing not found" -- so this is only ever reached by something
// unexpected. It answers with one fixed sentence and puts the real error where
// an operator can read it, which is the edge log, not the response body.
//
// Razorpay's "Order amount must be at least INR 1.00" and PayPal's
// details[0].description are exactly the kind of text that reads like a helpful
// hint and is really a description of our integration.
export function safeError(err, message, status) {
  try {
    console.error('[dz] ' + message + ' :: ' + ((err && (err.stack || err.message)) || String(err)));
  } catch {   }
  return json({ error: message }, status);
}

export const notFound = () => new Response('Not found', {
  status: 404,
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
  },
});

export function downloadHeaders(name, type) {
  return new Headers({
    'Content-Type': type || 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + storedFileNameAscii(name) + '"; ' +
                           "filename*=UTF-8''" + encodeURIComponent(storedFileName(name)),
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
}

export function storedFileName(name) {
  const clean = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80);
  return clean || 'file';
}

export function storedFileNameAscii(name) {
  return storedFileName(name).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
}
