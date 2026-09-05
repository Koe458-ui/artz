(function () {
  'use strict';

  var WIDE = '(min-width: 900px)';

  function el(id) { return document.getElementById(id); }
  function menu()  { return el('dzTopMenu'); }
  function ham()   { return el('dzHamBtn'); }
  function scrim() { return el('dzMenuScrim'); }

  function isOpen() {
    var m = menu();
    return !!m && m.classList.contains('open');
  }

  function dzMenuOpen() {
    var m = menu(), h = ham(), s = scrim();
    if (!m || isOpen()) return;
    m.classList.add('open');
    if (s) s.classList.add('on');
    if (h) h.setAttribute('aria-expanded', 'true');
    if (!window.matchMedia || !matchMedia('(hover: none)').matches) {
      var first = m.querySelector('.dzMenuItem');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
    }
  }

  function dzMenuClose() {
    var m = menu(), h = ham(), s = scrim();
    if (!m || !isOpen()) return;
    m.classList.remove('open');
    if (s) s.classList.remove('on');
    if (h) h.setAttribute('aria-expanded', 'false');
    dzMenuSubClose();
    if (h && m.contains(document.activeElement)) {
      try { h.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function dzMenuToggle() {
    if (isOpen()) dzMenuClose(); else dzMenuOpen();
  }

  function dzOpenSearch() {
    dzMenuClose();
    if (typeof window.openFgSearch === 'function') window.openFgSearch();
  }

  var MENUS = {
    ex: {
      wrap:'dzExWrap', btn:'dzExBtn', grp:'dzMenuExGrp', grpBtn:'dzMenuExBtn',
      secs:{ artworks:1, marketplace:1, blog:1, resources:1, jobs:1 },
      fallback:'artworks',
      pick: function (sec, e) {
        var path = (typeof window.dzRoutePath === 'function') ? window.dzRoutePath(sec) : null;
        if (path && typeof window.dzRouteGo === 'function' && window.dzRouteGo(path)) {
          if (e) e.preventDefault();
          return;
        }
        if (e) e.preventDefault();
        if (typeof window.bnGoGallery === 'function') window.bnGoGallery();
        else if (typeof window.openFG === 'function') window.openFG();
        if (typeof window.fgSwitchSection === 'function') window.fgSwitchSection(sec);
      }
    },
    cm: {
      wrap:'dzCmWrap', btn:'dzCmBtn', grp:'dzMenuCmGrp', grpBtn:'dzMenuCmBtn',
      secs:{ communities:1, friends:1, ranking:1 },
      fallback:'communities',
      pick: function (k, e) {
        if (k === 'ranking') {
          if (e) e.preventDefault();
          if (typeof window.openRankHub === 'function') window.openRankHub();
          return;
        }
        if (k === 'friends') {
          if (e) e.preventDefault();
          if (typeof window.bnGoFriends === 'function') window.bnGoFriends();
          return;
        }
        if (typeof window.dzRouteGo === 'function' && window.dzRouteGo('/community')) {
          if (e) e.preventDefault();
          return;
        }
        if (e) e.preventDefault();
        if (typeof window.bnGoCommunity === 'function') window.bnGoCommunity();
      }
    },
    up: {
      wrap:'dzUpWrap', btn:'dzUpBtn', grp:'dzMenuUpGrp', grpBtn:'dzMenuUpBtn',
      secs:{ artwork:1, marketplace:1, blog:1, resources:1, jobs:1 },
      fallback:'artwork',
      pick: function (sec) {
        if (typeof window.bnGoUpload === 'function') window.bnGoUpload(sec);
      }
    },

    ac: {
      wrap:'dzAcWrap', btn:'dzTopAccount', grp:'dzMenuAcGrp', grpBtn:'dzMenuAccount',
      secs:{ portfolio:1, analytics:1, payouts:1 },
      fallback:'portfolio',
      armed: function () {
        var w = el('dzAcWrap');
        return !!w && w.classList.contains('dzHasMenu');
      },
      pick: function (k) {
        if (k === 'analytics') { if (typeof window.anHubOpen === 'function') window.anHubOpen(); return; }
        if (k === 'payouts')   { if (typeof window.payHubOpen === 'function') window.payHubOpen(); return; }
        if (typeof window.bnGoProfile === 'function') window.bnGoProfile();
      }
    }
  };

  function wrapOf(k) { return el(MENUS[k].wrap); }
  function ddIsOpen(k) {
    var w = wrapOf(k);
    return !!w && w.classList.contains('open');
  }
  function menuAt(node) {
    for (var k in MENUS) {
      var w = wrapOf(k);
      if (w && w.contains(node)) return k;
    }
    return null;
  }

  var ddTimer = null;
  function ddCancel() { if (ddTimer) { clearTimeout(ddTimer); ddTimer = null; } }

  function armed(k) {
    var m = MENUS[k];
    return !m.armed || m.armed();
  }

  function ddOpen(k) {
    if (!armed(k)) return;
    ddCancel();
    for (var o in MENUS) if (o !== k) ddClose(o);
    var w = wrapOf(k), b = el(MENUS[k].btn);
    if (!w || ddIsOpen(k)) return;
    w.classList.add('open');
    if (b) b.setAttribute('aria-expanded', 'true');
  }

  function ddClose(k) {
    var w = wrapOf(k), b = el(MENUS[k].btn);
    if (!w || !w.classList.contains('open')) return;
    w.classList.remove('open');
    if (b) b.setAttribute('aria-expanded', 'false');
    if (b && w.contains(document.activeElement)) {
      try { b.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function ddCloseAll() {
    ddCancel();
    for (var k in MENUS) ddClose(k);
  }

  function ddToggle(k, e) {
    if (!armed(k)) return false;
    if (e) e.preventDefault();
    if (ddIsOpen(k)) ddClose(k); else ddOpen(k);
    return true;
  }

  function dzMenuSubToggle(k) {
    var m = MENUS[k]; if (!m || !armed(k)) return false;
    var g = el(m.grp), b = el(m.grpBtn);
    if (!g) return false;
    var on = !g.classList.contains('open');
    if (on) for (var o in MENUS) if (o !== k) subClose(o);
    g.classList.toggle('open', on);
    if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
    return true;
  }
  function subClose(k) {
    var m = MENUS[k]; if (!m) return;
    var g = el(m.grp), b = el(m.grpBtn);
    if (!g || !g.classList.contains('open')) return;
    g.classList.remove('open');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function dzMenuSubClose() { for (var k in MENUS) subClose(k); }

  function pick(k, sec, e) {
    var m = MENUS[k];
    if (!m.secs[sec]) sec = m.fallback;
    ddCloseAll();
    dzMenuClose();
    m.pick(sec, e);
  }

  function dzAcClick(e) {
    if (ddToggle('ac', e)) return;
    if (e) e.preventDefault();
    if (typeof window.bnGoProfile === 'function') window.bnGoProfile(e);
  }
  function dzAcMenuClick(e) {
    if (dzMenuSubToggle('ac')) { if (e) e.preventDefault(); return false; }
    if (e) e.preventDefault();
    dzMenuClose();
    if (typeof window.bnGoProfile === 'function') window.bnGoProfile(e);
    return false;
  }

  window.dzMenuClose     = dzMenuClose;
  window.dzMenuToggle    = dzMenuToggle;
  window.dzMenuSubToggle = dzMenuSubToggle;
  window.dzMenuSubClose  = dzMenuSubClose;
  window.dzOpenSearch    = dzOpenSearch;
  window.dzAcClick       = dzAcClick;
  window.dzAcMenuClick   = dzAcMenuClick;

  window.dzExToggle      = function (e) { ddToggle('ex', e); };
  window.dzCmToggle      = function (e) { ddToggle('cm', e); };
  window.dzUpToggle      = function (e) { ddToggle('up', e); };
  window.dzExClose       = function () { ddClose('ex'); };
  window.dzCmClose       = function () { ddClose('cm'); };
  window.dzUpClose       = function () { ddClose('up'); };
  window.dzAcClose       = function () { ddClose('ac'); };
  window.dzExPick        = function (sec, e) { pick('ex', sec, e); };
  window.dzCmPick        = function (k, e)   { pick('cm', k, e); };
  window.dzUpPick        = function (sec, e) { pick('up', sec, e); };
  window.dzAcPick        = function (k, e)   { pick('ac', k, e); };

  document.addEventListener('click', function (e) {
    if (!isOpen()) return;
    var m = menu(), h = ham();
    var t = e.target;
    if ((m && m.contains(t)) || (h && h.contains(t))) return;
    dzMenuClose();
  }, true);

  document.addEventListener('click', function (e) {
    if (!menuAt(e.target)) ddCloseAll();
  }, true);

  if (!window.matchMedia || matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', function (e) {
      var k = menuAt(e.target);
      if (k) ddOpen(k);
    });
    document.addEventListener('mouseout', function (e) {
      var k = menuAt(e.target);
      if (!k || !ddIsOpen(k)) return;
      var to = e.relatedTarget;
      if (to && wrapOf(k).contains(to)) return;
      ddCancel();
      ddTimer = setTimeout(function () { ddClose(k); }, 180);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var k in MENUS) {
      if (ddIsOpen(k)) { e.stopPropagation(); ddClose(k); return; }
    }
    if (!isOpen()) return;
    e.stopPropagation();
    dzMenuClose();
  }, true);

  if (window.matchMedia) {
    var mq = matchMedia(WIDE);
    var onWide = function () { if (mq.matches) dzMenuClose(); else ddCloseAll(); };
    if (mq.addEventListener) mq.addEventListener('change', onWide);
    else if (mq.addListener) mq.addListener(onWide);
  }
})();
