(function () {
  'use strict';

  var SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

  function cfg() {
    return (window.KOE_CONFIG && window.KOE_CONFIG.TURNSTILE_SITE_KEY) || '';
  }
  function db() { return (typeof sb !== 'undefined' && sb) ? sb : null; }

  function note(event, email, ok) {
    var c = db();
    if (!c || typeof c.rpc !== 'function') return;
    try {
      c.rpc('dz_note_auth', {
        p_event: event,
        p_email: email || null,
        p_ok: (ok === true || ok === false) ? ok : null
      }).then(function () {}, function () {});
    } catch (e) {   }
  }

  function required() {
    var c = db();
    if (!c || typeof c.rpc !== 'function') return Promise.resolve(false);
    return c.rpc('dz_captcha_required').then(
      function (r) { return !!(r && r.data === true); },
      function () { return false; }
    );
  }

  var loading = null;
  function load() {
    if (window.turnstile) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise(function (res) {
      var s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.defer = true;
      s.onload = function () { res(!!window.turnstile); };
      s.onerror = function () {
        why('the Turnstile script did not load \u2014 a blocker, an extension or the network stopped it');
        res(false);
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  var widgetId = null;
  var lastWhy = null;
  var onPrompt = null;

  function why(reason) {
    lastWhy = reason;
    console.warn('[DigiArtz] No captcha token: ' + reason + '. Sign-in will be refused ' +
                 'with \u201CCouldn\u2019t verify you\u2019re human\u201D.');
  }

  function host() {
    var el = document.getElementById('dzCaptcha');
    if (el) return el;
    var anchor = document.getElementById('authBtn');
    if (!anchor || !anchor.parentNode) return null;
    el = document.createElement('div');
    el.id = 'dzCaptcha';
    el.style.margin = '10px 0';
    el.style.display = 'flex';
    el.style.justifyContent = 'center';
    anchor.parentNode.insertBefore(el, anchor);
    return el;
  }

  function drop() {
    if (widgetId === null) return;
    try { window.turnstile.remove(widgetId); } catch (e) {   }
    widgetId = null;
  }

  function token(force) {
    var key = cfg();
    if (!key) return Promise.resolve(null);

    return load().then(function (ok) {
      if (!ok || !window.turnstile) { why('window.turnstile is not there'); return null; }
      var el = host();
      if (!el) { why('there is nowhere to put the widget \u2014 no #dzCaptcha and no #authBtn'); return null; }

      lastWhy = null;
      return new Promise(function (resolve) {
        var settled = false;
        function done(v) { if (!settled) { settled = true; resolve(v); } }

        var timer = setTimeout(function () {
          why('the widget did not answer within 20 seconds');
          done(null);
        }, 20000);

        function finish(v) { clearTimeout(timer); done(v); }

        drop();
        el.innerHTML = '';

        try {
          widgetId = window.turnstile.render(el, {
            sitekey: key,
            appearance: force ? 'always' : 'interaction-only',
            size: 'normal',
            callback: function (t) { finish(t || null); },
              // A challenge is on screen now, so the wait belongs to a person
              // reading it rather than to the widget. Twenty seconds is not long
              // enough for that, and timing out there is what turns a challenge
              // nobody noticed into "couldn't verify you're human".
            'before-interactive-callback': function () {
              clearTimeout(timer);
              timer = setTimeout(function () {
                why('the challenge was shown but never completed');
                done(null);
              }, 120000);
              if (typeof onPrompt === 'function') { try { onPrompt(); } catch (e) {   } }
            },
            'error-callback': function (code) {
              var c = (code === 0 || code) ? String(code) : '';
              why('Turnstile refused' + (c ? ' with error ' + c : '') +
                  ' \u2014 check the site key is this widget\u2019s and that the widget lists ' +
                  'this domain. Code reference: https://developers.cloudflare.com/turnstile/' +
                  'troubleshooting/client-side-errors/error-codes/');
              finish(null);
            },
            'expired-callback': function () { why('the challenge expired before it was used'); finish(null); },
            'timeout-callback': function () { why('the challenge timed out'); finish(null); }
          });
          if (widgetId === undefined) widgetId = null;
        } catch (e) {
          why('turnstile.render threw: ' + ((e && e.message) || e));
          finish(null);
        }
      });
    }, function () { why('the Turnstile script could not be loaded'); return null; });
  }

  function forAuth() {
    if (!cfg()) return Promise.resolve(null);
    return required().then(function (force) { return token(force); });
  }

  function reset() {
    drop();
  }

  window.dzCaptcha = {
    forAuth: forAuth,
    token: token,
    required: required,
    note: note,
    reset: reset,
    configured: function () { return !!cfg(); },
      // Why the last attempt produced no token, so the page can say that
      // instead of one sentence that covers every cause and fits none.
    reason: function () { return lastWhy; },
    onInteractive: function (fn) { onPrompt = fn; }
  };
})();
