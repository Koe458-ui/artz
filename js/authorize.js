(function () {
  'use strict';

  // The hand-off DigiArtz offers its own properties. Ored has no sign-in of its
  // own: it sends a member here, this page decides who they are — by finding a
  // session or by putting them through the login page that already exists — and
  // navigates back with the session in the fragment.
  //
  // The allow-list below is the whole of the security of it. An address that is
  // not on it is handed nothing, because a hand-off that returns tokens to any
  // address is a way to read any member's account.

  var HOMES = ['https://ored.digiartz.net'];
  var RETURN_KEY = 'dz.handoff.return';
  var RETURN_FOR = 15 * 60 * 1000;

  var cfg = window.KOE_CONFIG || {};
  var allowed = HOMES.concat(Array.isArray(cfg.HANDOFF_ORIGINS) ? cfg.HANDOFF_ORIGINS : []);

  var word = document.getElementById('hoWord');
  var note = document.getElementById('hoNote');
  var back = document.getElementById('hoBack');

  var params = new URLSearchParams(window.location.search);
  var state = params.get('state') || '';
  var silent = params.get('prompt') === 'none';

  function stop(message) {
    word.textContent = 'Sign-in stopped';
    note.textContent = message;
    note.classList.add('hoBad');
    back.hidden = false;
  }

  function home(raw) {
    if (!raw) return '';
    var url;
    try { url = new URL(raw, window.location.origin); } catch (e) { return ''; }
    if (url.protocol !== 'https:') return '';
    if (allowed.indexOf(url.origin) < 0) return '';
    return url.origin + (url.pathname || '/');
  }

  var target = home(params.get('redirect_uri'));

  function leave(fields) {
    var out = new URLSearchParams();
    Object.keys(fields).forEach(function (name) {
      if (fields[name] != null && fields[name] !== '') out.set(name, String(fields[name]));
    });
    if (state) out.set('state', state);
    window.location.replace(target + '#' + out.toString());
  }

  function hand(session) {
    leave({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in || 3600,
      token_type: session.token_type || 'bearer'
    });
  }

  function refuse(code) {
    leave({ error: code });
  }

  function client() {
    var url = String(cfg.SB_URL || '').trim();
    var key = String(cfg.SB_KEY || '').trim();
    if (!window.supabase || !url || !key) return null;
    try { return window.supabase.createClient(url, key); }
    catch (e) { return null; }
  }

  function remember() {
    var here = window.location.pathname + window.location.search;
    try {
      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ u: here, t: Date.now() }));
    } catch (e) {   }
    return here;
  }

  async function sessionOf(sb) {
    try {
      var result = await sb.auth.getSession();
      return (result && result.data && result.data.session) || null;
    } catch (e) { return null; }
  }

  async function run() {
    if (!target) {
      stop('That sign-in asked to be sent to an address DigiArtz does not hand accounts to.');
      return;
    }

    if (!state) { refuse('invalid_request'); return; }

    var sb = client();
    if (!sb) {
      if (silent) { refuse('server_error'); return; }
      stop('DigiArtz cannot reach its sign-in service right now. Refresh and try again.');
      return;
    }

    var session = await sessionOf(sb);
    if (session && session.access_token && session.refresh_token) { hand(session); return; }

    // prompt=none is the quiet attempt — the site was asked whether this browser
    // is already signed in, not to ask the member anything. Say no and go back.
    if (silent) { refuse('login_required'); return; }

    word.textContent = 'Log in to continue';
    note.textContent = 'Taking you to the DigiArtz login page.';
    window.location.replace('/login?continue=' + encodeURIComponent(remember()));
  }

  run().catch(function () {
    stop('That sign-in did not go through. Try again from Ored.');
  });
})();
