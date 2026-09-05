(function () {
  'use strict';

  function db() { return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function me() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; }
  function $(id) { return document.getElementById(id); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  var SESS_KEY = 'dzAnSrc1';

  var SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|search\.brave|startpage|qwant|naver|seznam)\./;
  var SOCIAL_HOSTS = /(^|\.)(instagram|facebook|fb|twitter|x|t|pinterest|reddit|tiktok|youtube|youtu|tumblr|linkedin|discord|telegram|whatsapp|threads|artstation|deviantart|behance|vk|weibo|line|snapchat|mastodon|bsky)\.[a-z.]+$/;

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function entry() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SESS_KEY) || 'null'); } catch (e) {}
    if (saved && saved.source) return saved;

    var ref = '';
    try { ref = document.referrer || ''; } catch (e) {}
    var host = hostOf(ref);
    var out;
    if (!host || host === location.hostname.replace(/^www\./, '')) {
      out = { source: 'direct', ref: '' };
    } else if (SEARCH_HOSTS.test('.' + host + '.')) {
      out = { source: 'search', ref: host };
    } else if (SOCIAL_HOSTS.test(host)) {
      out = { source: 'social', ref: host };
    } else {
      out = { source: 'referral', ref: host };
    }
    try { sessionStorage.setItem(SESS_KEY, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function device() {
    try {
      var uad = navigator.userAgentData;
      if (uad && typeof uad.mobile === 'boolean') {
        if (!uad.mobile) return 'desktop';
      }
      var ua = navigator.userAgent || '';
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
      if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
      if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile';
      if (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 500) return 'mobile';
      return 'desktop';
    } catch (e) { return 'unknown'; }
  }

  function countryHint() {
    try {
      var tags = [];
      if (navigator.languages && navigator.languages.length) tags = tags.concat(navigator.languages);
      if (navigator.language) tags.push(navigator.language);
      for (var i = 0; i < tags.length; i++) {
        var m = /-([A-Za-z]{2})(?:$|-)/.exec(String(tags[i]));
        if (m) return m[1].toUpperCase();
      }
    } catch (e) {}
    return null;
  }

  var ctxCache = null;
  function ctx() {
    if (ctxCache) return ctxCache;
    var e = entry();
    ctxCache = {
      source: e.source, ref: e.ref, device: device(), country: countryHint(),
      key: (typeof window.dzViewerKey === 'function') ? window.dzViewerKey() : null
    };
    return ctxCache;
  }

  window.dzAnDims = function () {
    var c = ctx();
    return { p_source: c.source, p_ref: c.ref || null, p_device: c.device, p_country: c.country };
  };

  function track(event, subject, extra) {
    var c = db();
    if (!c) return;
    var x = ctx();
    var args = {
      p_event: event,
      p_subject: subject || null,
      p_scope: (extra && extra.scope) || 'artwork',
      p_owner: (extra && extra.owner) || null,
      p_source: x.source,
      p_ref: x.ref || null,
      p_device: x.device,
      p_country: x.country,
      p_term: (extra && extra.term) || null,
      p_anon_key: x.key
    };
    try { c.rpc('dz_analytics_track', args).then(noop, noop); } catch (e) {}
  }
  function noop() {}

  window.dzAnTrack = track;

  window.dzAnSearch = function (ids, term, scope) {
    var c = db();
    if (!c || !term || !ids || !ids.length) return;
    var x = ctx();
    try {
      c.rpc('dz_analytics_track_search', {
        p_subjects: ids.slice(0, 12).map(String),
        p_term: String(term).slice(0, 80),
        p_source: x.source, p_ref: x.ref || null,
        p_device: x.device, p_country: x.country, p_anon_key: x.key,
        p_scope: scope || 'artwork'
      }).then(noop, noop);
    } catch (e) {}
  };

  var ITEM_SEEN_KEY = 'dzAnItemSeen', ITEM_COOLDOWN = 6 * 3600 * 1000;
  window.dzAnItemView = function (kind, id) {
    var c = db();
    if (!c || !id) return;
    if (kind === 'resources') kind = 'resource';
    if (['marketplace', 'blog', 'resource'].indexOf(kind) === -1) return;
    var mapKey = kind + ':' + id, now = Date.now(), map = {};
    try { map = JSON.parse(localStorage.getItem(ITEM_SEEN_KEY) || '{}'); } catch (e) {}
    if (map[mapKey] && now - map[mapKey] < ITEM_COOLDOWN) return;
    map[mapKey] = now;
    for (var k in map) if (now - map[k] > 8 * ITEM_COOLDOWN) delete map[k];
    try { localStorage.setItem(ITEM_SEEN_KEY, JSON.stringify(map)); } catch (e) {}
    var x = ctx();
    try {
      c.rpc('register_item_view', {
        p_kind: kind, p_subject: String(id), p_anon_key: x.key,
        p_source: x.source, p_ref: x.ref || null,
        p_device: x.device, p_country: x.country
      }).then(noop, noop);
    } catch (e) {}
  };
})();
