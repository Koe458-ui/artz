import { safeError } from '../lib/http.js';
import { sbUrl, sbSvc, sbService, ledger, hmacMatches } from '../lib/sb.js';
import {
  PLAN_TIERS, applySubscription, revokeSubscription, recordEarning
} from '../lib/billing.js';

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

const signed = (env, raw, signature) =>
  hmacMatches(env.RAZORPAY_WEBHOOK_SECRET, raw, signature);

async function rowFor(env, orderId, select) {
  const rows = await sbService(env,
    '/payments?rzp_order_id=eq.' + encodeURIComponent(orderId) +
    '&provider=eq.razorpay&select=' + select + '&limit=1');
  return (rows && rows[0]) || null;
}

async function fulfil(env, orderId, payment) {
  const row = await rowFor(env, orderId,
    'id,user_id,kind,plan,item_id,amount,currency,status,promo_code_id');
  if (!row) return 'no ledger row';

  const paid = Number(payment && payment.amount);
  const cur  = String((payment && payment.currency) || '');
  if (Number.isFinite(paid) && paid !== Number(row.amount)) return 'amount mismatch';
  if (cur && cur !== String(row.currency)) return 'currency mismatch';

  const patched = await sbService(env, '/payments?id=eq.' + row.id + '&status=eq.created', {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'paid',
      rzp_payment_id: String((payment && payment.id) || ''),
      paid_at: new Date().toISOString(),
    }),
  });
  const first = Array.isArray(patched) && patched.length > 0;

  await recordEarning(env, 'razorpay', row, {
    txn: (payment && payment.id) || null,
    amount: Number.isFinite(paid) ? paid : null,
    currency: cur || row.currency,
    fee: Number(payment && payment.fee) || 0,
  });

  if (!first) return 'already settled';

  if (row.kind === 'subscription' && PLAN_TIERS[row.plan]) {
    await applySubscription(env, row.user_id, PLAN_TIERS[row.plan]);
  }
  return 'settled';
}

async function reverseRow(env, row, status) {
  const patched = await sbService(env, '/payments?id=eq.' + row.id + '&status=eq.paid', {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
  if (!(Array.isArray(patched) && patched.length)) return 'not a settled payment';

  await sbService(env, '/marketplace_earnings?payment_id=eq.' + row.id +
    '&status=in.(pending,available)', {
    method: 'PATCH', body: JSON.stringify({ status: 'reversed' }),
  }).catch(() => {});

  if (row.kind === 'subscription' && PLAN_TIERS[row.plan]) {
    await revokeSubscription(env, row.user_id).catch(() => {});
  }
  return status;
}

async function refunded(env, orderId, payment, refund) {
  const row = await rowFor(env, orderId, 'id,user_id,kind,plan,status,amount');
  if (!row) return 'no ledger row';

  const gross = Number(payment && payment.amount) || Number(row.amount) || 0;
  const back  = Number.isFinite(Number(payment && payment.amount_refunded))
    ? Number(payment.amount_refunded)
    : Number((refund && refund.amount) || 0);

  if (!(gross > 0) || back < gross) return 'partial refund, purchase stands';
  return reverseRow(env, row, 'refunded');
}

async function disputeOpened(env, orderId) {
  const row = await rowFor(env, orderId, 'id,user_id,kind');
  if (!row) return 'no ledger row';
  await sbService(env, '/marketplace_earnings?payment_id=eq.' + row.id + '&status=eq.available', {
    method: 'PATCH', body: JSON.stringify({ status: 'pending' }),
  }).catch(() => {});
  return 'held pending dispute';
}

export async function onRequestPost({ env, request }) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !sbUrl(env) || !sbSvc(env))
    return json({ error: 'not configured' }, 503);

  const raw = await request.text().catch(() => '');
  if (!raw) return json({ error: 'bad body' }, 400);

  if (!(await signed(env, raw, request.headers.get('x-razorpay-signature'))))
    return json({ error: 'signature check failed' }, 401);

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'bad body' }, 400); }

  const type    = String(event.event || '');
  const payload = event.payload || {};
  const payment = (payload.payment && payload.payment.entity) || null;
  const order   = (payload.order && payload.order.entity) || null;
  const refund  = (payload.refund && payload.refund.entity) || null;

  const orderId = (payment && payment.order_id) || (order && order.id) || '';

  try {
    if (!orderId) return json({ ok: true, skipped: 'no order id' });

    if (type === 'payment.captured' || type === 'order.paid')
      return json({ ok: true, result: await fulfil(env, orderId, payment) });

    if (type === 'payment.failed')
      return json({ ok: true, skipped: 'attempt failed, order still open' });

    if (type === 'refund.created' || type === 'refund.processed')
      return json({ ok: true, result: await refunded(env, orderId, payment, refund) });

    if (type === 'payment.dispute.created')
      return json({ ok: true, result: await disputeOpened(env, orderId) });

    if (type === 'payment.dispute.lost') {
      const row = await rowFor(env, orderId, 'id,user_id,kind,plan,status');
      return json({ ok: true, result: row ? await reverseRow(env, row, 'refunded') : 'no ledger row' });
    }

    return json({ ok: true, skipped: type });
  } catch (err) {
    return safeError(err, 'handler failed', 500);
  }
}
