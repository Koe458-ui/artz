import { sbUrl, sbAnon, sbUser, sbRpc, sbService as sbRead, underLimit } from '../lib/sb.js';
import { UUID_RE } from '../lib/http.js';

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
    },
  });

class Refused extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function refusalFrom(status, body) {
  const code = String((body && body.code) || '');
  const msg = String((body && (body.message || body.error)) || '').trim();

  if (status === 401) return new Refused('Sign in required', 401);
  if (status === 404) return new Refused('Unavailable', 503);

  if (code === 'P0001') {
    if (/^not allowed$/i.test(msg)) return new Refused('Not allowed', 403);
    if (/^sign in required$/i.test(msg)) return new Refused('Sign in required', 401);
    return new Refused(msg.slice(0, 160) || 'That did not work', 400);
  }

  return new Refused('That did not work', 400);
}

async function rpc(env, request, fn, args = {}) {
  const res = await sbRpc(env, fn, args, request);
  if (!res.ok) throw refusalFrom(res.status, res.body);
  return res.body;
}

function sbService(env, path, init) {
  return sbRead(env, path, init)
    .catch((e) => { throw new Refused(e.message, 500); });
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

const ACTIONS = {
  async state({ env, request }) {
    return { ok: true, state: await rpc(env, request, 'dz_my_collab_state') };
  },

  async 'promo-resolve'({ env, request, body }) {
    const code = str(body.code, 12).toUpperCase();
    const kind = str(body.kind, 20);
    if (!/^[A-Z0-9]{4,6}$/.test(code))
      return { ok: false, error: 'A code is 4 to 6 letters or digits' };
    if (kind !== 'marketplace' && kind !== 'subscription')
      throw new Refused('Unknown purchase kind', 400);
    return await rpc(env, request, 'dz_promo_resolve', { p_code: code, p_kind: kind });
  },

  async 'claim-max'({ env, request }) {
    return await rpc(env, request, 'dz_claim_max');
  },

  async 'promo-create'({ env, request, body }) {
    const code = str(body.code, 12).toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(code))
      throw new Refused('A code is 4 to 6 letters or digits, nothing else', 400);
    return await rpc(env, request, 'dz_promo_create', { p_code: code });
  },

  async 'promo-mine'({ env, request }) {
    return await rpc(env, request, 'dz_promo_mine');
  },

  async wallet({ env, request, body }) {
    const [promo, wallet, ledger, state] = await Promise.all([
      rpc(env, request, 'dz_promo_mine'),
      rpc(env, request, 'dz_partner_wallet'),
      rpc(env, request, 'dz_partner_ledger', {
        p_limit: Math.min(Math.max(Number(body.limit) || 50, 1), 100),
        p_before: body.before || null,
      }),
      rpc(env, request, 'dz_my_collab_state'),
    ]);
    return { ok: true, promo, wallet: wallet || [], ledger: ledger || [], state };
  },

  async 'mod-find'({ env, request, body }) {
    const q = str(body.query, 200);
    if (q.length < 2) throw new Refused('Search for a username, an email or a user id', 400);
    const rows = await rpc(env, request, 'dz_mod_find', { p_query: q });
    return { ok: true, user: (rows && rows[0]) || null };
  },

  async ban({ env, request, body }) {
    const id = str(body.userId, 40);
    if (!UUID_RE.test(id)) throw new Refused('Pick a member to ban', 400);
    const reason = str(body.reason, 60);
    if (reason.length < 2) throw new Refused('A reason is required', 400);
    const days = Number(body.days);
    return await rpc(env, request, 'dz_ban_user', {
      p_target: id,
      p_reason: reason,
      p_note: str(body.note, 500) || null,
      p_days: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    });
  },

  async unban({ env, request, body }) {
    const id = str(body.userId, 40);
    if (!UUID_RE.test(id)) throw new Refused('Pick a member to unban', 400);
    return await rpc(env, request, 'dz_unban_user', { p_target: id });
  },

  async reports({ env, request, body }) {
    const status = str(body.status, 20) || 'pending';
    const rows = await rpc(env, request, 'dz_reports_queue', {
      p_status: status,
      p_limit: Math.min(Math.max(Number(body.limit) || 100, 1), 200),
    });
    return { ok: true, reports: rows || [] };
  },

  async 'report-resolve'({ env, request, body }) {
    const id = str(body.id, 40);
    if (!UUID_RE.test(id)) throw new Refused('Pick a report', 400);
    const status = str(body.status, 20);
    if (status !== 'resolved' && status !== 'dismissed')
      throw new Refused('Resolve it or dismiss it', 400);
    return await rpc(env, request, 'dz_report_resolve', {
      p_id: id, p_status: status, p_note: str(body.note, 500) || null,
    });
  },

  async 'add-partner'({ env, request, body }) {
    const email = str(body.email, 254).toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(email))
      throw new Refused('That does not look like an email address', 400);
    return await rpc(env, request, 'dz_grant_partner', { p_email: email });
  },

  async 'revoke-partner'({ env, request, body }) {
    const id = str(body.userId, 40);
    if (!UUID_RE.test(id)) throw new Refused('Pick a partner', 400);
    return await rpc(env, request, 'dz_revoke_partner', { p_user: id });
  },

  async partners({ env, request }) {
    return { ok: true, partners: (await rpc(env, request, 'dz_admin_partners')) || [] };
  },

  async audit({ env, request, body }) {
    const rows = await rpc(env, request, 'dz_audit_log', {
      p_limit: Math.min(Math.max(Number(body.limit) || 100, 1), 200),
      p_before: body.before || null,
    });
    return { ok: true, entries: rows || [] };
  },

  async telemetry({ env, request }) {
    return { ok: true, telemetry: await rpc(env, request, 'dz_admin_telemetry') };
  },

  async revenue({ env, request }) {
    const rows = await rpc(env, request, 'dz_platform_revenue');
    return { ok: true, revenue: (rows && rows[0]) || null };
  },

  async broadcast({ env, request, body }) {
    const title = str(body.title, 80);
    const message = str(body.message, 500);
    if (!title || !message) throw new Refused('A title and a message, please', 400);

    // an in-app path only, so a notification cannot be a link off the site
    const url = str(body.url, 300);
    if (url && !/^\/[\w\-./]*$/.test(url))
      throw new Refused('A target has to be a path on DigiArtz, like /explore', 400);

    // names in, ids out — the client never names an id, and never sees one
    let users = null;
    const names = String(body.to || '').split(/[\s,]+/)
      .map((n) => n.replace(/^@/, '').replace(/[^A-Za-z0-9_.-]/g, ''))
      .filter(Boolean).slice(0, 50);
    if (names.length) {
      const rows = await sbService(env,
        '/profiles?select=id,username&username=in.(' +
        names.map((n) => '"' + n + '"').join(',') + ')');
      users = (rows || []).map((r) => r.id);
      if (!users.length) throw new Refused('No one by that name', 400);
    }

      // dz_admin_notify raises unless the caller is staff, so the check is the database's, on the caller's own token
    const made = await rpc(env, request, 'dz_admin_notify', {
      p_title: title, p_message: message, p_url: url || null, p_users: users,
    });
    return { ok: true, sent: made };
  },
};

