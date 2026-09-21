import { authUrl, authKey, oredUrl, oredSvc, oredUser, oredService, oredUnderLimit } from '../lib/ored-sb.js';
import { UUID_RE, json, safeError, sameOrigin } from '../lib/ored-http.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURNS = 20;
const SEND_LIMIT = 20;
const SEND_WINDOW = 60;
const UPSTREAM_TIMEOUT_MS = 30000;

const endpoint = (env) => String(env.ORED_API_URL || '').trim();
const upstreamKey = (env) => String(env.ORED_API_KEY || '').trim();

const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

function history(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn && turn.role === 'assistant' ? 'assistant' : 'user',
      content: text(turn && turn.content, MAX_MESSAGE_CHARS),
    }))
    .filter((turn) => turn.content);
}

async function ask(env, payload) {
  const url = endpoint(env);
  const key = upstreamKey(env);
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = 'Bearer ' + key;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) return null;

  const reply = text(body.reply || body.response || body.text, MAX_MESSAGE_CHARS);
  if (!reply) return null;

  return { reply, model_version: text(body.model_version, 64) };
}

async function owns(env, conversationId, userId, title) {
  await oredService(env, '/ored_conversations', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: conversationId, user_id: userId, title: title }),
  });
  const rows = await oredService(env,
    `/ored_conversations?select=id&id=eq.${conversationId}&user_id=eq.${userId}&limit=1`);
  return Array.isArray(rows) && rows.length === 1;
}

async function remember(env, conversationId, userId, message, answer) {
  if (!oredSvc(env) || !UUID_RE.test(conversationId) || !UUID_RE.test(userId)) return;
  try {
    const title = message.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!(await owns(env, conversationId, userId, title))) return;
    await oredService(env, '/ored_messages', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify([
        { conversation_id: conversationId, role: 'user', content: message },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: answer.reply,
          model_version: answer.model_version || null,
        },
      ]),
    });
  } catch (err) {
    console.error('[ored] history not written :: ' + ((err && err.message) || String(err)));
  }
}

const ACTIONS = {
  state: {
    auth: false,
    async run({ env, user }) {
      return json({ ok: true, signed_in: !!user, connected: !!endpoint(env) }, 200);
    },
  },

  send: {
    auth: true,
    async run({ env, body, user }) {
      const message = text(body.message, MAX_MESSAGE_CHARS);
      if (!message) return json({ error: 'Write something first' }, 400);

      if (!(await oredUnderLimit(env, 'ored:send:' + user.id, SEND_LIMIT, SEND_WINDOW)))
        return json({ error: 'Too many messages — wait a moment' }, 429);

      if (!endpoint(env))
        return json({ error: 'Ored is still in training and is not answering yet', code: 'offline' }, 503);

      const answer = await ask(env, {
        conversation_id: text(body.conversation_id, 64),
        user_id: user.id,
        message,
        history: history(body.history),
      });

      if (!answer) return json({ error: 'Ored could not answer that right now' }, 502);

      await remember(env, text(body.conversation_id, 64), user.id, message, answer);

      return json({ ok: true, ...answer }, 200);
    },
  },
};

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!sameOrigin(request, env)) return json({ error: 'Not allowed' }, 403);
  if (!authUrl(env) || !authKey(env)) return json({ error: 'Not configured' }, 503);
  if (!oredUrl(env) || !oredSvc(env)) return json({ error: 'Not configured' }, 503);

  let body = {};
  try { body = (await request.json()) || {}; }
  catch { return json({ error: 'Bad request' }, 400); }

  const name = String(body.action || '');
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, name))
    return json({ error: 'Unknown action' }, 404);

  const action = ACTIONS[name];
  const user = await oredUser(env, request);
  if (action.auth && !user) return json({ error: 'Sign in required' }, 401);

  try {
    return await action.run({ env, request, body, user });
  } catch (err) {
    return safeError(err, 'Something went wrong', 500);
  }
}

export const onRequestGet = () => json({ error: 'Not found' }, 404);
