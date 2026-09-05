(function () {
  'use strict';

  var ROUTES = {
    '/':            { panel: null,            open: home },
    '/explore':     { panel: 'fg',            open: gallery('artworks'),    section: 'artworks' },
    '/marketplace': { panel: 'fg',            open: gallery('marketplace'), section: 'marketplace' },
    '/resources':   { panel: 'fg',            open: gallery('resources'),   section: 'resources' },
    '/blog':        { panel: 'fg',            open: gallery('blog'),        section: 'blog' },
    '/community':   { panel: 'communityPage', open: community },
    '/login':       { panel: null,            open: login, foreign: true }
  };

  var SECTION_PATH = {};
  Object.keys(ROUTES).forEach(function (p) {
    if (ROUTES[p].section) SECTION_PATH[ROUTES[p].section] = p;
  });

  var FOREIGN_RE = /^\/(?:artwork|profile|resource|blog|listing|job)\/./;

  function el(id) { return document.getElementById(id); }
  function isOpen(id) {
    var n = el(id);
    return !!(n && n.classList.contains('open'));
  }
  function fn(name) {
    return typeof window[name] === 'function' ? window[name] : null;
  }

  function activeSection() {
    var p = document.querySelector('#fg .fgSec.active');
    return p ? String(p.id).replace('fgSec-', '') : null;
  }

  function gallery(section) {
    return function () {
      var go = fn('bnGoGallery') || fn('openFG');
      if (go) go();
      var sw = fn('fgSwitchSection');
      if (sw && section) sw(section);
    };
  }
  function community() {
    var go = fn('bnGoCommunity');
    if (go) go();
  }
  function home() {
    var go = fn('bnGoHome');
    if (go) go();
  }
  function login() {
    var go = fn('openAuthMod');
    if (go) go();
  }

  var pushed = false;
  var returnUrl = null;
  var opening = false;
  var owns = false;

  function run(r) {
    opening = true;
    try { r.open(); } finally { opening = false; }
    if (r.panel) owns = true;
  }

  function address(path) {
    try {
      if (path) {
        owns = true;
        if (window.location.pathname === path) {
          pushed = true;
          return;
        }
        if (pushed) {
          history.replaceState({ dzr: 1 }, '', path);
        } else {
          returnUrl = window.location.pathname + window.location.search;
          history.pushState({ dzr: 1 }, '', path);
          pushed = true;
        }
      } else {
        owns = false;
        var back = returnUrl && !addressOfAClosedPanel(returnUrl) ? returnUrl : '/';
        if (window.location.pathname !== '/' &&
            window.location.pathname + window.location.search !== back) {
          history.replaceState({ dzr: 1 }, '', back);
        }
      }
    } catch (e) {}
  }
  window.dzRouteAddress = address;

  function enter(path) {
    var r = ROUTES[path];
    if (!r) return;
    if (r.foreign) { r.open(); return; }

    if (window.dzNavBegin) window.dzNavBegin();
    try { run(r); } finally { if (window.dzNavEnd) window.dzNavEnd(); }
    if (r.panel) address(path); else audit();
  }

  var ADDRESSED = [
    { re: /^\/(?:explore|marketplace|resources|blog)\/?$/, panel: 'fg' },
    { re: /^\/community\/?$/,                             panel: 'communityPage' },
    { re: /^\/profile\/./,                                panel: 'profilePage' },
    { re: /^\/artwork\/./,                                panel: 'artModal' },
    { re: /^\/(?:resource|blog|listing|job)\/./,          panel: 'dzView' },
    { re: /^\/login\/?$/,                                 panel: 'authMod' }
  ];

  function addressOfAClosedPanel(url) {
    var p = String(url).split('#')[0].split('?')[0];
    for (var i = 0; i < ADDRESSED.length; i++) {
      if (ADDRESSED[i].re.test(p)) return !isOpen(ADDRESSED[i].panel);
    }
    return false;
  }

  var auditTimer = null;
  function audit() {
    auditTimer = null;
    if (addressOfAClosedPanel(window.location.pathname)) address(null);
  }
  window.dzRouteAudit = audit;

  function auditSoon() {
    if (window.dzNavMoving && window.dzNavMoving()) return;
    if (auditTimer) return;
    auditTimer = setTimeout(function () {
      auditTimer = null;
      if (window.dzNavMoving && window.dzNavMoving()) return;
      audit();
    }, 0);
  }

  function sync() {
    var path = window.location.pathname;
    var r = ROUTES[path];

    if (FOREIGN_RE.test(path)) return;
    if (r && r.foreign) return;

    if (!r || !r.panel) {
      if (owns) home();
      return;
    }

    if (!isOpen(r.panel)) run(r);
    else {
      owns = true;
      if (r.section && activeSection() !== r.section) {
        var sw = fn('fgSwitchSection');
        if (sw) sw(r.section);
      }
    }
  }

  window.addEventListener('popstate', function () {
    pushed = false;
    returnUrl = null;
    sync();
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.origin !== window.location.origin) return;
    if (!ROUTES[a.pathname] || a.search || a.hash) return;
    e.preventDefault();
    enter(a.pathname);
  });

  function chipMoved() {
    if (opening || !owns) return;
    if (!isOpen('fg')) return;
    var path = SECTION_PATH[activeSection()];
    var here = ROUTES[window.location.pathname];
    if (!here || here.panel !== 'fg') return;
    try {
      if (path) { if (path !== window.location.pathname) history.replaceState({ dzr: 1 }, '', path); }
      else {
        history.replaceState({}, '', returnUrl || '/');
        pushed = false; returnUrl = null; owns = false;
      }
    } catch (e) {}
  }

  if (window.MutationObserver) {
    var gal = el('fg');
    if (gal) {
      new MutationObserver(chipMoved)
        .observe(gal, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    ADDRESSED.forEach(function (a) {
      var node = el(a.panel);
      if (!node) return;
      var was = node.classList.contains('open');
      new MutationObserver(function () {
        var now = node.classList.contains('open');
        if (was && !now) auditSoon();
        was = now;
      }).observe(node, { attributes: true, attributeFilter: ['class'] });
    });
  }

  window.dzRouteGo = function (path) {
    if (!ROUTES[path]) return false;
    enter(path);
    return true;
  };

  window.dzRoutePath = function (id) { return SECTION_PATH[id] || null; };

  var r0 = ROUTES[window.location.pathname];
  if (r0 && (r0.panel || r0.foreign)) run(r0);
})();