const LIMITS = {
  'promo-create': [5, 300],
  'claim-max': [5, 300],
  'add-partner': [10, 60],
  'revoke-partner': [10, 60],
  ban: [20, 60],
  unban: [20, 60],
  broadcast: [5, 300],
  'promo-resolve': [10, 60],
  'mod-find': [12, 60],
  audit: [30, 60],
};
const LIMIT_DEFAULT = [60, 60];

export async function handle(action, { env, request }) {
  if (!sbUrl(env) || !sbAnon(env)) return json({ error: 'Not configured' }, 503);

  const user = await sbUser(env, request);
  if (!user) return json({ error: 'Sign in required' }, 401);

  let body = {};
  if (request.method === 'POST') {
    try { body = (await request.json()) || {}; }
    catch { return json({ error: 'Bad request' }, 400); }
  }

  const name = String(action || body.action || '');
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  if (!has(ACTIONS, name)) return json({ error: 'Unknown action' }, 404);
  const fn = ACTIONS[name];
  if (typeof fn !== 'function') return json({ error: 'Unknown action' }, 404);

  const [limit, seconds] = has(LIMITS, name) ? LIMITS[name] : LIMIT_DEFAULT;
  if (!(await underLimit(env, 'cl:' + name + ':' + user.id, limit, seconds)))
    return json({ error: 'Too many attempts — wait a moment' }, 429);

  try {
    return json(await fn({ env, request, body, user }));
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.message }, e.status);
    return json({ error: 'Something went wrong' }, 500);
  }
}

export const onRequestPost = (ctx) => handle(null, ctx);
