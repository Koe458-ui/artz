  var FEED_CAP = 200;
  var feedTab  = 'trending';

  function feedIsArtists(){ return feedTab === 'artists'; }
  function feedIsFollowing(){ return feedTab === 'following'; }

    // Every category is a board, addressed cat:<slug>. "others" is off — a board of the uncategorised is a board of the unsorted
  function feedCatOf(tab){
    var t = tab === undefined ? feedTab : tab;
    return String(t || '').indexOf('cat:') === 0 ? t.slice(4) : null;
  }
  function feedInCat(list, slug){
    return (list || []).filter(function(a){
      var cs = catList(a && a.category);
      return (cs.length ? cs : ['others']).indexOf(slug) !== -1;
    });
  }

  function feedFollowApi(){ return window.dzFollow || null; }

    // Gallery is already in memory, so "artwork from artists I follow" is a filter, not a query. Newest first
  function feedFollowingOf(list){
    var f = feedFollowApi();
    if(!f || !f.ready()) return [];
    var mine = {};
    f.ids().forEach(function(id){ mine[String(id)] = 1; });
    return sortByNewest((list || []).filter(function(a){
      return a && a.user_id && mine[String(a.user_id)];
    }));
  }

  function feedSort(list){
    if(feedTab === 'new')     return sortByNewest(list);
    if(feedTab === 'weekly')  return sortByWeekly(list);
    if(feedTab === 'monthly') return sortByMonthly(list);
    return sortByTrending(list);
  }

  function feedArtistsOf(list){
    var out = [], seen = {};
    var src = sortByTrending((list || []).slice());
    for(var i = 0; i < src.length && out.length < FEED_CAP; i++){
      var uid = src[i] && src[i].user_id;
      if(!uid || seen[uid]) continue;
      seen[uid] = 1;
      out.push(String(uid));
    }
    return out;
  }

  function feedFetchArtists(ids, done){
      // A row cached by another fetch may predate follower_count, so present-but-incomplete counts as missing
    var missing = ids.filter(function(u){
      var p = dzArtistCache[u];
      return p === undefined || (p && p.follower_count === undefined);
    });
    if(!missing.length || !sb){ done(); return; }
      // A failed query resolves with data:null. Marking every id null caches "no such profile" for artists that exist
    sb.from('profiles').select(window.DZ_ARTIST_COLS ||
      'id,username,display_name,avatar_url,banner_url,bio,follower_count').in('id', missing)
      .then(function(res){
        if(res && res.error){ done(); return; }
        ((res && res.data) || []).forEach(function(p){ if(p && p.id) dzArtistCache[p.id] = p; });
        missing.forEach(function(u){ if(dzArtistCache[u] === undefined) dzArtistCache[u] = null; });
        done();
      }, function(){ done(); });
  }

    // Artist card = small profile: banner, avatar straddling its edge, who they are, what they made, what you can do.
  function buildArtistCard(uid){
    var card = document.createElement('div');
    card.className = 'awCard atCard';
    card.setAttribute('data-uid', String(uid));
    card.innerHTML =
      '<span class="atBanner" aria-hidden="true"></span>' +
      '<div class="atBody">' +
        '<span class="atAv"><span class="atLtr" aria-hidden="true"></span></span>' +
        '<span class="atName"></span>' +
        '<span class="atUser"></span>' +
        '<div class="atStats">' +
          '<span class="atStat"><b class="atStatN atStatFol">0</b> <span class="atStatL">Followers</span></span> ' +
          '<span class="atStat"><b class="atStatN atStatArt">0</b> <span class="atStatL">Artworks</span></span> ' +
          '<span class="atStat"><b class="atStatN atStatLike">0</b> <span class="atStatL">Likes</span></span>' +
        '</div>' +
        '<div class="atActs">' +
          '<button type="button" class="atBtn atBtnFrd"></button>' +
          '<button type="button" class="atBtn atBtnFol"></button>' +
        '</div>' +
      '</div>';

    var p = dzArtistCache[uid];
    if(p !== undefined) paintArtistCard(card, p);
    return card;
  }

  function feedNum(n){
    n = +n || 0;
    if(window.dzFollow && window.dzFollow.fmt) return window.dzFollow.fmt(n);
    return n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(n);
  }

    // Totals are the artist's whole published body, not what this feed loaded. One query per batch; the memory count stands in
  var dzArtStats = {};

  function feedFetchArtStats(ids, done){
    var missing = ids.filter(function(u){ return u && dzArtStats[u] === undefined; });
    if(!missing.length || !sb){ done(); return; }
    missing.forEach(function(u){ dzArtStats[u] = null; });
    var giveUp = function(){
      missing.forEach(function(u){ if(dzArtStats[u] === null) delete dzArtStats[u]; });
      done();
    };
    sb.from('artworks').select('user_id,like_count')
      .in('user_id', missing).eq('status', 'approved').eq('visibility', 'published')
      .then(function(res){
          // data:null + error is how a failed query arrives; reading it as empty pins these artists at 0 for the session
        if(res && res.error){ giveUp(); return; }
        missing.forEach(function(u){ dzArtStats[u] = { art: 0, likes: 0 }; });
        ((res && res.data) || []).forEach(function(r){
          var st = r && dzArtStats[r.user_id];
          if(!st) return;
          st.art++;
          st.likes += (+r.like_count || 0);
        });
        done();
      }, giveUp);
  }

  function feedArtistTally(uid){
    var known = uid && dzArtStats[uid];
    if(known) return known;
    var list = filterHidden((awArtworksCache || []).slice());
    var art = 0, likes = 0;
    for(var i = 0; i < list.length; i++){
      if(!list[i] || String(list[i].user_id) !== String(uid)) continue;
      art++;
      likes += (+list[i].like_count || +list[i].likes || 0);
    }
    return { art: art, likes: likes };
  }

  var FRIEND_LABEL = { none:'Add friend', sent:'Requested', incoming:'Accept', friends:'Message' };
    // frState also answers blocked_by_me/blocked_me, neither of which has a card action — "Add friend" accepted a request that is not there
  function feedFriendBlocked(st){ return st === 'blocked_by_me' || st === 'blocked_me' || st === 'blocked'; }

  function feedPaintActions(card, p){
    var id  = p && p.id ? String(p.id) : '';
    var frd = card.querySelector('.atBtnFrd');
    var fol = card.querySelector('.atBtnFol');
    if(!id || !frd || !fol) return;

    var mine = (typeof currentUser !== 'undefined' && currentUser && String(currentUser.id) === id);
    card.classList.toggle('atMine', !!mine);

    var st = (window.pfFriendBridge && window.pfFriendBridge.state)
      ? String(window.pfFriendBridge.state(id) || 'none') : 'none';
    frd.hidden = feedFriendBlocked(st);
    frd.textContent = FRIEND_LABEL[st] || FRIEND_LABEL.none;
    frd.dataset.frState = st;
    frd.classList.toggle('on', st === 'friends');
      // one button left in the row should still fill it
    card.classList.toggle('atOneAct', frd.hidden);

    var on = !!(window.dzFollow && window.dzFollow.is && window.dzFollow.is(id));
    fol.textContent = on ? 'Following' : 'Follow';
    fol.classList.toggle('on', on);
  }

    // card opens the profile, so both buttons stop the click getting there
  function feedWireActions(card, p){
    var id = p && p.id ? String(p.id) : '';
    if(!id) return;
    var frd = card.querySelector('.atBtnFrd');
    var fol = card.querySelector('.atBtnFol');

    if(fol) fol.onclick = function(e){
      e.stopPropagation();
      if(typeof currentUser === 'undefined' || !currentUser){
        if(typeof showToast === 'function') showToast('Sign in to follow artists');
        if(typeof openAuthMod === 'function') openAuthMod();
        return;
      }
      if(!window.dzFollow) return;
      var was = !!window.dzFollow.is(id);
      fol.disabled = true;
      Promise.resolve(window.dzFollow.set(id, !was)).then(function(){
        feedPaintActions(card, p);
      }, function(){}).then(function(){ fol.disabled = false; });
    };

    if(frd) frd.onclick = function(e){
      e.stopPropagation();
      if(typeof currentUser === 'undefined' || !currentUser){
        if(typeof showToast === 'function') showToast('Sign in to add friends');
        if(typeof openAuthMod === 'function') openAuthMod();
        return;
      }
      var br = window.pfFriendBridge;
      if(!br) return;
      var st = frd.dataset.frState || 'none';
      if(feedFriendBlocked(st)) return;
      if(st === 'friends'){
        br.chat({ id: id, username: p.username, avatar_url: p.avatar_url });
        return;
      }
      frd.disabled = true;
      var act = st === 'none' ? br.send(id) : (st === 'sent' ? br.cancel(id) : br.accept(id));
      Promise.resolve(act).then(function(){ return br.load(); }, function(){})
        .then(function(){ feedPaintActions(card, p); })
        .then(function(){ frd.disabled = false; }, function(){ frd.disabled = false; });
    };
  }

  function feedPaintAvatar(av, ltr, p, name){
    if(!av) return;
    if(p && p.avatar_url){
      var im = av.querySelector('img');
      if(!im){
        im = document.createElement('img');
        im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
        im.draggable = false;
        av.appendChild(im);
      }
      im.src = getThumbnailUrl(p.avatar_url);
      if(ltr) ltr.style.display = 'none';
    } else if(ltr){
      ltr.textContent = name.charAt(0).toUpperCase();
      ltr.style.display = '';
    }
  }

  function paintArtistCard(card, p){
    var name = (p && (p.display_name || p.username)) || 'Artist';
    var user = p && p.username ? String(p.username) : '';
    var av   = card.querySelector('.atAv');
    var ltr  = card.querySelector('.atLtr');
    var nm   = card.querySelector('.atName');
    var un   = card.querySelector('.atUser');

    if(nm) nm.textContent = name;
    if(un) un.textContent = user ? '@' + user : '';

    var bn = card.querySelector('.atBanner');
    if(bn && p && p.banner_url){
        // banner spans the card and is seen at up to 3x on a phone: ask for the 1000px webp, not the 600, or it upscales
      bn.style.backgroundImage = 'url("' + imgResize(p.banner_url, 1000) + '")';
    }
    feedPaintAvatar(av, ltr, p, name);

    var t = feedArtistTally(p && p.id);
    var set = function(sel, n){ var e = card.querySelector(sel); if(e) e.textContent = feedNum(n); };
    set('.atStatFol', p && p.follower_count);
    set('.atStatArt', t.art);
    set('.atStatLike', t.likes);
    var lbl = function(sel, n, s1, s2){
      var b = card.querySelector(sel), e = b && b.nextElementSibling;
      if(e) e.textContent = (+n === 1) ? s1 : s2;
    };
    lbl('.atStatFol',  p && p.follower_count, 'Follower', 'Followers');
    lbl('.atStatArt',  t.art,   'Artwork', 'Artworks');
    lbl('.atStatLike', t.likes, 'Like',    'Likes');

    feedPaintActions(card, p);
    feedWireActions(card, p);

    card.classList.add('atReady');
    if(user){
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View profile of ' + name);
      card.onclick = function(){ openProfileByUsername(user, true); };
      card.onkeydown = function(e){
        if(e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openProfileByUsername(user, true);
      };
    } else {
      card.classList.add('atDead');
    }
  }

  function feedRepaintPeople(uids, onlyUnpainted){
    uids.forEach(function(uid){
      var sel = (window.CSS && CSS.escape) ? CSS.escape(uid) : String(uid).replace(/["\\]/g, '\\$&');
      var q = '.atCard[data-uid="' + sel + '"]';
        // one pass over the document catches feed board, search page and hero search alike, without painting a card twice
      var cards = Array.prototype.slice.call(document.querySelectorAll(q));
      cards.forEach(function(card){
        if(onlyUnpainted && card.classList.contains('atReady')) return;
        if(dzArtistCache[uid] !== undefined) paintArtistCard(card, dzArtistCache[uid]);
      });
    });
  }

  function paintPeopleBatch(uids){
    feedFetchArtists(uids, function(){ feedRepaintPeople(uids, true); });
    feedFetchArtStats(uids, function(){ feedRepaintPeople(uids, false); });
  }
  window.dzPaintPeople = paintPeopleBatch;

  function feedEmptyText(){
    var cat = feedCatOf();
    if(cat) return 'NO ARTWORK IN THIS CATEGORY YET';
    if(feedTab === 'artists') return 'NO ARTISTS YET';
    if(feedIsFollowing()){
      var signedIn = (typeof currentUser !== 'undefined' && currentUser);
      if(!signedIn) return 'SIGN IN TO FOLLOW ARTISTS';
      var f = feedFollowApi();
      if(f && f.ready() && !f.count()) return 'FOLLOW ARTISTS TO FILL THIS FEED';
      return 'NOTHING NEW FROM THE ARTISTS YOU FOLLOW';
    }
    return 'NO ARTWORK YET';
  }

  function renderAwGrid(list, reset){
    var grid  = document.getElementById('awGrid');
    var empty = document.getElementById('awEmpty');
    if(!grid) return;

    var src = filterHidden((list || []).slice());
    var cat = feedCatOf();
    if(cat){
      awRList = sortByTrending(feedInCat(src, cat)).slice(0, FEED_CAP);
    } else if(feedIsArtists()){
      awRList = feedArtistsOf(src);
    } else if(feedIsFollowing()){
      awRList = feedFollowingOf(src).slice(0, FEED_CAP);
    } else {
      awRList = feedSort(src).slice(0, FEED_CAP);
    }

    grid.classList.toggle('awGrid--artists', !!feedIsArtists());

    var keep = reset ? 0 : awRShown;
    awRShown = 0;
    if(awSent){ awSent.destroy(); awSent = null; }
    grid.innerHTML = '';

    if(!awRList.length){
      if(empty){
        empty.textContent = feedEmptyText();
        empty.style.display = 'block';
      }
      return;
    }
    if(empty) empty.style.display = 'none';

    awAppendBatch(Math.max(gridInitialBatch(), keep));
    if(awRShown < awRList.length){
      awSent = makeGridSentinel(null, function(){ awAppendBatch(); });
      grid.appendChild(awSent.el);
    }
  }

  function awAppendBatch(count){
    var grid = document.getElementById('awGrid');
    if(!grid || awRShown >= awRList.length) return;
    var size = count || gridStepBatch();
    var end  = Math.min(awRShown + size, awRList.length);
    var artists = feedIsArtists();
    var frag = document.createDocumentFragment();
    var wanted = [];
    for(var i = awRShown; i < end; i++){
      var item = awRList[i], uid = null;
      if(artists){ frag.appendChild(buildArtistCard(item)); uid = item; }
      else frag.appendChild(buildAwCard(item, i < 4));
        // every artist is asked for, cached or not: totals are a separate fetch, and a hover-warmed profile would pin the card to the in-memory tally
      if(uid && wanted.indexOf(uid) === -1) wanted.push(uid);
    }
    awRShown = end;
    if(awSent && awSent.el.parentNode === grid) grid.insertBefore(frag, awSent.el);
    else grid.appendChild(frag);
    if(wanted.length) paintPeopleBatch(wanted);
    if(awRShown >= awRList.length){
      if(awSent){ awSent.destroy(); awSent = null; }
    } else if(awSent){
      awSent.recheck();
    }
  }

  window.rebuildGalCarousels = function(artworks){
    awArtworksCache = artworks || [];
    renderAwGrid(awArtworksCache);
  };

  window.rebuildGalCarousels(typeof images !== 'undefined' ? images : []);

  function ftSelect(id){
    if(!id || id === feedTab) return;
    var rail = document.getElementById('ftRail');
    if(!rail) return;
    if(typeof window.hsReset === 'function') window.hsReset();
    var tabs = rail.querySelectorAll('.ftTab[data-feed]');
    var picked = null;
    for(var i = 0; i < tabs.length; i++){
      var on = tabs[i].getAttribute('data-feed') === id;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      if(on) picked = tabs[i];
    }
    if(!picked) return;
    feedTab = id;
    if(id === 'following' && feedFollowApi() && !feedFollowApi().ready()){
      feedFollowApi().load().then(feedFollowRepaint, function(){});
    }
    var grid = document.getElementById('awGrid');
    if(grid) grid.setAttribute('aria-labelledby', picked.id);
    ftReveal(picked);
    renderAwGrid(awArtworksCache, true);
    if(grid){
      grid.classList.remove('awSwap');
      void grid.offsetWidth;
      grid.classList.add('awSwap');
    }
  }

  function ftReveal(btn){
    var rail = document.getElementById('ftRail');
    if(!rail || !btn) return;
    var to = btn.offsetLeft - (rail.clientWidth - btn.offsetWidth) / 2;
    to = Math.max(0, Math.min(to, rail.scrollWidth - rail.clientWidth));
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if(rail.scrollTo) rail.scrollTo({ left: to, behavior: still ? 'auto' : 'smooth' });
    else { rail.scrollLeft = to; ftEnds(rail); }
  }

    // Rail scrolls on every screen, so its arrows are too: enabled while there is room to travel, dimmed at the end.
  function ftEnds(rail){
    var wrap = rail.parentNode;
    var prev = wrap.querySelector('.ftPrev');
    var next = wrap.querySelector('.ftNext');
    var max  = rail.scrollWidth - rail.clientWidth;
    if(prev) prev.disabled = rail.scrollLeft <= 1;
    if(next) next.disabled = rail.scrollLeft >= max - 1;
  }

    // Six boards are in the markup; categories build from the list the rest of the site filters by, so adding one needs no second edit
  function ftBuildCats(rail){
    if(typeof SITE_CATEGORIES === 'undefined' || !SITE_CATEGORIES.length) return;
    var frag = document.createDocumentFragment();
    SITE_CATEGORIES.forEach(function(c){
      if(!c || !c.slug || c.slug === 'others') return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ftTab';
      b.id = 'ftTab-cat-' + c.slug;
      b.tabIndex = -1;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('data-feed', 'cat:' + c.slug);
      var l = document.createElement('span');
      l.className = 'ftLbl';
      l.textContent = c.label;
      b.appendChild(l);
      frag.appendChild(b);
    });
    rail.appendChild(frag);
  }

  (function(){
    var rail = document.getElementById('ftRail');
    if(!rail) return;
    ftBuildCats(rail);
    var wrap = rail.parentNode;
    var queued = false;
    function sync(){
      if(queued) return;
      queued = true;
      requestAnimationFrame(function(){ queued = false; ftEnds(rail); });
    }
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    if(window.ResizeObserver) new ResizeObserver(sync).observe(rail);
    wrap.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-ftnav]') : null;
      if(!b || b.disabled) return;
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
      var by = rail.clientWidth * 0.8 * (+b.getAttribute('data-ftnav') < 0 ? -1 : 1);
      if(rail.scrollBy) rail.scrollBy({ left: by, behavior: still ? 'auto' : 'smooth' });
      else rail.scrollLeft += by;
    });
    rail.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('.ftTab') : null;
      if(btn) ftSelect(btn.getAttribute('data-feed'));
    });
    rail.addEventListener('keydown', function(e){
      var step = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
      if(!step) return;
      var tabs = Array.prototype.slice.call(rail.querySelectorAll('.ftTab[data-feed]'));
      var at = tabs.indexOf(document.activeElement);
      if(at < 0) return;
      e.preventDefault();
      var next = tabs[(at + step + tabs.length) % tabs.length];
      next.focus();
      ftSelect(next.getAttribute('data-feed'));
    });
    var tabs = rail.querySelectorAll('.ftTab[data-feed]');
    for(var i = 0; i < tabs.length; i++){
      tabs[i].tabIndex = tabs[i].classList.contains('on') ? 0 : -1;
    }
    ftEnds(rail);
  })();

    // Following is the one tab whose contents change without the gallery changing: a follow taken anywhere belongs in it now.
  function feedFollowRepaint(){
    if(!feedIsFollowing()) return;
    renderAwGrid(awArtworksCache, true);
  }
  document.addEventListener('dz:follow', feedFollowRepaint);

  window.ftSelect = ftSelect;
