(function () {
  'use strict';

  var STORE_PREFIX = 'ored.chats.v1';
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
  var authForm = document.getElementById('oAuthForm');
  var authGo = document.getElementById('oAuthGo');
  var authJoin = document.getElementById('oAuthJoin');
  var authNote = document.getElementById('oAuthNote');
  var emailField = document.getElementById('oEmail');
  var passField = document.getElementById('oPass');
  var seeds = document.getElementById('oSeeds');
  var socialBtns = Array.prototype.slice.call(document.querySelectorAll('.oSocialBtn'));

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
    say('');
    if (message) sayAuth(message, bad);
    emailField.focus();
  }

  function showChat(id) {
    userId = id;
    document.body.classList.remove('oOut');
    auth.hidden = true;
    sayAuth('');
    passField.value = '';
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

  authForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!sb) { sayAuth('Ored cannot reach the sign-in service right now. Refresh and try again.', true); return; }

    var email = emailField.value.trim();
    var password = passField.value;
    if (!email || !password) return;

    authGo.disabled = true;
    sayAuth('Signing in…');

    var result;
    try {
      result = await sb.auth.signInWithPassword({ email: email, password: password });
    } catch (e) {
      authGo.disabled = false;
      sayAuth('That did not go through. Check your connection and try again.', true);
      return;
    }

    authGo.disabled = false;

    if (result.error) {
      sayAuth(result.error.message || 'That did not work. Try again.', true);
      return;
    }

    var session = result.data && result.data.session;
    if (!session) { sayAuth('That did not work. Try again.', true); return; }

    showChat(session.user.id);
    input.focus();
  });

  var OAUTH_LABELS = { google: 'Google', discord: 'Discord', apple: 'Apple' };

  function socialBusy(value) {
    for (var i = 0; i < socialBtns.length; i++) socialBtns[i].disabled = value;
  }

  async function oauth(provider) {
    if (provider === 'apple') {
      sayAuth('Apple sign-in isn\u2019t available at the moment. Continue with Google or Discord.', true);
      return;
    }
    if (!sb) {
      sayAuth('Ored cannot reach the sign-in service right now. Refresh and try again.', true);
      return;
    }

    var label = OAUTH_LABELS[provider] || provider;
    socialBusy(true);
    sayAuth('Opening ' + label + '\u2026');

    var opts = { redirectTo: window.location.origin + '/' };
    if (provider === 'google') opts.queryParams = { prompt: 'select_account' };

    try {
      var result = await sb.auth.signInWithOAuth({ provider: provider, options: opts });
      if (result.error) throw result.error;
    } catch (e) {
      socialBusy(false);
      var raw = (e && e.message ? String(e.message) : '').toLowerCase();
      sayAuth(/provider is not enabled|unsupported provider/.test(raw)
        ? label + ' sign-in isn\u2019t available right now. Try another way.'
        : label + ' sign-in did not go through. Try again.', true);
    }
  }

  socialBtns.forEach(function (button) {
    button.addEventListener('click', function () {
      oauth(button.getAttribute('data-provider'));
    });
  });

  seeds.addEventListener('click', function (event) {
    var button = event.target.closest('.oSeed');
    if (!button) return;
    input.value = button.textContent.trim();
    grow();
    input.focus();
  });

  outBtn.addEventListener('click', async function () {
    if (sb) { try { await sb.auth.signOut(); } catch (e) {   } }
    showAuth('Signed out.');
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

  function oauthNotice() {
    var query = new URLSearchParams(window.location.search);
    var hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    var error = query.get('error_description') || query.get('error') ||
                hash.get('error_description') || hash.get('error') || '';
    var handled = error || query.has('code') || hash.has('access_token');
    if (handled) {
      try { window.history.replaceState({}, document.title, window.location.pathname); }
      catch (e) {   }
    }
    return error ? String(error).replace(/\+/g, ' ') : '';
  }

  async function boot() {
    authJoin.href = SITE_URL + '/login';

    if (window.supabase && AUTH_URL && AUTH_KEY) {
      try { sb = window.supabase.createClient(AUTH_URL, AUTH_KEY); }
      catch (e) { sb = null; }
    }

    if (!sb) {
      socialBusy(true);
      showAuth('Ored is not configured. ORED_AUTH_URL and ORED_AUTH_KEY are not set on the Worker.', true);
      return;
    }

    var session = null;
    try {
      var result = await sb.auth.getSession();
      session = result && result.data && result.data.session;
    } catch (e) { session = null; }

    var refused = oauthNotice();

    if (session) showChat(session.user.id);
    else showAuth(refused || '', !!refused);

    sb.auth.onAuthStateChange(function (event, next) {
      if (next && next.user) {
        if (next.user.id !== userId) showChat(next.user.id);
      } else if (userId) {
        showAuth('');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
