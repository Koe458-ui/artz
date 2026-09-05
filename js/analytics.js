(function () {
  'use strict';

  function db() { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function $(id) { return document.getElementById(id); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  var SCOPES = [
    { key: 'artwork',     label: 'Artwork',     noun: 'artwork',  nouns: 'artworks',
      title: 'ARTWORK ANALYTICS',     sub: 'Everything your artworks did, and where it came from.' },
    { key: 'marketplace', label: 'Marketplace', noun: 'listing',  nouns: 'listings',
      title: 'MARKETPLACE ANALYTICS', sub: 'Everything your listings did, and where it came from.' },
    { key: 'blog',        label: 'Blog',        noun: 'post',     nouns: 'posts',
      title: 'BLOG ANALYTICS',        sub: 'Everything your posts did, and where it came from.' },
    { key: 'resource',    label: 'Resources',   noun: 'resource', nouns: 'resources',
      title: 'RESOURCES ANALYTICS',   sub: 'Everything your resources did, and where it came from.' }
  ];
  function scopeOf(key) {
    for (var i = 0; i < SCOPES.length; i++) if (SCOPES[i].key === key) return SCOPES[i];
    return SCOPES[0];
  }

  var RANGES = [
    { d: 7,   label: 'Last 7 days' },
    { d: 30,  label: 'Last 30 days' },
    { d: 90,  label: 'Last 90 days' },
    { d: 365, label: 'Last 12 months' }
  ];

  var METRICS = [
    { key: 'views',     label: 'Views',     ico: '👁', color: 'var(--an-views)',     hex: '#00A6FF' },
    { key: 'likes',     label: 'Likes',     ico: '❤️', color: 'var(--an-likes)',     hex: '#FF3D3D' },
    { key: 'bookmarks', label: 'Saves',     ico: '🔖', color: 'var(--an-bookmarks)', hex: '#00D9B8' },
    { key: 'downloads', label: 'Downloads', ico: '⬇️', color: 'var(--an-downloads)', hex: '#FFB300' },
    { key: 'comments',  label: 'Comments',  ico: '💬', color: 'var(--an-comments)',  hex: '#FF3DE0' },
    { key: 'shares',    label: 'Shares',    ico: '↗',  color: 'var(--an-green)',      hex: '#16D95F' }
  ];
  function metric(key) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === key) return METRICS[i];
    return METRICS[0];
  }
  function metricsFor(sc) {
    return METRICS.map(function (m) {
      if (m.key === 'downloads' && sc === 'marketplace') {
        return { key: 'sales', label: 'Sales', ico: '🛒', color: m.color, hex: m.hex };
      }
      return m;
    });
  }

  var SOURCE_LABEL = {
    direct: 'Direct', social: 'Social media', search: 'Search engines',
    referral: 'Referrals', internal: 'Within DigiArtz'
  };
  var SOURCE_HEX = {
    direct: '#00A6FF', social: '#FF3DE0', search: '#00D9B8',
    referral: '#FFB300', internal: '#16D95F'
  };
  var DEVICE_LABEL = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown' };
  var DEVICE_HEX   = { mobile: '#00A6FF', tablet: '#00D9B8', desktop: '#16D95F', unknown: '#8A8F98' };
  var WHEEL = ['#00A6FF', '#FF3DE0', '#00D9B8', '#FFB300', '#16D95F', '#FF3D3D',
               '#4DC3FF', '#FF85EC', '#5BE7D2', '#FFD24D', '#5BE88F', '#8A8F98'];

  var COUNTRY = {
    IN:'India', US:'United States', GB:'United Kingdom', ID:'Indonesia', BR:'Brazil',
    PH:'Philippines', CA:'Canada', AU:'Australia', DE:'Germany', FR:'France',
    JP:'Japan', KR:'South Korea', CN:'China', RU:'Russia', MX:'Mexico', ES:'Spain',
    IT:'Italy', NL:'Netherlands', PL:'Poland', TR:'Türkiye', VN:'Vietnam',
    TH:'Thailand', MY:'Malaysia', SG:'Singapore', PK:'Pakistan', BD:'Bangladesh',
    NG:'Nigeria', EG:'Egypt', ZA:'South Africa', AR:'Argentina', CO:'Colombia',
    CL:'Chile', PE:'Peru', UA:'Ukraine', SE:'Sweden', NO:'Norway', FI:'Finland',
    DK:'Denmark', BE:'Belgium', CH:'Switzerland', AT:'Austria', PT:'Portugal',
    IE:'Ireland', NZ:'New Zealand', SA:'Saudi Arabia', AE:'United Arab Emirates',
    IL:'Israel', RO:'Romania', CZ:'Czechia', HU:'Hungary', GR:'Greece', TW:'Taiwan',
    HK:'Hong Kong', LK:'Sri Lanka', NP:'Nepal', MM:'Myanmar', KH:'Cambodia'
  };
  function countryName(cc) { return COUNTRY[cc] || cc || 'Unknown'; }
  function flag(cc) {
    if (!/^[A-Z]{2}$/.test(cc || '')) return '🏳️';
    try {
      return String.fromCodePoint(cc.charCodeAt(0) + 127397, cc.charCodeAt(1) + 127397);
    } catch (e) { return '🏳️'; }
  }

  var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function full(n) { return Number(n || 0).toLocaleString(); }
  function pct(n) { return (Math.round(Number(n || 0) * 10) / 10) + '%'; }
  function delta(cur, prev) {
    cur = Number(cur) || 0; prev = Number(prev) || 0;
    if (prev === 0) {
      return cur > 0 ? { dir: 'up', txt: 'all new this period' }
                     : { dir: '', txt: 'none this period' };
    }
    var p = ((cur - prev) / prev) * 100;
    var r = Math.abs(p) >= 10 ? Math.round(p) : Math.round(p * 10) / 10;
    if (r === 0) return { dir: '', txt: 'same as last period' };
    return { dir: p > 0 ? 'up' : 'down', txt: (p > 0 ? '↑ ' : '↓ ') + Math.abs(r) + '% on previous' };
  }
  function dayName(iso, withYear) {
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined,
      { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  }
  function shortDate(iso) { return dayName(iso, false); }
  function longDate(iso)  { return dayName(iso, true); }
  function ago(ts) {
    var t = new Date(ts).getTime();
    if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function el (tag, cls, text) { return window.dzEl(tag, cls, text); }
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length < 3) return 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join('L');
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1],
          p3 = pts[i + 2 > pts.length - 1 ? pts.length - 1 : i + 2];
      var t = 0.28;
      var c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
      var c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      var lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
      c1y = Math.max(lo - (hi - lo) * 0.4, Math.min(hi + (hi - lo) * 0.4, c1y));
      c2y = Math.max(lo - (hi - lo) * 0.4, Math.min(hi + (hi - lo) * 0.4, c2y));
      d += 'C' + c1x + ',' + c1y + ' ' + c2x + ',' + c2y + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }

  function sparkline(values, hex) {
    var W = 120, H = 34, P = 2;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      // Empty series on a new account, and one bad row makes every number NaN — the fill path read pts[-1] and threw
    var nums = (Array.isArray(values) ? values : []).map(function (v) {
      var n = Number(v);
      return isFinite(n) ? n : 0;
    });
    if (!nums.length) return svg;
    var max = Math.max.apply(null, nums.concat([1]));
    var n = nums.length;
    var pts = nums.map(function (v, i) {
      var x = n === 1 ? W / 2 : P + (i / (n - 1)) * (W - P * 2);
      var y = H - P - (Number(v) / max) * (H - P * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    var id = 'anSp' + Math.random().toString(36).slice(2, 8);
    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': hex, 'stop-opacity': '.32' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': hex, 'stop-opacity': '0' }));
    defs.appendChild(grad); svg.appendChild(defs);
    var line = smoothPath(pts);
    svg.appendChild(svgEl('path', {
      d: line + 'L' + pts[pts.length - 1][0] + ',' + H + 'L' + pts[0][0] + ',' + H + 'Z',
      fill: 'url(#' + id + ')'
    }));
    svg.appendChild(svgEl('path', {
      d: line, fill: 'none', stroke: hex, 'stroke-width': '1.6',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke'
    }));
    return svg;
  }

  function lineChart(host, labels, series) {
    host.innerHTML = '';
    var wrap = el('div', 'anChartWrap');
    host.appendChild(wrap);

    var avail = Math.round(wrap.clientWidth || host.clientWidth || 320);
    var W = Math.max(280, avail);
    var narrow = W < 520;
    var H = narrow ? 200 : 250;
    var R = 10, T = 12, B = narrow ? 22 : 26;

    var max = 1;
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (Number(v) > max) max = Number(v); });
    });
    var step = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var top = Math.ceil(max / step) * step;
    if (top / max > 2 && step > 1) { step = step / 2; top = Math.ceil(max / step) * step; }

    var ticks = 4;
    if (top <= 4) {
      ticks = Math.max(1, Math.round(top));
    } else {
      var opts = [4, 5, 3, 2];
      for (var oi = 0; oi < opts.length; oi++) {
        if (top % opts[oi] === 0) { ticks = opts[oi]; break; }
      }
    }

    var axisFont = narrow ? 11 : 12;
    var widest = 0;
    for (var gi = 0; gi <= ticks; gi++) {
      widest = Math.max(widest, full(Math.round((top / ticks) * gi)).length);
    }
    var L = Math.min(Math.round(W * 0.28), 12 + Math.ceil(widest * axisFont * 0.62));
    var iw = Math.max(40, W - L - R), ih = H - T - B;

    var svg = svgEl('svg', {
      class: 'anChart', viewBox: '0 0 ' + W + ' ' + H,
      role: 'img', 'aria-label': 'Daily totals over the selected period'
    });
    svg.style.fontSize = axisFont + 'px';

    var n = labels.length;
    function xAt(i) { return n === 1 ? L + iw / 2 : L + (i / (n - 1)) * iw; }
    function yAt(v) { return T + ih - (Number(v) / top) * ih; }

    var seenLabel = null;
    for (var g = 0; g <= ticks; g++) {
      var v = (top / ticks) * g, y = yAt(v);
      svg.appendChild(svgEl('line', { class: 'anGridLine', x1: L, y1: y, x2: W - R, y2: y }));
      var text = full(Math.round(v));
      if (text === seenLabel) continue;
      seenLabel = text;
      var lbl = svgEl('text', { class: 'anAxis', x: L - 6, y: y + 3.5, 'text-anchor': 'end' });
      lbl.textContent = text;
      svg.appendChild(lbl);
    }

    var fit = Math.max(2, Math.floor(iw / (narrow ? 52 : 74)));
    var every = Math.max(1, Math.ceil(n / fit));
    for (var i = 0; i < n; i += every) {
      var tx = svgEl('text', {
        class: 'anAxis', x: xAt(i), y: H - 6,
        'text-anchor': i === 0 ? 'start' : 'middle'
      });
      tx.textContent = shortDate(labels[i]);
      svg.appendChild(tx);
    }

    series.forEach(function (s, si) {
      var pts = s.values.map(function (v, i) { return [xAt(i), yAt(v)]; });
      var d = smoothPath(pts);
      if (si === 0) {
        var id = 'anLg' + Math.random().toString(36).slice(2, 8);
        var defs = svgEl('defs');
        var grad = svgEl('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': s.hex, 'stop-opacity': '.26' }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': s.hex, 'stop-opacity': '0' }));
        defs.appendChild(grad); svg.appendChild(defs);
        svg.appendChild(svgEl('path', {
          d: d + 'L' + xAt(n - 1) + ',' + (T + ih) + 'L' + xAt(0) + ',' + (T + ih) + 'Z',
          fill: 'url(#' + id + ')'
        }));
      }
      svg.appendChild(svgEl('path', {
        d: d, fill: 'none', stroke: s.hex, 'stroke-width': '2',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke'
      }));
    });

    var mark = svgEl('line', { x1: 0, y1: T, x2: 0, y2: T + ih, stroke: 'var(--bdrh)', 'stroke-width': 1, opacity: 0 });
    svg.appendChild(mark);
    var dots = series.map(function (s) {
      var c = svgEl('circle', { r: 3.5, fill: s.hex, stroke: 'var(--bg)', 'stroke-width': 2, opacity: 0 });
      svg.appendChild(c);
      return c;
    });

    wrap.appendChild(svg);
    var tip = el('div', 'anTip');
    wrap.appendChild(tip);

    function at(clientX) {
      var box = svg.getBoundingClientRect();
      if (!box.width) return;
      var rel = ((clientX - box.left) / box.width) * W;
      var i = n === 1 ? 0 : Math.round(((rel - L) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      var x = xAt(i);
      mark.setAttribute('x1', x); mark.setAttribute('x2', x); mark.setAttribute('opacity', 1);
      var html = '<div class="anTipD">' + esc(longDate(labels[i])) + '</div>';
      series.forEach(function (s, si) {
        dots[si].setAttribute('cx', x);
        dots[si].setAttribute('cy', yAt(s.values[i]));
        dots[si].setAttribute('opacity', 1);
        html += '<div class="anTipRow"><span class="anTipDot" style="background:' + s.hex + '"></span>' +
                esc(s.label) + '<span class="anTipN">' + full(s.values[i]) + '</span></div>';
      });
      tip.innerHTML = html;
      tip.classList.add('on');
      var px = (x / W) * box.width;
      var half = (tip.offsetWidth || 120) / 2;
      tip.style.left = Math.max(half + 2, Math.min(box.width - half - 2, px)) + 'px';
      tip.style.top = ((T + ih * 0.35) / H) * box.height + 'px';
    }
    function off() {
      mark.setAttribute('opacity', 0);
      dots.forEach(function (d) { d.setAttribute('opacity', 0); });
      tip.classList.remove('on');
    }
    svg.addEventListener('pointermove', function (e) { at(e.clientX); });
    svg.addEventListener('pointerdown', function (e) { at(e.clientX); });
    svg.addEventListener('pointerleave', off);
    svg.addEventListener('pointercancel', off);
  }

  function donut(host, items, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var total = items.reduce(function (a, b) { return a + (Number(b.n) || 0); }, 0);
    var row = el('div', 'anDonutRow');

    var box = el('div', 'anDonut');
    var svg = svgEl('svg', { viewBox: '0 0 42 42', 'aria-hidden': 'true' });
    var R = 15.9155, C = 2 * Math.PI * R;
    svg.appendChild(svgEl('circle', {
      cx: 21, cy: 21, r: R, fill: 'none',
      stroke: 'rgba(var(--tx2-rgb),.10)', 'stroke-width': 5
    }));
    var acc = 0;
    items.forEach(function (it) {
      var share = total > 0 ? (Number(it.n) || 0) / total : 0;
      if (share <= 0) return;
      svg.appendChild(svgEl('circle', {
        cx: 21, cy: 21, r: R, fill: 'none', stroke: it.hex, 'stroke-width': 5,
        'stroke-dasharray': (share * C).toFixed(3) + ' ' + C.toFixed(3),
        'stroke-dashoffset': (-acc * C).toFixed(3),
        transform: 'rotate(-90 21 21)', 'stroke-linecap': 'butt'
      }));
      acc += share;
    });
    box.appendChild(svg);
    var mid = el('div', 'anDonutMid');
    var midWrap = el('div');
    midWrap.appendChild(el('div', 'anDonutMidN', full(total)));
    midWrap.appendChild(el('div', 'anDonutMidL', opts.midLabel || 'total'));
    mid.appendChild(midWrap);
    box.appendChild(mid);
    row.appendChild(box);

    var list = el('div', 'anLegList');
    items.forEach(function (it) {
      var r = el('div', 'anLegRow');
      var dot = el('span', 'anTipDot');
      dot.style.background = it.hex;
      r.appendChild(dot);
      r.appendChild(el('span', 'anLegName', it.label));
      r.appendChild(el('span', 'anLegPct',
        (total > 0 ? Math.round(((Number(it.n) || 0) / total) * 1000) / 10 : 0) + '% · ' + full(it.n)));
      list.appendChild(r);
    });
    row.appendChild(list);
    host.appendChild(row);
  }

  function bars(host, items, hex) {
    host.innerHTML = '';
    var max = items.reduce(function (a, b) { return Math.max(a, Number(b.n) || 0); }, 1);
    var wrap = el('div', 'anBars');
    items.forEach(function (it) {
      var row = el('div', 'anBar');
      row.appendChild(el('div', 'anBarLbl', it.label));
      var track = el('div', 'anBarTrack');
      var fill = el('div', 'anBarFill');
      fill.style.width = Math.max(2, ((Number(it.n) || 0) / max) * 100) + '%';
      if (hex) fill.style.background = hex;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'anBarVal', it.sub || full(it.n)));
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }

  function ring(host, value, label, hex) {
    host.innerHTML = '';
    var box = el('div', 'anRing');
    var svg = svgEl('svg', { viewBox: '0 0 42 42', 'aria-hidden': 'true' });
    var R = 16, C = 2 * Math.PI * R;
    var share = Math.max(0, Math.min(1, Number(value) / 100));
    svg.appendChild(svgEl('circle', {
      cx: 21, cy: 21, r: R, fill: 'none',
      stroke: 'rgba(var(--tx2-rgb),.10)', 'stroke-width': 4
    }));
    svg.appendChild(svgEl('circle', {
      cx: 21, cy: 21, r: R, fill: 'none', stroke: hex, 'stroke-width': 4,
      'stroke-linecap': 'round',
      'stroke-dasharray': (share * C).toFixed(2) + ' ' + C.toFixed(2)
    }));
    box.appendChild(svg);
    var mid = el('div', 'anRingMid');
    var w = el('div');
    w.appendChild(el('div', 'anRingN', pct(value)));
    w.appendChild(el('div', 'anRingL', label));
    mid.appendChild(w);
    box.appendChild(mid);
    host.appendChild(box);
  }

  function facts(host, list) {
    host.innerHTML = '';
    var wrap = el('div', 'anFacts');
    list.forEach(function (f) {
      var c = el('div', 'anFact');
      c.appendChild(el('div', 'anFactN', f.n));
      var l = el('div', 'anFactL', f.l);
      l.title = f.l;
      c.appendChild(l);
      wrap.appendChild(c);
    });
    host.appendChild(wrap);
  }

  function anCard(host, title, opts) {
    opts = opts || {};
    var c = el('div', 'anCard' + (opts.stack ? ' anStack' : ''));
    var hd = el('div', 'anCardHd');
    hd.appendChild(el('div', 'anCardTitle', title));
    if (opts.note) hd.appendChild(el('div', 'anSecNote', opts.note));
    if (opts.extra) hd.appendChild(opts.extra);
    c.appendChild(hd);
    if (host) host.appendChild(c);
    return c;
  }
  function cardBody(host, title, opts) {
    var body = el('div');
    anCard(host, title, opts).appendChild(body);
    return body;
  }
  function factsCard(host, title, list, opts) {
    facts(cardBody(host, title, opts), list);
  }

  var CARD_ROWS = 10;

  function moreBtn(label, onTap) {
    var b = el('button', 'anMore', label);
    b.type = 'button';
    b.addEventListener('click', onTap);
    return b;
  }

  function empty(host, msg) {
    host.innerHTML = '';
    host.appendChild(el('div', 'anEmpty', msg));
  }

  var state = {
    scope: 'artwork',
    days: 30,
    open: false,
    seq: 0,
    loading: false,
    data: { overview: null, content: null, reach: null, activity: null },
    chartMetrics: { views: true, likes: true },
    artSort: 'views',
    lastFocus: null,
    poll: null,
    channel: null,
    dirty: null,
    retry: null,
    again: false
  };

  var AN_DAYS_KEY = 'device:prefs:analytics:days';
  try {
    var savedDays = parseInt(
      (window.dzCache && window.dzCache.peek(AN_DAYS_KEY, 'device:prefs', { any: true })) ||
      localStorage.getItem('dzAnDays') || '30', 10);
    if ([7, 30, 90, 365].indexOf(savedDays) !== -1) state.days = savedDays;
  } catch (e) {}

  function buildShell() {
    var body = $('anBdy');
    if (!body || body.dataset.built === '1') return;
    body.dataset.built = '1';

    var top = el('div', 'anTop');
    var left = el('div');
    var hi = el('div', 'anHi');
    hi.id = 'anHi';
    hi.textContent = 'Your analytics';
    left.appendChild(hi);
    var sub = el('div', 'anSub');
    sub.id = 'anSub';
    sub.textContent = scopeOf(state.scope).sub;
    left.appendChild(sub);
    top.appendChild(left);

    var right = el('div', 'anTopRight');
    var live = el('div', 'anLive');
    live.id = 'anLive';
    live.appendChild(el('span', 'anLiveDot'));
    live.appendChild(el('span', null, 'Live'));
    right.appendChild(live);

    var sel = el('select', 'anRange');
    sel.id = 'anRangeSel';
    sel.setAttribute('aria-label', 'Time range');
    RANGES.forEach(function (r) {
      var o = el('option', null, r.label);
      o.value = String(r.d);
      if (r.d === state.days) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      state.days = parseInt(sel.value, 10) || 30;
      try {
        if (window.dzCache) window.dzCache.set(AN_DAYS_KEY, state.days, 'device:prefs');
        else localStorage.setItem('dzAnDays', String(state.days));
      } catch (e) {}
      load(true);
    });
    right.appendChild(sel);
    top.appendChild(right);
    body.appendChild(top);

    var nav = el('div', 'anNav');
    nav.id = 'anNav';
    body.appendChild(nav);

    sectionsFor(state.scope).forEach(function (s) {
      var btn = el('button', 'anNavBtn', s.short);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var target = $('anSec_' + s.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(btn);

      var sec = el('section', 'anSec');
      sec.id = 'anSec_' + s.id;
      var hd = el('div', 'anSecHd');
      hd.appendChild(el('h2', 'anSecTitle', s.title));
      if (s.note) hd.appendChild(el('span', 'anSecNote', s.note));
      sec.appendChild(hd);
      var host = el('div', 'anBox');
      host.id = 'anBox_' + s.id;
      host.appendChild(el('div', 'anEmpty', 'Loading…'));
      sec.appendChild(host);
      body.appendChild(sec);
    });

    watchNav();
  }

  function watchNav() {
      // buildShell() runs on every open, so the last observer is dropped first, the way anListStop() retires the list's
    if (state.navIo) { try { state.navIo.disconnect(); } catch (e) {} state.navIo = null; }
    if (!window.IntersectionObserver) return;
    var nav = $('anNav');
    if (!nav) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id.replace('anSec_', '');
        var idx = sectionsFor(state.scope).findIndex(function (s) { return s.id === id; });
        Array.prototype.forEach.call(nav.children, function (c, i) {
          c.classList.toggle('on', i === idx);
        });
      });
    }, { rootMargin: '-120px 0px -70% 0px', threshold: 0 });
    state.navIo = io;
    sectionsFor(state.scope).forEach(function (s) {
      var t = $('anSec_' + s.id);
      if (t) io.observe(t);
    });
  }

  var SECTIONS = [
    { id: 'overview',  short: 'Overview',   title: 'Overview',              note: 'the period at a glance' },
    { id: 'growth',    short: 'Growth',     title: 'Growth & Trends',       note: 'day by day' },
    { id: 'artworks',  short: 'Artworks',   title: 'Artwork Performance',   note: 'piece by piece',
      per: { marketplace: ['Listings',  'Listing Performance',  'listing by listing'],
             blog:        ['Posts',     'Post Performance',     'post by post'],
             resource:    ['Resources', 'Resource Performance', 'one by one'] } },
    { id: 'content',   short: 'Content',    title: 'Content Insights',      note: 'what you make' },
    { id: 'audience',  short: 'Audience',   title: 'Audience',              note: 'who is looking' },
    { id: 'traffic',   short: 'Traffic',    title: 'Traffic Sources',       note: 'how they arrived' },
    { id: 'search',    short: 'Search',     title: 'Search Analytics',      note: 'what they typed' },
    { id: 'engage',    short: 'Engagement', title: 'Engagement',            note: 'what a view turns into' },
    { id: 'revenue',   short: 'Revenue',    title: 'Revenue',               note: 'what your listings earned',
      only: 'marketplace' },
    { id: 'account',   short: 'Account',    title: 'Account & Audience',    note: 'you, not this section' },
    { id: 'community', short: 'Community',  title: 'Community Analytics',   note: 'your part in the place' },
    { id: 'goals',     short: 'Goals',      title: 'Goals & Achievements',  note: 'what you are aiming at' },
    { id: 'compare',   short: 'Compare',    title: 'Comparisons',           note: 'against yourself, and the site' }
  ];
  function sectionsFor(sc) {
    return SECTIONS.filter(function (s) { return !s.only || s.only === sc; })
      .map(function (s) {
        var p = s.per && s.per[sc];
        return p ? { id: s.id, short: p[0], title: p[1], note: p[2] } : s;
      });
  }

  async function load(showSkeleton) {
    var c = db();
    if (!c || !me()) return;
    var seq = ++state.seq;
    state.loading = true;
    if (showSkeleton) {
      sectionsFor(state.scope).forEach(function (s) {
        var b = $('anBox_' + s.id);
        if (b) empty(b, 'Loading…');
      });
    }
    var d = state.days, sc = state.scope;

    var cache = window.dzCached ? window.dzCached() : null;
    var key = cache ? cache.ukey('analytics', sc, d + 'd') : null;
      // named apart from load(): it was `load` too, and the retry below reached the inner one — four RPCs going nowhere
    var fetchAll = function () {
      return Promise.all([
        c.rpc('dz_analytics_overview', { p_days: d, p_scope: sc }),
        c.rpc('dz_analytics_content',  { p_days: d, p_scope: sc }),
        c.rpc('dz_analytics_reach',    { p_days: d, p_scope: sc }),
        c.rpc('dz_analytics_activity', { p_days: d, p_scope: sc })
      ]).then(function (res) {
        return res.map(function (r) { return (r && !r.error) ? r.data : null; });
      });
    };

    var out;
    try { out = (cache && key) ? await cache.getOrSet(key, fetchAll, 'user:analytics') : await fetchAll(); }
    catch (e) {
      if (seq !== state.seq) return;
      state.loading = false;
      state.again = false;
      failAll();
      return;
    }
    if (seq !== state.seq) return;
    state.loading = false;

    state.data.overview = out[0] || null;
    state.data.content  = out[1] || null;
    state.data.reach    = out[2] || null;
    state.data.activity = out[3] || null;

    paint();

    if (state.again) { state.again = false; if (state.open) load(false); }
  }

  function failAll() {
    sectionsFor(state.scope).forEach(function (s) {
      var b = $('anBox_' + s.id);
      if (!b) return;
      b.innerHTML = '';
      b.appendChild(el('div', 'anErr', 'COULDN’T LOAD THIS SECTION'));
      var r = el('button', 'anRetry', 'Try again');
      r.type = 'button';
      r.addEventListener('click', function () { load(true); });
      b.appendChild(r);
    });
  }

  var myName = null;
  async function loadMyName() {
    var c = db(), u = me();
    if (!c || !u || myName !== null) return;
    myName = '';
    try {
      var cache = window.dzCached ? window.dzCached() : null;
      var nameLoad = async function () {
        var res = await c.from('profiles').select('username,display_name').eq('id', u.id).maybeSingle();
        if (res.error) throw res.error;
        return res.data || null;
      };
      var row = (cache && cache.ukey)
        ? await cache.getOrSet(cache.ukey('profile', 'name'), nameLoad, 'user:profile')
        : await nameLoad();
      if (row) myName = row.display_name || row.username || '';
    } catch (e) {}
    var hi = $('anHi');
    if (hi && myName && state.open) hi.textContent = 'Welcome back, ' + myName;
  }

  function paint() {
    var sc = scopeOf(state.scope);
    var hi = $('anHi');
    if (hi) hi.textContent = myName ? ('Welcome back, ' + myName) : 'Your analytics';
    var sb2 = $('anSub');
    if (sb2) sb2.textContent = sc.sub;
    var ttl = document.querySelector('#anPage .subPgTitle');
    if (ttl) { ttl.textContent = sc.title; measureHeader(); }
    var pg = $('anPage');
    if (pg) pg.setAttribute('aria-label', sc.title.toLowerCase());
    paintOverview();
    paintGrowth();
    paintArtworks();
    paintContent();
    paintAudience();
    paintTraffic();
    paintSearch();
    paintEngagement();
    paintRevenue();
    paintAccount();
    paintCommunity();
    paintGoals();
    paintCompare();
  }

  function box(id) { return $('anBox_' + id); }

  function paintOverview() {
    var b = box('overview'), o = state.data.overview;
    if (!b) return;
    if (!o || o.error) { empty(b, 'COULDN’T LOAD THE OVERVIEW'); return; }
    b.innerHTML = '';

    var series = o.series || [];
    var win = o['window'] || {}, prev = o.prev || {};

    var grid = el('div', 'anKpis');
    metricsFor(state.scope).forEach(function (m) {
      var tile = el('div', 'anKpi');
      var top = el('div', 'anKpiTop');
      var ico = el('div', 'anKpiIco', m.ico);
      ico.style.background = m.hex + '22';
      top.appendChild(ico);
      top.appendChild(el('div', 'anKpiLbl', m.label));
      tile.appendChild(top);
      tile.appendChild(el('div', 'anKpiVal', full(win[m.key])));
      var dl = delta(win[m.key], prev[m.key]);
      var dEl = el('div', 'anKpiDelta ' + dl.dir, dl.txt);
      tile.appendChild(dEl);
      var sp = el('div', 'anKpiSpark');
      sp.appendChild(sparkline(series.map(function (r) { return r[m.key]; }), m.hex));
      tile.appendChild(sp);
      grid.appendChild(tile);
    });
    b.appendChild(grid);

    var t = o.totals || {};
    var sc = scopeOf(state.scope);
    var tiles = [
      { n: full(t.items), l: sc.nouns.charAt(0).toUpperCase() + sc.nouns.slice(1) },
      { n: full(t.views_all), l: 'Total views' },
      { n: full(t.likes_all), l: 'Total likes' },
      { n: full(t.bookmarks_all), l: 'Total saves' },
      { n: full(t.comments_all), l: 'Comments' },
      { n: full(t.shares_all), l: 'Shares' }
    ];
    tiles.push(state.scope === 'marketplace'
      ? { n: full(t.sales_all), l: 'Sales' }
      : { n: full(t.downloads_all), l: 'Downloads' });
    tiles.push({ n: t.items > 0 ? full(Math.round((t.views_all || 0) / t.items)) : '0',
                 l: 'Views / ' + sc.noun });
    factsCard(b, 'All time', tiles, { stack: true, note: sc.nouns + ' only' });
  }

  function paintGrowth() {
    var b = box('growth'), o = state.data.overview;
    if (!b) return;
    if (!o || o.error || !(o.series || []).length) { empty(b, 'NOTHING TO CHART YET'); return; }
    b.innerHTML = '';

    var series = o.series;
    var labels = series.map(function (r) { return r.d; });

    var mx = metricsFor(state.scope);
    var legend = el('div', 'anLegend');
    mx.forEach(function (m) {
      var btn = el('button', 'anLegBtn' + (state.chartMetrics[m.key] ? '' : ' off'));
      btn.type = 'button';
      var dot = el('span', 'anTipDot');
      dot.style.background = m.hex;
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(m.label));
      btn.addEventListener('click', function () {
        var on = !!state.chartMetrics[m.key];
        if (on && Object.keys(state.chartMetrics).filter(function (k) { return state.chartMetrics[k]; }).length === 1) return;
        state.chartMetrics[m.key] = !on;
        paintGrowth();
      });
      legend.appendChild(btn);
    });
    var chartHost = cardBody(b, 'Daily totals', { extra: legend });

    var picked = mx.filter(function (m) { return state.chartMetrics[m.key]; });
    lineChart(chartHost, labels, picked.map(function (m) {
      return { key: m.key, label: m.label, hex: m.hex, values: series.map(function (r) { return Number(r[m.key]) || 0; }) };
    }));

    var views = series.map(function (r) { return Number(r.views) || 0; });
    var best = 0, bestI = 0, sum = 0, active = 0;
    views.forEach(function (v, i) { sum += v; if (v > best) { best = v; bestI = i; } if (v > 0) active++; });
    var half = Math.floor(views.length / 2);
    var firstHalf = views.slice(0, half).reduce(function (a, x) { return a + x; }, 0);
    var lastHalf = views.slice(half).reduce(function (a, x) { return a + x; }, 0);
    var trend = firstHalf === 0
      ? (lastHalf > 0 ? 'Rising' : 'Flat')
      : (lastHalf > firstHalf * 1.1 ? 'Rising' : lastHalf < firstHalf * 0.9 ? 'Cooling' : 'Steady');

    var streak = 0;
    for (var i = views.length - 1; i >= 0 && views[i] > 0; i--) streak++;

    factsCard(b, 'Trend read', [
      { n: trend, l: 'Second half vs first' },
      { n: full(best), l: best > 0 ? 'Best day · ' + shortDate(labels[bestI]) : 'Best day' },
      { n: full(Math.round((sum / Math.max(1, views.length)) * 10) / 10), l: 'Views per day' },
      { n: streak + 'd', l: 'Current viewed streak' },
      { n: active + '/' + views.length, l: 'Days with a view' },
      { n: full((o['window'] || {}).uploads), l: 'Uploads this period' },
      { n: full((o['window'] || {}).views), l: 'Views this period' },
      { n: full((o.prev || {}).views), l: 'Views previous period' }
    ], { stack: true });
  }

  var ART_SORTS = [
    { key: 'views', label: 'Views' },
    { key: 'likes', label: 'Likes' },
    { key: 'bookmarks', label: 'Saves' },
    { key: 'downloads', label: 'Downloads' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'created_at', label: 'Newest' }
  ];

  function artRows(rows, limit) {
    var list = el('div', 'anArts');
    var show = limit ? rows.slice(0, limit) : rows;
    show.forEach(function (r, i) { list.appendChild(artRow(r, i)); });
    return list;
  }

  function artRow(r, i) {
    var row = el('button', 'anArt');
    row.type = 'button';
    row.appendChild(el('div', 'anArtRank', String(i + 1)));

    var src = (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(r.thumb || '') : (r.thumb || '');
    if (src) {
      var img = document.createElement('img');
      img.className = 'anArtThumb';
      img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
      img.src = src;
      img.addEventListener('error', function () {
        var ph = el('div', 'anArtNoThumb', '\uD83D\uDDBC');
        if (img.parentNode) img.parentNode.replaceChild(ph, img);
      });
      row.appendChild(img);
    } else {
      row.appendChild(el('div', 'anArtNoThumb', '\uD83D\uDDBC'));
    }

    var txt = el('div', 'anArtTxt');
    txt.appendChild(el('div', 'anArtName', r.title));
    var metaBits = [];
    if (typeof catLabel === 'function') metaBits.push(catLabel(r.category) || r.category);
    else metaBits.push(r.category);
    metaBits.push(pct(r.engagement) + ' engaged');
    if (r.visibility && r.visibility !== 'published') metaBits.push('unlisted');
    txt.appendChild(el('div', 'anArtMeta', metaBits.filter(Boolean).join(' \u00B7 ')));
    row.appendChild(txt);

    var nums = el('div', 'anArtNums');
    var last = state.scope === 'marketplace'
      ? ['\uD83D\uDED2', r.sales] : ['\u2B07\uFE0F', r.downloads];
    [['\uD83D\uDC41', r.views], ['\u2764\uFE0F', r.likes],
     ['\uD83D\uDD16', r.bookmarks], last].forEach(function (p) {
      var n = el('span', 'anArtNum');
      n.appendChild(document.createTextNode(p[0] + ' '));
      n.appendChild(el('b', null, full(p[1])));
      nums.appendChild(n);
    });
    row.appendChild(nums);

    row.addEventListener('click', function () {
      var id = String(r.id);
      closeAnList();
      closeAnalyticsPage();
      if (state.scope === 'artwork') {
        if (typeof window.handleArtClick === 'function' &&
            document.querySelector('.gItem[data-id="' + CSS.escape(id) + '"]')) {
          window.handleArtClick({ preventDefault: function () {}, stopPropagation: function () {} }, id);
        } else {
          location.href = '/artwork/' + encodeURIComponent(id);
        }
        return;
      }
      var seg = { marketplace: 'listing', blog: 'blog', resource: 'resource' }[state.scope];
      if (typeof window.dzOpenById === 'function') {
        window.dzOpenById(seg, id);
      } else {
        location.href = '/' + seg + '/' + encodeURIComponent(id);
      }
    });
    return row;
  }

  function paintArtworks() {
    var b = box('artworks'), c = state.data.content;
    if (!b) return;
    if (!c || c.error) { empty(b, 'COULDN’T LOAD YOUR ARTWORKS'); return; }
    var rows = (c.artworks || []).slice();
    var scw = scopeOf(state.scope);
    if (!rows.length) {
      empty(b, 'NO ' + scw.nouns.toUpperCase() + ' YET — PUBLISH ONE AND THIS FILLS IN');
      return;
    }
    b.innerHTML = '';

    var sorts = el('div', 'anSort');
    ART_SORTS.forEach(function (s) {
      var btn = el('button', 'anSortBtn' + (state.artSort === s.key ? ' on' : ''), s.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { state.artSort = s.key; paintArtworks(); });
      sorts.appendChild(btn);
    });
    var card = anCard(b, 'Ranked over the period', { extra: sorts });

    var k = state.artSort;
    rows.sort(function (x, y) {
      if (k === 'created_at') return String(y.created_at).localeCompare(String(x.created_at));
      return (Number(y[k]) || 0) - (Number(x[k]) || 0);
    });

    card.appendChild(artRows(rows, CARD_ROWS));
    if (rows.length > CARD_ROWS) {
      card.appendChild(moreBtn('View all', function () { openAnList('items'); }));
    }

    var byViews = rows.slice().sort(function (x, y) { return (y.views || 0) - (x.views || 0); });
    var top = byViews[0], low = byViews[byViews.length - 1];
    factsCard(b, 'Highs and lows', [
      { n: full(top ? top.views : 0), l: top ? 'Best: ' + top.title : 'Best' },
      { n: full(low ? low.views : 0), l: low ? 'Quietest: ' + low.title : 'Quietest' },
      { n: full(rows.reduce(function (a, r) { return a + (Number(r.views) || 0); }, 0)), l: 'Views in period' },
      { n: pct(rows.reduce(function (a, r) { return a + (Number(r.engagement) || 0); }, 0) / rows.length),
        l: 'Average engagement' }
    ], { stack: true });
  }

  function paintContent() {
    var b = box('content'), c = state.data.content;
    if (!b) return;
    if (!c || c.error) { empty(b, 'COULDN’T LOAD CONTENT INSIGHTS'); return; }
    b.innerHTML = '';

    var g = el('div', 'anGrid2');

    var catHost = cardBody(g, 'Views by category');
    var cats = (c.by_category || []).map(function (r, i) {
      return {
        label: (typeof catLabel === 'function' ? (catLabel(r.key) || r.key) : r.key),
        n: r.views, hex: WHEEL[i % WHEEL.length],
        sub: full(r.views) + ' · ' + r.artworks + (r.artworks === 1 ? ' piece' : ' pieces')
      };
    });
    if (cats.length) bars(catHost, cats); else empty(catHost, 'NO CATEGORIES YET');

    var tagHost = cardBody(g, 'Views by tag');
    var tags = (c.by_tag || []).slice(0, 10).map(function (r) {
      return { label: '#' + r.key, n: r.views, sub: full(r.views) };
    });
    if (tags.length) bars(tagHost, tags, '#FF3DE0');
    else empty(tagHost, 'TAG YOUR WORK AND THIS FILLS IN');

    var softHost = cardBody(g, 'Views by software');
    var softs = (c.by_software || []).map(function (r) {
      return { label: r.key, n: r.views, sub: full(r.views) };
    });
    if (softs.length) bars(softHost, softs, '#00D9B8');
    else empty(softHost, 'NAME THE SOFTWARE ON AN UPLOAD AND THIS FILLS IN');

    var cadHost = cardBody(g, 'Uploads per month');
    var cad = (c.cadence || []).map(function (r) {
      var parts = String(r.month).split('-');
      var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
      return {
        label: dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        n: r.uploads, sub: full(r.uploads)
      };
    });
    if (cad.length) bars(cadHost, cad, '#16D95F');
    else empty(cadHost, 'NO UPLOADS IN THE LAST YEAR');

    b.appendChild(g);

    var s = c.shape || {};
    factsCard(b, 'Your body of work', [
      { n: full(s.artworks), l: scopeOf(state.scope).nouns.charAt(0).toUpperCase() +
                                 scopeOf(state.scope).nouns.slice(1) },
      { n: full(s.approved), l: 'Approved' },
      { n: full(s.unlisted), l: 'Unlisted' },
      { n: full(s.featured), l: 'Featured' },
      { n: full(s.avg_views), l: 'Average views' },
      { n: full(s.avg_likes), l: 'Average likes' },
      { n: full(s.licensed), l: 'With a licence' },
      { n: s.last_upload ? ago(s.last_upload) : '—', l: 'Last upload' }
    ], { stack: true });
  }

  function paintAudience() {
    var b = box('audience'), r = state.data.reach;
    if (!b) return;
    if (!r || r.error) { empty(b, 'COULDN’T LOAD AUDIENCE'); return; }
    b.innerHTML = '';
    var a = r.audience || {};

    factsCard(b, 'Who came by', [
      { n: full(a.viewers), l: 'Unique viewers' },
      { n: full(a['new']), l: 'Saw you once' },
      { n: full(a.returning), l: 'Came back' },
      { n: full(a.signed_in), l: 'Signed in' },
      { n: full(a.days_per_viewer), l: 'Days per viewer' },
      { n: a.viewers > 0 ? Math.round((a.returning / a.viewers) * 100) + '%' : '0%', l: 'Return rate' },
      { n: full((r.countries || []).length), l: 'Countries seen' },
      { n: full((a.top_fans || []).length), l: 'Active fans' }
    ]);

    var g = el('div', 'anGrid2');

    var cHost = cardBody(g, 'Countries');
    var countries = (r.countries || []).map(function (x, i) {
      return { label: flag(x.key) + '  ' + countryName(x.key), n: x.n, hex: WHEEL[i % WHEEL.length] };
    });
    if (countries.length) donut(cHost, countries, { midLabel: 'views' });
    else empty(cHost, dimNote(r));

    var fanHost = cardBody(g, 'Top fans');
    var fans = a.top_fans || [];
    if (fans.length) {
      var wrap = el('div', 'anPeople');
      fans.forEach(function (p) { wrap.appendChild(personRow(p, p.n + (p.n === 1 ? ' action' : ' actions'))); });
      fanHost.appendChild(wrap);
    } else empty(fanHost, 'NOBODY HAS LIKED, SAVED OR COMMENTED YET');

    var wdHost = cardBody(g, 'Busiest weekday');
    var wd = (a.by_weekday || []).map(function (x) {
      return { label: WEEKDAY[x.w] || String(x.w), n: x.n, sub: full(x.n) };
    });
    if (wd.some(function (x) { return x.n > 0; })) bars(wdHost, wd);
    else empty(wdHost, 'NO VIEWS IN THIS PERIOD');

    var hHost = cardBody(g, 'Views by hour (UTC)');
    var hours = a.by_hour || [];
    if (hours.some(function (x) { return x.n > 0; })) {
      var maxH = hours.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
      var heat = el('div', 'anHeat');
      hours.forEach(function (x) {
        var col = el('div', 'anHeatCol');
        col.style.height = Math.max(3, (x.n / maxH) * 100) + '%';
        col.title = x.h + ':00 — ' + full(x.n) + ' views';
        heat.appendChild(col);
      });
      hHost.appendChild(heat);
      var ax = el('div', 'anHeatAxis');
      ['00', '06', '12', '18', '23'].forEach(function (t) { ax.appendChild(el('span', null, t)); });
      hHost.appendChild(ax);
    } else empty(hHost, dimNote(r));

    b.appendChild(g);
  }

  function personRow(p, sub) {
    var row = el(p && p.handle ? 'button' : 'div', 'anPerson');
    if (p && p.handle) {
      row.type = 'button';
      row.setAttribute('aria-label', 'Open ' + (p.name || p.handle) + '’s profile');
      row.addEventListener('click', function () {
        if (typeof openProfileByUsername !== 'function') return;
        closeAnalyticsPage();
        openProfileByUsername(p.handle, true);
      });
    }
    if (p.avatar) {
      var img = document.createElement('img');
      img.className = 'anAva';
      img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
      img.src = p.avatar;
      row.appendChild(img);
    } else {
      row.appendChild(el('div', 'anAvaTxt', String(p.name || '?').charAt(0).toUpperCase()));
    }
    var txt = el('div');
    txt.style.minWidth = '0';
    txt.appendChild(el('div', 'anPersonName', p.name || 'Artist'));
    if (p.handle) txt.appendChild(el('div', 'anPersonSub', '@' + p.handle));
    row.appendChild(txt);
    row.appendChild(el('div', 'anPersonN', sub));
    return row;
  }

  function dimNote(r) {
    return (r && r.dimension_rows > 0)
      ? 'NOTHING RECORDED IN THIS PERIOD'
      : 'NOTHING YET — THIS FILLS IN AS PEOPLE VISIT YOUR WORK FROM NOW ON';
  }

  function paintTraffic() {
    var b = box('traffic'), r = state.data.reach;
    if (!b) return;
    if (!r || r.error) { empty(b, 'COULDN’T LOAD TRAFFIC'); return; }
    b.innerHTML = '';

    var g = el('div', 'anGrid2');

    var sHost = cardBody(g, 'How people arrived');
    var srcs = (r.sources || []).map(function (x) {
      return { label: SOURCE_LABEL[x.key] || x.key, n: x.n, hex: SOURCE_HEX[x.key] || '#8A8F98' };
    });
    if (srcs.length) donut(sHost, srcs, { midLabel: 'views' });
    else empty(sHost, dimNote(r));

    var dHost = cardBody(g, 'Devices');
    var devs = (r.devices || []).map(function (x) {
      return { label: DEVICE_LABEL[x.key] || x.key, n: x.n, hex: DEVICE_HEX[x.key] || '#8A8F98' };
    });
    if (devs.length) donut(dHost, devs, { midLabel: 'views' });
    else empty(dHost, dimNote(r));

    b.appendChild(g);

    var rHost = cardBody(b, 'Sites that sent people', { stack: true });
    var refs = (r.referrers || []).map(function (x) {
      return { label: x.key, n: x.n, sub: full(x.n) };
    });
    if (refs.length) bars(rHost, refs, '#FFB300');
    else empty(rHost, 'NO OUTSIDE LINKS RECORDED — SHARE A PIECE AND WATCH THIS');
  }

  function paintSearch() {
    var b = box('search'), r = state.data.reach;
    if (!b) return;
    if (!r || r.error) { empty(b, 'COULDN’T LOAD SEARCH'); return; }
    b.innerHTML = '';
    var s = r.search || {};
    var terms = s.terms || [];

    var ctr = s.impressions > 0 ? Math.round((s.clicks / s.impressions) * 1000) / 10 : 0;
    factsCard(b, 'On-site search', [
      { n: full(s.impressions), l: 'Times you appeared' },
      { n: full(s.clicks), l: 'Times you were opened' },
      { n: ctr + '%', l: 'Click-through rate' },
      { n: full(terms.length), l: 'Distinct terms' }
    ]);

    var card = anCard(b, 'What people searched', { stack: true });
    if (!terms.length) {
      empty(card, dimNote(r));
    } else {
      var wrap = el('div', 'anTerms');
      var head = el('div', 'anTermHd');
      head.appendChild(el('div', null, 'Term'));
      var h2 = el('div', null, 'Shown'); h2.style.textAlign = 'right'; head.appendChild(h2);
      var h3 = el('div', null, 'Opened'); h3.style.textAlign = 'right'; head.appendChild(h3);
      var h4 = el('div', null, 'CTR'); h4.style.textAlign = 'right'; head.appendChild(h4);
      wrap.appendChild(head);
      terms.forEach(function (t) {
        var row = el('div', 'anTerm');
        row.appendChild(el('div', 'anTermTxt', t.term));
        row.appendChild(el('div', 'anTermN', full(t.impressions)));
        row.appendChild(el('div', 'anTermN', full(t.clicks)));
        row.appendChild(el('div', 'anTermN' + (t.ctr >= 20 ? ' hi' : ''), t.ctr + '%'));
        wrap.appendChild(row);
      });
      card.appendChild(wrap);
    }
  }

  function paintEngagement() {
    var b = box('engage'), a = state.data.activity;
    if (!b) return;
    if (!a || a.error) { empty(b, 'COULDN’T LOAD ENGAGEMENT'); return; }
    b.innerHTML = '';
    var e = a.engagement || {};

    var g = el('div', 'anGrid2w');

    var rCard = anCard(g, 'What a view turns into');
    var row = el('div', 'anRingRow');
    var ringHost = el('div');
    ring(ringHost, e.rate, 'engaged', '#00A6FF');
    row.appendChild(ringHost.firstChild);
    var rates = el('div');
    rates.style.flex = '1 1 200px';
    var rateHost = el('div');
    bars(rateHost, [
      { label: 'Liked',     n: e.like_rate,    sub: pct(e.like_rate) },
      { label: 'Saved',     n: e.save_rate,    sub: pct(e.save_rate) },
      { label: 'Commented', n: e.comment_rate, sub: pct(e.comment_rate) }
    ], '#FF3D3D');
    rates.appendChild(rateHost);
    row.appendChild(rates);
    rCard.appendChild(row);

    factsCard(g, 'Totals', [
      { n: full(e.views), l: 'Views' },
      { n: full(e.likes), l: 'Likes' },
      { n: full(e.bookmarks), l: 'Saves' },
      { n: full(e.comments), l: 'Comments' },
      { n: full(e.shares), l: 'Shares' },
      { n: full(e.downloads), l: 'Downloads' },
      { n: pct(e.rate), l: 'Engagement rate' },
      { n: full(e.views > 0 ? Math.round((e.likes / e.views) * 100) / 100 : 0), l: 'Likes per view' }
    ]);
    b.appendChild(g);

    var feed = a.activity || [];
    var card = anCard(b, 'Latest on your work', { stack: true });
    if (!feed.length) {
      empty(card, 'NOTHING YET');
    } else {
      var list = el('div', 'anFeed');
      feed.slice(0, CARD_ROWS).forEach(function (x) { list.appendChild(feedRow(x)); });
      card.appendChild(list);
      if (feed.length > CARD_ROWS) {
        card.appendChild(moreBtn('View all', function () { openAnList('activity'); }));
      }
    }
  }

  function paintRevenue() {
    var b = box('revenue'), a = state.data.activity;
    if (!b) return;
    if (!a || a.error) { empty(b, 'COULDN\u2019T LOAD REVENUE'); return; }
    var r = a.revenue;
    if (!r) { empty(b, 'NOTHING SOLD IN THIS PERIOD'); return; }
    b.innerHTML = '';

    var cur = r.currency || 'USD';
    function money(cents) {
      var n = (Number(cents) || 0) / 100;
      try {
        return n.toLocaleString(undefined, { style: 'currency', currency: cur,
                                             minimumFractionDigits: 2 });
      } catch (e) { return cur + ' ' + n.toFixed(2); }
    }

    factsCard(b, 'Earned in this period', [
      { n: money(r.net), l: 'Net this period' },
      { n: money(r.gross), l: 'Gross' },
      { n: money(r.fees), l: 'Fees' },
      { n: full(r.sales), l: 'Sales' },
      { n: money(r.net_all), l: 'Net all time' },
      { n: money(r.available), l: 'Available' },
      { n: money(r.pending), l: 'Clearing' },
      { n: r.sales > 0 ? money(Math.round(r.net / r.sales)) : money(0), l: 'Average sale' }
    ], { note: 'after the platform fee' });

    var cHost = cardBody(b, 'Earned per day', { stack: true });
    var srs = r.series || [];
    if (srs.some(function (x) { return Number(x.net) > 0; })) {
      lineChart(cHost, srs.map(function (x) { return x.d; }), [{
        key: 'net', label: 'Net (' + cur + ')', hex: '#16D95F',
        values: srs.map(function (x) { return (Number(x.net) || 0) / 100; })
      }]);
    } else empty(cHost, 'NOTHING EARNED IN THIS PERIOD');
  }

  function paintAccount() {
    var b = box('account'), a = state.data.activity;
    if (!b) return;
    if (!a || a.error) { empty(b, 'COULDN\u2019T LOAD YOUR ACCOUNT'); return; }
    b.innerHTML = '';
    var f = a.account || {};

    factsCard(b, 'Your audience', [
      { n: full(f.followers_total), l: 'Followers' },
      { n: '+' + full(f.followers_gained), l: 'Gained this period' },
      { n: full(f.followers_lost), l: 'Unfollowed this period' },
      { n: full(f.following_total), l: 'You follow' }
    ], { note: 'account-wide \u2014 people follow you, not a ' + scopeOf(state.scope).noun });

    var g = el('div', 'anGrid2 anStack');

    var cHost = cardBody(g, 'Followers gained per day');
    var srs = f.followers_series || [];
    if (srs.some(function (x) { return x.gained > 0; })) {
      lineChart(cHost, srs.map(function (x) { return x.d; }), [{
        key: 'followers', label: 'Followers', hex: '#16D95F',
        values: srs.map(function (x) { return Number(x.gained) || 0; })
      }]);
    } else empty(cHost, 'NO NEW FOLLOWERS IN THIS PERIOD');

    peopleCard(g, 'Followers', f.followers_list || [], 'NOBODY IS FOLLOWING YOU YET');
    peopleCard(g, 'Following', f.following_list || [], 'YOU ARE NOT FOLLOWING ANYONE YET');

    b.appendChild(g);
  }

    // Two audience lists. Newest first, CARD_ROWS shown and the rest a tap away, so a long list does not push the section down
  function peopleCard(host, title, list, emptyMsg) {
    var body = cardBody(host, title,
      { note: list.length >= 100 ? 'MOST RECENT 100' : (list.length ? full(list.length) : '') });
    if (!list.length) { empty(body, emptyMsg); return; }
    var wrap = el('div', 'anPeople');
    var shown = 0;
    function draw(n) {
      var end = Math.min(shown + n, list.length);
      for (; shown < end; shown++) wrap.appendChild(personRow(list[shown], ago(list[shown].at)));
    }
    draw(CARD_ROWS);
    body.appendChild(wrap);
    if (shown < list.length) {
      var more = moreBtn('SHOW ALL ' + full(list.length), function () {
        draw(list.length);
        more.remove();
      });
      body.appendChild(more);
    }
  }

  function paintCommunity() {
    var b = box('community'), a = state.data.activity;
    if (!b) return;
    if (!a || a.error) { empty(b, 'COULDN’T LOAD COMMUNITY'); return; }
    b.innerHTML = '';
    var c = a.account || {};

    factsCard(b, 'Your part in the place', [
      { n: full(c.communities_joined), l: 'Communities joined' },
      { n: full(c.communities_owned), l: 'Communities you run' },
      { n: full(c.messages), l: 'Messages sent' },
      { n: full(c.dms), l: 'Direct messages sent' },
      { n: full(c.comments_made), l: 'Comments you left' },
      { n: full(c.friends), l: 'Friends' },
      { n: full(c.profile_views), l: 'Profile views' },
      { n: full(c.merit), l: 'Merit' }
    ], { note: 'account-wide' });
  }

  var GOAL_METRICS = [
    { key: 'views', label: 'Views' }, { key: 'likes', label: 'Likes' },
    { key: 'bookmarks', label: 'Saves' }, { key: 'downloads', label: 'Downloads' },
    { key: 'comments', label: 'Comments' }, { key: 'uploads', label: 'Uploads' },
    { key: 'sales', label: 'Sales', only: 'marketplace' }
  ];
  function goalMetricsFor(sc) {
    return GOAL_METRICS.filter(function (m) {
      if (m.only) return m.only === sc;
      return !(m.key === 'downloads' && sc === 'marketplace');
    });
  }
  var GOAL_PERIODS = [
    { key: '7d', label: 'in 7 days' }, { key: '30d', label: 'in 30 days' },
    { key: '90d', label: 'in 90 days' }, { key: 'all', label: 'all time' }
  ];
  function goalLabel(k) {
    for (var i = 0; i < GOAL_METRICS.length; i++) if (GOAL_METRICS[i].key === k) return GOAL_METRICS[i].label;
    return k;
  }
  function periodLabel(k) {
    for (var i = 0; i < GOAL_PERIODS.length; i++) if (GOAL_PERIODS[i].key === k) return GOAL_PERIODS[i].label;
    return k;
  }

  function paintGoals() {
    var b = box('goals'), a = state.data.activity;
    if (!b) return;
    if (!a || a.error) { empty(b, 'COULDN’T LOAD GOALS'); return; }
    b.innerHTML = '';

    var gCard = anCard(b, 'Goals', { note: 'for ' + scopeOf(state.scope).nouns });

    var goals = a.goals || [];
    var list = el('div', 'anGoals');
    if (!goals.length) {
      list.appendChild(el('div', 'anEmpty', 'NO GOALS YET — SET ONE BELOW'));
    }
    goals.forEach(function (g) {
      var card = el('div', 'anGoal');
      var top = el('div', 'anGoalTop');
      top.appendChild(el('div', 'anGoalName', full(g.target) + ' ' + goalLabel(g.metric).toLowerCase()));
      top.appendChild(el('div', 'anGoalWhen', periodLabel(g.period)));
      if (g.achieved_at) top.appendChild(el('div', 'anGoalDone', 'Reached'));
      var x = el('button', 'anGoalX', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove goal');
      x.addEventListener('click', function () { removeGoal(g.id); });
      top.appendChild(x);
      card.appendChild(top);

      var track = el('div', 'anBarTrack');
      var fill = el('div', 'anBarFill');
      var share = Math.min(100, (Number(g.progress) / Math.max(1, Number(g.target))) * 100);
      fill.style.width = Math.max(2, share) + '%';
      if (g.achieved_at) fill.style.background = 'var(--an-up)';
      track.appendChild(fill);
      card.appendChild(track);

      var nums = el('div', 'anGoalNums');
      nums.appendChild(el('span', null, full(g.progress) + ' of ' + full(g.target)));
      nums.appendChild(el('span', null, Math.round(share) + '%'));
      card.appendChild(nums);
      list.appendChild(card);
    });
    gCard.appendChild(list);

    var form = el('div', 'anGoalNew');
    var mSel = el('select');
    mSel.setAttribute('aria-label', 'Goal metric');
    goalMetricsFor(state.scope).forEach(function (m) {
      var o = el('option', null, m.label); o.value = m.key; mSel.appendChild(o);
    });
    var tIn = el('input');
    tIn.type = 'number'; tIn.min = '1'; tIn.max = '100000000';
    tIn.placeholder = 'Target';
    tIn.setAttribute('aria-label', 'Goal target');
    var pSel = el('select');
    pSel.setAttribute('aria-label', 'Goal period');
    GOAL_PERIODS.forEach(function (p) {
      var o = el('option', null, p.label); o.value = p.key;
      if (p.key === '30d') o.selected = true;
      pSel.appendChild(o);
    });
    var add = el('button', 'anGoalAdd', 'Set goal');
    add.type = 'button';
    add.addEventListener('click', function () {
      var target = parseInt(tIn.value, 10);
      if (!target || target < 1) { toast('Type a target first'); return; }
      add.disabled = true;
      addGoal(mSel.value, target, pSel.value).then(function () {
        add.disabled = false; tIn.value = '';
      }, function () { add.disabled = false; });
    });
    form.appendChild(mSel); form.appendChild(tIn); form.appendChild(pSel); form.appendChild(add);
    gCard.appendChild(form);

    var done = (a.achievements || []).filter(function (x) { return x.done; }).length;
    var aCard = anCard(b, 'Achievements', { stack: true,
      note: done + ' of ' + (a.achievements || []).length + ' earned' });
    var grid = el('div', 'anAch');
    (a.achievements || []).forEach(function (x) {
      var card = el('div', 'anAchCard' + (x.done ? ' done' : ''));
      card.appendChild(el('div', 'anAchIco', x.done ? '🏆' : '🔒'));
      var txt = el('div', 'anAchTxt');
      txt.appendChild(el('div', 'anAchTitle', x.title));
      txt.appendChild(el('div', 'anAchNote', x.done ? x.note : (full(x.have) + ' / ' + full(x.need))));
      if (!x.done) {
        var bar = el('div', 'anAchBar');
        var fill = el('div', 'anAchBarFill');
        fill.style.width = Math.min(100, (Number(x.have) / Math.max(1, Number(x.need))) * 100) + '%';
        bar.appendChild(fill);
        txt.appendChild(bar);
      }
      card.appendChild(txt);
      grid.appendChild(card);
    });
    aCard.appendChild(grid);
  }

  async function addGoal(metric, target, period) {
    var c = db(), u = me();
    if (!c || !u) return;
    try {
      var r = await c.from('analytics_goals')
        .upsert({ user_id: u.id, scope: state.scope, metric: metric,
                  target: target, period: period, achieved_at: null },
                { onConflict: 'user_id,scope,metric,period' });
      if (r.error) throw r.error;
      toast('Goal set');
      await refresh();
    } catch (e) {
      toast((e && e.message && /limit/i.test(e.message)) ? 'You already have 12 goals' : 'Could not save the goal');
      throw e;
    }
  }
  async function removeGoal(id) {
    var c = db(), u = me();
    if (!c || !u) return;
    try {
      var r = await c.from('analytics_goals').delete().eq('id', id).eq('user_id', u.id);
      if (r.error) throw r.error;
      await refresh();
    } catch (e) { toast('Could not remove the goal'); }
  }

  function paintCompare() {
    var b = box('compare'), o = state.data.overview;
    if (!b) return;
    if (!o || o.error) { empty(b, 'COULDN’T LOAD COMPARISONS'); return; }
    b.innerHTML = '';
    var cmp = o.compare || {}, win = o['window'] || {}, prev = o.prev || {};

    var pHost = cardBody(b, 'This period vs the one before');
    bars(pHost, metricsFor(state.scope).map(function (m) {
      var cur = Number(win[m.key]) || 0, pv = Number(prev[m.key]) || 0;
      var d = delta(cur, pv);
      return { label: m.label, n: cur, sub: full(cur) + ' vs ' + full(pv) + ' · ' + d.txt.replace(' on previous', '') };
    }));

    var sCard = anCard(b, 'Against the rest of DigiArtz',
      { stack: true, note: 'views over the same window' });

    var top = Math.max(Number(cmp.my_views) || 0, Number(cmp.median_views) || 0, Number(cmp.avg_views) || 0, 1);
    var wrap = el('div', 'anCmpWrap');
    var bar = el('div', 'anCmpBar');
    var fill = el('div', 'anCmpFill');
    fill.style.width = Math.max(2, ((Number(cmp.my_views) || 0) / top) * 100) + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);

    var marks = [['median_views', 'median'], ['avg_views', 'average']]
      .map(function (pair) { return { v: Number(cmp[pair[0]]) || 0, name: pair[1] }; })
      .filter(function (m) { return m.v > 0; })
      .sort(function (x, y) { return x.v - y.v; });
    var lastPct = -99;
    marks.forEach(function (m) {
      var p = Math.min(99, (m.v / top) * 100);
      var tick = el('div', 'anCmpMark');
      tick.style.left = p + '%';
      wrap.appendChild(tick);
      var lb = el('div', 'anCmpMarkL', m.name + ' ' + full(m.v));
      if (p > 70) { lb.style.right = (100 - p) + '%'; lb.style.textAlign = 'right'; }
      else lb.style.left = p + '%';
      if (p - lastPct < 18) lb.style.top = '58px';
      lastPct = p;
      wrap.appendChild(lb);
    });
    sCard.appendChild(wrap);
    sCard.appendChild(el('div', 'anCmpMine', 'Your ' + full(cmp.my_views) + ' views this period'));

    var fb = el('div', 'anStack');
    facts(fb, [
      { n: full(cmp.my_views), l: 'Your views' },
      { n: full(cmp.median_views), l: 'Site median' },
      { n: full(cmp.avg_views), l: 'Site average' },
      { n: (cmp.percentile == null ? 0 : cmp.percentile) + '%', l: 'You beat this share' }
    ]);
    sCard.appendChild(fb);
  }

  function refresh() {
    if (state.loading) { state.again = true; return Promise.resolve(); }
    try { if (window.dzCache) window.dzCache.invalidateAnalytics(); } catch (e) {}
    return load(false);
  }

  function markDirty() {
    clearTimeout(state.dirty);
    state.dirty = setTimeout(function () { if (state.open) refresh(); }, 1200);
  }

  function startLive() {
    stopLive();
    var c = db(), u = me();
    if (!c || !u) return;

    state.poll = setInterval(function () {
      if (state.open && !document.hidden) refresh();
    }, 45000);

    if (typeof c.channel !== 'function') { setLive(false); return; }

    try {
      if (c.realtime && typeof c.realtime.setAuth === 'function' &&
          c.auth && typeof c.auth.getSession === 'function') {
        c.auth.getSession().then(function (r) {
          var tok = r && r.data && r.data.session && r.data.session.access_token;
          if (tok) { try { c.realtime.setAuth(tok); } catch (e) {} }
        }, function () {});
      }
    } catch (e) {}

    try {
      state.channel = c.channel('dz-analytics-' + u.id)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'analytics_events', filter: 'owner_id=eq.' + u.id },
            markDirty)
        .subscribe(function (status) {
          setLive(status === 'SUBSCRIBED');
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(state.retry);
            state.retry = setTimeout(function () {
              if (state.open) startLive();
            }, 15000);
          }
        });
    } catch (e) { setLive(false); }
  }

  function stopLive() {
    if (state.poll) { clearInterval(state.poll); state.poll = null; }
    clearTimeout(state.dirty);
    clearTimeout(state.retry);
    var c = db();
    if (state.channel && c && typeof c.removeChannel === 'function') {
      try { c.removeChannel(state.channel); } catch (e) {}
    }
    state.channel = null;
  }

  function setLive(on) {
    var n = $('anLive');
    if (!n) return;
    n.setAttribute('data-state', on ? 'on' : 'off');
    var txt = n.lastChild;
    if (txt) txt.textContent = on ? 'Live' : 'Auto-refresh';
    n.title = on ? 'Updating the moment something happens'
                 : 'Refreshing every 45 seconds';
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.open) refresh();
  });

  var fitTimer = null;
  function refit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      if (!state.open) return;
      measureHeader();
      if (state.data.overview) paint();
    }, 180);
  }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);

  function measureHeader() {
    var pg = $('anPage');
    if (!pg) return;
    var hdr = pg.querySelector('.subPgHdr');
    if (hdr) pg.style.setProperty('--an-hdr', Math.floor(hdr.getBoundingClientRect().height) + 'px');
  }

  function anListHost() {
    var pg = $('anListPage');
    if (pg && pg.parentNode) pg.parentNode.removeChild(pg);
    pg = document.createElement('div');
    pg.id = 'anListPage';
    pg.setAttribute('role', 'dialog');
    pg.setAttribute('aria-modal', 'true');
      // Built after load, so boot.js cannot tell it from a payment SDK's
      // overlay by looking. This says it is a panel of ours, and it goes back
      // to being inert whenever it is closed.
    pg.setAttribute('data-dz-panel', '');
    pg.style.cssText = 'position:fixed;inset:0;z-index:546;overflow-y:auto;' +
                       'background:var(--bg,#1A1A1F);color:var(--tx,#F3F3F8);';

    var hdr = el('div', 'subPgHdr');
    var back = el('button', 'subPgX', '');
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19 8 12l7-7"/></svg>';
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to analytics');
    back.addEventListener('click', closeAnList);
    hdr.appendChild(back);
    var t = el('div', 'subPgTitle');
    t.id = 'anListTitle';
    hdr.appendChild(t);
    pg.appendChild(hdr);

    var body = el('div', 'anBdy');
    body.id = 'anListBdy';
    pg.appendChild(body);
    document.body.appendChild(pg);
    return pg;
  }

  function openAnList(mode) {
    anList.mode = mode === 'activity' ? 'activity' : 'items';
    var pg = anListHost();
    pg.style.transform = 'translateX(100%)';
    pg.classList.add('open');
    void pg.offsetWidth;
    pg.style.transform = 'translateX(0)';
    var hdr = pg.querySelector('.subPgHdr');
    if (hdr) pg.style.setProperty('--an-hdr', Math.floor(hdr.getBoundingClientRect().height) + 'px');
    paintAnList();
    pg.scrollTop = 0;
  }

  var anListGone = null;
  function closeAnList() {
    var pg = $('anListPage');
    if (!pg) return;
    pg.classList.remove('open');
    pg.style.transform = 'translateX(100%)';
    if ($('anPage') && $('anPage').classList.contains('open')) {
      document.body.style.overflow = 'hidden';
    }
    anListStop();
    clearTimeout(anListGone);
    anListGone = setTimeout(function () {
      if (pg.parentNode && !pg.classList.contains('open')) pg.parentNode.removeChild(pg);
    }, 500);
  }

  var anList = { rows: [], mode: 'items', shown: 0, listEl: null, sentinel: null, io: null };
  var AN_FIRST = { items: 20, activity: 50 }, AN_STEP = 20;

  function anListStop() {
    if (anList.io) { try { anList.io.disconnect(); } catch (e) {} anList.io = null; }
    anList.sentinel = null;
    anList.listEl = null;
  }

  function anListChunk(n) {
    if (!anList.listEl) return;
    var to = Math.min(anList.rows.length, anList.shown + n);
    for (var i = anList.shown; i < to; i++) {
      anList.listEl.appendChild(
        anList.mode === 'activity' ? feedRow(anList.rows[i]) : artRow(anList.rows[i], i));
    }
    anList.shown = to;
    if (anList.shown >= anList.rows.length) {
      if (anList.sentinel && anList.sentinel.parentNode) {
        anList.sentinel.parentNode.removeChild(anList.sentinel);
      }
      anListStop();
    }
  }

  function anListWatch(pg) {
    if (anList.shown >= anList.rows.length) return null;
    var s = el('div', 'anSentinel');
    s.appendChild(el('div', 'anEmpty', 'Loading more\u2026'));
    anList.sentinel = s;
    if (!window.IntersectionObserver) {
      s.innerHTML = '';
      s.appendChild(moreBtn('Load more', function () { anListChunk(AN_STEP); }));
      return s;
    }
    anList.io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) anListChunk(AN_STEP);
    }, { root: pg, rootMargin: '600px 0px' });
    setTimeout(function () { if (anList.io && s.isConnected) anList.io.observe(s); }, 0);
    return s;
  }

  function feedRow(x) {
    var ICO = { like: ['\u2764\uFE0F', '#FF3D3D'], bookmark: ['\uD83D\uDD16', '#00D9B8'],
                comment: ['\uD83D\uDCAC', '#FF3DE0'] };
    var row = el('div', 'anFeedRow');
    var pair = ICO[x.event] || ['\u2022', '#8A8F98'];
    var ic = el('div', 'anFeedIco', pair[0]);
    ic.style.background = pair[1] + '22';
    row.appendChild(ic);
    var t = el('div', 'anFeedTxt');
    var verb = x.event === 'like' ? 'Someone liked ' :
               x.event === 'bookmark' ? 'Someone saved ' : 'New comment on ';
    t.appendChild(document.createTextNode(verb));
    t.appendChild(el('b', null, x.title));
    row.appendChild(t);
    row.appendChild(el('div', 'anFeedAt', ago(x.at)));
    return row;
  }

  function paintAnList() {
    var pg = $('anListPage');
    if (!pg) return;
    var body = $('anListBdy'), ttl = $('anListTitle');
    if (!body) return;
    var sc = scopeOf(state.scope);
    anListStop();
    body.innerHTML = '';

    var card = el('div', 'anCard');
    var hd = el('div', 'anCardHd');

    if (anList.mode === 'activity') {
      anList.rows = (state.data.activity && state.data.activity.activity) || [];
      if (ttl) ttl.textContent = 'LATEST ON YOUR WORK';
      pg.setAttribute('aria-label', 'Everything that happened on your work');
      hd.appendChild(el('div', 'anCardTitle', 'Most recent first'));
      card.appendChild(hd);
      if (!anList.rows.length) { empty(card, 'NOTHING YET'); body.appendChild(card); return; }
      anList.listEl = el('div', 'anFeed');
    } else {
      anList.rows = ((state.data.content && state.data.content.artworks) || []).slice();
      if (ttl) ttl.textContent = 'ALL ' + sc.nouns.toUpperCase();
      pg.setAttribute('aria-label', 'All ' + sc.nouns);
      hd.appendChild(el('div', 'anCardTitle', 'Ranked over the period'));
      var sorts = el('div', 'anSort');
      ART_SORTS.forEach(function (so) {
        if (so.key === 'downloads' && state.scope === 'marketplace') so = { key: 'sales', label: 'Sales' };
        var btn = el('button', 'anSortBtn' + (state.artSort === so.key ? ' on' : ''), so.label);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          state.artSort = so.key;
          paintAnList();
          paintArtworks();
          pg.scrollTop = 0;
        });
        sorts.appendChild(btn);
      });
      hd.appendChild(sorts);
      card.appendChild(hd);
      if (!anList.rows.length) { empty(card, 'NOTHING HERE YET'); body.appendChild(card); return; }
      var k = state.artSort;
      anList.rows.sort(function (x, y) {
        if (k === 'created_at') return String(y.created_at).localeCompare(String(x.created_at));
        return (Number(y[k]) || 0) - (Number(x[k]) || 0);
      });
      anList.listEl = el('div', 'anArts');
    }

    card.appendChild(anList.listEl);
    body.appendChild(card);

    anList.shown = 0;
    anListChunk(AN_FIRST[anList.mode] || AN_STEP);
    var s = anListWatch(pg);
    if (s) body.appendChild(s);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var pg = $('anListPage');
    if (!pg || !pg.classList.contains('open')) return;
    closeAnList();
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  function openAnalyticsPage(scope) {
    if (!me()) {
      toast('Sign in to see your analytics');
      if (typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    var pg = $('anPage');
    if (!pg) return;
    var want = scopeOf(scope || 'artwork').key;
    state.scope = want;
    var body = $('anBdy');
    if (body) { body.innerHTML = ''; body.dataset.built = ''; }
    state.data = { overview: null, content: null, reach: null, activity: null };
    buildShell();
    state.lastFocus = document.activeElement;
    state.open = true;
    pg.classList.add('open');
    document.body.style.overflow = 'hidden';
    measureHeader();
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { if (state.open) measureHeader(); });
    }
    loadMyName();
    load(true);
    startLive();
  }

  function closeAnalyticsPage() {
    var pg = $('anPage');
    if (!pg) return;
    var lp = $('anListPage');
    if (lp && lp.parentNode) { anListStop(); clearTimeout(anListGone); lp.parentNode.removeChild(lp); }
    if (state.navIo) { try { state.navIo.disconnect(); } catch (e) {} state.navIo = null; }
    state.open = false;
    stopLive();
    pg.classList.remove('open');
    if (typeof restoreScroll === 'function') restoreScroll();
    else document.body.style.overflow = '';
    var back = state.lastFocus;
    state.lastFocus = null;
    if (back && back.isConnected && back.focus) {
      try { back.focus({ preventScroll: true }); } catch (e) { try { back.focus(); } catch (e2) {} }
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var list = $('anListPage');
    if (list && list.classList.contains('open')) return;
    var pg = $('anPage');
    if (pg && pg.classList.contains('open')) { closeAnalyticsPage(); e.stopPropagation(); }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    var c = db();
    if (c && c.auth && c.auth.onAuthStateChange) {
      c.auth.onAuthStateChange(function () {
        myName = null;
        if (!state.open) return;
        if (!me()) closeAnalyticsPage();
        else { stopLive(); loadMyName(); load(true); startLive(); }
      });
    }
  });

  window.openAnalyticsPage = openAnalyticsPage;
  window.closeAnalyticsPage = closeAnalyticsPage;
})();
