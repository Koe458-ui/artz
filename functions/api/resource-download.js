import { UUID_RE, json } from '../lib/http.js';
import { servePrivateFile } from '../lib/download.js';

const gone = () => json({ reason: 'not_found', error: 'That resource is no longer available.' }, 404);

export function onRequestPost({ request, env }) {
  return servePrivateFile(request, env, {
    grant: 'dz_resource_file_grant',
    fallbackName: 'resource',
    gone,

    args: (b) => (UUID_RE.test(String(b.resource || '')) ? { resource: String(b.resource) } : null),
    ask: (a, req) => ({ p_resource: a.resource, p_ip: clientIp(req) }),

    refused: (status) => (status === 401
      ? json({ reason: 'auth', error: 'Sign in to download.' }, 401)
      : json({ error: 'Could not check your download allowance.' }, 502)),

    withheld: (row) => {
      if (row && row.allowed) return null;
      const why = row && row.reason;
      if (why === 'limit')
        return json({ reason: 'limit', error: 'Daily download limit reached.',
                      limit: row.limit, tier: row.tier, resets_at: row.resets_at }, 429);
      if (why === 'rate')
        return json({ reason: 'rate', error: 'Too many downloads just now.' }, 429,
                     { 'Retry-After': String(row.retry_after || 60) });
      if (why === 'auth') return json({ reason: 'auth', error: 'Sign in to download.' }, 401);
      return gone();
    },

    headers: (h, row, fileRes) => {
      if (typeof row.remaining === 'number') h.set('X-Downloads-Left', String(row.remaining));
      const len = fileRes.headers.get('content-length');
      if (len) h.set('Content-Length', len);
    },
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') ||
         String(request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || '';
}
