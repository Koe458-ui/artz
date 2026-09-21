export const oredUrl  = (env) => String(env.ORED_SB_URL || '').trim().replace(/\/$/, '');
export const oredAnon = (env) => String(env.ORED_SB_KEY || '').trim();
export const oredSvc  = (env) => String(env.ORED_SB_SERVICE_KEY || '').trim();

export async function oredUser(env, request) {
  const bearer = request.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const res = await fetch(oredUrl(env) + '/auth/v1/user', {
    headers: { apikey: oredAnon(env), authorization: bearer },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && u.id ? u : null;
}

export async function oredService(env, path, init = {}) {
  const key = oredSvc(env);
  const res = await fetch(oredUrl(env) + '/rest/v1' + path, {
    ...init,
    headers: {
      apikey: key,
      authorization: 'Bearer ' + key,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error('postgrest ' + (init.method || 'GET') + ' ' + path + ' -> ' + res.status);
  return body;
}

export async function oredUnderLimit(env, bucket, limit, seconds) {
  const key = oredSvc(env);
  if (!key) return true;
  try {
    const res = await fetch(oredUrl(env) + '/rest/v1/rpc/ored_rate_take', {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: 'Bearer ' + key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_bucket: bucket, p_limit: limit, p_seconds: seconds }),
    });
    if (!res.ok) return true;
    return (await res.json().catch(() => null)) !== false;
  } catch { return true; }
}
