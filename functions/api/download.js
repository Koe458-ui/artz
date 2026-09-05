import { peekJwt, underLimit, SB_URL_FALLBACK, SB_ANON_FALLBACK, SB_SIZE_RE } from '../lib/sb.js';
import { UUID_RE, sameOrigin, allowedHost, json, downloadHeaders } from '../lib/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const SB_URL  = env.SB_URL  || env.SUPABASE_URL      || SB_URL_FALLBACK;
  const SB_KEY  = env.SB_KEY  || env.SUPABASE_ANON_KEY || SB_ANON_FALLBACK;
  const FN_URL  = env.S3_FN_URL || `${SB_URL.replace(/\/$/, '')}/functions/v1/smart-function`;

  try {
    if (!sameOrigin(request, env)) {
      return json({ error: 'Downloads must come from the DigiArtz site.' }, 403);
    }

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ reason: 'auth', error: 'Sign in to download.' }, 401);

    let body;
    try { body = await request.json(); } catch { body = null; }
    const artwork = body && String(body.artwork || '');
    if (!artwork || !UUID_RE.test(artwork)) {
      return json({ error: 'Bad request.' }, 400);
    }

    const claims = peekJwt(token);
    if (!claims || !claims.sub || (claims.exp && claims.exp * 1000 <= Date.now())) {
      return json({ reason: 'auth', error: 'Session expired — sign in again.' }, 401);
    }

    if (!(await underIpLimit(env, request.headers.get('CF-Connecting-IP')))) {
      return json({ reason: 'rate', error: 'Too many download requests — wait a moment.' },
                  429, { 'Retry-After': '60' });
    }

    const gateRes = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'download',
        artwork,
        ip: request.headers.get('CF-Connecting-IP') || null
      })
    });

    let out = {};
    try { out = await gateRes.json(); } catch { out = {}; }

    if (!gateRes.ok) {
      const reason = out.reason || 'denied';
      if (gateRes.status === 429 && reason === 'rate') {
        return json({ reason: 'rate', error: 'Too many download requests — wait a moment.' },
                    429, { 'Retry-After': String(out.retry_after || 60) });
      }
      if (gateRes.status === 429) {
        return json({
          reason: 'limit',
          tier: out.tier, limit: out.limit, used: out.used,
          remaining: 0, resets_at: out.resets_at,
          error: 'Daily download quota reached.'
        }, 429);
      }
      if (gateRes.status === 401) return json({ reason: 'auth', error: 'Sign in to download.' }, 401);
      if (gateRes.status === 404) return json({ reason: 'not_found', error: 'Artwork not found.' }, 404);
      if (gateRes.status === 403) return json({ reason, error: 'Download not allowed.' }, 403);
      return json({ error: 'Could not check your download quota.' }, 502);
    }

    const gate = out.gate || {};
    const signed = typeof out.url === 'string' && out.url ? out.url : '';
    const src = signed || previewUrl(out.imageUrl);
    if (!src || !allowedHost(src, SB_URL)) {
      return json({ error: 'Artwork source is not downloadable.' }, 502);
    }

    const fileRes = signed
      ? await fetch(src)
      : await fetch(src, { cf: { cacheEverything: true, cacheTtl: 3600 } });
    if (!fileRes.ok || !fileRes.body) return json({ error: 'The file could not be fetched.' }, 502);

    const type = fileRes.headers.get('content-type') || 'application/octet-stream';
    const headers = downloadHeaders(niceName(out.name, src, type), type);
    headers.set('X-Dz-Remaining', String(gate.remaining ?? ''));
    headers.set('X-Dz-Limit', String(gate.limit ?? ''));
    headers.set('X-Dz-Tier', String(gate.tier || ''));
    headers.set('Access-Control-Expose-Headers', 'X-Dz-Remaining, X-Dz-Limit, X-Dz-Tier');
    return new Response(fileRes.body, { status: 200, headers });
  } catch (err) {
    return json({ error: 'Download failed — try again.' }, 500);
  }
}

async function underIpLimit(env, ip) {
  const addr = String(ip || '').trim();
  if (!addr) return true;
  return underLimit(env, 'dl:edge:' + addr.slice(0, 64), 60, 60);
}

function previewUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return SB_SIZE_RE.test(url) ? url.replace(SB_SIZE_RE, '__f1600.webp') : url;
}

function extFor(src, type) {
  if (/webp/i.test(type)) return 'webp';
  const m = /\.([a-z0-9]{2,4})$/i.exec(safePath(src));
  if (m) return m[1].toLowerCase();
  const t = /image\/([a-z0-9]+)/i.exec(type || '');
  return t ? t[1].toLowerCase() : 'jpg';
}
function safePath(src) {
  try { return new URL(src).pathname; } catch { return ''; }
}
function niceName(name, src, type) {
  const base = String(name || 'artwork').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60);
  return `${base || 'artwork'}.${extFor(src, type)}`;
}
