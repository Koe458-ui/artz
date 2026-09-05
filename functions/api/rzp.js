import { safeError } from '../lib/http.js';
import { sbUrl, sbAnon, sbSvc, sbUser, underLimit, sbService, hmacMatches } from '../lib/sb.js';
import { fromPriceCents } from '../lib/money.js';
import {
  memberCurrency, subscriptionAmount, marketplaceItem, alreadyPaid, resolvePromo,
  PLAN_TIERS, PLAN_LABEL, applySubscription, recordEarning
} from '../lib/billing.js';

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

async function rzp(env, path, init = {}) {
  const res = await fetch('https://api.razorpay.com' + path, {
    ...init,
    headers: {
      authorization: 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET),
      'content-type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body.error && body.error.description) || 'Payment provider error (' + res.status + ')');
  return body;
}

const validSignature = (env, orderId, paymentId, signature) =>
  hmacMatches(env.RAZORPAY_KEY_SECRET, orderId + '|' + paymentId, signature);

async function makeOrder(env, user, { amount, currency, kind, plan, itemId, label, promoId }) {
  const order = await rzp(env, '/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount, currency,
      receipt: 'dz_' + Date.now(),
      notes: { kind, plan: plan || '', item_id: itemId || '', user_id: user.id },
    }),
  });
  await sbService(env, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      user_id: user.id, kind, plan: plan || null, item_id: itemId || null,
      amount, currency, provider: 'razorpay',
      promo_code_id: promoId || null,
      order_label: label ? String(label).slice(0, 200) : null,
      rzp_order_id: order.id, status: 'created',
    }),
  });
  return json({ orderId: order.id, keyId: env.RAZORPAY_KEY_ID, amount, currency, label });
}

export async function onRequestGet({ env, request }) {
  if (!(await sbUser(env, request))) return json({ error: 'Sign in required' }, 401);
  const ready = !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET &&
                   sbUrl(env) && sbAnon(env) && sbSvc(env));
  return json({ enabled: ready });
}

export async function onRequestPost({ env, request }) {
  const missing = [
    ['RAZORPAY_KEY_ID', env.RAZORPAY_KEY_ID],
    ['RAZORPAY_KEY_SECRET', env.RAZORPAY_KEY_SECRET],
    ['SB_URL or SUPABASE_URL', sbUrl(env)],
    ['SB_KEY or SUPABASE_ANON_KEY', sbAnon(env)],
    ['SB_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY', sbSvc(env)],
  ].find(([, v]) => !v);
  if (missing) return json({ error: 'Payment service not configured (' + missing[0] + ' missing)' }, 500);

  const user = await sbUser(env, request);
  if (!user) return json({ error: 'Sign in required' }, 401);

  if (!(await underLimit(env, 'rzp:' + user.id, 30, 60)))
    return json({ error: 'Too many attempts — wait a moment' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  try {
    if (body.action === 'sub-order') {
      const key = String(body.plan || '');
      if (!(key in PLAN_TIERS)) return json({ error: 'Unknown plan' }, 400);

      const currency = await memberCurrency(env, user.id);

      const order = await subscriptionAmount(env, request, user, body, key, currency);
      if (order.error) return json({ error: order.error }, 400);

      return await makeOrder(env, user, {
        amount: order.amount, currency, promoId: order.promoId,
        kind: 'subscription', plan: key, label: PLAN_LABEL[key],
      });
    }

    if (body.action === 'market-order') {
      const itemId = String(body.itemId || '');
      const found = await marketplaceItem(env, user, itemId);
      if (found.error) return json({ error: found.error }, found.status);
      const item = found.item;

      if (await alreadyPaid(env, user, itemId)) return json({ owned: true });

      const promo = await resolvePromo(env, request, body.promo, 'marketplace');
      if (promo.error) return json({ error: promo.error }, 400);

      return await makeOrder(env, user, {
        amount: fromPriceCents(item.price_cents, item.currency),
        currency: item.currency || 'USD',
        kind: 'marketplace', itemId, promoId: promo.id,
        label: String(item.title || 'Marketplace item').slice(0, 120),
      });
    }

    if (body.action === 'verify') {
      const { orderId, paymentId, signature } = body;
      if (!orderId || !paymentId) return json({ error: 'Bad request' }, 400);
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(orderId)) ||
          !/^[A-Za-z0-9_-]{6,64}$/.test(String(paymentId)))
        return json({ error: 'Bad request' }, 400);
      if (!(await validSignature(env, orderId, paymentId, signature)))
        return json({ error: 'Payment verification failed' }, 400);

      const order = await rzp(env, '/v1/orders/' + encodeURIComponent(orderId));
      if (order.status !== 'paid') return json({ error: 'Payment not completed yet' }, 400);
      const notes = order.notes || {};
      if (notes.user_id !== user.id) return json({ error: 'Order does not belong to you' }, 403);

      let gwFee = 0;
      try {
        const pay = await rzp(env, '/v1/payments/' + encodeURIComponent(String(paymentId)));
        if (pay && pay.currency === order.currency) gwFee = Number(pay.fee) || 0;
      } catch {   }

      const paidRows = await sbService(env,
        '/payments?rzp_order_id=eq.' + encodeURIComponent(orderId) + '&status=eq.created' +
        '&select=id,user_id,kind,item_id,amount,currency,promo_code_id', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'paid', rzp_payment_id: String(paymentId),
          paid_at: new Date().toISOString(),
        }),
      });
      const firstVerify = Array.isArray(paidRows) && paidRows.length > 0;
      if (firstVerify) await recordEarning(env, 'razorpay', paidRows[0], {
        txn: String(paymentId), amount: order.amount_paid || order.amount,
        currency: order.currency, fee: gwFee,
      });

      let tier = null;
      if (notes.kind === 'subscription') {
        const t = PLAN_TIERS[notes.plan];
        if (t) {
          tier = firstVerify ? await applySubscription(env, user.id, t) : t;
        }
      }
      return json({ ok: true, kind: notes.kind, tier });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return safeError(err, 'The payment could not be completed \u2014 try again.', 500);
  }
}
