(function () {
  'use strict';

  function $ (id) { return document.getElementById(id); }
  function data () { return window.ZEO_DATA || null; }

  var body = null;
  var open = false;
  var activeControls = null;

  function view () {
    var v = $('zeoChatView');
    if (v) return v;
    var host = $('cmChatPanel');
    if (!host) return null;
    v = document.createElement('div');
    v.className = 'cmChat zeoChat';
    v.id = 'zeoChatView';
    v.style.display = 'none';
    v.innerHTML = '<div class="zeoBody" id="zeoBody" aria-live="polite"></div>';
    host.appendChild(v);
    return v;
  }

  function scrollDown () {
    requestAnimationFrame(function () { if (body) body.scrollTop = body.scrollHeight; });
  }

  function lockActiveControls () {
    if (!activeControls) return;
    activeControls.classList.add('zeoLocked');
    var btns = activeControls.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    activeControls = null;
  }

  function advance (label, proceed) {
    lockActiveControls();
    say(label, true);
    proceed();
  }

  function say (text, mine) {
    var msg = document.createElement('div');
    msg.className = 'zeoMsg' + (mine ? ' zeoMsgUser' : '');
    var bub = document.createElement('div');
    bub.className = 'zeoMsgBubble';
    bub.textContent = text;
    msg.appendChild(bub);
    body.appendChild(msg);
    scrollDown();
    return msg;
  }

  function newControls () {
    var c = document.createElement('div');
    c.className = 'zeoStepControls';
    return c;
  }
  function commit (controls) {
    body.appendChild(controls);
    activeControls = controls;
    scrollDown();
  }

  function addOptions (container, items, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'zeoOptions';
    items.forEach(function (item) {
      var b = document.createElement('button');
      b.className = 'zeoOption';
      b.type = 'button';
      b.textContent = item.label;
      b.addEventListener('click', function () {
        if (b.disabled) return;
        advance(item.label, function () { onPick(item); });
      });
      wrap.appendChild(b);
    });
    container.appendChild(wrap);
  }

  function addCategories (container, categories, onPick) {
    if (!categories || !categories.length) {
      var ph = document.createElement('div');
      ph.className = 'zeoComingSoon';
      ph.textContent = 'Topics are coming soon.';
      container.appendChild(ph);
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'zeoCategories';
    categories.forEach(function (cat) {
      var card = document.createElement('button');
      card.className = 'zeoCatCard';
      card.type = 'button';
      var ico = document.createElement('span');
      ico.className = 'zeoCatIco';
      ico.textContent = cat.icon || '📂';
      var txt = document.createElement('span');
      txt.className = 'zeoCatTxt';
      var lbl = document.createElement('span');
      lbl.className = 'zeoCatLabel';
      lbl.textContent = cat.label;
      txt.appendChild(lbl);
      if (cat.description) {
        var d = document.createElement('span');
        d.className = 'zeoCatDesc';
        d.textContent = cat.description;
        txt.appendChild(d);
      }
      card.appendChild(ico); card.appendChild(txt);
      card.addEventListener('click', function () {
        if (card.disabled) return;
        advance(cat.label, function () { onPick(cat); });
      });
      wrap.appendChild(card);
    });
    container.appendChild(wrap);
  }

  function addBack (container, parentFn) {
    var b = document.createElement('button');
    b.className = 'zeoBackBtn';
    b.type = 'button';
    b.textContent = '← Back';
    b.addEventListener('click', function () {
      if (b.disabled) return;
      advance('Back', parentFn);
    });
    container.appendChild(b);
  }

  function renderWelcome () {
    var d = data(); if (!d) return;
    say(d.welcomeMessage);
    var c = newControls();
    addOptions(c, d.welcomeOptions || [], routeWelcome);
    commit(c);
  }

  function routeWelcome (item) {
    if (item.id && item.id.indexOf('cat_') === 0) goCategory(item.id.slice(4));
    else goHelpCenter();
  }

  function goHelpCenter () {
    var d = data(); if (!d) return;
    say(d.helpCenterMessage);
    var c = newControls();
    addCategories(c, d.categories, function (cat) { goCategory(cat.id); });
    addBack(c, renderWelcome);
    commit(c);
  }

  function goCategory (catId) {
    var d = data(); if (!d) return;
    var cat = (d.categories || []).filter(function (c) { return c.id === catId; })[0];
    var resps = (d.responses || {})[catId] || [];

    if (cat && cat.prompt) say(cat.prompt);
    else if (cat)          say('Here are the options for ' + cat.label + ':');

    var c = newControls();
    if (!resps.length) {
      var ph = document.createElement('div');
      ph.className = 'zeoComingSoon';
      ph.textContent = 'Answers for this topic are coming soon.';
      c.appendChild(ph);
    } else {
      addOptions(c, resps.map(function (r) {
        return { id: r.question, label: r.question, question: r.question };
      }), function (item) { goAnswer(catId, item.question); });
    }
    addBack(c, goHelpCenter);
    commit(c);
  }

  function goAnswer (catId, question) {
    var d = data(); if (!d) return;
    var resps = (d.responses || {})[catId] || [];
    var resp = resps.filter(function (r) { return r.question === question; })[0];
    if (resp) say(resp.answer);
    var c = newControls();
    addBack(c, function () { goCategory(catId); });
    commit(c);
  }

  function zeoOpen () {
    var d = data();
    if (!d) { if (typeof showToast === 'function') showToast('Zeo is unavailable right now'); return; }
    var v = view(); if (!v) return;
    body = $('zeoBody'); if (!body) return;

    if (typeof window.dmCloseThread === 'function') window.dmCloseThread(true);
    var dm = $('dmChatView'); if (dm) dm.style.display = 'none';
    var cm = $('cmChatView'); if (cm) cm.style.display = 'none';
    v.style.display = 'flex';
    var bar = $('cpBar');      if (bar)  bar.style.display = 'none';
    var lock = $('cpLockNote'); if (lock) lock.style.display = 'none';

    if (typeof cmChatPanelOpen === 'function') cmChatPanelOpen();
    if (typeof cmHdrChatMode === 'function') {
      cmHdrChatMode({
        name  : 'Zeo',
        sub   : 'Bot · Always online',
        avatar: '/zeo-avatar.png?v=6',
        letter: '🤖',
        tap   : null
      });
    }
    open = true;

    while (body.firstChild) body.removeChild(body.firstChild);
    activeControls = null;
    renderWelcome();
  }

  function zeoHide () {
    if (!open) return;
    open = false;
    var v = $('zeoChatView'); if (v) v.style.display = 'none';
  }
  function zeoClose () {
    if (!open) return;
    zeoHide();
    if (typeof cmChatPanelClose === 'function') cmChatPanelClose();
    if (typeof cmHdrHomeMode === 'function') cmHdrHomeMode();
  }
  function zeoIsOpen () { return open; }

  document.addEventListener('DOMContentLoaded', function () {
    var orig = window.cmCloseChat;
    window.cmCloseChat = function () {
      if (open) { zeoClose(); return; }
      if (typeof orig === 'function') return orig.apply(this, arguments);
    };
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !open) return;
    e.stopImmediatePropagation();
    zeoClose();
  }, true);

  window.zeoOpen   = zeoOpen;
  window.zeoHide   = zeoHide;
  window.zeoClose  = zeoClose;
  window.zeoIsOpen = zeoIsOpen;
})();
