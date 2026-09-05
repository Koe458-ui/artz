(function () {
  'use strict';
  var TIERS = [
    { lvl: 5,   name: 'New Artist',      v: '--ms1' },
    { lvl: 10,  name: 'Sketch Explorer', v: '--ms2' },
    { lvl: 20,  name: 'Creative Soul',   v: '--ms3' },
    { lvl: 35,  name: 'Gallery Artist',  v: '--ms4' },
    { lvl: 50,  name: 'Community Star',  v: '--ms5' },
    { lvl: 70,  name: 'Master Creator',  v: '--ms6' },
    { lvl: 85,  name: 'Elite Artist',    v: '--ms7' },
    { lvl: 100, name: 'DigiArtz Legend', v: '--ms8' }
  ];

  function tierFor (level) {
    var lv = Number(level) || 0, t = null;
    for (var i = 0; i < TIERS.length; i++) { if (lv >= TIERS[i].lvl) t = TIERS[i]; }
    return t;
  }
  function fill (t) { return t ? 'var(' + t.v + ')' : ''; }
  function nameC (t) { return t ? 'var(' + t.v + '-name)' : ''; }

  function paintName (el, level) {
    if (!el) return;
    var t = tierFor(level);
    el.classList.toggle('msName', !!t);
    if (t) el.style.setProperty('--ms-c', nameC(t));
    else   el.style.removeProperty('--ms-c');
  }

  function paintRibbon (el, level) {
    if (!el) return;
    var t = tierFor(level);
    el.textContent = '';
    if (!t) { el.hidden = true; el.style.removeProperty('--ms-c'); return; }
    el.hidden = false;
    el.style.setProperty('--ms-c', fill(t));
    var lv = document.createElement('span');
    lv.className = 'msRibLvl';
    lv.textContent = 'LVL ' + t.lvl;
    el.appendChild(lv);
    el.appendChild(document.createTextNode(' ' + t.name));
    el.setAttribute('title', t.name + ' \u00B7 reached at level ' + t.lvl);
  }

  window.DZ_MS = {
    TIERS: TIERS,
    tierFor: tierFor,
    fill: fill,
    nameColor: nameC,
    paintName: paintName,
    paintRibbon: paintRibbon
  };
})();

