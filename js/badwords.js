var DZ_BW = (function () {
  var EXTERNAL = (window.DZ_WORDLIST && window.DZ_WORDLIST.words) || [];

  var WORDS = EXTERNAL.concat([
  ]);

  var STRICT = [
  ];

  var ANYWHERE = [
  ];

  var ALLOW = [
    'class', 'classic', 'classes', 'assassin', 'assassins', 'assess',
    'assessment', 'assign', 'assist', 'assistant', 'associate', 'assume',
    'bass', 'brass', 'glass', 'grass', 'mass', 'pass', 'passed', 'passion',
    'analysis', 'analyse', 'analyze', 'analog', 'canal',
    'cocktail', 'cockpit', 'peacock', 'shuttlecock',
    'hello', 'shell', 'shelter', 'michelle', 'helsinki', 'helicopter',
    'titan', 'titanic', 'title', 'titles', 'constitute', 'competition',
    'scunthorpe', 'penistone', 'sussex', 'essex', 'middlesex',
    'document', 'circumstance', 'accumulate', 'cucumber',
    'shiitake', 'matsushita', 'phuket'
  ];

  var PROMO = [
    'whatsapp', 'whats app', 'wa.me', 'telegram', 't.me', 'snapchat',
    'dm me', 'dm me on', 'inbox me', 'message me on', 'contact me on',
    'text me on', 'add me on'
  ];

  var BLOCK = {
    urls      : true,
    emails    : true,

    digitRuns : false,
    govIds    : false
  };

  var DIGIT_MIN = 10;

  var DOMAIN_ALLOW = [
    'digiartz.net'
  ];

  var TLDS = [
    'com', 'net', 'org', 'info', 'biz', 'online', 'site', 'shop', 'store',
    'app', 'dev', 'link', 'live', 'club', 'fun', 'top', 'vip', 'pro',
    'xyz', 'io', 'co', 'in', 'me', 'gg', 'tv', 'ly', 'to', 'cc', 'ru',
    'uk', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'br', 'es', 'it',
    'nl', 'se', 'pl', 'tr', 'ir', 'pk', 'bd', 'lk', 'np'
  ];

  var MASK_CHAR   = '*';
  var APPLY_TO_DEV = false;
  var MIN_LEN     = 3;
  var SKELETONS   = true;

  var SKELETON_FROM = [
    'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'bullshit',
    'motherfucker', 'faggot', 'nigger', 'nigga', 'retard', 'wanker',
    'bollocks', 'arsehole', 'pussy', 'fucker', 'fucking'
  ];
  var CJK_MIN     = 2;

  var LEET_MAP = {
    '@':'a', '4':'a', '8':'b', '(':'c', '3':'e', '6':'g', '9':'g',
    '1':'i', '!':'i', '|':'i', '0':'o', '$':'s', '5':'s', '7':'t',
    '+':'t', '2':'z', 'v':'u'
  };

  var SUFFIXES = ['ings','ing','ins','in','ers','er','ies','ed','es','s','y','z'];

  var FIELDS = {
    comments          : ['comment_text', 'username'],
    direct_messages   : ['content'],
    item_comments     : ['body', 'username'],

    profiles          : ['bio', 'display_name'],

    artworks          : ['name', 'title', 'description', 'tags', 'software'],
    scheduled_uploads : ['name', 'description', 'tags', 'software'],
    comics            : ['title', 'description', 'tags'],
    albums            : ['name'],

    resources         : ['title', 'description', 'tags', 'software'],
    blog_posts        : ['title', 'excerpt', 'body', 'tags'],
    marketplace_items : ['title', 'description', 'tags'],
    jobs              : ['title', 'company', 'description', 'tags',
                         'location_city', 'location_region'],

    communities       : ['name', 'description', 'rules'],

    artwork_reports   : ['details'],
    item_reports      : ['reason']
  };

  var RPC_ARGS = [
    'p_name', 'p_desc', 'p_description', 'p_title', 'p_body', 'p_text',
    'p_message', 'p_comment', 'p_reason', 'p_details', 'p_rules', 'p_bio',
    'p_content', 'p_excerpt', 'p_company'
  ];

  var USERNAME_POLICY = 'block';

  var USERNAME_SUBSTRING = true;
  var USERNAME_MIN_SUB   = 4;

  var dict = null;

  function reEsc(c) { return c.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&'); }

  var DATE_SAFE = /\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2})?)?\b/g;

  function shapes() {
    var out = [];
    if (BLOCK.urls) {
      var tld = TLDS.slice().sort(function (a, b) { return b.length - a.length; })
                    .map(reEsc).join('|');
      out.push(/(?:https?:\/\/|www\.)[^\s<>"']+/g);
      out.push(new RegExp(
        '\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:' + tld + ')\\b(?:\\/[^\\s<>"\']*)?', 'g'));

      out.push(/(?:https?|ftps?|wss?|magnet|tel|mailto)\s*:(?:\/\/)?[^\s<>"']+/g);
      out.push(/h[x*#]{2}ps?\s*:(?:\/\/)?[^\s<>"']+/g);
      out.push(new RegExp(
        '[a-z0-9][a-z0-9-]*(?:' +
          '%25?2e|&#(?:46|x2e);|\\s*[\\(\\[\\{]\\s*(?:dot|d0t)\\s*[\\)\\]\\}]\\s*|' +
          '\\s+dot\\s+|\\s+\\.\\s*' +
        ')(?:[a-z0-9-]+(?:%25?2e|&#(?:46|x2e);|\\.))*(?:' + tld + ')\\b' +
        '(?:\\/[^\\s<>"\']*)?', 'g'));
    }
    if (BLOCK.emails) out.push(/[a-z0-9._%+-]+\s?@\s?[a-z0-9.-]+\.[a-z]{2,}/g);
    if (BLOCK.digitRuns && DIGIT_MIN > 1) {
      out.push(new RegExp('\\+?\\d(?:[\\s.()+-]{0,2}\\d){' + (DIGIT_MIN - 1) + ',}', 'g'));
    }
    if (BLOCK.govIds) {
      out.push(/\b[a-z]{5}[0-9]{4}[a-z]\b/g);
      out.push(/\b[0-9]{2}[a-z]{5}[0-9]{4}[a-z][0-9a-z]{3}\b/g);
      out.push(/\b[a-z]{3}[0-9]{7}\b/g);
      out.push(/\b[a-z][0-9]{7}\b/g);
    }
    return out;
  }

  function fold(s) {
    var n = '', map = [], i, j, d;
    for (i = 0; i < s.length; i++) {
      d = s.charAt(i);
      try { d = d.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
      d = d.toLowerCase();
      for (j = 0; j < d.length; j++) { n += d.charAt(j); map.push(i); }
    }
    return { n: n, map: map };
  }

  function canon(s) {
    var o = '', i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      o += (LEET_MAP[ch] || ch);
    }
    return o;
  }

  var UNI_SPLIT = null;
  try { UNI_SPLIT = new RegExp('[\\p{L}\\p{N}]+', 'gu'); } catch (e) { UNI_SPLIT = null; }

  var RE_CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0e00-\u0e7f\uac00-\ud7af]/;

  function skeleton(w) {
    var sk = w.replace(/[aeiou]/g, '');
    return (sk.length >= 3 && sk.length < w.length) ? sk : null;
  }

  function squash(t) { return t.replace(/(.)\1+/g, '$1'); }
  function squash2(t) { return t.replace(/(.)\1{2,}/g, '$1$1'); }

  function compile() {
    if (dict) return dict;

    var plain = {}, suffixable = {}, phrases = {}, cjk = [], anywhere = [];
    var maxPhrase = 1;

    function tokens(w) {
      var t = [];
      if (UNI_SPLIT) {
        UNI_SPLIT.lastIndex = 0;
        var m; while ((m = UNI_SPLIT.exec(w)) !== null) t.push(m[0]);
      } else {
        t = w.split(/[^a-z0-9]+/);
      }
      return t.filter(function (x) { return !!x; });
    }

    function register(raw, bag, allowSkeleton) {
      var folded = fold(String(raw || '').trim()).n;
      if (!folded) return;

      if (RE_CJK.test(folded)) {
        if (folded.length >= CJK_MIN) cjk.push(folded);
        return;
      }
      var w = canon(folded);
      var tk = tokens(w);
      if (!tk.length) return;

      if (tk.length > 1) {
        var head = tk[0];
        (phrases[head] = phrases[head] || []).push(tk);
        if (tk.length > maxPhrase) maxPhrase = tk.length;
        return;
      }
      var t = tk[0];
      if (t.length < MIN_LEN) return;
      bag[t] = 1;
      if (allowSkeleton && SKELETONS && /^[a-z]+$/.test(t)) {
        var sk = skeleton(t);
        if (sk) plain[sk] = 1;
      }
    }

    var i;
    for (i = 0; i < WORDS.length; i++)  register(WORDS[i],  suffixable, false);
    for (i = 0; i < PROMO.length; i++)  register(PROMO[i],  suffixable, false);
    for (i = 0; i < STRICT.length; i++) register(STRICT[i], plain,      false);

    if (SKELETONS) {
      for (i = 0; i < SKELETON_FROM.length; i++) {
        var base = canon(fold(String(SKELETON_FROM[i] || '')).n).replace(/[^a-z]/g, '');
        var sk = base && skeleton(base);
        if (sk) plain[sk] = 1;
      }
    }

    for (i = 0; i < ANYWHERE.length; i++) {
      var a = canon(fold(String(ANYWHERE[i] || '')).n).replace(/[^a-z0-9]/g, '');
      if (a.length >= MIN_LEN) anywhere.push(a.split('').map(reEsc).join('+') + '+');
    }

    var cjkRe = null;
    if (cjk.length) {
      cjk.sort(function (x, y) { return y.length - x.length; });
      try { cjkRe = new RegExp('(?:' + cjk.map(function (x) {
        return x.split('').map(reEsc).join('');
      }).join('|') + ')', 'g'); } catch (e) { cjkRe = null; }
    }

    var anyRe = null;
    if (anywhere.length) {
      try { anyRe = new RegExp('(?:' + anywhere.join('|') + ')', 'g'); } catch (e) { anyRe = null; }
    }

    var allow = {};
    for (i = 0; i < ALLOW.length; i++) {
      var al = canon(fold(String(ALLOW[i] || '')).n).replace(/[^a-z0-9]/g, '');
      if (al) allow[al] = 1;
    }

    var okDomain = [];
    for (i = 0; i < DOMAIN_ALLOW.length; i++) {
      var dom = String(DOMAIN_ALLOW[i] || '').toLowerCase().trim();
      if (!dom) continue;
      okDomain.push(new RegExp(
        '(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*' + reEsc(dom) + '\\b(?:\\/[^\\s<>"\']*)?', 'g'));
    }

    dict = {
      plain: plain, suffixable: suffixable, phrases: phrases,
      maxPhrase: maxPhrase, cjkRe: cjkRe, anyRe: anyRe,
      allow: allow, okDomain: okDomain, shapes: shapes()
    };
    return dict;
  }

  function lookup(t) {
    var d = dict, i, s;
    if (t.length < MIN_LEN) return false;
    if (d.plain[t] || d.suffixable[t]) return true;

    for (i = 0; i < SUFFIXES.length; i++) {
      s = SUFFIXES[i];
      if (t.length > s.length + MIN_LEN - 1 &&
          t.slice(-s.length) === s && d.suffixable[t.slice(0, -s.length)]) return true;
    }
    var a = squash(t), b = squash2(t);
    if (a !== t && a.length >= MIN_LEN && (d.plain[a] || d.suffixable[a])) return true;
    if (b !== t && b !== a && b.length >= MIN_LEN && (d.plain[b] || d.suffixable[b])) return true;
    return false;
  }

  function find(text) {
    var d = compile();
    var f = fold(text), n = f.n;
    if (!n) return [];
    var c = canon(n);
    var hits = [], safe = [], m, k, i;

    for (k = 0; k < d.okDomain.length; k++) {
      var od = d.okDomain[k]; od.lastIndex = 0;
      while ((m = od.exec(n)) !== null) {
        safe.push([m.index, m.index + m[0].length]);
        if (m.index === od.lastIndex) od.lastIndex++;
      }
    }
    if (BLOCK.digitRuns) {
      DATE_SAFE.lastIndex = 0;
      while ((m = DATE_SAFE.exec(n)) !== null) {
        safe.push([m.index, m.index + m[0].length]);
        if (m.index === DATE_SAFE.lastIndex) DATE_SAFE.lastIndex++;
      }
    }

    var toks = [];
    if (UNI_SPLIT) {
      UNI_SPLIT.lastIndex = 0;
      while ((m = UNI_SPLIT.exec(c)) !== null) {
        toks.push({ t: m[0], a: m.index, b: m.index + m[0].length });
      }
    } else {
      var re = /[a-z0-9]+/g;
      while ((m = re.exec(c)) !== null) toks.push({ t: m[0], a: m.index, b: m.index + m[0].length });
    }

    for (i = 0; i < toks.length; i++) {
      if (d.allow[toks[i].t]) safe.push([toks[i].a, toks[i].b]);
    }
    function shielded(a, b) {
      for (var j = 0; j < safe.length; j++) if (a < safe[j][1] && b > safe[j][0]) return true;
      return false;
    }
    function hit(a, b) { if (!shielded(a, b)) hits.push([f.map[a], f.map[b - 1] + 1]); }

    function allDigits(t) { return /^[0-9]+$/.test(n.slice(t.a, t.b)); }

    for (i = 0; i < toks.length; i++) {
      if (allDigits(toks[i])) continue;
      if (lookup(toks[i].t)) hit(toks[i].a, toks[i].b);
    }

    for (i = 0; i < toks.length; i++) {
      if (toks[i].t.length > 2 || allDigits(toks[i])) continue;
      var joined = '', j = i;
      while (j < toks.length && toks[j].t.length <= 2 && !allDigits(toks[j]) && j - i < 12) {
        joined += toks[j].t;
        if (j > i && joined.length >= MIN_LEN && lookup(joined)) hit(toks[i].a, toks[j].b);
        j++;
      }
    }

    for (i = 0; i < toks.length; i++) {
      var list = d.phrases[toks[i].t];
      if (!list) continue;
      for (k = 0; k < list.length; k++) {
        var ph = list[k];
        if (i + ph.length > toks.length) continue;
        var ok = true;
        for (var q = 1; q < ph.length; q++) {
          if (toks[i + q].t !== ph[q]) { ok = false; break; }
        }
        if (ok) hit(toks[i].a, toks[i + ph.length - 1].b);
      }
    }

    if (d.cjkRe) {
      d.cjkRe.lastIndex = 0;
      while ((m = d.cjkRe.exec(n)) !== null) {
        hit(m.index, m.index + m[0].length);
        if (m.index === d.cjkRe.lastIndex) d.cjkRe.lastIndex++;
      }
    }

    var pool = d.anyRe ? [d.anyRe].concat(d.shapes) : d.shapes;
    for (k = 0; k < pool.length; k++) {
      var p = pool[k]; p.lastIndex = 0;
      var target = (k === 0 && d.anyRe) ? c : n;
      while ((m = p.exec(target)) !== null) {
        if (m[0].length) hit(m.index, m.index + m[0].length);
        if (m.index === p.lastIndex) p.lastIndex++;
      }
    }

    if (!hits.length) return [];
    hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [hits[0]];
    for (k = 1; k < hits.length; k++) {
      var last = out[out.length - 1];
      if (hits[k][0] <= last[1]) { if (hits[k][1] > last[1]) last[1] = hits[k][1]; }
      else out.push(hits[k]);
    }
    return out;
  }

  function bypass() {
    if (APPLY_TO_DEV) return false;
    try { if (typeof isDev !== 'undefined' && isDev === true) return true; } catch (e) {}
    return false;
  }

  function stars(n) { var s = ''; while (s.length < n) s += MASK_CHAR; return s; }

  function mask(text, opts) {
    if (text === null || text === undefined) return text;
    var s = String(text);
    if (!s) return s;
    if (!(opts && opts.force) && bypass()) return s;

    var spans = find(s);
    if (!spans.length) return s;

    var out = '', prev = 0;
    for (var i = 0; i < spans.length; i++) {
      out += s.slice(prev, spans[i][0]) + stars(spans[i][1] - spans[i][0]);
      prev = spans[i][1];
    }
    return out + s.slice(prev);
  }

  function has(text) {
    if (text === null || text === undefined) return false;
    return find(String(text)).length > 0;
  }

  function hasInside(text) {
    if (text === null || text === undefined) return false;
    if (has(text)) return true;
    if (!USERNAME_SUBSTRING) return false;
    var d = compile();
    var t = canon(fold(String(text)).n).replace(/[^a-z]/g, '');
    if (t.length < USERNAME_MIN_SUB) return false;

    var okAt = [], key, at;
    for (key in d.allow) {
      if (!Object.prototype.hasOwnProperty.call(d.allow, key)) continue;
      at = t.indexOf(key);
      while (at !== -1) { okAt.push([at, at + key.length]); at = t.indexOf(key, at + 1); }
    }
    function inside(a, b) {
      for (var z = 0; z < okAt.length; z++) if (a >= okAt[z][0] && b <= okAt[z][1]) return true;
      return false;
    }

    for (var i = 0; i < t.length; i++) {
      for (var len = USERNAME_MIN_SUB; i + len <= t.length; len++) {
        var sub = t.slice(i, i + len);
        if (d.allow[sub] || inside(i, i + len)) continue;
        if (d.plain[sub] || d.suffixable[sub]) return true;
      }
    }
    return false;
  }

  function scrubValue(v) {
    if (typeof v === 'string') return mask(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.map(function (x) { return typeof x === 'string' ? mask(x) : x; });
    }
    return v;
  }

  function scrubRow(table, row) {
    if (!row || typeof row !== 'object') return row;
    var cols = FIELDS[table];
    var copy = null, i, f;

    if (cols) {
      for (i = 0; i < cols.length; i++) {
        f = cols[i];
        if (!Object.prototype.hasOwnProperty.call(row, f)) continue;
        var cleaned = scrubValue(row[f]);
        if (cleaned !== row[f]) {
          if (!copy) copy = shallow(row);
          copy[f] = cleaned;
        }
      }
    }

    if (table === 'profiles' && USERNAME_POLICY !== 'off' &&
        Object.prototype.hasOwnProperty.call(row, 'username') && !bypass()) {
      var u = row.username;
      if (typeof u === 'string' && hasInside(u)) {
        if (USERNAME_POLICY === 'block') {
          var err = new Error('That username contains a blocked word.');
          err.code = 'DZ_BADWORD_USERNAME';
          throw err;
        }
        if (!copy) copy = shallow(row);
        copy.username = mask(u);
      }
    }
    return copy || row;
  }

  function shallow(o) {
    var c = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    return c;
  }

  function scrubPayload(table, values) {
    if (Object.prototype.toString.call(values) === '[object Array]') {
      var changed = false;
      var rows = values.map(function (r) {
        var c = scrubRow(table, r);
        if (c !== r) changed = true;
        return c;
      });
      return changed ? rows : values;
    }
    return scrubRow(table, values);
  }

  function scrubArgs(args) {
    if (!args || typeof args !== 'object') return args;
    var copy = null;
    for (var i = 0; i < RPC_ARGS.length; i++) {
      var k = RPC_ARGS[i];
      if (!Object.prototype.hasOwnProperty.call(args, k)) continue;
      var v = scrubValue(args[k]);
      if (v !== args[k]) { if (!copy) copy = shallow(args); copy[k] = v; }
    }
    return copy || args;
  }

  function guard(client) {
    if (!client || client.__dzGuarded) return client;
    client.__dzGuarded = true;

    var origFrom = client.from.bind(client);
    client.from = function (table) {
      var qb = origFrom(table);
      ['insert', 'upsert', 'update'].forEach(function (fn) {
        if (typeof qb[fn] !== 'function') return;
        var real = qb[fn].bind(qb);
        qb[fn] = function (values, options) {
          return real(scrubPayload(table, values), options);
        };
      });
      return qb;
    };

    if (typeof client.rpc === 'function') {
      var origRpc = client.rpc.bind(client);
      client.rpc = function (fn, args, options) {
        return origRpc(fn, scrubArgs(args), options);
      };
    }
    return client;
  }

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    var make = window.supabase.createClient;
    window.supabase.createClient = function () {
      return guard(make.apply(this, arguments));
    };
  } else {
    console.warn('badwords.js loaded before supabase-js — filter not installed.');
  }

  return {
    mask: mask, has: has, guard: guard,
    words: WORDS, strict: STRICT, anywhere: ANYWHERE, allow: ALLOW,
    fields: FIELDS,
    reload: function () { dict = null; }
  };
})();
