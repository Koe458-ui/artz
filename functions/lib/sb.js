import { encodePath } from './http.js';

export const SB_URL_FALLBACK  = 'https://tmqzqlrpjpydiftlrzmj.supabase.co';
export const SB_ANON_FALLBACK = 'sb_publishable_x7xlsCx-ZsvpNLCXRxyvMw_PsJQT2xy';

export const SB_SIZE_RE = /__(?:t300|t600|v1000|f1600)\.webp$/;

export const sbUrl  = (env) => env.SB_URL || env.SUPABASE_URL || '';
export const sbAnon = (env) => env.SB_KEY || env.SUPABASE_ANON_KEY || '';
export const sbSvc  = (env) => env.SB_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function sbUser(env, request) {
  const bearer = request.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return null;
  const res = await fetch(sbUrl(env) + '/auth/v1/user', {
    headers: { apikey: sbAnon(env), authorization: bearer },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && u.id ? u : null;
}

export function peekJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(pad));
  } catch { return null; }
}

export async function sbRpc(env, fn, args = {}, request) {
  const base = String(sbUrl(env) || SB_URL_FALLBACK).replace(/\/$/, '');
  const key = request ? sbAnon(env) : sbSvc(env);
  const res = await fetch(base + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: request ? (request.headers.get('authorization') || '') : 'Bearer ' + key,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

export async function sbService(env, path, init = {}) {
  const res = await fetch(sbUrl(env) + '/rest/v1' + path, {
    ...init,
    headers: {
      apikey: sbSvc(env),
      authorization: 'Bearer ' + sbSvc(env),
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error('postgrest ' + (init.method || 'GET') + ' ' + path + ' -> ' + res.status);
  return body;
}

export async function signObject(sbUrlStr, svcKey, bucket, path, seconds) {
  const res = await fetch(sbUrlStr + '/storage/v1/object/sign/' + bucket + '/' + encodePath(path), {
    method: 'POST',
    headers: {
      apikey: svcKey,
      authorization: 'Bearer ' + svcKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  const sig = await res.json().catch(() => null);
  const signed = sig && (sig.signedURL || sig.signedUrl);
  if (!res.ok || !signed) return '';
  return signed.startsWith('http') ? signed : sbUrlStr + '/storage/v1' + signed;
}

export async function underLimit(env, bucket, limit, seconds) {
  if (!sbSvc(env)) return true;
  try {
    const r = await sbRpc(env, 'dz_rate_take',
      { p_bucket: bucket, p_limit: limit, p_seconds: seconds });
    return !r.ok || r.body !== false;
  } catch { return true; }
}

export async function hmacMatches(secret, message, signature) {
  const sig = String(signature || '');
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const a = new TextEncoder().encode(hex);
  const b = new TextEncoder().encode(sig);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function ledger(env, args) {
  try { await sbRpc(env, 'dz_ledger_append', args); } catch {   }
}
