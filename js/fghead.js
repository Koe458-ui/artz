(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function mark(s) {
    return esc(s).replace(/\*([^*]+)\*/g, '<em class="fgHi">$1</em>');
  }
  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function stillness() {
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

    // One line per section: its word in the signature, eight things in it, "and more". The eight come from its own category list
  var HEADS = {
    artworks: {
      lead: 'Browse *artworks*',
      hint: 'Search artworks by title',
      desc: 'Discover anime art, characters, landscapes, sketches, concept art, ' +
            'fan art, 3D renders, pixel art, and more.'
    },
    marketplace: {
      lead: 'Browse the *marketplace*',
      hint: 'Search listings',
      desc: 'Buy prints, digital downloads, website templates, UI kits, icon ' +
            'sets, brushes, 3D models, commissions, and more.'
    },
    blog: {
      lead: 'Read the *blog*',
      hint: 'Search posts',
      desc: 'Catch up on tutorials, artist spotlights, interviews, tips and ' +
            'guides, reviews, community news, events, challenges, and more.'
    },
    resources: {
      lead: 'Find *resources*',
      hint: 'Search resources',
      desc: 'Download brushes, textures, fonts, PSD files, 3D assets, references, ' +
            'colour palettes, mockups, and more.'
    },
    jobs: {
      lead: 'Find *creative work*',
      hint: 'Search postings',
      desc: 'Apply for freelance briefs, full-time roles, part-time roles, remote ' +
            'positions, internships, contests, collaborations, and more.'
    }
  };

  function cats(sec) {
    if (sec === 'artworks') {
      var site = window.SITE_CATEGORIES;
      if (!Array.isArray(site)) return [];
      return site.map(function (c) { return { slug: c.slug, label: c.label }; });
    }
    var o = (window.FG_SECTIONS && window.FG_SECTIONS[sec] && window.FG_SECTIONS[sec].opts) || [];
    return o.map(function (x) { return { slug: slug(x), label: x }; });
  }

  function current(sec) {
    if (sec === 'artworks') {
      return (typeof window.dzArtCat === 'function') ? window.dzArtCat() : 'all';
    }
    return (window.fgSecFilter && window.fgSecFilter[sec]) || 'all';
  }

  var ARROW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="%D"/></svg>';

  function build(sec) {
    var h = HEADS[sec];
    if (!h) return '';
    var chips = [{ slug: 'all', label: 'All' }].concat(cats(sec));
    var cur = current(sec);
    return '' +
      '<header class="fgHead" id="fgHead-' + sec + '">' +
        '<h2 class="fgHeadLead">' + mark(h.lead) + '</h2>' +
        '<p class="fgHeadDesc">' + mark(h.desc) + '</p>' +
        '<div class="fgHeadSearch">' +
          '<span class="fgHeadSIco" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
            'stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/>' +
            '<path d="m20 20-3.6-3.6"/></svg></span>' +
          '<input type="search" class="fgHeadIn" id="' + fieldId(sec) + '" ' +
            'placeholder="' + esc(h.hint) + '" aria-label="' + esc(h.hint) + '" ' +
            'oninput="fgHeadSearch(\'' + sec + '\', this.value)">' +
          '<button type="button" class="fgHeadSX" aria-label="Clear search" ' +
            'onclick="fgHeadSearchClear(\'' + sec + '\')">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
            'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
          '<button type="button" class="fgHeadFlt" id="fgFltBtn-' + sec + '" ' +
            'onclick="fgOpenFilter(\'' + sec + '\')" aria-label="Filters" ' +
            'aria-controls="fgFltPanel">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/>' +
            '<line x1="11" y1="18" x2="13" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fgCatWrap">' +
          '<button type="button" class="fgCatNav fgCatPrev" data-fgnav="-1" ' +
            'aria-label="Scroll categories left">' + ARROW.replace('%D', 'm15 19-7-7 7-7') + '</button>' +
          '<div class="fgCatRail" id="fgCatRail-' + sec + '" role="group" ' +
            'aria-label="Categories">' +
            chips.map(function (c) {
              return '<button type="button" class="fgCatChip' + (c.slug === cur ? ' on' : '') + '" ' +
                'id="fgCat-' + sec + '-' + esc(c.slug) + '" aria-pressed="' +
                (c.slug === cur ? 'true' : 'false') + '" ' +
                'onclick="fgHeadCat(\'' + sec + '\',\'' + esc(c.slug) + '\')">' +
                esc(c.label) + '</button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="fgCatNav fgCatNext" data-fgnav="1" ' +
            'aria-label="Scroll categories right">' + ARROW.replace('%D', 'm9 5 7 7-7 7') + '</button>' +
        '</div>' +
      '</header>';
  }

  function fieldId(sec) {
    return sec === 'artworks' ? 'fgSearchIn' : (sec + 'HeadIn');
  }

  function fgHeadBuild(sec) {
    if (!HEADS[sec]) return;
    var panel = el('fgSec-' + sec);
    if (!panel || el('fgHead-' + sec)) return;
    panel.insertAdjacentHTML('afterbegin', build(sec));
    railWatch(el('fgCatRail-' + sec));
    if (typeof window.fgSyncFilterBtn === 'function') window.fgSyncFilterBtn();
  }

  var timer = {};
  function fgHeadSearch(sec, v) {
    var wrap = el(fieldId(sec));
    if (wrap) wrap.parentNode.classList.toggle('hasQ', !!String(v || '').length);
    if (sec === 'artworks') {
      clearTimeout(timer[sec]);
      timer[sec] = setTimeout(function () {
        if (typeof window.dzArtSearch === 'function') window.dzArtSearch();
      }, 140);
      return;
    }
    if (typeof window.fgSecSearchInput === 'function') window.fgSecSearchInput(sec, v);
  }
  function fgHeadSearchClear(sec) {
    var f = el(fieldId(sec));
    if (f) { f.value = ''; f.focus(); }
    fgHeadSearch(sec, '');
  }

  function fgHeadCat(sec, s) {
    var rail = el('fgCatRail-' + sec);
    if (rail) {
      var on = rail.querySelectorAll('.fgCatChip'), i, hit;
      for (i = 0; i < on.length; i++) {
        hit = on[i].id === 'fgCat-' + sec + '-' + s;
        on[i].classList.toggle('on', hit);
        on[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
      }
    }
    if (sec === 'artworks') {
      if (typeof window.dzArtCat === 'function') window.dzArtCat(s);
    } else {
      if (!window.fgSecFilter) window.fgSecFilter = {};
      window.fgSecFilter[sec] = s;
      if (typeof window.fgSyncFilterBtn === 'function') window.fgSyncFilterBtn();
      if (typeof window.dzSecRender === 'function') window.dzSecRender(sec);
    }
    var chip = el('fgCat-' + sec + '-' + s);
    if (rail && chip && chip.scrollIntoView) {
      try {
        chip.scrollIntoView({
          behavior: stillness() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest'
        });
      } catch (e) {}
    }
  }

  function fgHeadSyncCat(sec) {
    var rail = el('fgCatRail-' + sec);
    if (!rail) return;
    var cur = current(sec);
    var on = rail.querySelectorAll('.fgCatChip'), i, hit;
    for (i = 0; i < on.length; i++) {
      hit = on[i].id === 'fgCat-' + sec + '-' + cur;
      on[i].classList.toggle('on', hit);
      on[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
    }
  }
  function fgHeadSyncAll() {
    for (var sec in HEADS) fgHeadSyncCat(sec);
  }

    // both arrows stay on screen at every width, dimmed once the rail cannot travel, so it never shifts under a tap
  function ends(rail) {
    var wrap = rail.parentNode;
    var prev = wrap.querySelector('.fgCatPrev');
    var next = wrap.querySelector('.fgCatNext');
    var max  = rail.scrollWidth - rail.clientWidth;
    if (prev) prev.disabled = rail.scrollLeft <= 1;
    if (next) next.disabled = rail.scrollLeft >= max - 1;
  }

  function railWatch(rail) {
    if (!rail || rail.__fgWatched) return;
    rail.__fgWatched = true;

    var queued = false;
    function sync() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; ends(rail); });
    }
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    if (window.ResizeObserver) new ResizeObserver(sync).observe(rail);

    var wrap = rail.parentNode;
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-fgnav]');
      if (!b || b.disabled) return;
      var by = rail.clientWidth * 0.8 * (+b.getAttribute('data-fgnav') < 0 ? -1 : 1);
      if (rail.scrollBy) rail.scrollBy({ left: by, behavior: stillness() ? 'auto' : 'smooth' });
      else rail.scrollLeft += by;
    });

    var down = false, moved = false, startX = 0, startLeft = 0, id = null;
    var SLOP = 4;

    rail.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      down = true; moved = false;
      startX = e.clientX; startLeft = rail.scrollLeft; id = e.pointerId;
    });

    rail.addEventListener('pointermove', function (e) {
      if (!down || e.pointerId !== id) return;
      var dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < SLOP) return;
        moved = true;
        rail.classList.add('fgDrag');
        try { rail.setPointerCapture(id); } catch (err) {}
      }
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      rail.scrollLeft = startLeft - dx;
    });

    function up(e) {
      if (!down || (e && e.pointerId !== id)) return;
      down = false;
      if (moved) {
        rail.classList.remove('fgDrag');
        try { rail.releasePointerCapture(id); } catch (err) {}
        rail.addEventListener('click', function swallow(ev) {
          ev.stopPropagation(); ev.preventDefault();
          rail.removeEventListener('click', swallow, true);
        }, true);
      }
      moved = false; id = null;
    }
    rail.addEventListener('pointerup', up);
    rail.addEventListener('pointercancel', up);

    ends(rail);
  }

    // the search page builds the same chips, so it takes the same watcher rather than a second copy of the arrow logic
  window.dzRailWatch       = railWatch;
  window.fgHeadBuild       = fgHeadBuild;
  window.fgHeadSearch      = fgHeadSearch;
  window.fgHeadSearchClear = fgHeadSearchClear;
  window.fgHeadCat         = fgHeadCat;
  window.fgHeadSyncCat     = fgHeadSyncCat;
  window.fgHeadSyncAll     = fgHeadSyncAll;
})();
