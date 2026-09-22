(function () {
  'use strict';

  var STORE_PREFIX = 'ored.chats.v1';
  var HANDOFF_PATH = '/authorize';
  var STATE_KEY = 'ored.sso.state';
  var TRIED_KEY = 'ored.sso.tried';
  var OFF_KEY = 'ored.sso.off';
  var SEEN_KEY = 'ored.sso.seen';
  var MAX_CHATS = 50;
  var MAX_HISTORY_TURNS = 20;
  var TITLE_CHARS = 60;

  var cfg = window.ORED_CONFIG || {};
  var AUTH_URL = String(cfg.AUTH_URL || '');
  var AUTH_KEY = String(cfg.AUTH_KEY || '');
  var SITE_URL = String(cfg.SITE_URL || 'https://digiartz.net');
  var sb = null;

  var main = document.getElementById('oMain');
  var thread = document.getElementById('oThread');
  var form = document.getElementById('oForm');
  var input = document.getElementById('oInput');
  var sendBtn = document.getElementById('oSend');
  var note = document.getElementById('oNote');
  var newBtn = document.getElementById('oNew');
  var menuBtn = document.getElementById('oMenu');
  var outBtn = document.getElementById('oOut');
  var panel = document.getElementById('oHistory');
  var panelClose = document.getElementById('oHistoryClose');
  var list = document.getElementById('oHistoryList');
  var empty = document.getElementById('oHistoryEmpty');
  var scrim = document.getElementById('oScrim');

  var auth = document.getElementById('oAuth');
  var authGo = document.getElementById('oAuthGo');
  var authJoin = document.getElementById('oAuthJoin');
  var authNote = document.getElementById('oAuthNote');
  var seeds = document.getElementById('oSeeds');

  var chats = [];
  var activeId = '';
  var busy = false;
  var userId = '';

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function storeKey() {
    return userId ? STORE_PREFIX + ':' + userId : '';
  }

  function flagGet(store, key) {
    try { return window[store].getItem(key) || ''; } catch (e) { return ''; }
  }

  function flagSet(store, key, value) {
    try { window[store].setItem(key, value); } catch (e) {   }
  }

  function flagDrop(store, key) {
    try { window[store].removeItem(key); } catch (e) {   }
  }

  function read() {
    var key = storeKey();
    if (!key) return [];
    var parsed = [];
    try {
      var raw = window.localStorage.getItem(key);
      parsed = raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (chat) {
      return chat && typeof chat.id === 'string' && Array.isArray(chat.messages);
    });
  }

  function write() {
    var key = storeKey();
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(chats.slice(0, MAX_CHATS)));
    } catch (e) {   }
  }

  function current() {
    for (var i = 0; i < chats.length; i++) if (chats[i].id === activeId) return chats[i];
    return null;
  }

  function startChat() {
    var chat = { id: uid(), title: '', updated: Date.now(), messages: [] };
    chats.unshift(chat);
    activeId = chat.id;
    return chat;
  }

  function titleFor(chat) {
    if (chat.title) return chat.title;
    for (var i = 0; i < chat.messages.length; i++) {
      if (chat.messages[i].role !== 'user') continue;
      var line = chat.messages[i].content.replace(/\s+/g, ' ').trim();
      return line.length > TITLE_CHARS ? line.slice(0, TITLE_CHARS - 1) + '…' : line;
    }
    return 'New chat';
  }

  function say(message, bad) {
    note.textContent = message || '';
    note.classList.toggle('oNoteBad', !!bad);
  }

  function sayAuth(message, bad) {
    authNote.textContent = message || '';
    authNote.classList.toggle('oNoteBad', !!bad);
  }

  function bubble(role, content, failed) {
    var turn = document.createElement('div');
    turn.className = 'oTurn' + (role === 'user' ? ' oMine' : '');
    var box = document.createElement('div');
    box.className = 'oBubble' + (failed ? ' oFailed' : '');
    box.textContent = content;
    turn.appendChild(box);
    return turn;
  }

  function renderThread() {
    var chat = current();
    thread.textContent = '';
    var messages = chat ? chat.messages : [];
    for (var i = 0; i < messages.length; i++) {
      thread.appendChild(bubble(messages[i].role, messages[i].content, messages[i].failed));
    }
    document.body.classList.toggle('oEmpty', messages.length === 0);
    if (messages.length) main.scrollTop = main.scrollHeight;
  }

  function renderHistory() {
    list.textContent = '';
    for (var i = 0; i < chats.length; i++) {
      if (!chats[i].messages.length) continue;
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'oHistoryItem';
      button.textContent = titleFor(chats[i]);
      button.setAttribute('data-id', chats[i].id);
      if (chats[i].id === activeId) button.setAttribute('aria-current', 'true');
      item.appendChild(button);
      list.appendChild(item);
    }
    empty.hidden = list.childElementCount > 0;
  }

  function openHistory() {
    renderHistory();
    panel.hidden = false;
    scrim.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    var first = list.querySelector('.oHistoryItem');
    (first || panelClose).focus();
  }

  function closeHistory(refocus) {
    panel.hidden = true;
    scrim.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (refocus) menuBtn.focus();
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  function setBusy(value) {
    busy = value;
    sendBtn.disabled = value;
    input.readOnly = value;
  }

  function showAuth(message, bad) {
    userId = '';
    chats = [];
    activeId = '';
    closeHistory(false);
    thread.textContent = '';
    document.body.classList.add('oOut');
    document.body.classList.remove('oEmpty');
    auth.hidden = false;
    settle();
    say('');
    sayAuth(message || '', bad);
    authGo.disabled = false;
    try { authGo.focus({ preventScroll: true }); } catch (e) {   }
  }

  function showChat(id) {
    userId = id;
    document.body.classList.remove('oOut');
    auth.hidden = true;
    settle();
    sayAuth('');
    chats = read();
    if (!chats.length || chats[0].messages.length) startChat();
    else activeId = chats[0].id;
    renderThread();
    renderHistory();
    say('');
  }

  async function token() {
    if (!sb) return '';
    try {
      var result = await sb.auth.getSession();
      var session = result && result.data && result.data.session;
      return session ? session.access_token : '';
    } catch (e) { return ''; }
  }

  async function post(payload, bearer) {
    var headers = { 'content-type': 'application/json' };
    if (bearer) headers.authorization = 'Bearer ' + bearer;
    var res = await fetch('/api/ored', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    var body = await res.json().catch(function () { return null; });
    return { status: res.status, body: body || {} };
  }

  async function send(text) {
    if (busy) return;

    if (!sb) {
      say('Ored cannot reach its server right now. Refresh and try again.', true);
      return;
    }

    var bearer = await token();
    if (!bearer) { showAuth('Your session expired. Sign in again.', true); return; }

    var chat = current() || startChat();
    var past = chat.messages.slice(-MAX_HISTORY_TURNS).map(function (m) {
      return { role: m.role, content: m.content };
    });

    chat.messages.push({ role: 'user', content: text, at: Date.now() });
    chat.title = titleFor(chat);
    chat.updated = Date.now();
    write();
    renderThread();

    setBusy(true);
    say('Ored is thinking…');

    var answer;
    try {
      answer = await post({
        action: 'send',
        conversation_id: chat.id,
        message: text,
        history: past
      }, bearer);
    } catch (e) {
      setBusy(false);
      say('That message could not be sent. Check your connection and try again.', true);
      return;
    }

    setBusy(false);

    if (answer.status === 401) { showAuth('Your session expired. Sign in again.', true); return; }

    if (!answer.body.ok) {
      say(answer.body.error || 'Ored could not answer that right now.', true);
      return;
    }

    say('');
    chat.messages.push({
      role: 'assistant',
      content: answer.body.reply,
      model: answer.body.model_version || '',
      at: Date.now()
    });
    chat.updated = Date.now();
    write();
    renderThread();
  }

  function siteOrigin() {
    try { return new URL(SITE_URL).origin; } catch (e) { return ''; }
  }

  var NO_SITE = 'Ored does not know where DigiArtz is. Refresh and try again.';

  function handoff(silent) {
    var origin = siteOrigin();
    if (!origin) return false;
    var state = uid();
    flagSet('sessionStorage', STATE_KEY, state);
    flagSet('sessionStorage', TRIED_KEY, '1');
    var url = origin + HANDOFF_PATH +
      '?redirect_uri=' + encodeURIComponent(window.location.origin + '/') +
      '&state=' + encodeURIComponent(state) +
      (silent ? '&prompt=none' : '');
    window.location.assign(url);
    return true;
  }

  function signIn() {
    flagDrop('sessionStorage', OFF_KEY);
    authGo.disabled = true;
    sayAuth('Taking you to DigiArtz\u2026');
    if (handoff(false)) return;
    authGo.disabled = false;
    sayAuth(NO_SITE, true);
  }

  authGo.addEventListener('click', signIn);

  seeds.addEventListener('click', function (event) {
    var button = event.target.closest('.oSeed');
    if (!button) return;
    input.value = button.textContent.trim();
    grow();
    input.focus();
  });

  outBtn.addEventListener('click', async function () {
    flagSet('sessionStorage', OFF_KEY, '1');
    flagDrop('localStorage', SEEN_KEY);
    if (sb) { try { await sb.auth.signOut(); } catch (e) {   } }
    showAuth('Signed out. You are still signed in on DigiArtz.');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    grow();
    send(text);
  });

  input.addEventListener('input', grow);

  input.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (window.matchMedia('(pointer:coarse)').matches) return;
    event.preventDefault();
    form.requestSubmit();
  });

  newBtn.addEventListener('click', function () {
    closeHistory(false);
    var chat = current();
    if (chat && !chat.messages.length) { input.focus(); return; }
    startChat();
    write();
    renderThread();
    say('');
    input.focus();
  });

  menuBtn.addEventListener('click', function () {
    if (panel.hidden) openHistory(); else closeHistory(true);
  });

  panelClose.addEventListener('click', function () { closeHistory(true); });
  scrim.addEventListener('click', function () { closeHistory(true); });

  list.addEventListener('click', function (event) {
    var button = event.target.closest('.oHistoryItem');
    if (!button) return;
    activeId = button.getAttribute('data-id');
    closeHistory(false);
    say('');
    renderThread();
    input.focus();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) closeHistory(true);
  });

  function settle() {
    document.body.classList.remove('oBooting');
  }

  function landing() {
    var hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    var query = new URLSearchParams(window.location.search);
    var pick = function (name) { return hash.get(name) || query.get(name) || ''; };

    var access = pick('access_token');
    var refresh = pick('refresh_token');
    var state = pick('state');
    var error = pick('error_description') || pick('error');
    var invited = query.has('sso') || query.get('from') === 'digiartz';

    if (!access && !error && !invited) return null;

    try { window.history.replaceState({}, document.title, window.location.pathname); }
    catch (e) {   }

    if (!access && !error) return { invited: true };

    var expected = flagGet('sessionStorage', STATE_KEY);
    flagDrop('sessionStorage', STATE_KEY);
    if (!expected || state !== expected)
      return { error: 'That sign-in could not be verified. Try again.' };

    var code = String(error || '').replace(/\+/g, ' ');
    if (/^(login|interaction|consent)_required$/.test(code)) return { quiet: true };
    if (code) return { error: code };
    if (!refresh) return { error: 'That sign-in did not come back complete. Try again.' };

    return { access_token: access, refresh_token: refresh };
  }

  function cameFromSite() {
    var origin = siteOrigin();
    if (!origin) return false;
    try { return new URL(document.referrer).origin === origin; } catch (e) { return false; }
  }

  function trySilently(invited) {
    if (flagGet('sessionStorage', TRIED_KEY)) return false;
    if (flagGet('sessionStorage', OFF_KEY)) return false;
    return !!invited || !!flagGet('localStorage', SEEN_KEY) || cameFromSite();
  }

  function watch() {
    sb.auth.onAuthStateChange(function (event, next) {
      if (next && next.user) {
        if (next.user.id !== userId) showChat(next.user.id);
      } else if (userId) {
        showAuth('');
      }
    });
  }

  async function adopt(back) {
    var result;
    try {
      result = await sb.auth.setSession({
        access_token: back.access_token,
        refresh_token: back.refresh_token
      });
    } catch (e) { result = null; }
    var session = result && result.data && result.data.session;
    if (!session || result.error) return null;
    return session;
  }

  async function boot() {
    authJoin.href = SITE_URL + '/login';

    if (window.supabase && AUTH_URL && AUTH_KEY) {
      try {
        sb = window.supabase.createClient(AUTH_URL, AUTH_KEY, {
          auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
        });
      } catch (e) { sb = null; }
    }

    if (!sb) {
      showAuth('Ored is not configured. ORED_AUTH_URL and ORED_AUTH_KEY are not set on the Worker.', true);
      authGo.disabled = true;
      return;
    }

    var back = landing();

    if (back && back.access_token) {
      var handed = await adopt(back);
      if (handed) {
        flagSet('localStorage', SEEN_KEY, '1');
        showChat(handed.user.id);
        watch();
        return;
      }
      showAuth('That sign-in did not go through. Try again.', true);
      watch();
      return;
    }

    var session = null;
    try {
      var result = await sb.auth.getSession();
      session = result && result.data && result.data.session;
    } catch (e) { session = null; }

    if (session) {
      showChat(session.user.id);
      watch();
      return;
    }

    if (back && back.quiet) {
      flagDrop('localStorage', SEEN_KEY);
      showAuth('');
    } else if (back && back.error) {
      showAuth(back.error, true);
    } else if (trySilently(back && back.invited)) {
      if (handoff(true)) return;
      showAuth(NO_SITE, true);
    } else {
      showAuth('');
    }

    watch();
  }

  function start() {
    boot().catch(function () {
      showAuth('Ored could not start. Refresh and try again.', true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
