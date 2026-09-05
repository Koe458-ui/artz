import { sbUrl, sbAnon, sbSvc, peekJwt, signObject } from './sb.js';
import { sameOrigin, allowedHost, json, downloadHeaders } from './http.js';

const SIGN_TTL = 120;

export async function servePrivateFile(request, env, spec) {
  const SB_URL = sbUrl(env), SB_KEY = sbAnon(env), SB_SVC = sbSvc(env);
  const notConfigured = () => json({ error: 'Downloads are not configured.' }, 503);

  try {
    if (!SB_URL || !SB_KEY) return notConfigured();

    if (!sameOrigin(request, env))
      return json({ error: 'Downloads must come from the DigiArtz site.' }, 403);

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ reason: 'auth', error: 'Sign in to download.' }, 401);

    let body;
    try { body = await request.json(); } catch { body = null; }
    const args = spec.args(body || {});
    if (!args) return json({ error: 'Bad request.' }, 400);

    const claims = peekJwt(token);
    if (!claims || !claims.sub || (claims.exp && claims.exp * 1000 <= Date.now()))
      return json({ reason: 'auth', error: 'Session expired — sign in again.' }, 401);

    const grantRes = await fetch(SB_URL + '/rest/v1/rpc/' + spec.grant, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: JSON.stringify(spec.ask(args, request)),
    });
    const grant = await grantRes.json().catch(() => null);
    if (!grantRes.ok) return spec.refused(grantRes.status, grant);

    const row = Array.isArray(grant) ? grant[0] : grant;
    const withheld = spec.withheld(row);
    if (withheld) return withheld;

    const bucket = String(row.bucket || '');
    const path   = String(row.path || '');
    const name   = String(row.filename || spec.fallbackName);

    let src = '';
    if (path && bucket && !path.startsWith('/') && !path.includes('..')) {
      if (!SB_SVC) return notConfigured();
      src = await signObject(SB_URL, SB_SVC, bucket, path, SIGN_TTL);
      if (!src) return json({ error: 'The file could not be prepared.' }, 502);
    } else if (row.legacy_url) {
      src = String(row.legacy_url);
    }

    if (!src || !allowedHost(src, SB_URL)) return spec.gone();

    const fileRes = await fetch(src);
    if (!fileRes.ok || !fileRes.body) return json({ error: 'The file could not be fetched.' }, 502);

    const type = (spec.type && spec.type(row)) || fileRes.headers.get('content-type');
    const headers = downloadHeaders(name, type);
    if (spec.headers) spec.headers(headers, row, fileRes);

    return new Response(fileRes.body, { status: 200, headers });
  } catch (err) {
    return json({ error: 'Download failed — try again.' }, 500);
  }
}
