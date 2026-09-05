(function () {
  'use strict';

  var BUILD = 'c1';

  var DB_NAME = 'digiartz-cache';
  var DB_STORE = 'entries';
  var MIRROR_PREFIX = 'dzc2:';
  var LEGACY_PREFIX = 'dzc1:';

  var MAX_MEM = 400;
  var MAX_DISK = 1200;
  var MIRROR_MAX_BYTES = 96 * 1024;
  var WRITE_DELAY = 250;

  var SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

  var POLICY = {
    'gallery:latest':    { ttl: 45 * SEC,  swr: 5 * MIN,  scope: 'public', store: 'both', sync: true },
    'gallery:trending':  { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', offline: true },
    'gallery:category':  { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 24, capAt: 1, offline: true },
    'gallery:tag':       { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 24, capAt: 1, offline: true },

    'artwork':           { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 120, capAt: 1, offline: true },
    'artwork:stats':     { ttl: 15 * SEC,  swr: 45 * SEC, scope: 'public', store: 'memory' },

    'profile:public':    { ttl: 5 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 60, capAt: 2, offline: true },
    'artist:artworks':   { ttl: 2 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 40, capAt: 2, offline: true },

    'comments':          { ttl: 20 * SEC,  swr: 60 * SEC, scope: 'public', store: 'memory' },

    'section:blog':      { ttl: 5 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', offline: true },
    'section:resources': { ttl: 5 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', offline: true },
    'section:marketplace': { ttl: 3 * MIN, swr: 10 * MIN, scope: 'public', store: 'both', offline: true },
    'section:jobs':      { ttl: 60 * SEC,  swr: 5 * MIN,  scope: 'public', store: 'both', offline: true },
    'section:item':      { ttl: 5 * MIN,   swr: 15 * MIN, scope: 'public', store: 'both', cap: 80, capAt: 2, offline: true },

    'cart':              { ttl: 15 * SEC,  swr: 0,        scope: 'private', store: 'memory' },

    'search':            { ttl: 60 * SEC,  swr: 0,        scope: 'public', store: 'memory' },

    'categories':        { ttl: DAY,       swr: 7 * DAY,  scope: 'public', store: 'both', sync: true, offline: true },

    'device:prefs':      { ttl: 30 * DAY,  swr: 90 * DAY, scope: 'public', store: 'both', sync: true, offline: true },

    'ranking':           { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 20, capAt: 1, offline: true },

    'communities':       { ttl: 3 * MIN,   swr: 10 * MIN, scope: 'public', store: 'both', cap: 20, capAt: 1, offline: true },

    'community:posts':   { ttl: 45 * SEC,  swr: 3 * MIN,  scope: 'private', store: 'both', sync: true, cap: 12, capAt: 3, offline: true },

    'user:profile':      { ttl: 60 * SEC,  swr: 10 * MIN, scope: 'private', store: 'both', sync: true, offline: true },
    'user:list':         { ttl: 30 * SEC,  swr: 5 * MIN,  scope: 'private', store: 'both', cap: 40, capAt: 3, offline: true },
    'user:friends':      { ttl: 30 * SEC,  swr: 5 * MIN,  scope: 'private', store: 'both', sync: true, offline: true },
    'user:follows':      { ttl: 30 * SEC,  swr: 5 * MIN,  scope: 'private', store: 'both', sync: true, offline: true },
    'user:convos':       { ttl: 20 * SEC,  swr: 5 * MIN,  scope: 'private', store: 'both', sync: true, offline: true },
    'user:thread':       { ttl: 10 * SEC,  swr: 2 * MIN,  scope: 'private', store: 'both', cap: 30, capAt: 3, offline: true },
    'user:settings':     { ttl: DAY,       swr: 7 * DAY,  scope: 'private', store: 'both', sync: true, offline: true },
    'user:analytics':    { ttl: 2 * MIN,   swr: 5 * MIN,  scope: 'private', store: 'both', cap: 24, capAt: 3 },

    'user:notifications': { ttl: 10 * SEC, swr: 0,        scope: 'private', store: 'memory' },

    'subscription':      { ttl: 15 * SEC,  swr: 0,        scope: 'private', store: 'memory' },

    'none':              { ttl: 0,         swr: 0,        scope: 'private', store: 'none' }
  };

  var DEFAULT = { ttl: 30 * SEC, swr: 0, scope: 'private', store: 'memory' };

  var m = {
    hit: 0, miss: 0, stale: 0, refresh: 0, error: 0, evict: 0,
    dedup: 0, origin: 0, write: 0, reject: 0, disk_error: 0
  };
  function count(what) {
    m[what] = (m[what] || 0) + 1;
    if (typeof window.dzCacheOnEvent === 'function') {
      try { window.dzCacheOnEvent(what); } catch (e) {}
    }
  }
  var DEBUG = false;
  try { DEBUG = localStorage.getItem('dz.cache.debug') === '1'; } catch (e) {}
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, ['[cache]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function uid() {
    var u = window.currentUser;
    return (u && u.id) ? String(u.id) : 'guest';
  }

  function policy(name) {
    if (name && typeof name === 'object') {
      var base = POLICY[name.policy] || DEFAULT;
      var out = {};
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
      for (var j in name) if (Object.prototype.hasOwnProperty.call(name, j)) out[j] = name[j];
      return out;
    }
    return POLICY[name] || DEFAULT;
  }

  function full(key, p) {
    return p.scope === 'public'
      ? BUILD + '|p|' + key
      : BUILD + '|u|' + uid() + '|' + key;
  }

  var mem = new Map();

  function memGet(k) {
    var e = mem.get(k);
    if (!e) return null;
    mem.delete(k); mem.set(k, e);
    return e;
  }
  function memSet(k, e) {
    if (mem.has(k)) mem.delete(k);
    mem.set(k, e);
    while (mem.size > MAX_MEM) {
      var oldest = mem.keys().next();
      if (oldest.done) break;
      mem.delete(oldest.value);
      count('evict');
    }
  }

  function mirrorGet(k) {
    try {
      var raw = localStorage.getItem(MIRROR_PREFIX + k);
      if (!raw) return null;
      var e = JSON.parse(raw);
      return (e && typeof e === 'object' && 'v' in e) ? e : null;
    } catch (e) { return null; }
  }
  function mirrorSet(k, e) {
    var raw;
    try { raw = JSON.stringify(e); } catch (err) { return; }
    if (raw.length > MIRROR_MAX_BYTES) return;
    try {
      localStorage.setItem(MIRROR_PREFIX + k, raw);
    } catch (err) {
      mirrorClear();
      try { localStorage.setItem(MIRROR_PREFIX + k, raw); } catch (e2) {}
    }
  }
  function mirrorDel(k) {
    try { localStorage.removeItem(MIRROR_PREFIX + k); } catch (e) {}
  }
  function mirrorKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(MIRROR_PREFIX) === 0) out.push(k.slice(MIRROR_PREFIX.length));
      }
    } catch (e) {}
    return out;
  }
  function mirrorClear() {
    mirrorKeys().forEach(mirrorDel);
  }

  var dbPromise = null, dbDead = false;

  function db() {
    if (dbDead) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { dbDead = true; resolve(null); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'k' });
      };
      req.onsuccess = function () {
        var d = req.result;
        d.onversionchange = function () { try { d.close(); } catch (e) {} dbPromise = null; };
        resolve(d);
      };
      req.onerror = function () { dbDead = true; count('disk_error'); resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return db().then(function (d) {
      if (!d) return null;
      try { return d.transaction(DB_STORE, mode).objectStore(DB_STORE); }
      catch (e) { count('disk_error'); return null; }
    });
  }

  function diskGet(k) {
    return tx('readonly').then(function (store) {
      if (!store) return null;
      return new Promise(function (resolve) {
        var r = store.get(k);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { count('disk_error'); resolve(null); };
      });
    }).catch(function () { return null; });
  }

  var writeQueue = new Map(), writeTimer = null;

  function diskSet(k, e) {
    writeQueue.set(k, e);
    if (writeTimer) return;
    writeTimer = setTimeout(flushWrites, WRITE_DELAY);
  }

  function flushWrites() {
    writeTimer = null;
    if (!writeQueue.size) return Promise.resolve();
    var batch = writeQueue; writeQueue = new Map();
    return tx('readwrite').then(function (store) {
      if (!store) return;
      batch.forEach(function (e, k) {
        try { store.put(e); count('write'); }
        catch (err) { count('disk_error'); }
      });
      return new Promise(function (resolve) {
        store.transaction.oncomplete = resolve;
        store.transaction.onabort = function () {
          count('disk_error');
          sweep(true).then(resolve, resolve);
        };
        store.transaction.onerror = function () { count('disk_error'); resolve(); };
      });
    }).catch(function () {});
  }

  function diskDel(keys) {
    writeQueue && keys.forEach(function (k) { writeQueue.delete(k); });
    return tx('readwrite').then(function (store) {
      if (!store) return;
      keys.forEach(function (k) { try { store.delete(k); } catch (e) {} });
      return new Promise(function (resolve) {
        store.transaction.oncomplete = resolve;
        store.transaction.onabort = resolve;
        store.transaction.onerror = resolve;
      });
    }).catch(function () {});
  }

  function diskAll() {
    return tx('readonly').then(function (store) {
      if (!store) return [];
      return new Promise(function (resolve) {
        var out = [];
        var r = store.openCursor();
        r.onsuccess = function () {
          var c = r.result;
          if (!c) { resolve(out); return; }
          out.push(c.value);
          c.continue();
        };
        r.onerror = function () { count('disk_error'); resolve(out); };
      });
    }).catch(function () { return []; });
  }

  function entryOf(k, key, value, p, name) {
    var now = Date.now();
    return {
      k: k, key: key, v: value, t: now,
      f: now + (p.ttl || 0),
      s: now + (p.ttl || 0) + (p.swr || 0),
      u: p.scope === 'public' ? null : uid(),
      a: now, p: name || null
    };
  }

  function usable(e, p, any) {
    if (!e || typeof e !== 'object') return null;
    if (p.scope !== 'public' && e.u !== uid()) { count('reject'); return null; }
    if (!any && (!e.s || Date.now() > e.s)) return null;
    return e;
  }

  function peek(key, name, opts) {
    var p = policy(name);
    if (p.store === 'none') return null;
    var any = !!(opts && opts.any);
    var k = full(key, p);
    var e = usable(memGet(k), p, any);
    if (e) return e.v;
    if (p.sync) {
      e = usable(mirrorGet(k), p, any);
      if (e) { memSet(k, e); return e.v; }
    }
    return null;
  }

  function lookup(k, p, any) {
    var e = usable(memGet(k), p, any);
    if (e) return Promise.resolve(e);
    if (p.sync) {
      var mv = usable(mirrorGet(k), p, any);
      if (mv) { memSet(k, mv); return Promise.resolve(mv); }
    }
    if (p.store !== 'both') return Promise.resolve(null);
    return diskGet(k).then(function (de) {
      var ok = usable(de, p, any);
      if (ok) memSet(k, ok);
      return ok;
    });
  }

  function recall(key, name) {
    var p = policy(name);
    if (p.store === 'none') return Promise.resolve(null);
    return lookup(full(key, p), p, true).then(function (e) { return e ? e.v : null; });
  }

  function get(key, name) {
    var p = policy(name);
    if (p.store === 'none') return Promise.resolve(null);
    return lookup(full(key, p), p).then(function (e) {
      if (!e) return null;
      return Date.now() < e.f ? e.v : null;
    });
  }

  function set(key, value, name) {
    var p = policy(name);
    if (p.store === 'none') return Promise.resolve(value);
    var k = full(key, p);
    var e = entryOf(k, key, value, p, typeof name === 'string' ? name : null);
    memSet(k, e);
    if (p.sync) mirrorSet(k, e);
    if (p.store === 'both') {
      diskSet(k, e);
      if (p.cap) scheduleCap(family(key, p), p.cap);
    }
    return Promise.resolve(value);
  }

  function del(key, name) {
    var p = policy(name);
    var k = full(key, p);
    mem.delete(k);
    mirrorDel(k);
    return diskDel([k]);
  }

  function tailOf(k) {
    var parts = String(k).split('|');
    return parts.length > 2 ? parts.slice(parts[1] === 'u' ? 3 : 2).join('|') : k;
  }

  function matchAny(tail, prefixes) {
    for (var i = 0; i < prefixes.length; i++) {
      if (tail.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  function deleteByPrefix(prefix, opts) {
    var list = Array.isArray(prefix) ? prefix.slice() : [prefix];
    list = list.filter(function (x) { return typeof x === 'string' && x; });
    if (!list.length) return Promise.resolve();
    var quiet = opts && opts.quiet;

    var hits = [];
    mem.forEach(function (e, k) { if (matchAny(tailOf(k), list)) hits.push(k); });
    hits.forEach(function (k) { mem.delete(k); });
    mirrorKeys().forEach(function (k) { if (matchAny(tailOf(k), list)) mirrorDel(k); });
    noteInvalidation(list, false);
    writeQueue.forEach(function (e, k) { if (matchAny(tailOf(k), list)) writeQueue.delete(k); });
    if (!quiet) list.forEach(broadcast);
    log('drop', list.join(' '));

    return diskAll().then(function (rows) {
      var kill = rows.filter(function (r) { return matchAny(tailOf(r.k), list); })
                     .map(function (r) { return r.k; });
      return kill.length ? diskDel(kill) : null;
    });
  }

  function family(key, p) {
    var n = p.capAt || 1;
    return String(key).split(':').slice(0, n).join(':') + ':';
  }

  var capTimers = {};
  function scheduleCap(prefix, cap) {
    if (capTimers[prefix]) return;
    capTimers[prefix] = setTimeout(function () {
      delete capTimers[prefix];
      capFamily(prefix, cap);
    }, 4000);
  }
  function capFamily(prefix, cap) {
    return diskAll().then(function (rows) {
      var mine = rows.filter(function (r) { return tailOf(r.k).indexOf(prefix) === 0; });
      if (mine.length <= cap) return null;
      mine.sort(function (a, b) { return (b.a || b.t || 0) - (a.a || a.t || 0); });
      var kill = mine.slice(cap).map(function (r) { count('evict'); return r.k; });
      kill.forEach(function (k) { mem.delete(k); mirrorDel(k); });
      return diskDel(kill);
    }).catch(function () {});
  }

  var inflight = {};

  var invalidations = [];
  var INVAL_KEEP = 5 * MIN, INVAL_MAX = 200;

  function noteInvalidation(list, priv) {
    var now = Date.now();
    invalidations.push({ t: now, list: list, priv: !!priv });
    while (invalidations.length && (invalidations.length > INVAL_MAX ||
           now - invalidations[0].t > INVAL_KEEP)) {
      invalidations.shift();
    }
  }

  function invalidatedSince(k, since) {
    var tail = tailOf(k), isPrivate = String(k).indexOf(BUILD + '|u|') === 0;
    for (var i = invalidations.length - 1; i >= 0; i--) {
      var rec = invalidations[i];
      if (rec.t < since) break;
      if (rec.priv && isPrivate) return true;
      if (rec.list && matchAny(tail, rec.list)) return true;
    }
    return false;
  }

  function fetchOnce(k, loader) {
    if (inflight[k]) { count('dedup'); return inflight[k]; }
    count('origin');
    var pr = Promise.resolve().then(loader).then(
      function (v) { delete inflight[k]; return v; },
      function (e) { delete inflight[k]; throw e; }
    );
    inflight[k] = pr;
    return pr;
  }

  function getOrSet(key, loader, name, onFresh) {
    var p = policy(name);
    if (p.store === 'none') return Promise.resolve().then(loader);
    var k = full(key, p);
    var nm = typeof name === 'string' ? name : null;
    var asked = Date.now();

    return lookup(k, p).then(function (e) {
      var now = Date.now();

      if (e && now < e.f) {
        count('hit');
        e.a = now;
        return e.v;
      }

      if (e) {
        count('stale');
        revalidate(k, key, loader, p, nm, onFresh, asked);
        return e.v;
      }

      count('miss');
      return fetchOnce(k, loader).then(function (v) {
        if (v !== undefined && !invalidatedSince(k, asked)) set(key, v, negative(v, p, name));
        return v;
      }, function (err) {
        count('error');
        if (p.offline) {
          return lookup(k, p, true).then(function (old) {
            if (old) return old.v;
            throw err;
          });
        }
        throw err;
      });
    });
  }

  function negative(v, p, name) {
    if (v !== null) return name;
    var neg = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) neg[k] = p[k];
    neg.ttl = 20 * SEC;
    neg.swr = 0;
    return neg;
  }

  function revalidate(k, key, loader, p, nm, onFresh, asked) {
    count('refresh');
    var since = asked || Date.now();
    fetchOnce(k, loader).then(function (v) {
      if (v === undefined || invalidatedSince(k, since)) return;
      set(key, v, negative(v, p, nm || p));
      if (typeof onFresh === 'function') {
        try { onFresh(v); } catch (e) {}
      }
    }, function () {
      count('error');
    });
  }

  function warm(key, loader, name, onStale, onFresh) {
    var have = peek(key, name, { any: true });
    if (have != null && typeof onStale === 'function') {
      try { onStale(have); } catch (e) {}
    }
    return getOrSet(key, loader, name, onFresh);
  }

  var chan = null;
  try { chan = ('BroadcastChannel' in window) ? new BroadcastChannel('dz-cache') : null; } catch (e) { chan = null; }
  if (chan) {
    chan.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d || d.type !== 'drop' || !d.prefix) return;
      var hits = [];
      mem.forEach(function (e, k) { if (tailOf(k).indexOf(d.prefix) === 0) hits.push(k); });
      hits.forEach(function (k) { mem.delete(k); });
      mirrorKeys().forEach(function (k) { if (tailOf(k).indexOf(d.prefix) === 0) mirrorDel(k); });
    };
  }
  function broadcast(prefix) {
    if (!chan) return;
    try { chan.postMessage({ type: 'drop', prefix: prefix }); } catch (e) {}
  }

  function sweep(hard) {
    return diskAll().then(function (rows) {
      var now = Date.now(), kill = [], keep = [];
      rows.forEach(function (r) {
        if (!r || !r.k) return;
        if (String(r.k).indexOf(BUILD + '|') !== 0) { kill.push(r.k); return; }
        if (!r.s || now > r.s + DAY) { kill.push(r.k); return; }
        keep.push(r);
      });
      var limit = hard ? Math.floor(MAX_DISK * 0.75) : MAX_DISK;
      if (keep.length > limit) {
        keep.sort(function (a, b) { return (b.a || b.t || 0) - (a.a || a.t || 0); });
        keep.slice(limit).forEach(function (r) { count('evict'); kill.push(r.k); });
      }
      log('sweep', kill.length, 'of', rows.length);
      return kill.length ? diskDel(kill) : null;
    }).catch(function () {});
  }

  function dropLegacy() {
    try {
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LEGACY_PREFIX) === 0) kill.push(k);
      }
      kill.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  function dropPrivate() {
    var hits = [];
    mem.forEach(function (e, k) { if (String(k).indexOf(BUILD + '|u|') === 0) hits.push(k); });
    hits.forEach(function (k) { mem.delete(k); });
    mirrorKeys().forEach(function (k) { if (String(k).indexOf(BUILD + '|u|') === 0) mirrorDel(k); });
    noteInvalidation(null, true);
    writeQueue.forEach(function (e, k) {
      if (String(k).indexOf(BUILD + '|u|') === 0) writeQueue.delete(k);
    });
    return diskAll().then(function (rows) {
      var kill = rows.filter(function (r) { return String(r.k).indexOf(BUILD + '|u|') === 0; })
                     .map(function (r) { return r.k; });
      return kill.length ? diskDel(kill) : null;
    }).catch(function () {});
  }

  function invalidateArtwork(id, meta) {
    var drop = ['gallery:', 'search:artwork', 'feed:'];
    if (id) drop.push('artwork:' + id, 'comments:art:' + id);
    if (meta && meta.userId) {
      drop.push('artist:artworks:' + meta.userId, 'profile:public:' + meta.userId);
    }
    if (!meta || meta.ranking !== false) drop.push('ranking:');
    return deleteByPrefix(drop);
  }

  function up(rest) { return 'user:' + uid() + ':' + rest; }

  function invalidateProfile(id, username) {
    var drop = [];
    if (username) drop.push('profile:public:name:' + norm(username));
    else drop.push('profile:public:');
    if (id) drop.push('artist:artworks:' + id);
    if (id && String(id) === uid()) drop.push(up('profile'));
    return deleteByPrefix(drop);
  }

  function invalidateCommunity(channel) {
    return channel
      ? deleteByPrefix(up('community:' + channel))
      : deleteByPrefix([up('community:'), 'communities:']);
  }

  function invalidateSection(sec, id) {
    var drop = ['section:' + sec, 'search:' + sec];
    if (id) drop.push('section:item:' + sec + ':' + id);
    return deleteByPrefix(drop);
  }

  function invalidateComments(kind, id) {
    return deleteByPrefix('comments:' + kind + ':' + id);
  }
  function invalidateStats(id) {
    return deleteByPrefix('artwork:stats:' + id);
  }
  function invalidateRanking() {
    return deleteByPrefix('ranking:');
  }
  function invalidateSearch() {
    return deleteByPrefix('search:');
  }
  function invalidateFriends() {
    return deleteByPrefix([up('friends'), up('convos')]);
  }
  function invalidateFollows() {
    return deleteByPrefix(up('follows'));
  }
  function invalidateThread(partnerId) {
    return deleteByPrefix(up('thread:' + (partnerId || '')));
  }
  function invalidateAnalytics() {
    return deleteByPrefix(up('analytics'));
  }
  function invalidateUserList(what) {
    return deleteByPrefix(up('list:' + (what || '')));
  }

  function purgeImages(urls) {
    var list = (urls || []).filter(function (u) { return typeof u === 'string' && u; });
    if (!list.length || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'DZ_DROP_IMAGES', urls: list });
    } catch (e) {}
  }

  function warmImages(urls, limit) {
    var list = (urls || []).filter(function (u) { return typeof u === 'string' && u.indexOf('http') === 0; })
                           .slice(0, limit || 50);
    if (!list.length) return;
    var i = 0;
    function next() {
      if (i >= list.length) return;
      var u = list[i++];
      try { fetch(u, { mode: 'no-cors', credentials: 'omit' }).then(next, next); }
      catch (e) { next(); }
    }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(next, { timeout: 4000 });
    else setTimeout(next, 2500);
  }

  function key() {
    return [].slice.call(arguments)
      .filter(function (x) { return x !== null && x !== undefined && x !== ''; })
      .map(function (x) { return String(x).replace(/[|:\s]+/g, '_'); })
      .join(':');
  }

  function norm(q) {
    return String(q == null ? '' : q).toLowerCase().trim()
      .replace(/[\s_+]+/g, ' ')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }

  function params(obj) {
    if (!obj) return '';
    return Object.keys(obj).sort().map(function (n) {
      var v = obj[n];
      if (v === null || v === undefined || v === '' || v === 'all' || v === false) return null;
      return n + '=' + norm(Array.isArray(v) ? v.slice().sort().join(',') : v);
    }).filter(Boolean).join('&');
  }

  function ukey() {
    return 'user:' + uid() + ':' + key.apply(null, arguments);
  }

  function stats() {
    var reads = m.hit + m.stale + m.miss;
    var out = { memory: mem.size, reads: reads };
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) out[k] = m[k];
    out.hit_ratio = reads ? Math.round(((m.hit + m.stale) / reads) * 100) + '%' : 'n/a';
    return out;
  }

  function workerStats() {
    return new Promise(function (resolve) {
      var ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!ctl || typeof MessageChannel !== 'function') { resolve(null); return; }
      var ch = new MessageChannel();
      var done = false;
      ch.port1.onmessage = function (ev) { done = true; resolve(ev.data || null); };
      setTimeout(function () { if (!done) resolve(null); }, 1500);
      try { ctl.postMessage({ type: 'DZ_CACHE_STATS' }, [ch.port2]); }
      catch (e) { resolve(null); }
    });
  }

  function report() {
    return Promise.all([diskAll(), workerStats()]).then(function (both) {
      var rows = both[0], sw = both[1];
      var s = stats();
      s.disk = rows.length;
      try {
        console.log('%cdigiartz cache', 'font-weight:bold');
        console.table([s]);
        var byPolicy = {};
        rows.forEach(function (r) {
          var n = r.p || 'unknown';
          byPolicy[n] = (byPolicy[n] || 0) + 1;
        });
        console.log('data, by policy');
        console.table(byPolicy);
        if (sw) { console.log('files, held by the service worker'); console.table([sw]); }
        else console.log('no service worker holding files in this tab');
      } catch (e) {}
      s.worker = sw;
      return s;
    });
  }

  function boot() {
    dropLegacy();
    sweep(false);
  }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(boot, { timeout: 5000 });
  else setTimeout(boot, 2000);

  window.addEventListener('pagehide', function () { flushWrites(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushWrites();
  });

  window.dzCache = {
    get: get,
    set: set,
    peek: peek,
    recall: recall,
    delete: del,
    deleteByPrefix: deleteByPrefix,
    getOrSet: getOrSet,
    warm: warm,
    flush: flushWrites,

    key: key,
    ukey: ukey,
    norm: norm,
    params: params,
    uid: uid,

    invalidateArtwork: invalidateArtwork,
    invalidateProfile: invalidateProfile,
    invalidateCommunity: invalidateCommunity,
    invalidateSection: invalidateSection,
    invalidateComments: invalidateComments,
    invalidateStats: invalidateStats,
    invalidateRanking: invalidateRanking,
    invalidateSearch: invalidateSearch,
    invalidateFriends: invalidateFriends,
    invalidateFollows: invalidateFollows,
    invalidateThread: invalidateThread,
    invalidateAnalytics: invalidateAnalytics,
    invalidateUserList: invalidateUserList,
    dropPrivate: dropPrivate,
    sweep: sweep,

    purgeImages: purgeImages,
    warmImages: warmImages,

    stats: stats,
    report: report,
    policies: POLICY,
    build: BUILD
  };
})();
