  var currentUser = null;
  var currentUserAvatarUrl = null;
  var authMode = 'login';

  function paintAvatarChip(imgId, txtId, url, letter){
    var img = document.getElementById(imgId);
    var txt = document.getElementById(txtId);
    if(!img || !txt) return;
    if(url){
      img.src = getThumbnailUrl(url);
      img.style.display = 'block';
      txt.style.display = 'none';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      txt.style.display = '';
      txt.textContent = letter || '?';
    }
  }

  function syncAuthBtn() {
    var bar  = document.getElementById('dzTopAccount');
    var menu = document.getElementById('dzMenuAccount');
    var barTxt  = document.getElementById('dzTopAccountTxt')  || bar;
    var menuTxt = document.getElementById('dzMenuAccountTxt') || menu;

    var wrap = document.getElementById('dzAcWrap');
    var grp  = document.getElementById('dzMenuAcGrp');
    if (wrap) wrap.classList.toggle('dzHasMenu', !!currentUser);
    if (grp)  grp.classList.toggle('dzHasMenu', !!currentUser);
    if (!currentUser) {
      if (typeof window.dzAcClose === 'function') window.dzAcClose();
      if (grp) grp.classList.remove('open');
      if (bar)  bar.setAttribute('aria-expanded', 'false');
      if (menu) menu.setAttribute('aria-expanded', 'false');
    }

    if (currentUser) {
      var name = typeof cpGetDisplayName === 'function' ? cpGetDisplayName() : '';
      var href = name && name !== 'User' ? '/profile/' + encodeURIComponent(name) : '/login';
      if (bar) {
        bar.title = 'Profile — ' + (name || 'you');
        bar.setAttribute('href', href);
      }
      if (barTxt) barTxt.textContent = 'Profile';
      if (menu) {
        menu.title = 'Profile — ' + (name || 'you');
        menu.setAttribute('href', href);
      }
      if (menuTxt) menuTxt.textContent = 'Profile';
    } else {
      if (bar)  { bar.removeAttribute('title');  bar.setAttribute('href', '/login'); }
      if (menu) { menu.removeAttribute('title'); menu.setAttribute('href', '/login'); }
      if (barTxt)  barTxt.textContent  = 'Sign in';
      if (menuTxt) menuTxt.textContent = 'Login';
    }

    if (typeof cpSyncAvatar === 'function') cpSyncAvatar();
  }

  var setLastFocus = null;
  var setBackMo = null;

  function openSettingsPage() {
    if (!dzPanelOpen('setPage')) return;
    setDropBack();
    if (!setLastFocus || setLastFocus.isConnected === false) setLastFocus = document.activeElement;
    pfMenuRefreshCounts();
  }

  function closeSettingsPage(keepBack) {
    dzPanelShut('setPage');
    if (keepBack === true) return;
    setDropBack();
    if (setLastFocus && setLastFocus.focus) { try { setLastFocus.focus(); } catch (e) {} }
    setLastFocus = null;
  }

  function setGo(open, id) {
    closeSettingsPage(true);
    if (typeof open === 'function') open();
    setWatchBack(id);
  }

  function setWatchBack(id) {
    setDropBack();
    var el = id && document.getElementById(id);
    if (!el || !el.classList.contains('open')) {
      openSettingsPage();
      return;
    }
    if (!window.MutationObserver) return;
    setBackMo = new MutationObserver(function () {
      if (el.classList.contains('open')) return;
      setDropBack();
      var prof = document.getElementById('profilePage');
      if (prof && prof.classList.contains('open')) openSettingsPage();
    });
    setBackMo.observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function setDropBack() {
    if (setBackMo) { setBackMo.disconnect(); setBackMo = null; }
  }
  window.dzSetDropBack = setDropBack;

  async function pfMenuRefreshCounts() {
    var L = document.getElementById('pfMenuLikeCount'),
        B = document.getElementById('pfMenuBmCount'),
        F = document.getElementById('pfMenuFrdCount');
    if (L) L.textContent = ''; if (B) B.textContent = ''; if (F) F.textContent = '';
    if (!sb || !currentUser) return;
    var uid = currentUser.id;
    sb.from('artwork_likes').select('artwork_id', { count: 'exact', head: true })
      .eq('user_id', uid).then(function (r) {
        if (L && !r.error && typeof r.count === 'number') L.textContent = r.count;
      });
    sb.from('artwork_bookmarks').select('artwork_id', { count: 'exact', head: true })
      .eq('user_id', uid).then(function (r) {
        if (B && !r.error && typeof r.count === 'number') B.textContent = r.count;
      });
    if (typeof window.__dmFetchPartners === 'function') {
      window.__dmFetchPartners().then(function (partners) {
        if (F) F.textContent = partners.length;
      }).catch(function(){});
    }
  }

  var loLastFocus = null;

  function pfMenuLogout() {
    var m = document.getElementById('loConfirm');
    if (!m) { doLogout(); return; }
    loLastFocus = document.activeElement;
    m.classList.add('open');
    var no = document.getElementById('loConfirmNo');
    if (no) { try { no.focus(); } catch (e) {} }
  }

  function closeLogoutConfirm() {
    var m = document.getElementById('loConfirm');
    if (m) m.classList.remove('open');
    if (loLastFocus && loLastFocus.focus && loLastFocus.isConnected !== false) {
      try { loLastFocus.focus(); } catch (e) {}
    }
    loLastFocus = null;
  }

  function confirmLogout() {
    closeLogoutConfirm();
    doLogout();
  }

  function doLogout() {
    closeSettingsPage();
    if (sb) {
      if (window.dzCaptcha) window.dzCaptcha.note('logout', null, true);
      sb.auth.signOut()
        .then(function(){ showToast('Signed out'); })
        .catch(function(e){ console.error('Error: ' + e.message); });
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = document.getElementById('loConfirm');
    if (m && m.classList.contains('open')) { e.stopPropagation(); closeLogoutConfirm(); }
  }, true);

  document.addEventListener('click', function (e) {
    var m = document.getElementById('loConfirm');
    if (m && m.classList.contains('open') && e.target === m) closeLogoutConfirm();
  });

  var authReturnUrl = null;
  window.addEventListener('popstate', function(){ authReturnUrl = null; });

  function openAuthMod() {
    document.getElementById('authUser').value  = '';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPass').value  = '';
    authClear();
    switchAuthMode('login');
    document.getElementById('authMod').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.location.pathname !== '/login') {
      authReturnUrl = window.location.pathname + window.location.search;
      try{ history.pushState({},'', '/login'); }catch(e){}
    }
    setTimeout(function(){
      var mode = authMode;
      var focusId = (mode === 'signup') ? 'authUser' : 'authEmail';
      var el = document.getElementById(focusId);
      if (el) el.focus();
    }, 120);
  }
  function closeAuthMod(revertUrl) {
    var panel = document.getElementById('authMod');
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    restoreScroll();
    if (revertUrl !== false && window.location.pathname === '/login') {
      try{ history.replaceState({},'', authReturnUrl || '/'); }catch(e){}
      authReturnUrl = null;
    }
  }

  function authEl(id) { return document.getElementById(id); }
  function authFail(msg) {
    var err = authEl('authErr');
    err.textContent = msg;
    err.classList.add('show');
  }
  function authClear() {
    var err = authEl('authErr'), msg = authEl('authMsg');
    err.textContent = ''; err.classList.remove('show');
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  }

  async function authCaptcha() {
    if (!window.dzCaptcha) return null;
    if (window.dzCaptcha.onInteractive) {
      window.dzCaptcha.onInteractive(function () {
        authFail('Complete the check above to continue.');
      });
    }
    var tok = await window.dzCaptcha.forAuth();
    if (window.dzCaptcha.configured() && !tok) {
        // Every one of these used to read "refresh the page and try again",
        // which is advice for none of them: an expired challenge, a site key
        // that does not list this domain, a blocker that ate the script.
      var r = window.dzCaptcha.reason && window.dzCaptcha.reason();
      authFail('Couldn\u2019t verify you\u2019re human' + (r ? ' \u2014 ' + r : '') + '.');
      return false;
    }
    return tok;
  }

  function dzAuthErr(e, fallback) {
    var raw = ((e && e.message) || '').toLowerCase();
    if (raw.indexOf('captcha') !== -1) {
      var configured = !!(window.dzCaptcha && window.dzCaptcha.configured());
      if (!configured) {
        console.warn(
          '[DigiArtz] Sign-in was refused for a missing captcha token, and no ' +
          'TURNSTILE_SITE_KEY is present in config.js. CAPTCHA protection is ' +
          'enabled in Supabase but the page cannot satisfy it, so sign-in and ' +
          'sign-up are broken for everyone. Either set TURNSTILE_SITE_KEY (and ' +
          'emit it from the Pages build command), or turn CAPTCHA protection ' +
          'off in Supabase \u2192 Authentication \u2192 Attack Protection. ' +
          'See security/CAPTCHA-SETUP.md.');
      }
      if (!configured) {
          // GoTrue refused for a missing token and this page has no site key to
          // make one with. That is not the member's problem to retry -- nothing
          // they do from here can succeed until the site is configured.
        return 'Sign-in is unavailable: this site\u2019s human check is not set up. ' +
               'TURNSTILE_SITE_KEY is missing from config.js while CAPTCHA protection ' +
               'is on in Supabase.';
      }
      return 'Couldn\u2019t verify you\u2019re human. Refresh the page and try again.';
    }
    return (e && e.message) || fallback;
  }

  async function doAuth() {
    if (!sb) { showToast('Can\u2019t connect \u2014 try again'); return; }
    var email = authEl('authEmail').value.trim();
    var pass  = authEl('authPass').value;

    if (!email) { authFail('Please enter your email.'); return; }
    if (!pass)  { authFail('Please enter your password.'); return; }

    var btn = authEl('authBtn');
    btn.textContent = 'SIGNING IN…'; btn.disabled = true;
    authEl('authErr').textContent = ''; authEl('authErr').classList.remove('show');

    try {
      var capTok = await authCaptcha();
      if (capTok === false) { btn.textContent = 'Log In'; btn.disabled = false; return; }

      var opts = capTok ? { captchaToken: capTok } : undefined;

      var result = await sb.auth.signInWithPassword(
        opts ? { email: email, password: pass, options: opts }
             : { email: email, password: pass });
      if (result.error) throw result.error;
      if (window.dzCaptcha) window.dzCaptcha.note('login', email, true);
    } catch (e) {
      if (window.dzCaptcha) {
        window.dzCaptcha.note('login', email, false);
        window.dzCaptcha.reset();
      }
      authFail(dzAuthErr(e, 'Login failed. Check your credentials.'));
    } finally {
      btn.textContent = 'Log In'; btn.disabled = false;
    }
  }

  var OAUTH_LABELS = { google:'Google', discord:'Discord', apple:'Apple' };

  function showAppleUnavailable(){
    if (document.getElementById('appleNaDlg')) return;
    var ov = document.createElement('div');
    ov.id = 'appleNaDlg';
    ov.setAttribute('role','dialog');
    ov.setAttribute('aria-modal','true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:4000;display:flex;'
      + 'align-items:center;justify-content:center;padding:1.5rem;'
      + 'background:rgba(0,0,0,.55);backdrop-filter:blur(4px);'
      + '-webkit-backdrop-filter:blur(4px);';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:340px;width:100%;'
      + 'background:var(--sur,#24242c);color:var(--tx,#fff);'
      + 'border:1px solid var(--bdr,#2c2c36);border-radius:16px;'
      + 'padding:1.4rem 1.3rem 1.15rem;box-shadow:0 20px 60px rgba(0,0,0,.5);'
      + 'font-family:var(--fb,sans-serif);text-align:center;';
    box.innerHTML =
      '<div style="font-size:.96rem;line-height:1.5;margin-bottom:1.15rem;">'
      + 'Apple sign-in isn\u2019t available at the moment. You can still '
      + 'continue with Google or Discord.</div>'
      + '<button type="button" id="appleNaOk" style="border:0;cursor:pointer;'
      + 'background:var(--pg,#8B5CF6);color:var(--text-on-accent,#fff);'
      + 'font-family:var(--fm,inherit);font-weight:700;letter-spacing:.06em;'
      + 'padding:.62rem 1.7rem;border-radius:10px;font-size:.85rem;">OK</button>';
    ov.appendChild(box);
    function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
    document.body.appendChild(ov);
    var ok = document.getElementById('appleNaOk');
    if (ok){ ok.addEventListener('click', close); ok.focus(); }
  }

  async function doOAuth(provider, btnEl) {
    if (provider === 'apple') { showAppleUnavailable(); return; }
    if (!sb) { showToast('Can\u2019t connect \u2014 try again'); return; }
    var label = OAUTH_LABELS[provider] || provider;
    authEl('authErr').textContent = ''; authEl('authErr').classList.remove('show');

    var row = document.querySelector('.laSocial');
    var btns = row ? row.querySelectorAll('.laSocialBtn') : [];
    Array.prototype.forEach.call(btns, function(b){ b.disabled = true; });

    try {
      var opts = { redirectTo: window.location.origin };
      if (provider === 'google') opts.queryParams = { prompt: 'select_account' };

      var result = await sb.auth.signInWithOAuth({ provider: provider, options: opts });
      if (result.error) throw result.error;
    } catch (e) {
      Array.prototype.forEach.call(btns, function(b){ b.disabled = false; });
      var raw = (e && e.message || '').toLowerCase();
      authFail(/provider is not enabled|unsupported provider/.test(raw)
        ? label + ' sign-in isn\u2019t available right now. Try another method.'
        : (e && e.message) ? label + ' sign-in failed: ' + e.message
                           : label + ' sign-in is unavailable right now.');
    }
  }

  var AUTH_MODES = {
    signup: {
      title: 'Create Account', cta: 'Create Account', other: 'login', alt: 'Log in',
      sub: 'Choose a username (your public display name), enter your email, and set a password of at least 6 characters.',
      lead: 'Already have an account?', user: '', autocomplete: 'new-password'
    },
    login: {
      title: 'Welcome Back', cta: 'Log In', other: 'signup', alt: 'Sign up',
      sub: 'Sign in to continue to your account.',
      lead: "Don't have an account?", user: 'none', autocomplete: 'current-password'
    }
  };

  function switchAuthMode(mode) {
    var m = AUTH_MODES[mode] || AUTH_MODES.login;
    authMode = mode;
    authClear();

    authEl('authTitle').textContent = m.title;
    var subtitle = authEl('authSubtitle');
    subtitle.textContent = m.sub;
    subtitle.style.display = 'block';
    var btn = authEl('authBtn');
    btn.textContent = m.cta;
    btn.onclick = mode === 'signup' ? doSignUp : doAuth;
    authEl('authLeadText').textContent = m.lead;
    var toggleBtn = authEl('authToggleBtn');
    toggleBtn.textContent = m.alt;
    toggleBtn.onclick = function(){ switchAuthMode(m.other); };
    var userWrap = authEl('authUserWrap');
    if (userWrap) userWrap.style.display = m.user;
    authEl('authPass').setAttribute('autocomplete', m.autocomplete);
    if (mode === 'signup') {
      setTimeout(function(){ var u = authEl('authUser'); if (u) u.focus(); }, 60);
    }
  }

  var AUTH_EYE_OPEN = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>';
  var AUTH_EYE_OFF  = '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.86 13.86 0 0 0 1 11s4 7 11 7a9.26 9.26 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  function toggleAuthPassVis() {
    var inp  = document.getElementById('authPass');
    var icon = document.getElementById('authEyeIcon');
    if (!inp) return;
    var showing = inp.type === 'password';
    inp.type = showing ? 'text' : 'password';
    if (icon) icon.innerHTML = showing ? AUTH_EYE_OFF : AUTH_EYE_OPEN;
  }

  var SIGNUP_REFUSALS = [
    [/already registered|already in use|user already/, 'This email is already registered. Try logging in instead.'],
    [/weak password|password should|at least/,         'Password is too weak. Use at least 6 characters.'],
    [/invalid email|unable to validate email/,         'Invalid email address. Please check and try again.'],
    [/network|fetch|failed to fetch/,                  'Network error. Please check your connection and try again.'],
    [/rate limit|too many/,                            'Too many attempts. Please wait a moment and try again.']
  ];

  async function doSignUp() {
    if (!sb) { showToast('Can\u2019t connect \u2014 try again'); return; }

    var email    = authEl('authEmail').value.trim();
    var pass     = authEl('authPass').value;
    var username = (authEl('authUser').value || '').trim();
    var msg      = authEl('authMsg');

    authClear();

    var wrong = !username ? 'Please enter a username.'
      : !email ? 'Please enter your email address.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Please enter a valid email address.'
      : !pass ? 'Please enter a password.'
      : pass.length < 6 ? 'Password must be at least 6 characters long.'
      : '';
    if (wrong) { authFail(wrong); return; }

    var btn = authEl('authBtn');
    btn.textContent = 'CREATING ACCOUNT…'; btn.disabled = true;

    try {
      var capTok = await authCaptcha();
      if (capTok === false) { btn.textContent = 'Create Account'; btn.disabled = false; return; }
      var suOpts = { data: { username: username } };
      if (capTok) suOpts.captchaToken = capTok;

      var result = await sb.auth.signUp({ email: email, password: pass, options: suOpts });
      if (result.error) {
        if (window.dzCaptcha) {
          window.dzCaptcha.note('signup', email, false);
          window.dzCaptcha.reset();
        }
        throw result.error;
      }
      if (window.dzCaptcha) window.dzCaptcha.note('signup', email, true);

      var session = result.data && result.data.session;

      if (session) {
        showToast('Account created. Welcome!');
      } else {
        authEl('authEmail').value = '';
        authEl('authPass').value  = '';
        msg.textContent = 'Check your email to confirm your account.';
        msg.style.display = 'block';
        btn.textContent = 'Create Account'; btn.disabled = false;
        setTimeout(function(){
          if (authEl('authMod').classList.contains('open')) closeAuthMod();
        }, 5000);
      }
    } catch (e) {
      var raw = (e.message || '').toLowerCase();
      var hit = SIGNUP_REFUSALS.find(function (r) { return r[0].test(raw); });
      authFail(hit ? hit[1]
        : raw.includes('captcha') ? dzAuthErr(e, 'Sign-up failed. Please try again.')
        : (e.message || 'Sign-up failed. Please try again.'));
    } finally {
      if (btn.disabled) {
        btn.textContent = 'Create Account'; btn.disabled = false;
      }
    }
  }

  let isDev = false;
  let userRole = null;
  let userPlan = null;
  function dzIsStaff(){ return userRole === 'admin' || userRole === 'dev'; }
  function dzIsPartner(){ return userRole === 'partner'; }
  window.dzIsStaff = dzIsStaff;
  window.dzIsPartner = dzIsPartner;

  function dzForgetPlanCaches(){
    if(typeof window.dzJobQuotaForget === 'function') window.dzJobQuotaForget();
  }

    // Re-reads the profile, so tier and expiry come from the database rather
    // than from whatever a purchase happened to answer with. store.js has
    // called window.checkUserRole after a Max claim all along; until now
    // nothing exported it, so that call did nothing.
  async function checkUserRole(){
    if(!sb || !currentUser){
      isDev=false; userRole=null; userPlan=null; currentUserAvatarUrl=null;
      dzSetPlan('guest', null); dzPaintLimits(); dzForgetPlanCaches();
      if(typeof dzPaintAds === 'function') dzPaintAds();
      syncAdmBtn(); return;
    }
    try{
      const{data,error}=await sb.from('profiles')
        .select('role,subscription_tier,subscription_expires_at,avatar_url')
        .eq('id',currentUser.id).single();
      if(error) throw error;
      isDev    = !!data && data.role==='dev';
      userRole = (data && data.role) || null;
      userPlan = (data && data.subscription_tier) ? data.subscription_tier : 'guest';
      currentUserAvatarUrl = (data && data.avatar_url) ? data.avatar_url : null;
      dzSetPlan(isDev ? 'dev' : userPlan,
                (data && data.subscription_expires_at) || null);
      dzPaintLimits();
      dzForgetPlanCaches();
      if(typeof dzPaintAds === 'function') dzPaintAds();
    }catch(e){
      console.error(e);
      isDev=false; userRole=null; userPlan='guest'; currentUserAvatarUrl=null;
      dzSetPlan('guest', null); dzPaintLimits(); dzForgetPlanCaches();
      if(typeof dzPaintAds === 'function') dzPaintAds();
    }
    syncAdmBtn();
    syncAuthBtn();
    notifRefreshBadge();
    if(currentUser && sessionStorage.getItem('pendPfUp')==='1'){
      sessionStorage.removeItem('pendPfUp');
      setTimeout(function(){
        if(typeof bnGoUpload==='function') bnGoUpload();
      },250);
    }
  }
  window.checkUserRole = checkUserRole;

  var dzLastAuthId = (function(){
    try { return currentUser && currentUser.id ? String(currentUser.id) : 'guest'; }
    catch (e) { return 'guest'; }
  })();

  if (sb) {
    sb.auth.onAuthStateChange(function(event, session) {
      currentUser = session ? session.user : null;
      var nowId = currentUser && currentUser.id ? String(currentUser.id) : 'guest';
      var switched = nowId !== dzLastAuthId;
      dzLastAuthId = nowId;

      if (switched) {
        dzScopeBump();
        pfRowCache = {}; cmMineRows = []; cpMsgCache = {}; cmMineCache = {};
        try{ albResetMine(); }catch(e){}
        notifList = [];
        try{ if(window.dzCache) window.dzCache.dropPrivate(); }catch(e){}
        try{
          pf.albums = []; pf.albumsLoaded = false;
          pf.galleryRows = []; pf.galleryIds = Object.create(null);
          pf.galleryOffset = 0; pf.galleryDone = false;
          pfMediaCache = {};
        }catch(e){}
        try{ syncAuthBtn(); }catch(e){ console.error('syncAuthBtn: '+(e.message||e)); }
        try{ if (typeof window.rkRefresh === 'function') window.rkRefresh(); }catch(e){}
        try{
          loadHiddenArtworks().then(function(){
            try{ renderHome(); }catch(e){}
            try{ renderFG(); }catch(e){}
          }, function(){   });
        }catch(e){ console.error('loadHiddenArtworks: '+(e.message||e)); }
      }

      if (event === 'SIGNED_IN') {
        closeAuthMod();
        checkUserRole();
        var greetName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.username)
          ? currentUser.user_metadata.username
          : '';
        afterIntro(function(){
          setTimeout(function(){
            showToast(greetName ? ('Welcome, ' + greetName) : 'Signed in');
          }, 460);
        });
      }
      if (event === 'SIGNED_OUT') {
        currentUserAvatarUrl = null;
        syncAuthBtn();
        isDev=false; userRole=null; userPlan=null; syncAdmBtn();
        dzSetPlan('guest', null); dzPaintLimits();
        if(typeof dzPaintAds === 'function') dzPaintAds();
        notifRefreshBadge();
        closeProfilePage();
        closeMyWorkPage();
        if(typeof dzOpsReset === 'function') dzOpsReset();
      }
    });

    sb.auth.getSession().then(function(res) {
      if (res.data && res.data.session) {
        currentUser = res.data.session.user;
        syncAuthBtn();
        checkUserRole();
      }
    });
  }

  var notifList = [];
  var NOTIF_WINDOW = 40;
  var notifBusy = false;

  function openNotifications(){ if(dzPanelOpen('notifPage')) notifLoad(); }
  function closeNotifPage(){ dzPanelShut('notifPage'); }

  var NOTIF_ICON = {
    like:'♥', comment:'“', comment_reply:'↩', mention:'@',
    follow:'⊕', friend_request:'✦', friend_accepted:'✦',
    community_join:'◉', community_post:'◉', community_comment:'@',
    message:'✉', artwork_featured:'★',
    artwork_approved:'✓', artwork_rejected:'✕',
    comic_approved:'✓', comic_rejected:'✕',
    post_published:'✓', post_rejected:'✕',
    marketplace_sale:'▲', marketplace_purchase:'▼',
    payment:'▲', subscription:'★'
  };
  function notifIcon(type){ return NOTIF_ICON[type] || '🔔'; }

  function notifRelTime(iso){
    var d = new Date(iso), diff = Math.max(0, (Date.now()-d.getTime())/1000);
    if(diff < 60) return 'Just now';
    if(diff < 3600) return Math.floor(diff/60)+'m ago';
    if(diff < 86400) return Math.floor(diff/3600)+'h ago';
    if(diff < 604800) return Math.floor(diff/86400)+'d ago';
    return d.toLocaleDateString();
  }

  function notifCache(){ return window.dzCached ? window.dzCached() : null; }
  function notifDrop(){
    var c = notifCache();
    if(c){ try{ c.deleteByPrefix(c.ukey('notifications')); }catch(e){} }
  }

    // One RPC for the window: rows, actor name and avatar, and this reader's read state — one round trip per page.
  async function notifLoad(){
    if(!sb || !currentUser){ notifList=[]; notifRender(); return; }
    var c = notifCache();
    var load = async function(){
      const{data,error} = await sb.rpc('dz_notifications', { p_limit: NOTIF_WINDOW });
      if(error) throw error;
      return data||[];
    };
    try{
      notifList = c ? await c.getOrSet(c.ukey('notifications'), load, 'user:notifications')
                    : await load();
    }catch(e){
      console.error('Error loading notifications: '+e.message);
      notifList = (c ? await c.recall(c.ukey('notifications'), 'user:notifications') : null) || [];
    }
    notifRender();
    notifPaintBadges(notifUnreadCount());
  }

  function notifUnreadCount(){
    return notifList.filter(function(n){ return !n.is_read; }).length;
  }

  // an actor's face when a person did it, the site mark when DigiArtz did
  function notifAvatar(n){
    if(!n.actor_id){
      // the site's own mark, on the URL the page already precaches
      return '<img class="notifAv notifAv--site" src="/favicon.svg?v=4" alt="DigiArtz" loading="lazy" decoding="async">';
    }
    var letter = esc((n.actor_name||'?').charAt(0).toUpperCase());
    if(!n.actor_avatar) return '<span class="notifAv notifAv--txt">'+letter+'</span>';
    return '<img class="notifAv" src="'+esc(getThumbnailUrl(n.actor_avatar))+'" alt="" '+
           'loading="lazy" decoding="async" '+
           'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">'+
           '<span class="notifAv notifAv--txt" style="display:none;">'+letter+'</span>';
  }

  function notifRender(){
    var wrap = document.getElementById('notifList'), empty = document.getElementById('notifEmpty');
    var allBtn = document.getElementById('notifReadAll');
    if(!wrap) return;
    if(allBtn) allBtn.hidden = !notifUnreadCount();
    if(!notifList.length){ wrap.innerHTML=''; if(empty) empty.style.display='block'; return; }
    if(empty) empty.style.display='none';
    wrap.innerHTML = notifList.map(function(n){
      var unread = !n.is_read;
      var req = n.type === 'friend_request' && n.conversation_id;
      return '<div class="notifItem'+(unread?' unread':'')+'" data-id="'+esc(String(n.id))+'" '+
          'role="button" tabindex="0" onclick="notifGo('+n.id+')" '+
          'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();notifGo('+n.id+');}">'+
        '<div class="notifAvWrap">'+notifAvatar(n)+
          '<span class="notifIcoWrap ico-'+esc(n.type||'admin')+'">'+notifIcon(n.type)+'</span>'+
        '</div>'+
        '<div class="notifBody">'+
          '<div class="notifTitle">'+esc(n.title)+'</div>'+
          '<div class="notifMsg">'+esc(n.message)+'</div>'+
          '<div class="notifTime">'+(n.created_at?notifRelTime(n.created_at):'')+'</div>'+
          (req ? '<div class="notifActs">'+
              '<button class="notifAct" onclick="notifFriend(event,\''+esc(String(n.conversation_id))+'\',1)">ACCEPT</button>'+
              '<button class="notifAct notifAct--ghost" onclick="notifFriend(event,\''+esc(String(n.conversation_id))+'\',0)">DECLINE</button>'+
            '</div>' : '')+
        '</div>'+
        (unread?'<span class="notifDot" aria-hidden="true"></span>':'')+
      '</div>';
    }).join('');
  }

  function notifById(id){
    for(var i=0;i<notifList.length;i++) if(String(notifList[i].id)===String(id)) return notifList[i];
    return null;
  }

  async function notifMarkRead(id){
    var n = notifById(id);
    if(!n || n.is_read || !sb || !currentUser) return;
    n.is_read = true;
    notifRender();
    notifPaintBadges(notifUnreadCount());
    try{
      const{error} = await sb.from('notification_reads')
        .upsert([{user_id:currentUser.id, notification_id:n.id}],
                {onConflict:'user_id,notification_id', ignoreDuplicates:true});
      if(error) throw error;
      notifDrop();
    }catch(e){ n.is_read = false; notifRender(); notifRefreshBadge(); }
  }

  async function notifReadAll(){
    if(!sb || !currentUser || notifBusy) return;
    notifBusy = true;
    var before = notifList.map(function(n){ return n.is_read; });
    notifList.forEach(function(n){ n.is_read = true; });
    notifRender(); notifPaintBadges(0);
    try{
      const{error} = await sb.rpc('dz_notif_read_all');
      if(error) throw error;
      notifDrop();
    }catch(e){
      notifList.forEach(function(n,i){ n.is_read = before[i]; });
      notifRender(); notifRefreshBadge();
      showToast('Could not mark those read');
    }
    notifBusy = false;
  }

  // read first, then take the reader where the notification points
  async function notifGo(id){
    var n = notifById(id);
    if(!n) return;
    notifMarkRead(id);
    if(n.type === 'friend_request') return;             // the buttons are the action
    if(n.conversation_id && typeof window.dmOpenWith === 'function'){
      closeNotifPage(); window.dmOpenWith(n.conversation_id); return;
    }
    if(n.community_id && typeof window.cmOpenCommunity === 'function'){
      closeNotifPage(); cmOpenCommunity('c:' + n.community_id); return;
    }
    var url = n.target_url || (n.artwork_id ? '/artwork/' + n.artwork_id : null);
    if(!url) return;
    closeNotifPage();
    var art = url.match(/^\/artwork\/([^/]+)\/?$/);
    if(art && typeof openArtworkById === 'function'){ openArtworkById(art[1], true); return; }
    var pro = url.match(/^\/profile\/([^/]+)\/?$/);
    if(pro && typeof openProfileByUsername === 'function'){ openProfileByUsername(pro[1], true); return; }
    var item = url.match(/^\/(resource|blog|listing|job)\/([^/]+)\/?$/);
    if(item && typeof window.dzOpenById === 'function'){ window.dzOpenById(item[1], item[2]); return; }
    if(typeof window.dzRouteGo === 'function' && window.dzRouteGo(url)) return;
    try{ window.location.href = url; }catch(e){}
  }

  // accept or decline straight from the notification
  async function notifFriend(ev, pid, accept){
    if(ev){ ev.stopPropagation(); }
    var fr = window.pfFriendBridge;
    if(!fr){ showToast('Try again in a moment'); return; }
    try{
      await fr.load();
      if(accept) await fr.accept(pid);
      else if(fr.decline) await fr.decline(pid);
      else await fr.cancel(pid);
    }catch(e){ showToast('Could not do that — try again'); }
    notifDrop();
    notifLoad();
  }

  // a friend action anywhere drops the cached window and repaints the bell
  function notifAfterFriendChange(){
    notifDrop();
    if(document.getElementById('notifPage') &&
       document.getElementById('notifPage').classList.contains('open')) notifLoad();
    else notifRefreshBadge();
  }

  function notifPaintBadges(count){
    var n = Number(count) || 0;
    var el = document.getElementById('hNotifBtn');
    if(!el) return;
    el.classList.toggle('hasUnread', n > 0);
    var dot = el.querySelector('.hNotifDot');
    if(dot) dot.textContent = n > 9 ? '9+' : (n ? String(n) : '');
  }
  var notifBadgeAt = 0;
  async function notifRefreshBadge(){
    if(!document.getElementById('hNotifBtn')) return;
    if(!sb || !currentUser){ notifPaintBadges(0); return; }
    notifBadgeAt = Date.now();
    try{
      const{data,error} = await sb.rpc('dz_notif_unread');
      if(error) throw error;
      notifPaintBadges(data);
    }catch(e){   }
  }

  // no polling: the count catches up when the tab comes back, at most once a minute
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState !== 'visible') return;
    if(Date.now() - notifBadgeAt < 60000) return;
    notifDrop();
    notifRefreshBadge();
  });

