import { safeError } from '../lib/http.js';
import { sbUrl, sbAnon, sbSvc, sbUser, underLimit, sbService } from '../lib/sb.js';
import { pp } from '../lib/paypal.js';
import { fromPriceCents, toValue, toMinor, ppFee } from '../lib/money.js';
import {
  memberCurrency, subscriptionAmount, marketplaceItem, alreadyPaid, resolvePromo,
  PLAN_TIERS, PLAN_LABEL, applySubscription, recordEarning
} from '../lib/billing.js';

const SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'NZD', 'SGD', 'HKD', 'MXN',
  'BRL', 'ILS', 'PHP', 'THB', 'TWD']);

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

async function makeOrder(env, user, { minor, currency, kind, plan, itemId, label, promoId }) {
  const order = await pp(env, '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'paypal-request-id': 'dz_' + user.id.slice(0, 8) + '_' + Date.now() },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: 'dz_' + Date.now(),
        description: String(label || 'DigiArtz').slice(0, 127),
        custom_id: user.id,
        amount: { currency_code: currency, value: toValue(minor, currency) },
      }],
      application_context: {
        brand_name: 'DigiArtz',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  });
  if (!order.id) throw new Error('Payment provider error');

  await sbService(env, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      user_id: user.id, kind, plan: plan || null, item_id: itemId || null,
      amount: minor, currency, provider: 'paypal',
      promo_code_id: promoId || null,
      order_label: label ? String(label).slice(0, 200) : null,
      pp_order_id: order.id, status: 'created',
    }),
  });
  return json({
    orderId: order.id,
    clientId: env.PAYPAL_CLIENT_ID,
    amount: minor,
    currency,
    label,
  });
}

export async function onRequestGet({ env, request }) {
  if (!(await sbUser(env, request))) return json({ error: 'Sign in required' }, 401);
  const ready = !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET &&
                   sbUrl(env) && sbAnon(env) && sbSvc(env));
  return json({ enabled: ready });
}

export async function onRequestPost({ env, request }) {
  const missing = [
    ['PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID],
    ['PAYPAL_CLIENT_SECRET', env.PAYPAL_CLIENT_SECRET],
    ['SB_URL or SUPABASE_URL', sbUrl(env)],
    ['SB_KEY or SUPABASE_ANON_KEY', sbAnon(env)],
    ['SB_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY', sbSvc(env)],
  ].find(([, v]) => !v);
  if (missing) return json({ error: 'PayPal is not configured (' + missing[0] + ' missing)' }, 500);

  const user = await sbUser(env, request);
  if (!user) return json({ error: 'Sign in required' }, 401);

  if (!(await underLimit(env, 'pp:' + user.id, 30, 60)))
    return json({ error: 'Too many attempts — wait a moment' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  try {
    if (body.action === 'sub-order') {
      const key = String(body.plan || '');
      if (!(key in PLAN_TIERS)) return json({ error: 'Unknown plan' }, 400);

      const currency = await memberCurrency(env, user.id);
      if (!SUPPORTED.has(currency))
        return json({ error: 'PayPal cannot take ' + currency + ' \u2014 use the other checkout' }, 400);

      const order = await subscriptionAmount(env, request, user, body, key, currency);
      if (order.error) return json({ error: order.error }, 400);

      return await makeOrder(env, user, {
        minor: order.amount, currency, promoId: order.promoId,
        kind: 'subscription', plan: key, label: PLAN_LABEL[key],
      });
    }

    if (body.action === 'market-order') {
      const itemId = String(body.itemId || '');
      const found = await marketplaceItem(env, user, itemId);
      if (found.error) return json({ error: found.error }, found.status);
      const item = found.item;

      const currency = item.currency || 'USD';
      if (!SUPPORTED.has(currency))
        return json({ error: 'PayPal cannot take ' + currency + ' — use the other checkout' }, 400);

      if (await alreadyPaid(env, user, itemId)) return json({ owned: true });

      const promo = await resolvePromo(env, request, body.promo, 'marketplace');
      if (promo.error) return json({ error: promo.error }, 400);

      return await makeOrder(env, user, {
        minor: fromPriceCents(item.price_cents, currency),
        currency,
        kind: 'marketplace', itemId, promoId: promo.id,
        label: String(item.title || 'Marketplace item').slice(0, 120),
      });
    }

    if (body.action === 'capture') {
      const orderId = String(body.orderId || '');
      if (!/^[A-Z0-9]{6,64}$/i.test(orderId)) return json({ error: 'Bad request' }, 400);

      const rows = await sbService(env,
        '/payments?pp_order_id=eq.' + encodeURIComponent(orderId) +
        '&user_id=eq.' + user.id +
        '&select=id,user_id,kind,plan,item_id,amount,currency,status,promo_code_id&limit=1');
      const row = rows && rows[0];
      if (!row) return json({ error: 'Order does not belong to you' }, 403);

      let order;
      try {
        order = await pp(env, '/v2/checkout/orders/' + orderId + '/capture', {
          method: 'POST',
          headers: { 'paypal-request-id': 'cap_' + orderId },
          body: '{}',
        });
      } catch (err) {
        if (err.issue === 'ORDER_ALREADY_CAPTURED')
          order = await pp(env, '/v2/checkout/orders/' + orderId);
        else throw err;
      }

      const unit    = (order.purchase_units && order.purchase_units[0]) || {};
      const capture = (unit.payments && unit.payments.captures && unit.payments.captures[0]) || {};
      if (order.status !== 'COMPLETED' || capture.status !== 'COMPLETED')
        return json({ error: 'Payment not completed yet' }, 400);

      const paidAmount = capture.amount || {};
      if (paidAmount.currency_code !== row.currency ||
          paidAmount.value !== toValue(row.amount, row.currency))
        return json({ error: 'Payment amount does not match the order' }, 400);

      const paidRows = await sbService(env, '/payments?id=eq.' + row.id + '&status=eq.created', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'paid',
          pp_capture_id: String(capture.id || ''),
          paid_at: new Date().toISOString(),
        }),
      });
      const firstCapture = Array.isArray(paidRows) && paidRows.length > 0;

      await recordEarning(env, 'paypal', row, {
        txn: capture.id,
        amount: toMinor(paidAmount.value, row.currency),
        currency: paidAmount.currency_code,
        fee: ppFee(capture, row.currency),
      });

      let tier = null;
      if (row.kind === 'subscription') {
        const t = PLAN_TIERS[row.plan];
        if (t) {
          tier = firstCapture ? await applySubscription(env, user.id, t) : t;
        }
      }
      return json({ ok: true, kind: row.kind, tier });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return safeError(err, 'The payment could not be completed \u2014 try again.', 500);
  }
}
