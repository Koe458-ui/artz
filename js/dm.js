(function () {
  'use strict';
  var LINK_RE = /(https?:\/\/|www\.|\S+\.(com|net|org|io|gg|xyz)\b)/i;
  var POLL_MS = 5000, MAX_LEN = 1000;
  var dmPartner = null;
  var dmPoll = null, dmSending = false;
  var dmLimit = 25, DM_LOAD_STEP = 25, dmHasMore = false, dmLoadingOlder = false, dmLastSig = '';

  function $ (id) { return document.getElementById(id); }
  function me () { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function db () { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function toast (m) { if (typeof showToast === 'function') showToast(m); }
  function when (iso) {
    var d = new Date(iso), diff = (Date.now() - d.getTime()) / 6e4;
    if (diff < 1)    return 'now';
    if (diff < 60)   return Math.floor(diff) + 'm';
    if (diff < 1440) return Math.floor(diff / 60) + 'h';
    if (diff < 10080)return Math.floor(diff / 1440) + 'd';
    return d.toLocaleDateString();
  }
    // Looked up when called: app-core.js defines them and loads after this file, so reading them here left both undefined
  function hhmm (iso) { return window.dzHHMM ? window.dzHHMM(iso) : ''; }
  function dayChip (d) { return window.dzDayChip ? window.dzDayChip(d) : ''; }

  var FR_MAX_FRIENDS = 200;
  window.FR_MAX_FRIENDS = FR_MAX_FRIENDS;
  var frMap = {};
  function frCount (status) {
    return Object.keys(frMap).filter(function (k) { return frMap[k].status === status; }).length;
  }
  function frPaintBadge () {
    if (typeof window.cmSetFriendCount === 'function') window.cmSetFriendCount(frCount('accepted'));
  }
  function frAtCap () {
    if (frCount('accepted') < FR_MAX_FRIENDS) return false;
    toast('You have ' + FR_MAX_FRIENDS + ' friends — the most allowed. Remove one first.');
    return true;
  }
  function dmc () { return window.dzCached ? window.dzCached() : null; }
  function frKey () { var c = dmc(); return c ? c.ukey('friends') : null; }

  async function loadFriendships () {
    var c = dmc(), k = frKey();
    var warm = (c && k) ? c.peek(k, 'user:friends', { any: true }) : null;
    frMap = warm ? warm : {};
    if (!db() || !me()) { frMap = {}; return; }
    try {
      var fresh = await (c && k
        ? c.getOrSet(k, frFetch, 'user:friends')
        : frFetch());
      frMap = fresh || {};
    } catch (e) {
      if (!frMap) frMap = {};
    }
  }

  async function frFetch () {
    var uid = me().id;
    var r = await db().from('friendships')
      .select('id,requester_id,addressee_id,status,blocked_by')
      .or('requester_id.eq.' + uid + ',addressee_id.eq.' + uid);
    if (r.error) throw r.error;
    var map = {};
    (r.data || []).forEach(function (f) {
      map[f.requester_id === uid ? f.addressee_id : f.requester_id] = f;
    });
    return map;
  }
  function frState (pid) {
    var f = frMap[pid];
    if (!f) return 'none';
    if (f.status === 'accepted') return 'friends';
    if (f.status === 'blocked') return f.blocked_by === (me() && me().id) ? 'blocked_by_me' : 'blocked_me';
    return f.requester_id === (me() && me().id) ? 'sent' : 'incoming';
  }
  async function refreshAfterFrChange () {
    if (typeof window.notifAfterFriendChange === 'function') window.notifAfterFriendChange();
    var c = dmc();
    if (c && c.invalidateFriends) { try { await c.invalidateFriends(); } catch (e) {} }
    await loadFriendships();
    frPaintBadge();
    if ($('frdPage') && $('frdPage').classList.contains('open')) loadFriendsPage();
    if (dmPartner) dmApplyGate();
    var frdInp = $('frdSearchInput');
    if (frdInp && frdInp.value.trim().length >= 2) frdInp.dispatchEvent(new Event('input'));
  }
  function frErr (e, fallback) {
    var m = (e && e.message) || '';
    if (/FR_MAX_FRIENDS/.test(m))  return 'That would go over the ' + FR_MAX_FRIENDS + ' friend limit.';
    if (/FR_MAX_PENDING/.test(m))  return 'You have too many requests waiting \u2014 cancel some first.';
    if (/Too many .* in a short time/i.test(m)) return m;
    if (/duplicate|uniq/i.test(m)) return 'A request already exists';
    return fallback;
  }
  async function frSendReq (pid) {
    if (!db() || !me()) { if (typeof openAuthMod === 'function') openAuthMod(); return; }
    if (frAtCap()) return;
    try {
      var r = await db().from('friendships').insert({ requester_id: me().id, addressee_id: pid });
      if (r.error) throw r.error;
      toast('Friend request sent');
    } catch (e) {
      toast(frErr(e, 'Couldn\u2019t send the request'));
    }
    await refreshAfterFrChange();
  }
  async function frAccept (pid) {
    var f = frMap[pid]; if (!f || !db()) return;
    if (frAtCap()) return;
    try {
      var r = await db().from('friendships').update({ status: 'accepted' }).eq('id', f.id);
      if (r.error) throw r.error;
      toast('You are now friends');
    } catch (e) { toast(frErr(e, 'Couldn\u2019t accept — try again')); }
    await refreshAfterFrChange();
  }
  async function frRemove (pid, okMsg) {
    var f = frMap[pid]; if (!f || !db()) return;
    try {
      var r = await db().from('friendships').delete().eq('id', f.id);
      if (r.error) throw r.error;
      if (okMsg) toast(okMsg);
    } catch (e) { toast('Action failed — try again'); }
    await refreshAfterFrChange();
  }
  async function frBlock (pid) {
    if (!db() || !me()) return;
    try {
      var f = frMap[pid];
      if (f) {
        var r = await db().from('friendships').update({ status: 'blocked' }).eq('id', f.id);
        if (r.error) throw r.error;
      } else {
        var i = await db().from('friendships').insert({ requester_id: me().id, addressee_id: pid }).select().single();
        if (i.error) throw i.error;
        var u = await db().from('friendships').update({ status: 'blocked' }).eq('id', i.data.id);
        if (u.error) throw u.error;
      }
      toast('Blocked');
    } catch (e) { toast('Couldn\u2019t block — try again'); }
    await refreshAfterFrChange();
  }
  function frBtnEl (label, cls, fn) {
    var b = document.createElement('button');
    b.className = 'frBtn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
    return b;
  }

  async function runSearch (q, box, onOpen) {
    if (!db()) { toast('Backend not configured'); return; }
    var safe = q.replace(/[%_]/g, '\\$&');
    try {
      var r = await db().from('profiles')
        .select('id,username,avatar_url')
        .ilike('username', '%' + safe + '%')
        .limit(8);
      if (r.error) throw r.error;
      await loadFriendships();
      var rows = (r.data || []).filter(function (p) {
        if (me() && p.id === me().id) return false;
        return frState(p.id) !== 'blocked_me';
      });
      box.innerHTML = '';
      if (!rows.length) {
        box.innerHTML = '<div class="dmSearchNote">NO USERS FOUND</div>';
        return;
      }
      rows.forEach(function (p) { box.appendChild(userRow(p, true, null, null, onOpen)); });
    } catch (e) { box.innerHTML = '<div class="dmSearchNote">SEARCH FAILED — TRY AGAIN</div>'; }
  }

  function userRow (p, isSearch, preview, ts, onOpen) {
    var item = document.createElement('div');
    item.className = 'cmFriendItem';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    var av = document.createElement('div');
    av.className = 'cmFriendAvatar';
    if (p.avatar_url) {
      var img = document.createElement('img');
      img.src = (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(p.avatar_url) : p.avatar_url; img.alt = ''; img.draggable = false;
      img.onerror = function () { this.remove(); av.textContent = (p.username || '?')[0].toUpperCase(); };
      av.appendChild(img);
    } else {
      av.textContent = (p.username || '?')[0].toUpperCase();
    }
    var meta = document.createElement('div');
    meta.className = 'cmFriendMeta';
    var name = document.createElement('div');
    name.className = 'cmFriendName';
    name.textContent = p.username || 'Artist';
    var status = document.createElement('div');
    status.className = 'cmFriendStatus' + (preview ? ' dmPreview' : '');
    var st = isSearch ? frState(p.id) : null;
    status.textContent = isSearch
      ? ({ none: 'Send a friend request', sent: 'Request sent — waiting', incoming: 'Sent you a friend request', friends: 'Tap to message', blocked_by_me: 'Blocked' }[st] || '')
      : (preview || '');
    meta.appendChild(name); meta.appendChild(status);
    item.appendChild(av); item.appendChild(meta);
    if (isSearch) {
      var acts = document.createElement('span');
      acts.className = 'frRowBtns';
      if (st === 'none')            acts.appendChild(frBtnEl('ADD FRIEND', '', function () { frSendReq(p.id); }));
      else if (st === 'sent')       acts.appendChild(frBtnEl('CANCEL', 'frBtn--ghost', function () { frRemove(p.id, 'Request cancelled'); }));
      else if (st === 'incoming')   acts.appendChild(frBtnEl('ACCEPT', '', function () { frAccept(p.id); }));
      else if (st === 'blocked_by_me') acts.appendChild(frBtnEl('UNBLOCK', 'frBtn--ghost', function () { frRemove(p.id, 'Unblocked'); }));
      else if (st === 'friends') {
        var go = document.createElement('span');
        go.className = 'dmGo'; go.textContent = 'MESSAGE';
        acts.appendChild(go);
      }
      item.appendChild(acts);
    } else if (ts) {
      var w = document.createElement('span');
      w.className = 'dmWhen'; w.textContent = when(ts);
      item.appendChild(w);
    }
    var open = function () { (onOpen || openThread)(p); };
    item.addEventListener('click', open);
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return item;
  }

  async function fetchPartners () {
    if (!db() || !me()) return [];
    var uid = me().id;
    var r = await db().from('direct_messages')
      .select('sender_id,recipient_id,content,created_at')
      .or('sender_id.eq.' + uid + ',recipient_id.eq.' + uid)
      .order('created_at', { ascending: false })
      .limit(120);
    if (r.error) throw r.error;
    var seen = {}, partners = [];
    (r.data || []).forEach(function (m) {
      var pid = m.sender_id === uid ? m.recipient_id : m.sender_id;
      if (seen[pid]) return;
      seen[pid] = true;
      partners.push({ id: pid, preview: (m.sender_id === uid ? 'You: ' : '') + m.content, ts: m.created_at });
    });
    return partners;
  }
  window.__dmFetchPartners = async function () {
    await loadFriendships();
    return Object.keys(frMap)
      .filter(function (k) { return frMap[k].status === 'accepted'; })
      .map(function (k) { return { id: k }; });
  };

  async function convosFetch () {
    var partners = await fetchPartners();
    if (!partners.length) return { partners: [], profiles: {} };
    var pr = await db().from('profiles')
      .select('id,username,avatar_url')
      .in('id', partners.map(function (p) { return p.id; }));
      // a failed query resolves with data:null; without this the list caches with every name reduced to "Artist"
    if (pr.error) throw pr.error;
    var byId = {};
    (pr.data || []).forEach(function (p) { byId[p.id] = p; });
    return { partners: partners, profiles: byId };
  }

  function convosPaint (snap) {
    var list = $('dmConvoList'), empty = $('dmEmpty'), head = $('dmConvoHead');
    if (!list || !snap) return;
    var partners = snap.partners || [], byId = snap.profiles || {};
    list.innerHTML = '';
    if (head) head.style.display = partners.length ? '' : 'none';
    if (empty) empty.style.display = partners.length ? 'none' : '';
    partners.forEach(function (pt) {
      var prof = byId[pt.id] || { id: pt.id, username: 'Artist' };
      list.appendChild(userRow(prof, false, pt.preview, pt.ts));
    });
  }

  async function refreshConvos () {
    var list = $('dmConvoList');
    if (!list || !db() || !me()) return;
    var c = dmc(), k = c ? c.ukey('convos') : null;
    try {
      if (c && k) {
        await c.warm(k, convosFetch, 'user:convos', convosPaint, convosPaint)
               .then(convosPaint);
      } else {
        convosPaint(await convosFetch());
      }
    } catch (e) {
      if (c && k) {
        var old = await c.recall(k, 'user:convos');
        if (old && old.partners && old.partners.length) convosPaint(old);
      }
    }
  }

  function openThread (p) {
    if (!db()) { toast('Backend not configured'); return; }
    if (!me()) { if (typeof openAuthMod === 'function') openAuthMod(); return; }
    dmPartner = p;
    if (typeof window.zeoHide === 'function') window.zeoHide();
    var chat = $('dmChatView'), cmChat = $('cmChatView');
    if (cmChat) cmChat.style.display = 'none';
    if (chat) chat.style.display = 'flex';
    var cpBarEl = $('cpBar');   if (cpBarEl) cpBarEl.style.display = 'none';
    var lockEl  = $('cpLockNote'); if (lockEl) lockEl.style.display = 'none';
    if (typeof cmChatPanelOpen === 'function') cmChatPanelOpen();
    if (typeof cmHdrChatMode === 'function') {
      cmHdrChatMode({
        name  : p.username || 'Artist',
        sub   : 'Tap to view profile',
        avatar: p.avatar_url || null,
        letter: (p.username || '?').charAt(0).toUpperCase(),
        tap   : function () {
          if (!p.username) return;
          if (typeof openProfileByUsername === 'function') openProfileByUsername(p.username, true);
        }
      });
    }
    var res = $('dmResults');   if (res) res.innerHTML = '';
    $('dmBody').innerHTML = '<div class="dmSearchNote">LOADING…</div>';
    var gEl = $('dmGate'), bEl = document.querySelector('#dmChatView .dmBar');
    if (frMap[p.id]) {
      dmApplyGate(true);
    } else {
      if (bEl) bEl.style.display = 'none';
      if (gEl) { gEl.style.display = 'flex'; gEl.innerHTML = '<div class="dmGateTxt">…</div>'; }
    }
    loadFriendships().then(function () { dmApplyGate(); });
    dmLimit = 25; dmHasMore = false; dmLoadingOlder = false; dmLastSig = '';
    loadThread(true);
    clearInterval(dmPoll);
    dmPoll = setInterval(function () {
      if (document.visibilityState === 'visible') loadThread(false);
    }, POLL_MS);
    setTimeout(function () { var i = $('dmInput'); if (i) i.focus({ preventScroll: true }); }, 340);
  }
  function closeThread () {
    dmPartner = null;
    clearInterval(dmPoll); dmPoll = null;
    if (typeof cmChatPanelClose === 'function') cmChatPanelClose();
    if (typeof cmHdrHomeMode === 'function') cmHdrHomeMode();
    refreshConvos();
  }
  function dmPaint (rows, hasMore, mode, uid) {
    var body = $('dmBody');
    if (!body) return;
    var atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    var prevHeight = body.scrollHeight, prevTop = body.scrollTop;

    var msgHtml = '';
    var lastDayKey = '', lastSender = null, lastTs = 0;
    rows.forEach(function (m) {
      var mine = m.sender_id === uid;
      var d = m.created_at ? new Date(m.created_at) : null;
      var dayKey = d ? d.toDateString() : '';
      if (dayKey && dayKey !== lastDayKey) {
        msgHtml += '<div class="chatDay"><span>' + dayChip(d) + '</span></div>';
        lastDayKey = dayKey;
        lastSender = null;
      }
      var ts = d ? d.getTime() : 0;
      var cont = lastSender === m.sender_id && ts && (ts - lastTs) < 300000;
      lastSender = m.sender_id; lastTs = ts;
      msgHtml += '<div class="dmMsg ' + (mine ? 'dmMsg--me' : 'dmMsg--them') + (cont ? ' dmMsg--cont' : '') + '">' +
               esc(m.content) +
               '<span class="dmMsgTime">' + hhmm(m.created_at) + '</span>' +
             '</div>';
    });

    var loaderHtml = hasMore
      ? '<div class="cpRefreshWrap visible" id="dmRefreshWrap" aria-hidden="true"><div class="cpRefreshSpinner"></div></div>'
      : '';

    body.innerHTML = loaderHtml + (msgHtml ||
      '<div class="dmSearchNote">SAY HI — THIS IS THE START OF YOUR CHAT</div>');

    if (mode === 'older') {
      body.scrollTop = prevTop + (body.scrollHeight - prevHeight);
    } else if (mode === 'open' || atEnd) {
      body.scrollTop = body.scrollHeight;
    } else {
      body.scrollTop = prevTop;
    }
  }

  function dmThreadKey (pid) {
    var c = dmc();
    return c ? c.ukey('thread', pid) : null;
  }

  async function loadThread (scrollToEnd) {
    if (!dmPartner || !db() || !me()) return;
    var uid = me().id, pid = dmPartner.id;
    var c = dmc(), k = dmThreadKey(pid);

    if (scrollToEnd && c && k) {
      var snap = c.peek(k, 'user:thread', { any: true });
      if (snap && snap.rows && snap.rows.length) {
        dmPaint(snap.rows, !!snap.more, 'open', uid);
      }
    }

    try {
      var r = await db().from('direct_messages')
        .select('id,sender_id,content,created_at')
        .or('and(sender_id.eq.' + uid + ',recipient_id.eq.' + pid + '),and(sender_id.eq.' + pid + ',recipient_id.eq.' + uid + ')')
        .order('created_at', { ascending: false })
        .limit(dmLimit + 1);
      if (r.error) throw r.error;
      if (!dmPartner || dmPartner.id !== pid) return;
      var rows = r.data || [];
      dmHasMore = rows.length > dmLimit;
      if (dmHasMore) rows = rows.slice(0, dmLimit);
      rows.reverse();

      if (c && k) {
        c.set(k, { rows: rows.slice(-50), more: dmHasMore || rows.length > 50 },
              'user:thread');
      }

      var sig = dmLimit + '|' + dmHasMore + '|' + rows.map(function (m) { return m.id; }).join(',');
      if (!scrollToEnd && !dmLoadingOlder && sig === dmLastSig) return;
      dmLastSig = sig;

      var mode = dmLoadingOlder ? 'older' : (scrollToEnd ? 'open' : 'poll');
      dmLoadingOlder = false;
      dmPaint(rows, dmHasMore, mode, uid);
    } catch (e) {
      dmLoadingOlder = false;
      console.error('dm thread:', (e && e.message) || e);
        // Only the opening read says so on screen. A failing poll behind a painted thread leaves it alone
      var failed = scrollToEnd && $('dmBody');
      if (failed && !failed.querySelector('.dmMsg')) {
        failed.innerHTML = '<div class="dmSearchNote">COULDN\u2019T LOAD THIS CHAT — TRY AGAIN</div>';
      }
    }
  }

  function dmMaybeLoadOlder () {
    if (dmLoadingOlder || !dmHasMore || !dmPartner) return;
    dmLoadingOlder = true;
    dmLimit += DM_LOAD_STEP;
    loadThread(false);
  }

  function dmApplyGate (skipFocus) {
    var bar = document.querySelector('#dmChatView .dmBar'), gate = $('dmGate');
    if (!bar || !gate || !dmPartner) return;
    var st = frState(dmPartner.id);
    if (st === 'friends') {
      gate.style.display = 'none';
      bar.style.display = 'flex';
      if (!skipFocus) {
        var i = $('dmInput'); if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 60);
      }
      return;
    }
    bar.style.display = 'none';
    gate.style.display = 'flex';
    gate.innerHTML = '';
    var txt = document.createElement('div'); txt.className = 'dmGateTxt';
    var row = document.createElement('div'); row.className = 'dmGateRow';
    var nm = (dmPartner.username || 'this artist').toUpperCase();
    if (st === 'none') {
      txt.textContent = 'YOU CAN ONLY MESSAGE FRIENDS';
      row.appendChild(frBtnEl('ADD FRIEND', '', function () { frSendReq(dmPartner.id); }));
    } else if (st === 'sent') {
      txt.textContent = 'FRIEND REQUEST SENT — WAITING FOR ' + nm;
      row.appendChild(frBtnEl('CANCEL REQUEST', 'frBtn--ghost', function () { frRemove(dmPartner.id, 'Request cancelled'); }));
    } else if (st === 'incoming') {
      txt.textContent = nm + ' WANTS TO BE FRIENDS';
      row.appendChild(frBtnEl('ACCEPT', '', function () { frAccept(dmPartner.id); }));
      row.appendChild(frBtnEl('DECLINE', 'frBtn--ghost', function () { frRemove(dmPartner.id); }));
    } else if (st === 'blocked_by_me') {
      txt.textContent = 'YOU BLOCKED ' + nm;
      row.appendChild(frBtnEl('UNBLOCK', 'frBtn--ghost', function () { frRemove(dmPartner.id, 'Unblocked'); }));
    } else {
      txt.textContent = 'YOU CAN’T MESSAGE THIS ARTIST';
    }
    gate.appendChild(txt);
    if (row.children.length) gate.appendChild(row);
  }

  async function send () {
    var inp = $('dmInput'), btn = $('dmSendBtn');
    if (!inp || dmSending || !dmPartner) return;
    if (!me()) { if (typeof openAuthMod === 'function') openAuthMod(); return; }
    var text = inp.value.trim();
    if (!text) return;
    if (text.length > MAX_LEN) { toast('Message is too long (max 1000 characters)'); return; }
    if (LINK_RE.test(text)) { toast('Links aren\'t allowed in messages'); return; }
    if (frState(dmPartner.id) !== 'friends') { dmApplyGate(); toast('You can only message friends'); return; }
    if (window.dzChat) {
      var wait = window.dzChat.check(text);
      if (wait) { toast(wait); return; }
    }
    dmSending = true; if (btn) btn.disabled = true;
    try {
      var r = await db().from('direct_messages')
        .insert({ sender_id: me().id, recipient_id: dmPartner.id, content: text })
        .select('id');
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) {
        toast(window.dzChat ? await window.dzChat.fromServer(db())
                            : 'That didn\u2019t send \u2014 try again');
        return;
      }
      if (window.dzChat) window.dzChat.note(text);
      inp.value = '';
      var c = dmc();
      if (c && c.deleteByPrefix) { try { c.deleteByPrefix(c.ukey('convos')); } catch (e2) {} }
      await loadThread(true);
    } catch (e) {
      var m = (e && e.message) || '';
      toast(/dm_no_links/.test(m) ? 'Links aren\'t allowed in messages'
          : /row-level security|policy/i.test(m) ? 'You can only message friends'
          : 'Message failed to send — try again');
      if (/row-level security|policy/i.test(m)) { loadFriendships().then(dmApplyGate); }
    } finally {
      dmSending = false; if (btn) btn.disabled = false;
    }
  }

    // short order-independent stamp for a set of ids, so a cache key can name a list's members without every uuid
  function frIdsTag (ids) {
    var h = 2166136261;
    ids.slice().sort().join(',').split('').forEach(function (ch) {
      h ^= ch.charCodeAt(0);
      h = (h * 16777619) >>> 0;
    });
    return ids.length + '.' + h.toString(36);
  }

  var frdLastFocus = null, frdSearchTimer = null;
  function frdStartChat (p) {
    closeFriendsPage();
    var page = document.getElementById('communityPage');
    var wasOpen = !!(page && page.classList.contains('open'));
    if (typeof window.openCommunityHome === 'function') window.openCommunityHome();
    if (wasOpen || !page) { openThread(p); return; }
    var fired = false;
    function go(){ if (fired) return; fired = true; openThread(p); }
    page.addEventListener('transitionend', function h(e){
      if (e.target !== page || e.propertyName !== 'transform') return;
      page.removeEventListener('transitionend', h);
      go();
    });
    setTimeout(go, 520);
  }
  async function loadFriendsPage () {
    var list = $('frdList'), empty = $('frdEmptyState'),
        head = $('frdListHead'), cnt = $('frdCount'),
        sentHead = $('frdSentHead'), sentList = $('frdSentList'), sentCnt = $('frdSentCount'),
        blkHead = $('frdBlockHead'), blkList = $('frdBlockList'), blkCnt = $('frdBlockCount');
    if (!list) return;
    list.innerHTML = '<div class="dmSearchNote">LOADING…</div>';
    if (sentList) sentList.innerHTML = '';
    if (blkList) blkList.innerHTML = '';
    empty.style.display = 'none'; head.style.display = 'none';
    if (sentHead) sentHead.style.display = 'none';
    if (blkHead) blkHead.style.display = 'none';
    try {
      await loadFriendships();
        // an incoming request is a notification now, not a row here
      var uid = me().id, sent = [], friends = [], blocked = [];
      Object.keys(frMap).forEach(function (pid) {
        var f = frMap[pid];
        if (f.status === 'accepted') friends.push(pid);
        else if (f.status === 'pending' && f.requester_id === uid) sent.push(pid);
        else if (f.status === 'blocked' && f.blocked_by === uid) blocked.push(pid);
      });
      list.innerHTML = '';
      if (cnt) cnt.textContent = friends.length + ' / ' + FR_MAX_FRIENDS;
      frPaintBadge();
      var allIds = sent.concat(friends, blocked);
      if (!allIds.length) { empty.style.display = ''; return; }
      var byId = {};
      var c = dmc();
        // keyed by who is in the list, not how many: swapping one friend for another kept the count and served old names
      var frpKey = c ? c.ukey('list', 'frprofiles', frIdsTag(allIds)) : null;
      var frpLoad = async function () {
        var pr = await db().from('profiles')
          .select('id,username,avatar_url')
          .in('id', allIds);
        if (pr.error) throw pr.error;
        var out = {};
        (pr.data || []).forEach(function (p) { out[p.id] = p; });
        return out;
      };
      try {
        byId = (c && frpKey) ? await c.getOrSet(frpKey, frpLoad, 'user:list') : await frpLoad();
      } catch (ppe) {
        byId = (c && frpKey) ? (await c.recall(frpKey, 'user:list')) || {} : {};
      }
      function prof (pid) { return byId[pid] || { id: pid, username: 'Artist' }; }

      if (sent.length && sentHead && sentList) {
        sentHead.style.display = '';
        if (sentCnt) sentCnt.textContent = sent.length;
        sent.forEach(function (pid) {
          var row = userRow(prof(pid), false, 'Request pending…', null, function(){});
          var acts = document.createElement('span'); acts.className = 'frRowBtns';
          acts.appendChild(frBtnEl('CANCEL', 'frBtn--ghost', function () { frRemove(pid, 'Request cancelled'); }));
          row.appendChild(acts);
          sentList.appendChild(row);
        });
      }
      if (friends.length) {
        head.style.display = '';
        friends.forEach(function (pid) {
          var row = userRow(prof(pid), false, 'Friend, tap to chat', null, frdStartChat);
          var acts = document.createElement('span'); acts.className = 'frRowBtns';
          acts.appendChild(frBtnEl('REMOVE', 'frBtn--ghost', function () {
            var u = prof(pid).username || 'this artist';
            if (confirm('Remove ' + u + ' as a friend? Neither of you will be able to message the other until one sends a new request.')) {
              frRemove(pid, 'Friend removed');
            }
          }));
          acts.appendChild(frBtnEl('BLOCK', 'frBtn--danger', function () {
            var u = prof(pid).username || 'this artist';
            if (confirm('Block ' + u + '? They won\u2019t be able to message you, and you won\u2019t see their requests.')) frBlock(pid);
          }));
          row.appendChild(acts);
          list.appendChild(row);
        });
      }
      if (blocked.length && blkHead && blkList) {
        blkHead.style.display = '';
        if (blkCnt) blkCnt.textContent = blocked.length;
        blocked.forEach(function (pid) {
          var row = userRow(prof(pid), false, 'Blocked', null, frdStartChat);
          var acts = document.createElement('span'); acts.className = 'frRowBtns';
          acts.appendChild(frBtnEl('UNBLOCK', 'frBtn--ghost', function () { frRemove(pid, 'Unblocked'); }));
          row.appendChild(acts);
          blkList.appendChild(row);
        });
      }
    } catch (e) {
      list.innerHTML = '<div class="dmSearchNote">COULDN\u2019T LOAD FRIENDS — TRY AGAIN</div>';
    }
  }
  function openFriendsPage () {
    if (!me()) { if (typeof openAuthMod === 'function') openAuthMod(); return; }
    frdLastFocus = document.activeElement;
    $('frdPage').classList.add('open');
    document.body.style.overflow = 'hidden';
    var inp = $('frdSearchInput'); if (inp) inp.value = '';
    var res = $('frdResults'); if (res) res.innerHTML = '';
    loadFriendsPage();
    refreshConvos();
  }
  function closeFriendsPage () {
    $('frdPage').classList.remove('open');
    if (typeof restoreScroll === 'function') restoreScroll();
    else document.body.style.overflow = '';
    if (frdLastFocus && frdLastFocus.focus) frdLastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('frdPage') || !$('frdPage').classList.contains('open')) return;
    e.stopImmediatePropagation();
    closeFriendsPage();
  });
  window.openFriendsPage  = openFriendsPage;
  window.dmOpenWith = async function (pid) {
    if (!db() || !me()) { if (typeof openAuthMod === 'function') openAuthMod(); return; }
    var p = { id: pid, username: 'Artist' };
    try {
      var r = await db().from('profiles').select('id,username,avatar_url').eq('id', pid).maybeSingle();
      if (r && r.data) p = r.data;
    } catch (e) {}
    frdStartChat(p);
  };
  window.dmCloseThread = function () {
    if (!dmPartner) return;
    dmPartner = null;
    clearInterval(dmPoll); dmPoll = null;
    var dm = $('dmChatView'); if (dm) dm.style.display = 'none';
    refreshConvos();
  };
  window.pfFriendBridge = {
    load:   loadFriendships,
    state:  frState,
    send:   frSendReq,
    accept: frAccept,
    cancel: function (pid) { return frRemove(pid, 'Request cancelled'); },
    decline: function (pid) { return frRemove(pid, 'Request declined'); },
    block:  frBlock,
    chat:   frdStartChat
  };
  window.closeFriendsPage = closeFriendsPage;

  document.addEventListener('DOMContentLoaded', function () {
    var fInp = $('frdSearchInput'), fBox = $('frdResults');
    if (fInp && fBox) fInp.addEventListener('input', function () {
      clearTimeout(frdSearchTimer);
      var q = fInp.value.trim();
      if (q.length < 2) { fBox.innerHTML = ''; return; }
      frdSearchTimer = setTimeout(function () { runSearch(q, fBox, frdStartChat); }, 300);
    });
    var btn = $('dmSendBtn'); if (btn) btn.addEventListener('click', send);
    var inp = $('dmInput');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    var dmScrollT = null, dmBodyEl = $('dmBody');
    if (dmBodyEl) dmBodyEl.addEventListener('scroll', function () {
      if (dmBodyEl.scrollTop <= 40 && !dmLoadingOlder && dmHasMore) {
        clearTimeout(dmScrollT);
        dmScrollT = setTimeout(dmMaybeLoadOlder, 250);
      }
    }, { passive: true });
    var orig = window.cmCloseChat;
    window.cmCloseChat = function () {
      if (dmPartner) { closeThread(); return; }
      if (typeof orig === 'function') orig.apply(this, arguments);
    };
    var origOpen = window.openCommunityHome;
    if (typeof origOpen === 'function') {
      window.openCommunityHome = function () {
        var out = origOpen.apply(this, arguments);
        loadFriendships().then(frPaintBadge);
        return out;
      };
    }
    if (db() && db().auth && db().auth.onAuthStateChange) {
      db().auth.onAuthStateChange(function () {
        frMap = {};
        frPaintBadge();
        setTimeout(function () { loadFriendships().then(frPaintBadge); refreshConvos(); }, 400);
      });
    }
  });
})();
