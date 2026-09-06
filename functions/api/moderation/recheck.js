import { json } from '../../lib/http.js';
import { sbUser, sbSvc, sbService, underLimit } from '../../lib/sb.js';
import {
  MODERATION_PROMPT, CATEGORIES, MESSAGES,
  RESOURCE_PROMPT, RESOURCE_CATEGORIES, RESOURCE_MESSAGES,
  decide, moderateWithGemini, toBase64
} from '../moderate-upload.js';

// One upload per call, oldest first. An unreachable moderator keeps an upload pending; this drains that queue in order

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Global single-flight: one tick every few seconds however many people have the site open
const TICK_SECONDS = 6;

// heads to look at before giving up this tick; bounds the work when several queued rows have unreadable images
const MAX_ATTEMPTS = 4;

// Everything moderation gates. Listing/resource judged as previews, artwork/blog cover as artwork. Only artworks carry a rating
const QUEUES = [
  { table: 'artworks',          image: 'image_url',   resource: false, records: true  },
  { table: 'blog_posts',        image: 'cover_url',   resource: false, records: false },
  { table: 'resources',         image: 'preview_url', resource: true,  records: false },
  { table: 'marketplace_items', image: 'preview_url', resource: true,  records: false }
];

export async function onRequestPost(context) {
  const { request, env } = context;

  const user = await sbUser(env, request);
  if (!user) return json({ error: 'Not signed in.' }, 401);
  if (!sbSvc(env)) return json({ processed: 0, down: true, more: false }, 200);

  if (!(await underLimit(env, 'modq:drain', 1, TICK_SECONDS))) {
    return json({ processed: null, busy: true, more: true }, 200);
  }

  let waiting;
  try {
    waiting = await pending(env);
  } catch {
    return json({ error: 'Queue unavailable.' }, 503);
  }
  if (waiting.length === 0) return json({ processed: 0, more: false, down: false }, 200);

  for (let n = 0; n < Math.min(MAX_ATTEMPTS, waiting.length); n++) {
    const { queue, row, mode } = waiting[n];
    const more = waiting.length > n + 1;

    const image = await loadImage(row[queue.image]);

    if (!image.ok && mode === 'verify') {
      // What is published is not a readable image. A content-type that is not
      // an image at all is the shape the ticket weakness would produce, so that
      // one is demoted. The rest -- a fetch that failed, an empty body, an
      // oversized one -- are indistinguishable from a bad minute at the CDN, so
      // they are stamped and left alone rather than left to sit at the head of
      // the queue forever, blocking every row behind them.
      if (String(image.reason || '').startsWith('type ')) {
        await demote(env, context, queue, row, image.reason);
        return json({ processed: 1, more, down: false }, 200);
      }
      await markVerified(env, queue, row);
      continue;
    }

    if (!image.ok) continue;  // unreadable head; try the next one rather than stall

    const cfg = queue.resource
      ? { resource: true,  prompt: RESOURCE_PROMPT,   categories: RESOURCE_CATEGORIES }
      : { resource: false, prompt: MODERATION_PROMPT, categories: CATEGORIES };

    const verdict = await moderateWithGemini(env, image.b64, image.type, cfg);
    const call = decide(verdict, queue.resource);

      // still down; nothing changes and everything keeps its place in the queue
    if (call.deferred) return json({ processed: 0, down: true, more: true }, 200);

    await apply(env, context, queue, row, verdict, call, mode);

      // deliberately opaque: caller is whoever had the site open, not the uploader — says a tick happened, no more
    return json({ processed: 1, more, down: false }, 200);
  }

  return json({ processed: 0, skipped: true, more: waiting.length > MAX_ATTEMPTS }, 200);
}

// Two kinds of work, drained by the same tick.
//
//   'queued'  — status='pending'. The moderator was unreachable when this was
//               uploaded, so it has never been judged. Judging it publishes it.
//
//   'verify'  — status='approved' and never re-read. The approval ticket the
//               insert presented is signed over the member's id and nothing
//               else, so it says "this member passed a check", not "this row
//               is what passed". One clean check could therefore approve a row
//               whose image_url points at something else entirely, and the
//               image the site actually serves was never the image the
//               moderator saw. This pass closes that by moderating what got
//               published, from its public url, and demoting what fails.
//
// Queued rows come first: nothing they hold is public yet, and a member is
// waiting on the verdict.
async function pending(env) {
  const heads = await Promise.all(QUEUES.flatMap((queue) => {
    const cols = ['id', 'user_id', 'created_at', queue.image].join(',');
    const ask = (filter, mode) => sbService(env,
      `/${queue.table}?${filter}&select=${cols}` +
      `&order=created_at.asc&limit=${MAX_ATTEMPTS + 1}`, { method: 'GET' })
      .then(rows => (Array.isArray(rows) ? rows : []).map(row => ({ queue, row, mode })));

    return [
      ask('status=eq.pending', 'queued'),
      ask('status=eq.approved&mod_verified_at=is.null', 'verify'),
    ];
  }));

  const all = heads.flat();
  const byAge = (a, b) => String(a.row.created_at).localeCompare(String(b.row.created_at));
  return [
    ...all.filter(w => w.mode === 'queued').sort(byAge),
    ...all.filter(w => w.mode === 'verify').sort(byAge),
  ];
}

