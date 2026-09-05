(function () {
  'use strict';

  var ROOTS = {
    bnHome:      [],
    bnGallery:   ['#fg'],
    bnUpload:    ['#pfUpMod'],
    bnCommunity: ['#communityPage'],
    bnProfile:   ['#profilePage', '#authMod']
  };

  var RANGE = 8;
  var DEPTH = 5;
  var POLL  = 380;

  var activeId = '';
  var root     = null;
  var scroller = null;
  var timer = 0;
  var saved   = {};
  var pending = '';
  var pendingUntil = 0, hurry = 0;
  var glide = 0, wasLocked = false;
  var mqReduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  function docBox () { return document.scrollingElement || document.documentElement; }

  function overflow (el) {
    return el ? (el.scrollHeight - el.clientHeight) : 0;
  }

  function scrolls (el) {
    if (overflow(el) <= RANGE) return false;
    var oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  }

  function findRoot (id) {
    var sel = ROOTS[id] || [], i, el, fallback = null;
    for (i = 0; i < sel.length; i++) {
      el = document.querySelector(sel[i]);
      if (!el) continue;
      if (el.classList.contains('open')) return el;
      if (!fallback) fallback = el;
    }
    return sel.length ? fallback : null;
  }

  function findScroller (box) {
    if (!box) return null;
    if (scrolls(box)) return box;
    var best = null, bestOver = RANGE;
    var level = [box], depth = 0;
    while (level.length && depth < DEPTH) {
      var next = [];
      for (var i = 0; i < level.length; i++) {
        var kids = level[i].children;
        for (var k = 0; k < kids.length; k++) {
          var el = kids[k];
          if (el.nodeType !== 1 || (window.SVGElement && el instanceof SVGElement)) continue;
          var over = overflow(el);
          if (over > bestOver && scrolls(el)) { best = el; bestOver = over; }
          next.push(el);
        }
      }
      level = next;
      depth++;
    }
    return best;
  }

  function boxOf () { return scroller || docBox(); }

  function room (box) { return box ? (box.scrollHeight - box.clientHeight) : 0; }

  function locked () {
    return document.body.style.overflow === 'hidden' ||
           document.documentElement.style.overflow === 'hidden';
  }

  function setScroll (box, y) {
    try { box.scrollTo({ top: y, behavior: 'instant' }); }
    catch (e) { box.scrollTop = y; }
  }

  function remember () {
    if (!activeId || pending) return;
    var box = boxOf();
    if (room(box) <= RANGE) return;
    saved[activeId] = box.scrollTop;
  }

  function restoreLater (id) {
    if (!saved[id] || saved[id] <= RANGE) return;
    pending = id;
    pendingUntil = Date.now() + 1500;
    if (!hurry) hurry = setInterval(applyPending, 70);
    applyPending();
  }

  function dropPending () {
    pending = '';
    if (hurry) { clearInterval(hurry); hurry = 0; }
  }

  function applyPending () {
    if (!pending) { dropPending(); return; }
    if (Date.now() > pendingUntil) { dropPending(); return; }
    if (pending !== activeId) return;
    var box = boxOf(), max = room(box);
    if (max <= RANGE) return;
    var y = Math.min(saved[pending], max);
    if (Math.abs(box.scrollTop - y) > 1) setScroll(box, y);
    if (y >= saved[pending] - 1) { dropPending(); }
  }

  function stopGlide () { if (glide) { cancelAnimationFrame(glide); glide = 0; } }

  function toTop (start) {
    if ((scroller && !scroller.isConnected) || (root && !root.isConnected)) relink();
    var box = boxOf();
    if (!box) return;
    var from = Math.max(box.scrollTop, Math.min(start || 0, room(box)));
    if (from <= 0) return;
    stopGlide();
    dropPending();
    if (mqReduce && mqReduce.matches) { setScroll(box, 0); return; }
    if (box.scrollTop < from - 1) setScroll(box, from);
    var t0 = 0;
    var dur = Math.min(760, 260 + from * 0.22);
    glide = requestAnimationFrame(function step (now) {
      if (!t0) t0 = now;
      var k = (now - t0) / dur;
      if (k > 1) k = 1;
      setScroll(box, from * (1 - (1 - Math.pow(1 - k, 3))));
      glide = k < 1 ? requestAnimationFrame(step) : 0;
    });
  }

  function interrupt () { stopGlide(); dropPending(); }

  function relink () {
    root = findRoot(activeId);
    scroller = findScroller(root);
  }

  function measure () {
    if (!activeId) return;
    if ((root && !root.isConnected) || (scroller && !scroller.isConnected)) relink();
    else if (!scroller && root) scroller = findScroller(root);
    remember();
  }

  function setActive (id) {
    if (!id || id === activeId) return;
    remember();
    stopGlide();
    activeId = id;
    relink();
    restoreLater(id);
  }

  function currentId () {
    return document.documentElement.getAttribute('data-section') || '';
  }

  function onScroll (e) {
    var t = e.target;
    if (t === document || t === window || t === docBox() || t === document.body) {
      if (!root) measure();
      return;
    }
    if (t && t.nodeType === 1 && root && root.contains(t)) {
      if (t !== scroller && overflow(t) > RANGE) scroller = t;
      if (t === scroller) measure();
    }
  }

  function watchLock () {
    var now = locked();
    if (wasLocked && !now && activeId === 'bnHome' && docBox().scrollTop <= 1) restoreLater('bnHome');
    wasLocked = now;
  }

  function startPoll () {
    if (timer) return;
    timer = setInterval(function () {
      if (document.hidden) return;
      watchLock();
      applyPending();
      measure();
    }, POLL);
  }

  function onNavTap (e) {
    var el = e.target, item = null;
    while (el && el !== document) {
      if (el.getAttribute && el.hasAttribute('data-bn')) { item = el; break; }
      el = el.parentNode;
    }
    if (!item) return;
    if (item.getAttribute('data-bn') !== activeId) return;
    var box = boxOf();
    var from = box ? box.scrollTop : 0;
    requestAnimationFrame(function () { toTop(from); });
  }

  setActive(currentId() || 'bnHome');

  if (window.MutationObserver) {
    new MutationObserver(function () {
      var id = currentId();
      if (id) setActive(id);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-section'] });
  }

  addEventListener('scroll', onScroll, { capture: true, passive: true });
  addEventListener('pageshow', measure);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) measure(); });

  document.addEventListener('click', onNavTap, true);
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (ev) {
    addEventListener(ev, interrupt, { capture: true, passive: true });
  });

  wasLocked = locked();
  startPoll();

  window.bnScrollMemory = { toTop: toTop, saved: saved };
})();
