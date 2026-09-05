import { safeError } from '../lib/http.js';
import { sbUrl, sbAnon, sbSvc, sbUser, sbRpc, underLimit, sbService, ledger } from '../lib/sb.js';
import { toValue } from '../lib/money.js';
import { pp } from '../lib/paypal.js';

const MIN_PAYOUT = {
  USD: 500, EUR: 500, GBP: 400, INR: 50000, JPY: 700,
  AUD: 800, CAD: 700, SGD: 700,
  CHF: 400, HKD: 4000, NZD: 900, SEK: 5000,
};
const MIN_DEFAULT = 500;
const minPayout = (cur) => MIN_PAYOUT[cur] != null ? MIN_PAYOUT[cur] : MIN_DEFAULT;

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const PP_PAYOUT_CURRENCIES = new Set(['AUD', 'BRL', 'CAD', 'CZK', 'DKK', 'EUR',
  'HKD', 'HUF', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN',
  'GBP', 'SGD', 'SEK', 'CHF', 'THB', 'USD']);

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

async function wallet(env, request, fn, args = {}) {
  const res = await sbRpc(env, fn, args, request);
  if (!res.ok) throw new Error('wallet rpc ' + fn + ' returned ' + res.status);
  return res.body;
}

async function isAdmin(env, userId) {
  const rows = await sbService(env, '/profiles?id=eq.' + userId + '&select=role&limit=1');
  const role = rows && rows[0] && rows[0].role;
  return role === 'admin' || role === 'dev';
}

async function reconciled(env, userId, currency) {
  let rows;
  try {
    const res = await sbRpc(env, 'dz_reconcile', { p_user: userId });
    if (!res.ok) return { ok: false, reason: 'check unavailable' };
    rows = res.body;
  } catch {
    return { ok: false, reason: 'check unavailable' };
  }

  const row = (rows || []).find((r) => r.currency === currency);
  if (!row) return { ok: true };
  if (row.agrees) return { ok: true };

  const open = await sbService(env,
    '/reconciliation_flags?user_id=eq.' + userId +
    '&currency=eq.' + currency + '&status=eq.open&select=id&limit=1').catch(() => null);
  if (!(open && open.length)) {
    await sbService(env, '/reconciliation_flags', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId, currency,
        operational: row.operational, ledger: row.ledger,
        discrepancy: row.discrepancy, kind: 'balance_mismatch',
        detail: 'Withdrawal blocked: wallet says ' + row.operational +
                ', ledger says ' + row.ledger + ' (' + currency + ', minor units)',
      }),
    }).catch(() => {});
  }

  return { ok: false, reason: 'mismatch', row };
}

async function withdrawable(env, userId) {
  const earnings = await sbService(env,
    '/marketplace_earnings?seller_id=eq.' + userId +
    '&status=eq.available&available_at=lte.' + new Date().toISOString() +
    '&select=net_amount,currency');

  const open = await sbService(env,
    '/payout_requests?user_id=eq.' + userId +
    '&status=in.(requested,approved,processing)&select=amount,currency');

  const by = {};
  for (const e of earnings || []) {
    by[e.currency] = (by[e.currency] || 0) + Number(e.net_amount || 0);
  }
  for (const r of open || []) {
    by[r.currency] = (by[r.currency] || 0) - Number(r.amount || 0);
  }
  for (const k of Object.keys(by)) if (by[k] < 0) by[k] = 0;
  return by;
}

async function earnedAvailable(env, userId, currency) {
  const rows = await sbService(env,
    '/marketplace_earnings?seller_id=eq.' + userId +
    '&status=eq.available&currency=eq.' + encodeURIComponent(currency) +
    '&available_at=lte.' + new Date().toISOString() + '&select=net_amount');
  return (rows || []).reduce((n, e) => n + Number(e.net_amount || 0), 0);
}

async function claimedTotal(env, userId, currency, statuses, exceptId) {
  const rows = await sbService(env,
    '/payout_requests?user_id=eq.' + userId +
    '&currency=eq.' + encodeURIComponent(currency) +
    '&status=in.(' + statuses.join(',') + ')&select=id,amount');
  return (rows || [])
    .filter((r) => !exceptId || r.id !== exceptId)
    .reduce((n, r) => n + Number(r.amount || 0), 0);
}

