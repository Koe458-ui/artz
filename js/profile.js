  var pf = {
    profile: null,
    isOwner: false,
    tab: 'gallery',
    galleryRows: [], galleryDone: false, galleryBusy: false,
    upFile: null,
    upThumbFocus: null,
    upPageFiles: [],
    upAlbums: [],
    albums: [], albumsLoaded: false
  };

  var pfMediaCache = {};
  var pfRowCache = {};
  var pfOpenSeq = 0;
  function pfPreloadImage(url){
    if(!url) return;
    var img = new Image();
    img.src = url;
  }

  function pfFormatDate(iso){
    if(!iso) return '';
    try{
      return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
    }catch(e){ return ''; }
  }

  var PF_PROFILE_COLS = 'id,username,display_name,bio,role,created_at,username_changed_at,follower_count,following_count,merit,avatar_url,avatar_storage_path,avatar_updated_at,banner_url,banner_storage_path,banner_updated_at,social_links';

  function pfOwnKey(){
    var c = window.dzCached ? window.dzCached() : null;
    return (c && c.ukey) ? c.ukey('profile') : null;
  }
  function pfCacheOwn(row){
    var c = window.dzCached && window.dzCached(), k = pfOwnKey();
    if(c && k && row) c.set(k, row, 'user:profile');
  }
  window.pfOwnProfileCached = function(){
    var c = window.dzCached && window.dzCached(), k = pfOwnKey();
    return (c && k) ? c.peek(k, 'user:profile', { any:true }) : null;
  };

  async function pfEnsureOwnProfile(){
    if(!sb || !currentUser) return null;
    try{
      const{data:existing,error:se}=await sb.from('profiles').select(PF_PROFILE_COLS).eq('id',currentUser.id).maybeSingle();
      if(se) throw se;
      if(existing){ pfCacheOwn(existing); return existing; }
      var base = (currentUser.user_metadata && currentUser.user_metadata.username) ||
                 (currentUser.email ? currentUser.email.split('@')[0] : '') || 'user';
      base = base.replace(/[^a-zA-Z0-9_.]/g,'').slice(0,30) || 'user';
      var uname = base;
      for(var attempt=0; attempt<3; attempt++){
        const{data:ins,error:ie}=await sb.from('profiles').insert({id:currentUser.id,username:uname}).select(PF_PROFILE_COLS).single();
        if(!ie && ins){
          if(uname !== (currentUser.user_metadata && currentUser.user_metadata.username)){
            try{ await sb.auth.updateUser({data:{username:uname}}); }catch(e){}
          }
          pfCacheOwn(ins);
          return ins;
        }
        var msg = (ie && ie.message) || '';
        if(/duplicate|unique|23505/i.test(msg)){
          const{data:again}=await sb.from('profiles').select(PF_PROFILE_COLS).eq('id',currentUser.id).maybeSingle();
          if(again){ pfCacheOwn(again); return again; }
          uname = base.slice(0,24)+'_'+Math.random().toString(36).slice(2,6);
          continue;
        }
        console.error('pfEnsureOwnProfile: '+msg);
        return null;
      }
    }catch(e){
      console.error('pfEnsureOwnProfile: '+(e.message||e));
      var cachedProf = window.pfOwnProfileCached();
      if(cachedProf){ showToast('Offline \u2014 showing saved profile'); return cachedProf; }
    }
    return null;
  }

  async function openOwnProfile(token){
    if(!currentUser){ showToast('Sign in to view your profile'); openAuthMod(); return; }
    if(!sb){ showToast('Can\u2019t connect \u2014 try again'); return; }
    var uname = currentUser.user_metadata && currentUser.user_metadata.username;
    if(uname){ openProfileByUsername(uname); return; }
    var row = await pfEnsureOwnProfile();
    if(token != null && typeof window.dzNavCurrent === 'function' &&
       !window.dzNavCurrent(token)) return;
    if(row && row.username){ openProfileByUsername(row.username); return; }
    showToast('Could not load your profile — please try again');
  }

  function pfCloseCompetingOverlays(){
    try{
      var _dz = document.getElementById('dzView');
      var _fg = document.getElementById('fg');
      var _cm = document.getElementById('communityPage');
      var _rk = document.getElementById('rankPage');
      if(_dz && _dz.classList.contains('open')) window.pfReturnOverlay = 'dzView';
      else if(_fg && _fg.classList.contains('open')) window.pfReturnOverlay = 'fg';
      else if(_cm && _cm.classList.contains('open')) window.pfReturnOverlay = 'communityPage';
      else if(_rk && _rk.classList.contains('open')) window.pfReturnOverlay = 'rankPage';
      else window.pfReturnOverlay = null;
    }catch(e){ window.pfReturnOverlay = null; }
    try{ if(typeof closeLB==='function') closeLB(true); }catch(e){}
    try{ if(typeof closeFG==='function') closeFG(); }catch(e){}
    try{ if(typeof closePfUpload==='function') closePfUpload(); }catch(e){}
    try{ if(typeof window.cmCloseChat==='function') window.cmCloseChat(); }catch(e){}
    try{ if(typeof window.closeFriendsPage==='function') window.closeFriendsPage(); }catch(e){}
    try{ if(typeof closeCommunityPage==='function') closeCommunityPage(); }catch(e){}
    try{ if(typeof window.closeRankPage==='function') window.closeRankPage(); }catch(e){}
    try{ if(typeof window.dzCloseViewSilent==='function') window.dzCloseViewSilent(); else if(typeof window.dzCloseView==='function') window.dzCloseView(); }catch(e){}
  }

  async function openProfileByUsername(username, pushUrl){
    if(!sb){ showToast('Can\u2019t connect \u2014 try again'); return; }
    pfCloseCompetingOverlays();
    var panel = document.getElementById('profilePage');
    panel.classList.add('open');
    document.body.style.overflow='hidden';

    if(pushUrl !== false) pfAddress(username);
    var mediaCached = pfMediaCache[username];
    if(mediaCached){
      pfPreloadImage(getThumbnailUrl(mediaCached.avatar_url));
      pfPreloadImage(getViewUrl(mediaCached.banner_url));
    }
    if(currentUser && currentUser.user_metadata && currentUser.user_metadata.username===username){
      pfPreloadImage(getThumbnailUrl(currentUserAvatarUrl));
    }
    pf.profile=null; pf.galleryRows=[]; pf.galleryDone=false; pf.galleryBusy=false;
    pf.galleryOffset=0; pf.galleryIds=Object.create(null);
    var _lk=document.getElementById('pfStatLikes'); if(_lk) delete _lk.dataset.total;
    pf.resLoaded=false; pf.mktLoaded=false; pf.blogLoaded=false; pf.resRows=[]; pf.mktRows=[]; pf.blogRows=[];
    pf.albumsLoaded=false; pf.albums=[];

    ['pfGalleryGrid','pfAlbumGrid','pfResGrid','pfBlogList','pfMktGrid','pfXpWrap',
     'pfConnectList']
      .forEach(function(id){ var e=document.getElementById(id); if(e) e.innerHTML=''; });
    var _bio=document.getElementById('pfBioText'); if(_bio) _bio.textContent='';
    var _mer=document.getElementById('pfStatMerit'); if(_mer) _mer.textContent='—';
    ['pfGalleryEmpty','pfAlbumEmpty','pfResEmpty','pfBlogEmpty','pfMktEmpty']
      .forEach(function(id){ var e=document.getElementById(id); if(e) e.style.display='none'; });
    var _pgs=document.getElementById('pfGallerySentinel'); if(_pgs) _pgs.style.display='none';
    var mySeq = ++pfOpenSeq;

    var pfLc = String(username).toLowerCase();
    var pfCache = window.dzCached ? window.dzCached() : null;
    var pfKey = 'profile:public:name:' + (pfCache ? pfCache.norm(pfLc) : pfLc);
    var cachedRow = pfRowCache[pfLc] ||
                    (pfCache ? pfCache.peek(pfKey, 'profile:public', { any:true }) : null);
    if(cachedRow){
      pfSwitchTab('gallery');
      pfPaintProfile(cachedRow, cachedRow.username, pushUrl);
    } else {
      document.getElementById('pfUsername').textContent='Loading…';
      document.getElementById('pfAvatarLetter').textContent='?';
      document.getElementById('pfAvatarImg').style.display='none';
      document.getElementById('pfBannerImg').style.display='none';
      document.getElementById('pfJoined').textContent='';
      var _hb=document.getElementById('pfHeadBio'); if(_hb) _hb.textContent='';
      var _hn=document.getElementById('pfHandle'); if(_hn) _hn.textContent='';
      var _st=document.getElementById('pfStats'); if(_st) _st.hidden=true;
      pfResetTabRail();
      var _ar=document.getElementById('pfActionRow'); if(_ar) _ar.hidden=true;
      var _wm=document.getElementById('pfWarnMark'); if(_wm) _wm.classList.remove('on');
      pfPaintTopBar(null);
      if(window.DZ_MS){
        DZ_MS.paintName(document.getElementById('pfUsername'), 0);
        DZ_MS.paintRibbon(document.getElementById('pfMsRibbon'), 0);
      }
      pfSwitchTab('gallery');
    }
    try{
      let{data,error}=await sb.from('profiles').select(PF_PROFILE_COLS).eq('username',username).maybeSingle();
      if(error) throw error;
        // the edge resolves /profile/<name> case-insensitively; without the same second look the panel self-closed with "Profile not found"
      if(!data) data = await pfFindByName(username);
      if(!data && currentUser){
        var metaName = currentUser.user_metadata && currentUser.user_metadata.username;
        if(metaName && metaName.toLowerCase() === String(username).toLowerCase()){
          data = await pfEnsureOwnProfile();
        }
      }
      if(mySeq !== pfOpenSeq) return;
      if(!document.getElementById('profilePage').classList.contains('open')) return;
      if(!data){ showToast('Profile not found'); closeProfilePage(); return; }
      username = data.username;
      pfRowCache[String(username).toLowerCase()] = data;
      if(pfCache) pfCache.set(pfKey, data, 'profile:public');
      pfPaintProfile(data, username, pushUrl);
    }catch(e){
      console.error('Error: '+e.message);
      if(!cachedRow && mySeq === pfOpenSeq) closeProfilePage();
    }
  }

    // % and _ are LIKE wildcards and a username may hold an underscore, so the name is escaped and the row must be the same name
  async function pfFindByName(username){
    var raw = String(username || '');
    if(!raw || !/^[\w.\-]{1,40}$/.test(raw)) return null;
    var pattern = raw.replace(/[\\%_]/g, '\\$&');
    try{
      const{data,error} = await sb.from('profiles').select(PF_PROFILE_COLS)
        .ilike('username', pattern).limit(1);
      if(error) return null;
      var row = (data && data[0]) || null;
      if(!row || String(row.username||'').toLowerCase() !== raw.toLowerCase()) return null;
      return row;
    }catch(e){ return null; }
  }

  function pfPaintTopBar(isOwner){
    var acts = document.getElementById('pfTopActions');
    var guest = document.getElementById('pfTopGuest');
    var known = (isOwner !== null && isOwner !== undefined);
    if(acts) acts.hidden = !isOwner;
    if(guest) guest.hidden = !known || !!isOwner || !currentUser;
  }

  var rptUserBusy = false;

  function pfReportUser(){
    if(!currentUser){ showToast('Sign in to report an account'); openAuthMod(); return; }
    if(!pf.profile){ showToast('Nothing to report'); return; }
    if(pf.profile.id === currentUser.id) return;

    var m = document.getElementById('rptUserMod');
    if(!m) return;
    var chosen = m.querySelector('input[name="rptUserReason"]:checked');
    if(chosen) chosen.checked = false;
    document.getElementById('rptUserDetails').value = '';
    var sub = document.getElementById('rptUserSub');
    if(sub) sub.textContent = 'Why are you reporting @' +
      (pf.profile.username || 'this account') + '?';
    m.classList.add('open');
  }

  function rptUserClose(){
    var m = document.getElementById('rptUserMod');
    if(m) m.classList.remove('open');
  }

  async function rptUserSubmit(){
    if(rptUserBusy) return;
    var m = document.getElementById('rptUserMod');
    var picked = m.querySelector('input[name="rptUserReason"]:checked');
    if(!picked){ showToast('Pick a reason first'); return; }
    if(!pf.profile || !currentUser) return;

    var btn = document.getElementById('rptUserSubmit');
    rptUserBusy = true; btn.disabled = true; btn.textContent = 'SENDING…';
    try{
      var ins = await sb.from('user_reports').insert({
        reporter_id: currentUser.id,
        target_id  : pf.profile.id,
        reason     : picked.value,
        details    : (document.getElementById('rptUserDetails').value.trim() || null)
      });
      if(ins.error && ins.error.code !== '23505') throw ins.error;
      rptUserClose();
      showToast('Report submitted — thank you');
    }catch(e){
      showToast(safeErr(e, 'Couldn\u2019t submit report — try again'));
    }finally{
      rptUserBusy = false; btn.disabled = false; btn.textContent = '🚩 Submit Report';
    }
  }

  function pfPaintProfile(data, username, pushUrl){
      pf.profile = data;
      pf.isOwner = !!(currentUser && currentUser.id === data.id);
      pfPaintTopBar(pf.isOwner);
      if(!pf.isOwner && typeof window.dzAnTrack === 'function'){
        window.dzAnTrack('profile_view', null, { scope: 'profile', owner: String(data.id) });
      }
      pfMediaCache[username] = { avatar_url: data.avatar_url||null, banner_url: data.banner_url||null };
      pfPreloadImage(getThumbnailUrl(data.avatar_url));
      pfPreloadImage(getViewUrl(data.banner_url));
      var pfVisibleName = data.display_name || data.username;
      document.getElementById('pfUsername').textContent = pfVisibleName;
      var _hnEl=document.getElementById('pfHandle'); if(_hnEl) _hnEl.textContent = '@' + data.username;
      document.getElementById('pfAvatarLetter').textContent = (pfVisibleName||'?').charAt(0).toUpperCase();
      document.getElementById('pfEditAvatarLetter').textContent = (pfVisibleName||'?').charAt(0).toUpperCase();
      pfRenderAvatarBanner();
      document.getElementById('pfJoined').textContent = data.created_at ? ('Joined '+pfFormatDate(data.created_at)) : '';
      pfRenderBio();
      pfRenderHeadBio();
      pfRenderConnect();
      if(typeof pfPaintAudience === 'function') pfPaintAudience();
      pfResetTabRail();
      pfLoadTabRail();
      pfLoadStats();
      pfLoadHeadStats();
      pfLoadActionRow();
      pfLoadMoreGallery();
      if(pf.tab && pf.tab !== 'gallery') pfLoadTab(pf.tab);
      if(pushUrl!==false &&
         document.getElementById('profilePage').classList.contains('open')){
        pfAddress(username);
      }
  }

  function pfAddress(username){
    var path = '/profile/'+encodeURIComponent(username);
    if(!window.pfReturnOverlay && typeof window.dzRouteAddress === 'function'){
      pfReturnUrl = null;
      window.dzRouteAddress(path);
      return;
    }
    if(window.location.pathname === path) return;
    try{
      if(pfReturnUrl === null){
        pfReturnUrl = window.location.pathname + window.location.search;
        history.pushState({profileUser:username},'',path);
      } else {
        history.replaceState({profileUser:username},'',path);
      }
    }catch(e){}
  }

  var pfReturnUrl = null;
  window.addEventListener('popstate', function(){ pfReturnUrl = null; });

  function closeProfilePage(revertUrl, restore){
    var panel = document.getElementById('profilePage');
    if(!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    document.getElementById('pfEditPage').classList.remove('open');
    restoreScroll();
    if(revertUrl!==false && /^\/profile\//.test(window.location.pathname)){
      if(pfReturnUrl === null && typeof window.dzRouteAddress === 'function'){
        window.dzRouteAddress(null);
      } else {
        try{ history.replaceState({},'', pfReturnUrl || '/'); }catch(e){}
      }
      pfReturnUrl = null;
    }
    var ret = window.pfReturnOverlay; window.pfReturnOverlay = null;
    if(restore===true){
      if(ret==='fg'){
        var fg = document.getElementById('fg');
        if(fg && !fg.classList.contains('open')){
          fg.classList.add('open');
          document.body.style.overflow='hidden';
          if(typeof bnSetActive==='function') bnSetActive('bnGallery');
        }
      } else if(ret==='communityPage'){
        if(typeof openCommunityHome==='function'){
          openCommunityHome();
          if(typeof bnSetActive==='function') bnSetActive('bnCommunity');
        }
      } else if(ret==='rankPage'){
        if(typeof window.openRankPage==='function'){ window.openRankPage(); }
      } else if(ret==='dzView'){
        setTimeout(function(){
          var fg = document.getElementById('fg');
          if(fg && !fg.classList.contains('open')){
            fg.classList.add('open');
            if(typeof bnSetActive==='function') bnSetActive('bnGallery');
          }
          var dz = document.getElementById('dzView');
          if(dz && !dz.classList.contains('open')){
            dz.classList.add('open');
            document.body.style.overflow='hidden';
          }
        }, 0);
      }
    }
  }

  var PF_TABS = ['gallery','album','resources','blog','marketplace','progress','about'];
    // Level and About describe the account, so always present. The rest appear when the artist has put something in them
  var PF_TABS_ALWAYS = ['progress','about'];

  function pfTabBtn(t){
    return document.getElementById('pfTab' + t.charAt(0).toUpperCase() + t.slice(1));
  }
  function pfTabShown(t){
    var b = pfTabBtn(t);
    return !!b && !b.hidden;
  }
  function pfVisibleTabs(){ return PF_TABS.filter(pfTabShown); }

  function pfSwitchTab(tab){
    pf.tab=tab;
    PF_TABS.forEach(function(t){
      var cap = t.charAt(0).toUpperCase()+t.slice(1);
      var btn = document.getElementById('pfTab'+cap);
      var pan = document.getElementById('pfPanel'+cap);
      var on  = (t===tab);
      if(btn){
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
        if(on && btn.scrollIntoView){
          try{ btn.scrollIntoView({behavior:'smooth', inline:'nearest', block:'nearest'}); }catch(e){}
        }
      }
      if(pan) pan.classList.toggle('active', on);
    });
    pfLoadTab(tab);
  }

    // Which sections this artist has something in, each asked the way its tab asks it, so the rail cannot promise a tab
    // that opens empty. A visitor is counted published rows only; the owner is counted what their own tabs render.
  async function pfSectionsWithContent(forId, isOwner){
    function count(q){
      return q.then(function(r){ return (r && !r.error && r.count) ? r.count : 0; },
                    function(){ return 0; });
    }
    function pubOnly(q){ return isOwner ? q : q.eq('visibility', 'published'); }
    var art = sb.from('artworks').select('id', { count:'exact', head:true })
                .eq('user_id', forId).eq('kind', ART_KIND_ART);
    if(!isOwner) art = art.eq('visibility', 'published');

    var res = await Promise.all([
      count(art),
        // a portfolio is an artist's public face: nothing public, no tab. The owner reaches every album from the menu
      sb.rpc('get_user_albums', { target: forId })
        .then(function(r){
          return (r && !r.error && Array.isArray(r.data))
            ? r.data.filter(function(a){ return a.is_public !== false; }).length : 0;
        }, function(){ return 0; }),
        // same question the tab asks: a draft is "kept, not listed" and a hidden item is link-only — neither is a stranger's to see
      count(pubOnly(sb.from('resources').select('id', { count:'exact', head:true })
              .eq('user_id', forId).eq('status', 'approved'))),
      count(pubOnly(sb.from('blog_posts').select('id', { count:'exact', head:true })
              .eq('user_id', forId).eq('status', 'approved'))),
      count(pubOnly(sb.from('marketplace_items').select('id', { count:'exact', head:true })
              .eq('user_id', forId).eq('status', 'approved'))),
      isOwner ? Promise.resolve(false)
              : sb.from('profiles').select('likes_public,bookmarks_public')
                  .eq('id', forId).maybeSingle()
                  .then(function(r){ return !!(r && r.data &&
                          (r.data.likes_public === true || r.data.bookmarks_public === true)); },
                        function(){ return false; })
    ]);

    return {
      gallery:     res[0] > 0,
      album:       res[1] > 0 || res[5],
      resources:   res[2] > 0,
      blog:        res[3] > 0,
      marketplace: res[4] > 0
    };
  }

    // Hide every section tab until we know, so the rail never shows one then takes it away
  function pfResetTabRail(){
    PF_TABS.forEach(function(t){
      var b = pfTabBtn(t);
      if(b) b.hidden = (PF_TABS_ALWAYS.indexOf(t) === -1);
    });
  }

  function pfPaintTabRail(has){
    PF_TABS.forEach(function(t){
      var b = pfTabBtn(t);
      if(b && PF_TABS_ALWAYS.indexOf(t) === -1) b.hidden = !has[t];
    });
      // the open tab may have just been taken off the rail
    if(!pfTabShown(pf.tab)) pfSwitchTab(pfVisibleTabs()[0] || 'progress');
  }

  async function pfLoadTabRail(){
    if(!pf.profile || !sb) return;
    var forId = String(pf.profile.id);
    var isOwner = !!(currentUser && String(currentUser.id) === forId);
    try{
      var has = await pfSectionsWithContent(forId, isOwner);
      if(!pfStillOn(forId)) return;
      pfPaintTabRail(has);
    }catch(e){
        // a profile with a tab too few is worse than one with a tab too many
      if(pfStillOn(forId)) pfPaintTabRail(
        { gallery:true, album:true, resources:true, blog:true, marketplace:true });
    }
  }

  function pfLoadTab(tab){
    if(tab==='progress' && typeof xpLoadInto==='function' && pf.profile){
      xpLoadInto('pfXpWrap', pf.profile.id, { leaderboard:true });
    }
    if(tab==='album') albLoadProfileTab();
    if(tab==='resources' || tab==='blog' || tab==='marketplace') pfLoadList(tab);
  }

  function pfTabKey(e){
    var tabs = pfVisibleTabs();
    var i = tabs.indexOf(pf.tab);
    if(i === -1) return;
    var next;
    if(e.key === 'ArrowRight')      next = (i + 1) % tabs.length;
    else if(e.key === 'ArrowLeft')  next = (i - 1 + tabs.length) % tabs.length;
    else if(e.key === 'Home')       next = 0;
    else if(e.key === 'End')        next = tabs.length - 1;
    else return;
    e.preventDefault();
    var t = tabs[next];
    pfSwitchTab(t);
    var btn = pfTabBtn(t);
    if(btn) try{ btn.focus({preventScroll:true}); }catch(e2){ btn.focus(); }
  }
  document.addEventListener('DOMContentLoaded', function(){
    var rail = document.getElementById('pfTabGroup');
    if(rail) rail.addEventListener('keydown', pfTabKey);
  });

  function pfDzCard(sec){
    return function(r){
      var id = esc(String(r.id));
      var H  = window.dzHelpers || { bytes:function(){return '';}, money:function(){return '';} };
      var thumb = r.preview_url
        ? '<img loading="lazy" decoding="async" src="'+esc(getThumbnailUrl(r.preview_url))+'" alt="'+esc(r.title||'')+'">'
        : '<span class="dzExt">'+esc(String(sec==='resources'?(r.file_ext||'FILE'):(r.item_type||'ITEM')).toUpperCase())+'</span>';
      if(sec==='resources'){
        return '<div class="dzCard" onclick="pfDzOpen(\'resources\',\''+id+'\')">'+
          '<div class="dzThumb">'+thumb+'<span class="dzBadge">'+esc((r.file_ext||'').toUpperCase())+'</span></div>'+
          '<div class="dzBody"><div class="dzName">'+esc(r.title||'')+'</div>'+
          '<div class="dzMeta"><span>'+esc(H.bytes(r.file_size))+'</span>'+
          '<span>'+esc(String(r.download_count||0))+' downloads</span>'+
          '<span>'+esc(r.license||'')+'</span></div></div></div>';
      }
      return '<div class="dzCard" onclick="pfDzOpen(\'marketplace\',\''+id+'\')">'+
        '<div class="dzThumb">'+thumb+'<span class="dzBadge">'+esc((r.item_type||'').toUpperCase())+'</span></div>'+
        '<div class="dzBody"><div class="dzName">'+esc(r.title||'')+'</div>'+
        (typeof window.dzSlot === 'function' ? window.dzSlot(r, id, r.file_ext?1:0, 'card') : '')+
        '<div class="dzMeta"><span>'+esc(r.license||'')+'</span>'+
        (r.delivery_days ? '<span>'+esc(String(r.delivery_days))+'d delivery</span>' : '')+
        '</div></div></div>';
    };
  }

  function pfDzOpen(sec, id){
    var arr = sec==='resources' ? (pf.resRows||[]) : sec==='blog' ? (pf.blogRows||[]) : (pf.mktRows||[]);
    var row = arr.find(function(x){ return String(x.id)===String(id); });
    if(row && typeof window.dzOpenRow==='function') window.dzOpenRow(sec, row);
  }

  function pfStillOn(forId){
    return !!pf.profile && String(pf.profile.id) === String(forId);
  }

  var PF_LISTS = {
    resources: {
      table:'resources', host:'pfResGrid', empty:'pfResEmpty', loaded:'resLoaded', rows:'resRows',
      select:function(){
        return 'id,user_id,title,description,category,tags,file_storage_path,file_name,file_ext,file_size,preview_url,license,software,download_count,created_at';
      },
      html:function(rows){ return rows.map(pfDzCard('resources')).join(''); }
    },
    marketplace: {
      table:'marketplace_items', host:'pfMktGrid', empty:'pfMktEmpty', loaded:'mktLoaded', rows:'mktRows',
      select:function(){
        return typeof window.dzSelectFor === 'function'
          ? window.dzSelectFor('marketplace')
          : 'id,user_id,title,description,category,tags,item_type,currency,file_ext,file_size,preview_url,license,delivery_days,created_at';
      },
      html:function(rows){ return rows.map(pfDzCard('marketplace')).join(''); },
      after:function(){ if(typeof window.dzExtras === 'function') window.dzExtras(); }
    },
    blog: {
      table:'blog_posts', host:'pfBlogList', empty:'pfBlogEmpty', loaded:'blogLoaded', rows:'blogRows',
      select:function(){
        return 'id,user_id,title,slug,excerpt,body,cover_url,category,tags,read_minutes,created_at';
      },
      html:function(rows){ return rows.map(pfBlogRow).join(''); }
    }
  };

  async function pfLoadList(kind){
    var cfg = PF_LISTS[kind];
    if(!pf.profile || pf[cfg.loaded]) return;
    var host = document.getElementById(cfg.host), empty = document.getElementById(cfg.empty);
    if(!host) return;
    var forId = String(pf.profile.id);
    if(empty) empty.style.display='none';
    host.innerHTML='<div class="pfEmpty" style="display:block;">Loading…</div>';
    try{
        // RLS hands a visitor every approved row whatever its visibility, so drafts and hidden items are kept off a stranger's page
      var own = !!currentUser && String(currentUser.id) === forId;
      var q = sb.from(cfg.table)
        .select(cfg.select())
        .eq('user_id', pf.profile.id).eq('status','approved');
      if(!own) q = q.eq('visibility','published');
      const{data,error}=await q
        .order('created_at',{ascending:false}).limit(60);
      if(error) throw error;
      if(!pfStillOn(forId)) return;
      var rows = data||[];
      pf[cfg.loaded]=true; pf[cfg.rows]=rows;
      host.innerHTML = cfg.html(rows);
      if(cfg.after) cfg.after();
      if(empty) empty.style.display = rows.length ? 'none' : '';
    }catch(e){
      if(!pfStillOn(forId)) return;
      host.innerHTML=''; if(empty) empty.style.display='';
      showToast('Couldn\u2019t load \u2014 try again');
    }
  }

  function pfBlogRow(r){
    var id = esc(String(r.id));
    var H  = window.dzHelpers || { ago:function(){return '';} };
    var ico = r.cover_url
      ? '<img loading="lazy" decoding="async" src="'+esc(getThumbnailUrl(r.cover_url))+'" alt="">'
      : esc((r.title||'?').charAt(0).toUpperCase());
    var ex = r.excerpt || String(r.body||'').slice(0,140);
    return '<div class="dzRow" onclick="pfDzOpen(\'blog\',\''+id+'\')"><div class="dzRowIco">'+ico+'</div>'+
      '<div style="min-width:0;flex:1"><div class="dzName">'+esc(r.title||'')+'</div>'+
      '<div class="dzMeta" style="margin:.2rem 0 .3rem"><span>'+esc(H.ago(r.created_at))+'</span>'+
      '<span>'+esc(String(r.read_minutes||1))+' min read</span></div>'+
      '<div class="dzHint">'+esc(ex)+'</div></div></div>';
  }

  function thumbStyle(x, y, z){
    var tx = (x!=null && isFinite(+x)) ? +x : 50;
    var ty = (y!=null && isFinite(+y)) ? +y : 50;
    var tz = (z!=null && isFinite(+z)) ? Math.max(1, Math.min(2, +z)) : 1;
    var s = 'object-position:'+tx+'% '+ty+'%';
    if(tz > 1) s += ';transform:scale('+tz+');transform-origin:'+tx+'% '+ty+'%';
    return s;
  }
