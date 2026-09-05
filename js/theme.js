(function () {
  'use strict';

  var KEY   = 'koeTheme';

  var THEMES = [
    { id:'graydark', name:'Charcoal', bg:'#1A1A1F', sur:'#24242C', ln:'#40404E', ac:'#F4F4F6',
      desc:'Deep, warm charcoal. Cards lift off the page so your eye lands on the art, not the screen.' },
    { id:'light', name:'Paper', bg:'#F7F5EB', sur:'#FFFEF9', ln:'#D8D3B8', ac:'#17151F',
      desc:'Warm gallery paper. Bright to work in, easy on the eyes for an hour.' },
    { id:'offwhite', name:'Off-White <em class="thmBadge">Default</em>',
      bg:'#F3F3F1', sur:'#FCFCFA', ln:'#D2D2CD', ac:'#17171A',
      desc:'Paper with the warmth taken out. The same brightness on a neutral ground, ' +
           'for a wall with no colour in it.' }
  ];
  var VALID = {}, META = {};
  THEMES.forEach(function (t) { VALID[t.id] = 1; META[t.id] = t.bg; });

  var TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5l3.5 3.5 7-8"/></svg>';
  var ROW  = '<span class="thmTbWrap"><span class="thmTb"></span><span class="thmLn"></span></span>';

  var grid = document.getElementById('thmGrid');
  if (grid) {
    grid.innerHTML = THEMES.map(function (t) {
      return '<button class="thmCard thmCard--' + t.id + '" data-theme="' + t.id + '" value="' + t.id + '" ' +
          'role="radio" aria-checked="false" type="button" ' +
          'style="--p-bg:' + t.bg + ';--p-sur:' + t.sur + ';--p-ln:' + t.ln + ';--p-ac:' + t.ac + '">' +
        '<span class="thmCheck" aria-hidden="true">' + TICK + '</span>' +
        '<span class="thmPrev" aria-hidden="true">' +
          '<span class="thmPrevTop"><span class="thmPrevLogo"></span></span>' +
          '<span class="thmPrevBody">' +
            '<span class="thmPrevSide"><span class="thmLn"></span><span class="thmLn thmLn--s"></span>' +
              '<span class="thmLn thmLn--ac"></span><span class="thmLn thmLn--s"></span></span>' +
            '<span class="thmPrevMain">' + ROW + ROW + ROW + ROW + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="thmMeta">' +
          '<span class="thmName">' + t.name + '</span>' +
          '<span class="thmDesc">' + t.desc + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  var page  = document.getElementById('themePage');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.thmCard'));
  var lastFocus = null;
  var prevOverflow = { body:'', doc:'' };

  function saved () {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    return VALID[v] ? v : 'offwhite';
  }

  function idOf (c) {
    for (var k in VALID) {
      if (VALID.hasOwnProperty(k) && c.classList.contains('thmCard--' + k)) return k;
    }
    var v = c.getAttribute('data-theme') || c.getAttribute('value');
    return VALID[v] ? v : null;
  }

  function paint (t) {
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', META[t]);
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', t === 'graydark' ? 'dark' : 'light');
    syncCards(t);
  }

  var fadeTimer = null;
  function fade () {
    var root = document.documentElement;
    root.classList.add('thmFade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { root.classList.remove('thmFade'); }, 360);
  }

  function apply (t) {
    if (!VALID[t]) return;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    var reduce = window.matchMedia &&
                 matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && t !== document.documentElement.getAttribute('data-theme')) fade();
    paint(t);
  }

  function syncCards (t) {
    cards.forEach(function (c) {
      var on = idOf(c) === t;
      c.setAttribute('aria-checked', on ? 'true' : 'false');
      c.tabIndex = on ? 0 : -1;
    });
  }

  cards.forEach(function (c, i) {
    c.addEventListener('click', function () { apply(idOf(c)); });
    c.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % cards.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + cards.length) % cards.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End')  j = cards.length - 1;
      if (j === null) return;
      e.preventDefault();
      apply(idOf(cards[j]));
      cards[j].focus();
    });
  });

  function openThemePage () {
    if (!page) return;
    if (!page.classList.contains('open')) {
      lastFocus = document.activeElement;
      prevOverflow.body = document.body.style.overflow;
      prevOverflow.doc  = document.documentElement.style.overflow;
    }
    syncCards(saved());
    page.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    var sel = cards.filter(function (c) { return c.tabIndex === 0; })[0];
    if (sel) sel.focus({ preventScroll: true });
  }
  function closeThemePage () {
    if (!page) return;
    page.classList.remove('open');
    document.body.style.overflow = prevOverflow.body;
    document.documentElement.style.overflow = prevOverflow.doc;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && page && page.classList.contains('open')) closeThemePage();
  });

  window.openThemePage  = openThemePage;
  window.closeThemePage = closeThemePage;

  syncCards(saved());
})();