export async function onRequestPost({ env, request }) {
  if (!sbUrl(env) || !sbAnon(env) || !sbSvc(env))
    return json({ error: 'Not configured' }, 503);

  const user = await sbUser(env, request);
  if (!user) return json({ error: 'Sign in required' }, 401);

  if (!(await underLimit(env, 'po:' + user.id, 20, 60)))
    return json({ error: 'Too many attempts — wait a moment' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  try {
    if (body.action === 'overview') {
      const [summary, history, methods] = await Promise.all([
        wallet(env, request, 'dz_wallet_summary'),
        sbService(env, '/wallet_history?user_id=eq.' + user.id +
          '&order=happened_at.desc&limit=100' +
          '&select=id,direction,category,title,amount,currency,status,provider,transaction_id,happened_at'),
        sbService(env, '/payout_methods?user_id=eq.' + user.id +
          '&order=is_default.desc,created_at.asc' +
          '&select=id,provider,kind,label,paypal_email,upi_vpa,holder_name,bank_name,bank_last4,bank_ifsc,is_default,verified'),
      ]);
      const flags = await sbService(env,
        '/reconciliation_flags?user_id=eq.' + user.id + '&status=eq.open' +
        '&select=id,currency,discrepancy,created_at&limit=5');
      const tax = await sbService(env,
        '/seller_tax?user_id=eq.' + user.id + '&select=country,pan,is_individual&limit=1');
      const payouts = await sbService(env,
        '/payout_requests?user_id=eq.' + user.id +
        '&order=requested_at.desc&limit=50' +
        '&select=id,amount,currency,status,destination,review_note,requested_at,paid_at');

      return json({
        ok: true,
        summary: Array.isArray(summary) ? summary : [],
        history: history || [],
        methods: methods || [],
        payouts: payouts || [],
        tax: (tax && tax[0]) || null,
        flags: flags || [],
        minPayouts: MIN_PAYOUT,
        minDefault: MIN_DEFAULT,
        sendableKinds: ['paypal_email'],
        withdrawable: await withdrawable(env, user.id),
      });
    }

    if (body.action === 'method-add') {
      const kind = String(body.kind || '');
      const label = String(body.label || '').slice(0, 40) || null;
      let row = { user_id: user.id, kind, label, is_default: false };

      if (kind === 'paypal_email') {
        const email = String(body.paypalEmail || '').trim();
        if (!EMAIL_RE.test(email))
          return json({ error: 'That does not look like an email address' }, 400);
        row.provider = 'paypal';
        row.paypal_email = email;
      } else if (kind === 'upi') {
        const vpa = String(body.upi || '').trim().toLowerCase();
        if (!/^[a-z0-9.\-_]{2,64}@[a-z][a-z0-9.\-]{1,40}$/.test(vpa))
          return json({ error: 'That does not look like a UPI ID' }, 400);
        row.provider = 'razorpay';
        row.upi_vpa = vpa;
      } else if (kind === 'bank_account') {
        const holder = String(body.holderName || '').trim().slice(0, 80);
        const acct   = String(body.accountNumber || '').replace(/\s+/g, '');
        const ifsc   = String(body.ifsc || '').trim().toUpperCase();
        if (holder.length < 2) return json({ error: 'Account holder name is required' }, 400);
        if (!/^[0-9]{6,20}$/.test(acct)) return json({ error: 'That does not look like an account number' }, 400);
        if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))
          return json({ error: 'That does not look like an IFSC code' }, 400);
        row.provider    = 'razorpay';
        row.holder_name = holder;
        row.bank_name   = String(body.bankName || '').trim().slice(0, 80) || null;
        row.bank_ifsc   = ifsc || null;
        row.bank_last4  = acct.slice(-4);
      } else {
        return json({ error: 'Unknown payout method' }, 400);
      }

      const existing = await sbService(env,
        '/payout_methods?user_id=eq.' + user.id + '&select=id&limit=6');
      if (existing && existing.length >= 5)
        return json({ error: 'You can keep up to five payout methods' }, 400);
      row.is_default = !(existing && existing.length);

      const made = await sbService(env, '/payout_methods', {
        method: 'POST', body: JSON.stringify(row),
      });
      return json({ ok: true, method: made && made[0] });
    }

    if (body.action === 'currency') {
      const cur = String(body.currency || '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(cur)) return json({ error: 'Pick a currency' }, 400);

      const priced = await sbService(env,
        '/subscription_prices?currency=eq.' + cur + '&select=plan&limit=1');
      if (!(priced && priced.length))
        return json({ error: cur + ' is not one of the supported currencies' }, 400);

      await sbService(env, '/profiles?id=eq.' + user.id, {
        method: 'PATCH', body: JSON.stringify({ currency: cur }),
      });
      return json({ ok: true, currency: cur });
    }

    if (body.action === 'tax') {
      const country = String(body.country || 'IN').toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) return json({ error: 'Pick a country' }, 400);
      const pan = String(body.pan || '').trim().toUpperCase();
      if (country === 'IN' && pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))
        return json({ error: 'That does not look like a PAN' }, 400);
      await sbService(env, '/seller_tax', {
        method: 'POST',
        headers: { prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: user.id, country, pan: pan || null,
          is_individual: body.isIndividual !== false,
          updated_at: new Date().toISOString(),
        }),
      });
      return json({ ok: true });
    }

    if (body.action === 'method-remove') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad id' }, 400);
      const open = await sbService(env,
        '/payout_requests?user_id=eq.' + user.id +
        '&status=in.(requested,approved,processing)&select=id&limit=1');
      if (open && open.length)
        return json({ error: 'You have a payout in progress — wait for it to finish' }, 400);
      const gone = await sbService(env,
        '/payout_methods?id=eq.' + id + '&user_id=eq.' + user.id, { method: 'DELETE' });

      const removedDefault = Array.isArray(gone) && gone[0] && gone[0].is_default;
      if (removedDefault) {
        const left = await sbService(env,
          '/payout_methods?user_id=eq.' + user.id +
          '&order=created_at.asc&select=id&limit=1');
        if (left && left[0]) {
          await sbService(env, '/payout_methods?id=eq.' + left[0].id,
            { method: 'PATCH', body: JSON.stringify({ is_default: true }) }).catch(() => {});
        }
      }
      return json({ ok: true });
    }

    if (body.action === 'method-default') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad id' }, 400);
      await sbService(env, '/payout_methods?user_id=eq.' + user.id + '&is_default=is.true',
        { method: 'PATCH', body: JSON.stringify({ is_default: false }) });
      const rows = await sbService(env, '/payout_methods?id=eq.' + id + '&user_id=eq.' + user.id,
        { method: 'PATCH', body: JSON.stringify({ is_default: true }) });
      if (!(Array.isArray(rows) && rows.length)) return json({ error: 'No such method' }, 404);
      return json({ ok: true });
    }

    if (body.action === 'balance') {
      return json({ ok: true, withdrawable: await withdrawable(env, user.id) });
    }

    if (body.action === 'request') {
      const currency = String(body.currency || '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return json({ error: 'Pick a currency to withdraw' }, 400);
      const amount   = Math.round(Number(body.amount));
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Bad amount' }, 400);

      const flags = await sbService(env,
        '/reconciliation_flags?user_id=eq.' + user.id +
        '&status=eq.open&select=id&limit=1');
      if (flags && flags.length)
        return json({ error: 'Withdrawals are paused on this account while a balance check is reviewed. Please contact support.', flagged: true }, 409);

      const methods = await sbService(env,
        '/payout_methods?user_id=eq.' + user.id + '&is_default=is.true' +
        '&select=kind,paypal_email,upi_vpa,bank_last4&limit=1');
      const m = methods && methods[0];
      const dest = m && (m.paypal_email || m.upi_vpa ||
                         (m.bank_last4 ? 'bank ****' + m.bank_last4 : null));
      if (!dest) return json({ error: 'Add a payout method before requesting a payout' }, 400);
      if (m.kind !== 'paypal_email')
        return json({ error: 'Only PayPal payouts can be sent automatically right now' }, 400);

      if (!PP_PAYOUT_CURRENCIES.has(currency))
        return json({ error: 'PayPal cannot pay out in ' + currency +
          '. Your ' + currency + ' balance stays as it is — nothing is converted — ' +
          'until a payout route for it is available. Contact support if you need it sooner.' }, 400);

      const rec = await reconciled(env, user.id, currency);
      if (!rec.ok) {
        return json({
          error: rec.reason === 'mismatch'
            ? 'Your balance could not be verified. Withdrawals are paused on this account as a precaution — please contact support.'
            : 'Balance verification is unavailable right now. Please try again shortly.',
          flagged: rec.reason === 'mismatch',
        }, 409);
      }

      const avail = (await withdrawable(env, user.id))[currency] || 0;
      if (!avail)
        return json({ error: 'You have no ' + currency + ' balance to withdraw' }, 400);
      if (amount > avail)
        return json({ error: 'You can withdraw at most ' + toValue(avail, currency) + ' ' + currency }, 400);
      const min = minPayout(currency);
      if (amount < min)
        return json({ error: 'Minimum payout is ' + toValue(min, currency) + ' ' + currency }, 400);

      const covering = await sbService(env,
        '/marketplace_earnings?seller_id=eq.' + user.id +
        '&status=eq.available&currency=eq.' + currency +
        '&available_at=lte.' + new Date().toISOString() +
        '&select=gross_amount,net_amount,tds_amount&order=created_at.asc');
      let left = amount, grossBasis = 0, tdsAlready = 0;
      for (const e of covering || []) {
        if (left <= 0) break;
        grossBasis += Number(e.gross_amount || 0);
        tdsAlready += Number(e.tds_amount || 0);
        left -= Number(e.net_amount || 0);
      }

      const rows = await sbService(env, '/payout_requests', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id, amount, currency,
          method: 'paypal', destination: dest, status: 'requested',
          gross_basis: grossBasis,
          tds_amount: tdsAlready, tds_bps: 0, net_amount: amount,
        }),
      });
      const made = Array.isArray(rows) && rows[0];

      if (made) {
        const pot = await earnedAvailable(env, user.id, currency);
        const claimed = await claimedTotal(env, user.id, currency,
          ['requested', 'approved', 'processing'], null);
        if (claimed > pot) {
          await sbService(env, '/payout_requests?id=eq.' + made.id + '&status=eq.requested', {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'rejected',
              review_note: 'Withdrawn automatically — another request for the same balance was already open',
              decided_at: new Date().toISOString(),
            }),
          }).catch(() => {});
          return json({ error: 'Another payout request for this balance is already open — ' +
                               'check your payouts list and try again.' }, 409);
        }
      }

      return json({ ok: true, request: made, tds: 0, net: amount,
                    tdsAlreadyWithheld: tdsAlready });
    }

    if (body.action === 'cancel') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request id' }, 400);
      const rows = await sbService(env,
        '/payout_requests?id=eq.' + id + '&user_id=eq.' + user.id + '&status=eq.requested', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', review_note: 'Cancelled by the seller',
                               decided_at: new Date().toISOString() }),
      });
      if (!(Array.isArray(rows) && rows.length))
        return json({ error: 'That request can no longer be cancelled' }, 400);
      return json({ ok: true });
    }

    if (!String(body.action || '').startsWith('admin-'))
      return json({ error: 'Unknown action' }, 400);
    if (!(await isAdmin(env, user.id))) return json({ error: 'Not allowed' }, 403);

    if (body.action === 'admin-list') {
      const status = String(body.status || 'requested');
      if (!/^[a-z,]{1,60}$/.test(status)) return json({ error: 'Bad filter' }, 400);
      const rows = await sbService(env,
        '/payout_requests?status=in.(' + status + ')' +
        '&select=*&order=requested_at.asc&limit=200');
      return json({ ok: true, requests: rows || [] });
    }

    if (body.action === 'admin-decide') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request id' }, 400);
      const approve = !!body.approve;

      const reqs = await sbService(env,
        '/payout_requests?id=eq.' + id + '&status=eq.requested&select=*&limit=1');
      const req = reqs && reqs[0];
      if (!req) return json({ error: 'No such open request' }, 404);

      if (approve) {
        const total = await earnedAvailable(env, req.user_id, req.currency);
        const committed = await claimedTotal(env, req.user_id, req.currency,
          ['approved', 'processing'], req.id);
        if (total < Number(req.amount) + committed)
          return json({ error: committed
            ? 'This seller already has ' + toValue(committed, req.currency) + ' ' +
              req.currency + ' approved or in flight; the balance does not cover both'
            : 'Balance has fallen below the requested amount — reject or ask them to re-request' }, 400);
      }

      const rows = await sbService(env, '/payout_requests?id=eq.' + id + '&status=eq.requested', {
        method: 'PATCH',
        body: JSON.stringify({
          status: approve ? 'approved' : 'rejected',
          review_note: String(body.note || '').slice(0, 500) || null,
          decided_at: new Date().toISOString(),
        }),
      });
      return json({ ok: true, request: rows && rows[0] });
    }

    if (body.action === 'admin-send') {
      for (const k of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'])
        if (!env[k]) return json({ error: 'PayPal is not configured (' + k + ' missing)' }, 503);

      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request id' }, 400);

      const claimed = await sbService(env, '/payout_requests?id=eq.' + id + '&status=eq.approved', {
        method: 'PATCH', body: JSON.stringify({ status: 'processing' }),
      });
      const req = Array.isArray(claimed) && claimed[0];
      if (!req) return json({ error: 'That request is not approved and waiting' }, 400);

      const pot = await earnedAvailable(env, req.user_id, req.currency);
      const alsoInFlight = await claimedTotal(env, req.user_id, req.currency,
        ['processing'], req.id);
      if (pot < Number(req.amount) + alsoInFlight) {
        await sbService(env, '/payout_requests?id=eq.' + req.id + '&status=eq.processing', {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'approved',
            review_note: 'Not sent: the available balance no longer covers this request',
          }),
        }).catch(() => {});
        return json({ error: 'The available balance no longer covers this request — nothing was sent' }, 409);
      }

      const batchId = 'dzpo_' + req.id.slice(0, 8) + '_' + Date.now();
      const retiredIds = [];
      try {
        const out = await pp(env, '/v1/payments/payouts', {
          method: 'POST',
          headers: { 'paypal-request-id': batchId },
          body: JSON.stringify({
            sender_batch_header: {
              sender_batch_id: batchId,
              email_subject: 'Your DigiArtz payout',
              email_message: 'Your marketplace earnings have been sent.',
            },
            items: [{
              recipient_type: 'EMAIL',
              receiver: req.destination,
              amount: { value: toValue(req.net_amount != null ? req.net_amount : req.amount,
                                       req.currency), currency: req.currency },
              note: 'DigiArtz marketplace earnings',
              sender_item_id: req.id,
            }],
          }),
        }, 'Payout');

        const bid = (out.batch_header && out.batch_header.payout_batch_id) || batchId;

        const earned = await sbService(env,
          '/marketplace_earnings?seller_id=eq.' + req.user_id +
          '&status=eq.available&currency=eq.' + req.currency +
          '&available_at=lte.' + new Date().toISOString() +
          '&select=id,net_amount&order=created_at.asc');
        let left = Number(req.amount), retired = 0;
        for (const e of earned || []) {
          if (left <= 0) break;
          await sbService(env, '/marketplace_earnings?id=eq.' + e.id, {
            method: 'PATCH', body: JSON.stringify({ status: 'paid_out' }),
          });
          retiredIds.push(e.id);
          retired += Number(e.net_amount || 0);
          left -= Number(e.net_amount || 0);
        }

        await ledger(env, {
          p_user: req.user_id, p_type: 'payout_debit', p_direction: 'debit',
          p_amount: retired, p_currency: req.currency,
          p_source: 'paypal', p_provider_txn: bid,
          p_provider_amount: req.net_amount != null ? req.net_amount : req.amount,
          p_provider_currency: req.currency,
          p_ref_table: 'payout_requests', p_ref_id: req.id,
          p_note: req.tds_amount ? 'net of tax withheld' : null,
        });

        const confirmable = !!env.PAYPAL_WEBHOOK_ID;
        await sbService(env, '/payout_requests?id=eq.' + req.id, {
          method: 'PATCH',
          body: JSON.stringify(confirmable
            ? { batch_id: bid, review_note: 'Sent, waiting for PayPal to confirm delivery' }
            : { status: 'paid', batch_id: bid, paid_at: new Date().toISOString() }),
        });
        return json({ ok: true, batchId: bid, confirmed: !confirmable });
      } catch (err) {
        await sbService(env, '/payout_requests?id=eq.' + req.id, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'approved',
            review_note: 'Not sent \u2014 the provider refused. See the edge log for its reason.',
          }),
        }).catch(() => {});
        if (retiredIds.length) {
          await sbService(env,
            '/marketplace_earnings?status=eq.paid_out' +
            '&id=in.(' + retiredIds.join(',') + ')', {
            method: 'PATCH', body: JSON.stringify({ status: 'available' }),
          }).catch(() => {});
        }
        return safeError(err, 'The payout could not be sent. It is back in the approved queue.', 502);
      }
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return safeError(err, 'The payout service is not answering \u2014 try again shortly.', 500);
  }
}
