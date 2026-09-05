  (function () {
    'use strict';

    var TICK_MS = 45000;
    var TOP = 10;
    var PG_PAGE = 50;
    var NEAR_END = 240;

    var BOARDS = [
      { key:'level',     name:'LEVEL',     word:'LEVEL' },
      { key:'followers', name:'FOLLOWERS', word:'FOLLOWERS' },
      { key:'likes',     name:'LIKES',     word:'LIKES' },
      { key:'bookmarks', name:'BOOKMARKS', word:'SAVES' }
    ];

    var state = {};
    var timer = null, seen = false, started = false;

    function db () { return (typeof sb !== 'undefined' && sb) ? sb : null; }
    function me () { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
    function el (tag, cls, text) { return window.dzEl(tag, cls, text); }
    function num (n) { return (Number(n) || 0).toLocaleString(); }
    function thumb (u) {
      if (!u) return null;
      return (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(u) : u;
    }
    function valueOf (b, row) {
      return b.key === 'level'
        ? ('LEVEL ' + (Number(row.lvl) || 1))
        : (b.word + ' ' + num(row.score));
    }

    function buildCards () {
      var grid = document.getElementById('rkGrid');
      if (!grid) return false;
      grid.innerHTML = '';
      BOARDS.forEach(function (b) {
        var card = el('article', 'rkCard rkCard--' + b.key + ' xpCard');

        var head = el('div', 'rkHead');
        head.appendChild(el('div', 'rkHeadT', b.name + ' LEADERBOARD'));
        head.appendChild(el('div', 'rkHeadN', 'TOP 10'));
        card.appendChild(head);

        var list = el('div', 'rkList');
        list.appendChild(el('div', 'rkSkel'));
        list.appendChild(el('div', 'rkSkel'));
        list.appendChild(el('div', 'rkSkel'));
        card.appendChild(list);

        var mine = el('div', 'rkMine');
        mine.appendChild(el('span', 'rkMineLbl', 'Your rank'));
        card.appendChild(mine);

        var all = el('button', 'rkAll', 'VIEW FULL RANKING \u2192');
        all.type = 'button';
        all.onclick = function () { openRankPage(b.key); };
        card.appendChild(all);

        grid.appendChild(card);

        state[b.key] = { rows: [], total: 0, busy: false, sig: '',
                         listEl: list, mineEl: mine, headEl: head, allEl: all };
      });
      return true;
    }

    var track, dotsWrap, prevBtn, nextBtn, cur = 0;

    function cardAt (i) { return (track && track.children[i]) ? track.children[i] : null; }
    function centreOf (c) { return c.offsetLeft + c.clientWidth / 2; }

    function slideTo (i) {
      if (!track) return;
      i = Math.max(0, Math.min(BOARDS.length - 1, i));
      var c = cardAt(i);
      if (!c) return;
      track.scrollTo({ left: centreOf(c) - track.clientWidth / 2, behavior: 'smooth' });
    }
    function syncNav () {
      if (!track) return;
      var mid = track.scrollLeft + track.clientWidth / 2, best = 0, bd = Infinity;
      for (var i = 0; i < BOARDS.length; i++) {
        var c = cardAt(i);
        if (!c) continue;
        var d = Math.abs(centreOf(c) - mid);
        if (d < bd) { bd = d; best = i; }
      }
      cur = best;
      if (dotsWrap) {
        var dots = dotsWrap.children;
        for (var k = 0; k < dots.length; k++) {
          dots[k].classList.toggle('on', k === cur);
          dots[k].setAttribute('aria-selected', k === cur ? 'true' : 'false');
        }
      }
      if (prevBtn) prevBtn.disabled = (cur === 0);
      if (nextBtn) nextBtn.disabled = (cur === BOARDS.length - 1);
    }
    function buildNav () {
      track    = document.getElementById('rkGrid');
      dotsWrap = document.getElementById('rkDots');
      prevBtn  = document.getElementById('rkPrev');
      nextBtn  = document.getElementById('rkNext');
      if (!track) return;

      if (dotsWrap) {
        dotsWrap.innerHTML = '';
        BOARDS.forEach(function (b, i) {
          var d = el('button', 'rkDot' + (i === 0 ? ' on' : ''));
          d.type = 'button';
          d.setAttribute('role', 'tab');
          d.setAttribute('aria-label', b.name);
          d.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
          d.onclick = function () { slideTo(i); };
          dotsWrap.appendChild(d);
        });
      }
      if (prevBtn) prevBtn.onclick = function () { slideTo(cur - 1); };
      if (nextBtn) nextBtn.onclick = function () { slideTo(cur + 1); };

      var raf = null;
      track.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = null; syncNav(); });
      }, { passive: true });
      window.addEventListener('resize', function () {
        var c = cardAt(cur);
        if (c) track.scrollLeft = centreOf(c) - track.clientWidth / 2;
        syncNav();
      });
      syncNav();
    }

    async function loadTop (b) {
      var s = state[b.key], c = db();
      if (!s || s.busy) return;
      if (!c) { note(s, 'RANKING UNAVAILABLE'); return; }
      s.busy = true;
      var cache = window.dzCached ? window.dzCached() : null;
      var apply = function (rows) {
        s.rows  = rows || [];
        s.total = s.rows.length ? (Number(s.rows[0].total) || 0) : 0;
        render(b);
      };
      var load = async function () {
        var r = await c.rpc('get_rank_board', { board: b.key, lim: TOP, off: 0 });
        if (r.error) throw r.error;
        return r.data || [];
      };
      try {
        apply(cache
          ? await cache.getOrSet('ranking:' + b.key + ':top:' + TOP, load, 'ranking', apply)
          : await load());
      } catch (e) {
        if (!s.rows.length) note(s, 'COULDN\u2019T LOAD RANKING');
      } finally {
        s.busy = false;
      }
    }

    function note (s, msg) {
      s.listEl.innerHTML = '';
      s.listEl.appendChild(el('div', 'xpNote', msg));
    }

    var MEDAL = ['1ST', '2ND', '3RD'];

    function rowEl (b, r, uid, onTap) {
      var row = el('div', 'xpLbRow' + (uid && r.uid === uid ? ' self' : ''));
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      var pos = Number(r.rnk) || 0;
      row.appendChild(el('div',
        'xpLbRank' + (pos >= 1 && pos <= 3 ? ' m' + pos : ''),
        (pos >= 1 && pos <= 3) ? MEDAL[pos - 1] : ('#' + pos)));

      var ava = el('div', 'xpLbAva');
      var src = thumb(r.avatar_url);
      if (src) {
        var img = document.createElement('img');
        img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
        img.src = src;
        img.onerror = function () { ava.textContent = (r.username || '?').charAt(0).toUpperCase(); };
        ava.appendChild(img);
      } else {
        ava.textContent = (r.username || '?').charAt(0).toUpperCase();
      }
      row.appendChild(ava);

      var nameEl = el('div', 'xpLbName', r.username || 'Artist');
      if (window.DZ_MS) DZ_MS.paintName(nameEl, Number(r.lvl) || 0);
      row.appendChild(nameEl);

      row.appendChild(el('div', 'xpLbLvl', valueOf(b, r)));

      row.onclick = function () { onTap(r); };
      row.onkeydown = function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onTap(r); }
      };
      return row;
    }

    function render (b) {
      var s = state[b.key];
      var uid = me() ? me().id : null;
      var sig = s.rows.map(function (r) { return r.rnk + ':' + r.uid + ':' + r.score + ':' + r.lvl; })
                      .join('|') + '#' + s.total + '#' + uid;
      if (sig === s.sig) return;
      s.sig = sig;

      var n = s.headEl && s.headEl.querySelector('.rkHeadN');
      if (n) n.textContent = s.total ? (num(s.total) + (s.total === 1 ? ' ARTIST' : ' ARTISTS')) : 'TOP 10';

      if (s.allEl) {
        s.allEl.textContent = (s.total > s.rows.length)
          ? ('VIEW ALL ' + num(s.total) + ' \u2192')
          : 'VIEW FULL RANKING \u2192';
      }

      var list = s.listEl;
      list.innerHTML = '';

      if (!s.rows.length) {
        list.appendChild(el('div', 'xpNote', 'NO RANKED ARTISTS YET'));
        return;
      }

      s.rows.forEach(function (r) {
        list.appendChild(rowEl(b, r, uid, function () { openRankPage(b.key); }));
      });
    }

    async function paintMine (box, b, openPage) {
      var c = db(), u = me();
      box.innerHTML = '';
      box.classList.remove('tap');
      box.onclick = null;

      if (!u) {
        box.appendChild(el('span', 'rkMineLbl', 'Sign in to see your rank'));
        box.classList.add('tap');
        box.onclick = function () { if (typeof openAuthMod === 'function') openAuthMod(); };
        return;
      }

      box.appendChild(el('span', 'rkMineLbl', 'Your rank'));
      if (!c) return;
      if (openPage) { box.classList.add('tap'); box.onclick = openPage; }

      try {
        var r = await c.rpc('get_rank_me', { board: b.key });
        if (r.error) throw r.error;
        var d = (r.data && r.data[0]) || null;
        if (!d) { box.appendChild(el('span', 'rkMinePos', 'UNRANKED')); return; }
        box.appendChild(el('span', 'rkMinePos',
          '#' + num(d.rnk) + ' OF ' + num(d.total) + ' \u00B7 ' + valueOf(b, d)));
      } catch (e) {
        box.appendChild(el('span', 'rkMinePos', '\u2014'));
      }
    }

    function loadMine (b) {
      var s = state[b.key];
      if (!s) return;
      paintMine(s.mineEl, b, function () { openRankPage(b.key); });
    }

    function reload (b) {
      loadTop(b);
      loadMine(b);
    }

    function tick () {
      if (document.visibilityState !== 'visible' || !seen) return;
      BOARDS.forEach(reload);
    }

    function start () {
      if (started) return;
      started = true;
      BOARDS.forEach(reload);
      clearInterval(timer);
      timer = setInterval(tick, TICK_MS);
    }

    document.addEventListener('DOMContentLoaded', function () {
      if (!buildCards()) return;
      buildNav();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && started) tick();
      });
    });

    window.openRankHub = function () {
      if (!dzPanelOpen('rankHub')) return;
      seen = true;
      if (started) tick(); else start();
    };

    window.closeRankHub = function () {
      if (!dzPanelShut('rankHub')) return;
      seen = false;
    };

    var pg = { board: 'level', rows: [], off: 0, total: 0, done: false, busy: false, wired: false };

    function pgBoard () {
      for (var i = 0; i < BOARDS.length; i++) if (BOARDS[i].key === pg.board) return BOARDS[i];
      return BOARDS[0];
    }

    function pgTitle () {
      var t = document.getElementById('rkPgTitle');
      if (t) t.textContent = pgBoard().name + ' RANKING';
    }

    function pgReset () {
      pg.rows = []; pg.off = 0; pg.total = 0; pg.done = false;
      var list = document.getElementById('rkPgList');
      if (list) {
        list.innerHTML = '';
        list.appendChild(el('div', 'rkSkel'));
        list.appendChild(el('div', 'rkSkel'));
        list.appendChild(el('div', 'rkSkel'));
      }
      var page = document.getElementById('rankPage');
      if (page) page.scrollTop = 0;
      pgLoadMine();
      pgLoad();
    }

    async function pgLoad () {
      var c = db(), b = pgBoard();
      if (pg.busy || pg.done) return;
      var list = document.getElementById('rkPgList');
      if (!list) return;
      if (!c) { list.innerHTML = ''; list.appendChild(el('div', 'xpNote', 'RANKING UNAVAILABLE')); return; }
      pg.busy = true;
      try {
        var pgCache = window.dzCached ? window.dzCached() : null;
        var pgLoadRows = async function () {
          var r = await c.rpc('get_rank_board', { board: b.key, lim: PG_PAGE, off: pg.off });
          if (r.error) throw r.error;
          return r.data || [];
        };
        var rows = pgCache
          ? await pgCache.getOrSet(
              'ranking:' + b.key + ':page:' + pg.off + ':' + PG_PAGE, pgLoadRows, 'ranking')
          : await pgLoadRows();
        if (!pg.off) list.innerHTML = '';
        if (rows.length) pg.total = Number(rows[0].total) || pg.total;
        pg.rows = pg.rows.concat(rows);
        pg.off += rows.length;
        if (rows.length < PG_PAGE || (pg.total && pg.rows.length >= pg.total)) pg.done = true;

        var uid = me() ? me().id : null;
        rows.forEach(function (row) {
          list.appendChild(rowEl(b, row, uid, function (rr) {
            if (!rr.username || typeof openProfileByUsername !== 'function') return;
            openProfileByUsername(rr.username, true);
          }));
        });

        var end = document.getElementById('rkPgEnd');
        if (end) {
          end.textContent = pg.done
            ? (pg.rows.length ? ('END \u00B7 ' + num(pg.total || pg.rows.length) + ' RANKED ARTISTS') : '')
            : 'LOADING\u2026';
        }
        if (!pg.rows.length) list.appendChild(el('div', 'xpNote', 'NO RANKED ARTISTS YET'));
      } catch (e) {
        if (!pg.rows.length) { list.innerHTML = ''; list.appendChild(el('div', 'xpNote', 'COULDN\u2019T LOAD RANKING')); }
      } finally {
        pg.busy = false;
      }
    }

    function pgLoadMine () {
      var box = document.getElementById('rkPgMine');
      if (!box) return;
      paintMine(box, pgBoard(), null);
    }

    window.openRankPage = function (boardKey) {
      var page = document.getElementById('rankPage');
      if (!page) return;
      pg.board = boardKey || pg.board || 'level';

      if (!pg.wired) {
        pg.wired = true;
        page.addEventListener('scroll', function () {
          if (pg.busy || pg.done) return;
          if (page.scrollHeight - page.scrollTop - page.clientHeight < NEAR_END) pgLoad();
        }, { passive: true });
      }

      dzPanelOpen('rankPage');
      pgTitle();
      pgReset();
    };

    window.closeRankPage = function () { dzPanelShut('rankPage'); };

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      var page = document.getElementById('rankPage');
      if (page && page.classList.contains('open')) { closeRankPage(); return; }
      var hub = document.getElementById('rankHub');
      if (hub && hub.classList.contains('open')) closeRankHub();
    });

    window.rkRefresh = function () {
      if (started) BOARDS.forEach(reload);
      var page = document.getElementById('rankPage');
      if (page && page.classList.contains('open')) { pgLoadMine(); pgReset(); }
    };
  })();
