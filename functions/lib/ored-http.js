export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sameOrigin(request, env) {
  const h = request.headers;
  let host = '';
  try { host = new URL(request.url).host; } catch { return false; }

  const allowed = new Set([host]);
  for (const extra of String(env.ORED_ALLOWED_ORIGINS || '').split(',')) {
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

export function caller(request) {
  const raw = request.headers.get('CF-Connecting-IP') ||
              request.headers.get('X-Forwarded-For') || '';
  const first = raw.split(',')[0].trim();
  return first ? first.slice(0, 64) : 'unknown';
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

export function safeError(err, message, status) {
  try {
    console.error('[ored] ' + message + ' :: ' + ((err && (err.stack || err.message)) || String(err)));
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
