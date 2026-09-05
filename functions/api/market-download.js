import { UUID_RE, json } from '../lib/http.js';
import { servePrivateFile } from '../lib/download.js';

const gone = () => json({ reason: 'not_found', error: 'That file is no longer available.' }, 404);

export function onRequestPost({ request, env }) {
  return servePrivateFile(request, env, {
    grant: 'dz_market_file_grant',
    fallbackName: 'file',
    gone,
    type: (row) => row.mime,

    args: (b) => {
      const item = String(b.item || '');
      const file = String(b.file || item || '');
      return (UUID_RE.test(item) && UUID_RE.test(file)) ? { item, file } : null;
    },
    ask: (a) => ({ p_item: a.item, p_file: a.file }),

    refused: (status, grant) => {
      const msg = (grant && (grant.message || grant.error)) || '';
      if (/purchase required/i.test(msg))
        return json({ reason: 'unpaid', error: 'Buy this item to download it.' }, 402);
      if (status === 401) return json({ reason: 'auth', error: 'Sign in to download.' }, 401);
      return json({ error: 'Could not check your purchase.' }, 502);
    },

    withheld: (row) => (row ? null : gone()),
  });
}