// A published row whose image cannot be judged as an image at all.
async function demote(env, context, queue, row, why) {
  await sbService(env,
    `/${queue.table}?id=eq.${encodeURIComponent(row.id)}&status=eq.approved`,
    { method: 'PATCH', body: JSON.stringify({
      status: 'rejected',
      mod_verified_at: new Date().toISOString(),
    }) });

  context.waitUntil(sbService(env, '/moderation_logs', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: row.user_id,
      allowed: false,
      code: 'PUBLISHED_IMAGE_UNREADABLE',
      rating: 'SAFE',
      confidence: null,
      audit: { verify: true, table: queue.table, row_id: row.id, reason: why },
    }),
  }).catch(() => {}));
}

// Stamped so the sweep does not come back to it every tick.
function markVerified(env, queue, row) {
  return sbService(env,
    `/${queue.table}?id=eq.${encodeURIComponent(row.id)}&status=eq.approved`,
    { method: 'PATCH',
      body: JSON.stringify({ mod_verified_at: new Date().toISOString() }) }).catch(() => {});
}

async function apply(env, context, queue, row, verdict, call, mode = 'queued') {
  const rating = (verdict.rating === 'MATURE') ? 'MATURE' : 'SAFE';
  const MSG = queue.resource ? RESOURCE_MESSAGES : MESSAGES;

  const audit = {
    model: env.GEMINI_MODEL || 'gemini-flash-latest',
    checked_at: new Date().toISOString(),
    queued: mode === 'queued',
    verify: mode === 'verify',
    images: [{
      i: 0,
      allow: !!verdict.allow,
      artwork: !!verdict.artwork,
      resource: !!verdict.resource,
      ai_generated: !!verdict.ai_generated,
      rating: verdict.rating || null,
      quality: verdict.quality || null,
      category: verdict.category || null,
      reason: verdict.reason || null,
      confidence: verdict.confidence ?? null,
      decision: call.pass ? 'pass' : call.code
    }]
  };

  const patch = { status: call.pass ? 'approved' : 'rejected' };
  if (queue.records) {
    patch.ai_moderation = call.pass ? audit
      : { ...audit, code: call.code, reason: MSG[call.code] || MSG.UNCLEAR };
    if (call.pass) {
      patch.content_rating = rating;
      patch.is_mature = rating === 'MATURE';
    }
  }

  // Either way the row has now been judged on what it actually serves, so it
  // never needs the verify pass again -- a pass stops it being picked up, and a
  // rejection takes it out of the approved set the pass reads.
  patch.mod_verified_at = new Date().toISOString();

    // filtered on the status it still has, so two racing ticks cannot both apply a verdict
  const was = mode === 'verify' ? 'approved' : 'pending';
  await sbService(env,
    `/${queue.table}?id=eq.${encodeURIComponent(row.id)}&status=eq.${was}`,
    { method: 'PATCH', body: JSON.stringify(patch) });

  context.waitUntil(sbService(env, '/moderation_logs', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: row.user_id,
      allowed: call.pass,
      code: call.pass ? (queue.resource ? 'RESOURCE_OK' : 'ARTWORK_OK') : call.code,
      rating,
      confidence: verdict.confidence ?? null,
      audit: { queued: mode === 'queued', verify: mode === 'verify',
               table: queue.table, row_id: row.id, images: audit.images }
    })
  }).catch(() => {}));
}

async function loadImage(url) {
  if (!url) return { ok: false, reason: 'no image' };
  let res;
  try { res = await fetch(url); } catch { return { ok: false, reason: 'unreachable' }; }
  if (!res.ok) return { ok: false, reason: 'http ' + res.status };

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) return { ok: false, reason: 'type ' + (type || 'unknown') };

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) return { ok: false, reason: 'empty' };
  if (buf.byteLength > MAX_BYTES) return { ok: false, reason: 'too large' };

  return { ok: true, b64: toBase64(buf), type };
}