(function () {
  'use strict';
    // The same ladder public.xp_level_thresholds() returns — read together, so they must change together
  var XP_TOTALS = [0,40,80,120,160,205,250,295,340,390,440,490,540,595,650,705,760,820,880,940,
    1000,1065,1130,1195,1260,1330,1400,1470,1540,1615,1690,1765,1840,1920,2000,2080,2160,2245,2330,2415,
    2500,2590,2680,2770,2860,2955,3050,3145,3240,3340,3440,3540,3640,3745,3850,3955,4060,4170,4280,4390,
    4500,4615,4730,4845,4960,5080,5200,5320,5445,5575,5705,5835,5965,6100,6235,6370,6505,6645,6785,6925,
    7065,7210,7355,7500,7645,7795,7945,8095,8245,8400,8555,8710,8865,9025,9185,9345,9505,9670,9835,10000];
  function levelOf (xp) {
    var l = 1;
    for (var i = 0; i < XP_TOTALS.length; i++) { if (xp >= XP_TOTALS[i]) l = i + 1; else break; }
    return l;
  }
  function rankTitle (level) {
    var t = window.DZ_MS && window.DZ_MS.tierFor(level);
    return t ? t.name : 'Newcomer';
  }
  function el (tag, cls, text) { return window.dzEl(tag, cls, text); }
  function svgIcon (d) {
    var w = document.createElement('span');
    w.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    return w.firstChild;
  }
  var ICONS = {
    upload:   '<path d="M12 17V4m0 0 5 5m-5-5-5 5"/><path d="M4 20h16"/>',
    like:     '<path d="M12 20.3 4.8 13a4.6 4.6 0 1 1 6.5-6.5l.7.7.7-.7A4.6 4.6 0 1 1 19.2 13Z"/>',
    bookmark: '<path d="M6.5 3.5h11V21L12 16.8 6.5 21Z"/>',
    comment:  '<path d="M21 12a8 8 0 0 1-8 8H4l1.6-3.2A8 8 0 1 1 21 12Z"/>'
  };

  function client () { return (typeof sb !== 'undefined' && sb) ? sb : null; }

  window.xpLoadInto = async function (wrapId, targetId, opts) {
    opts = opts || {};
    var wrap = document.getElementById(wrapId);
    if (!wrap) return;
    if (!targetId) { wrap.innerHTML = ''; wrap.appendChild(el('div', 'xpNote', 'SIGN IN TO SEE YOUR PROGRESS')); return; }
    var c = client();
    if (!c) { wrap.innerHTML = ''; wrap.appendChild(el('div', 'xpNote', 'PROGRESS UNAVAILABLE \u2014 TRY AGAIN')); return; }
    wrap.innerHTML = '';
    wrap.appendChild(el('div', 'xpNote', 'LOADING\u2026'));
    try {
      var calls = [c.rpc('get_artist_progress', { target: targetId })];
      if (opts.leaderboard) calls.push(c.rpc('get_xp_leaderboard', { lim: 10 }));
      var res = await Promise.all(calls);
      if (res[0].error) throw res[0].error;
      var p = (res[0].data && res[0].data[0]) || { uploads: 0, likes_given: 0, bookmarks_given: 0, comments_made: 0, xp: 0, level: 1 };
      var lb = (opts.leaderboard && res[1] && !res[1].error) ? (res[1].data || []) : null;
      renderAll(wrap, p, lb, targetId);
    } catch (e) {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', 'xpNote', 'COULDN\u2019T LOAD PROGRESS \u2014 TRY AGAIN'));
    }
  };

  function renderAll (wrap, p, lb, targetId) {
    wrap.innerHTML = '';
    var xp = Number(p.xp) || 0;
    var level = Number(p.level) || levelOf(xp);

    var rank = el('div', 'xpCard xpRank');
    rank.appendChild(el('div', 'xpRankLvl', 'LEVEL ' + level));
    rank.appendChild(el('div', 'xpRankTitle', rankTitle(level)));
    var cur = XP_TOTALS[level - 1];
    var next = level < 100 ? XP_TOTALS[level] : null;
    var track = el('div', 'xpBarTrack');
    var fill = el('div', 'xpBarFill');
    track.appendChild(fill);
    rank.appendChild(track);
    var nums = el('div', 'xpBarNums');
    nums.appendChild(el('span', null, xp + ' XP'));
    nums.appendChild(el('span', null, next != null ? next + ' XP' : 'MAX'));
    rank.appendChild(nums);
    var nxt = el('div', 'xpNext');
    if (next != null) {
      var b = el('b', null, String(next - xp) + ' XP');
      nxt.appendChild(b);
      nxt.appendChild(document.createTextNode(' UNTIL LEVEL ' + (level + 1)));
    } else {
      nxt.textContent = 'MAX LEVEL REACHED';
    }
    rank.appendChild(nxt);
    wrap.appendChild(rank);
    var pct = next != null ? Math.max(0, Math.min(100, (xp - cur) * 100 / (next - cur))) : 100;
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = pct + '%'; }); });

    var earn = el('div', 'xpCard');
    earn.appendChild(el('div', 'xpCardLbl', 'HOW TO EARN XP'));
    var eg = el('div', 'xpGrid2');
    [['upload', 'Upload an artwork', '+10 XP'],
     ['like', 'Like an artwork', '+2 XP'],
     ['bookmark', 'Bookmark an artwork', '+2 XP'],
     ['comment', 'Comment', '+1 XP']].forEach(function (r) {
      var row = el('div', 'xpEarnRow');
      row.appendChild(svgIcon(ICONS[r[0]]));
      row.appendChild(el('span', null, r[1]));
      row.appendChild(el('span', 'xpEarnAmt', r[2]));
      eg.appendChild(row);
    });
    earn.appendChild(eg);
    wrap.appendChild(earn);

    var stats = el('div', 'xpCard');
    stats.appendChild(el('div', 'xpCardLbl', 'COMMUNITY ACTIVITY'));
    var sg = el('div', 'xpGrid2');
    [[p.uploads, 'ARTWORKS UPLOADED'], [p.likes_given, 'LIKES GIVEN'],
     [p.bookmarks_given, 'BOOKMARKS GIVEN'], [p.comments_made, 'COMMENTS MADE']].forEach(function (s) {
      var t = el('div', 'xpStat');
      t.appendChild(el('div', 'xpStatNum', String(Number(s[0]) || 0)));
      t.appendChild(el('div', 'xpStatLbl', s[1]));
      sg.appendChild(t);
    });
    stats.appendChild(sg);
    wrap.appendChild(stats);

    var mile = el('div', 'xpCard');
    mile.appendChild(el('div', 'xpCardLbl', 'ARTIST MILESTONES'));
    var curTitle = rankTitle(level);
    ((window.DZ_MS && DZ_MS.TIERS) || []).forEach(function (r) {
      var done = level >= r.lvl;
      var row = el('div', 'xpMile' + (done ? ' done' : '') + (done && r.name === curTitle ? ' cur' : ''));
      var t = window.DZ_MS && DZ_MS.tierFor(r.lvl);
      if (t && done) {
        row.style.setProperty('--ms-c', DZ_MS.fill(t));
        row.style.setProperty('--ms-n', DZ_MS.nameColor(t));
      }
      row.appendChild(el('div', 'xpMileBadge', done ? '\u2713' : String(r.lvl)));
      row.appendChild(el('div', 'xpMileName', r.name));
      row.appendChild(el('div', 'xpMileLvl', 'LVL ' + r.lvl));
      mile.appendChild(row);
    });
    wrap.appendChild(mile);

    if (lb) {
      var board = el('div', 'xpCard');
      board.appendChild(el('div', 'xpCardLbl', 'COMMUNITY LEADERBOARD'));
      if (!lb.length) board.appendChild(el('div', 'xpNote', 'NO RANKED ARTISTS YET'));
      lb.forEach(function (row, i) {
        var r = el('div', 'xpLbRow' + (row.user_id === targetId ? ' self' : ''));
        r.appendChild(el('div', 'xpLbRank' + (i < 3 ? ' m' + (i + 1) : ''), i < 3 ? ['1ST', '2ND', '3RD'][i] : '#' + (i + 1)));
        var ava = el('div', 'xpLbAva');
        if (row.avatar_url) {
          var img = document.createElement('img');
          img.alt = ''; img.loading = 'lazy';
          img.src = (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(row.avatar_url) : row.avatar_url;
          ava.appendChild(img);
        } else {
          ava.textContent = (row.username || '?').charAt(0).toUpperCase();
        }
        r.appendChild(ava);
        var lbName = el('div', 'xpLbName', row.username || 'Artist');
        if (window.DZ_MS) DZ_MS.paintName(lbName, Number(row.level) || 0);
        r.appendChild(lbName);
        r.appendChild(el('div', 'xpLbLvl', 'LEVEL ' + (Number(row.level) || 1)));
        board.appendChild(r);
      });
      wrap.appendChild(board);
    }
  }

  var xpLastFocus = null;
  window.openXpPage = function () {
    xpLastFocus = document.activeElement;
    if (!dzPanelOpen('xpPage')) return;
    var target = (window.pf && window.pf.profile && window.pf.profile.id) ||
                 (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;
    window.xpLoadInto('xpPageWrap', target, { leaderboard: true });
  };
  window.closeXpPage = function () {
    if (!dzPanelShut('xpPage')) return;
    if (xpLastFocus && xpLastFocus.focus) xpLastFocus.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var pg = document.getElementById('xpPage');
    if (pg && pg.classList.contains('open')) window.closeXpPage();
  });
})();

(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
      });
    });
  }
  window.addEventListener('offline', function () {
    if (typeof showToast === 'function') showToast('You\u2019re offline \u2014 showing saved copies');
  });
  window.addEventListener('online', function () {
    if (typeof showToast === 'function') showToast('Back online');
  });
})();
