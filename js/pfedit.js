  function openPfEditPage(){
    if(!pf.isOwner || !pf.profile){ showToast('You can only edit your own profile'); return; }
    document.getElementById('pfEditDisplayName').value = pf.profile.display_name || '';
    document.getElementById('pfEditUsername').value = pf.profile.username || '';
    (function(){
      var uIn = document.getElementById('pfEditUsername');
      var uHint = document.getElementById('pfEditUsernameHint');
      var next = pfUsernameNextChange();
      if(next){
        uIn.disabled = true;
        if(uHint){ uHint.style.display=''; uHint.textContent = 'You can change your @handle again on ' + pfFormatDate(next.toISOString()) + '.'; }
      } else {
        uIn.disabled = false;
        if(uHint){ uHint.style.display=''; uHint.textContent = 'Your @handle can be changed once every 90 days.'; }
      }
    })();
    document.getElementById('pfEditBio').value = pf.profile.bio || '';
    pfUpdateEditBioCount();
    pfRenderAvatarBanner();
    var links = pf.profile.social_links || {};
    PF_SOCIAL_PLATFORMS.forEach(function(p){
      var input = document.getElementById('pfConnect_'+p.key);
      if(input){ input.value = links[p.key] || ''; input.classList.remove('err'); }
    });
    dzPanelOpen('pfEditPage');
  }
  function closePfEditPage(){ dzPanelShut('pfEditPage'); }
  function pfUpdateEditBioCount(){
    var len = document.getElementById('pfEditBio').value.length;
    document.getElementById('pfEditBioCount').textContent = len+'/500';
  }
  document.addEventListener('DOMContentLoaded', function(){
    var ta = document.getElementById('pfEditBio');
    if(ta) ta.addEventListener('input', pfUpdateEditBioCount);
    PF_SOCIAL_PLATFORMS.forEach(function(p){
      var input = document.getElementById('pfConnect_'+p.key);
      if(input) input.addEventListener('input', function(){ input.classList.remove('err'); });
      var lbl = document.querySelector('label[for="pfConnect_'+p.key+'"]');
      if(lbl && !lbl.querySelector('.pfConnectIco')){
        lbl.classList.add('pfBrand--'+p.key);
        lbl.insertAdjacentHTML('afterbegin', pfSocialIcoHtml(p));
      }
    });
  });

  async function savePfEditProfile(){
    if(!pf.isOwner || !pf.profile) return;
    var newUsername = document.getElementById('pfEditUsername').value.trim();
    var newDisplayName = document.getElementById('pfEditDisplayName').value.trim().slice(0,30);
    var newBio = document.getElementById('pfEditBio').value.trim().slice(0,500);
    if(!newUsername){ showToast('Username can\'t be empty'); return; }
    if(newUsername.length>30){ showToast('Username must be 30 characters or fewer'); return; }
    if(!/^[a-zA-Z0-9_.]+$/.test(newUsername)){ showToast('Username can only contain letters, numbers, "_" and "."'); return; }

    var newSocialLinks = {};
    for(var i=0;i<PF_SOCIAL_PLATFORMS.length;i++){
      var p = PF_SOCIAL_PLATFORMS[i];
      var input = document.getElementById('pfConnect_'+p.key);
      var res = pfValidateSocialLink(p, input.value);
      if(!res.ok){
        input.classList.add('err');
        input.scrollIntoView({behavior:'smooth', block:'center'});
        input.focus();
        showToast(res.msg);
        return;
      }
      input.classList.remove('err');
      newSocialLinks[p.key] = res.value;
    }

    var btn = document.getElementById('pfEditSaveBtn');
    btn.disabled = true; btn.textContent = 'SAVING…';
    try{
      var usernameChanged = newUsername.toLowerCase() !== (pf.profile.username||'').toLowerCase();
      var oldUsername = pf.profile.username || '';
      if(usernameChanged){
        var nextChg = pfUsernameNextChange();
        if(nextChg){ showToast('You can change your @handle again on ' + pfFormatDate(nextChg.toISOString())); return; }
        // "_" is a LIKE wildcard and legal in a username: unescaped, "john_doe" read as taken whenever a "johnXdoe" existed
        var taken = newUsername.replace(/[\\%_]/g, '\\$&');
        const{data:existing,error:ce}=await sb.from('profiles').select('id').ilike('username',taken).neq('id',pf.profile.id).limit(1);
        if(ce) throw ce;
        if(existing && existing.length){ showToast('That username is already taken'); return; }
      }
      var updates = { username:newUsername, display_name:newDisplayName||null, bio:newBio||null, social_links:newSocialLinks };
      const{error:de}=await sb.from('profiles').update(updates).eq('id',pf.profile.id);
      if(de) throw de;
      pf.profile.username = newUsername;
      pf.profile.display_name = newDisplayName || null;
      try{
        delete pfRowCache[String(oldUsername||'').toLowerCase()];
        pfRowCache[String(newUsername).toLowerCase()] = pf.profile;
      }catch(e){}
      try{
        if(window.dzCache){
          window.dzCache.invalidateProfile(pf.profile.id, oldUsername);
          window.dzCache.invalidateProfile(pf.profile.id, newUsername);
        }
      }catch(e){}
      pf.profile.bio = newBio;
      pf.profile.social_links = newSocialLinks;
      if(usernameChanged){
        pf.profile.username_changed_at = new Date().toISOString();
      }
      var visibleName = newDisplayName || newUsername;
      document.getElementById('pfUsername').textContent = visibleName;
      var _hnSv=document.getElementById('pfHandle'); if(_hnSv) _hnSv.textContent = '@' + newUsername;
      document.getElementById('pfAvatarLetter').textContent = visibleName.charAt(0).toUpperCase();
      document.getElementById('pfEditAvatarLetter').textContent = visibleName.charAt(0).toUpperCase();
      pfRenderBio();
      pfRenderHeadBio();
      pfRenderConnect();
      if(usernameChanged){
        try{ history.replaceState({profileUser:newUsername},'','/profile/'+encodeURIComponent(newUsername)); }catch(e){}
        try{ await sb.auth.updateUser({ data:{ username:newUsername } }); }catch(e){}
      }
      showToast('Profile updated');
      closePfEditPage();
    }catch(err){
      if(err && /USERNAME_COOLDOWN/.test(err.message||'')){
        var m = /until\s+([0-9T:.\- +]+)/.exec(err.message);
        var when = m ? new Date(m[1].trim()) : null;
        showToast('You can change your @handle again' + (when && isFinite(+when) ? ' on ' + pfFormatDate(when.toISOString()) : ' in a while'));
      } else {
        console.error('Error: '+err.message);
        showToast('Couldn\u2019t save \u2014 try again');
      }
    }
    finally{ btn.disabled=false; btn.textContent='SAVE CHANGES'; }
  }

  document.addEventListener('keydown',e=>{if(e.key==='Escape'){
    var _upg=document.getElementById('upGuideMod');
    if(_upg && _upg.classList.contains('open')){ upGuideClose(); return; }
    var _cmi=document.getElementById('cmInfoPage');
    if(_cmi && _cmi.classList.contains('open')) return;
    var _frd=document.getElementById('frdPage');
    if(_frd && _frd.classList.contains('open')) return;
    closeLB();closeFG();closeFilterPanel();closeAuthMod();closeCommunityPage();closeShowcasePicker();closeSettingsPage();closeSubscription();closePfEditPage();closeProfilePage();closePfUpload();cancelPfAvBCrop();
    cancelPfCrop();closeNotifPage();closeMyWorkPage();
    if(typeof dzOpsClose === 'function') dzOpsClose();
    if(typeof window.dzClosePanel === 'function') window.dzClosePanel();
  }});

  var BN_PARENT = {
    bnFriends:  'bnCommunity',
    bnAnalytics:'bnProfile',
    bnPayouts:  'bnProfile'
  };
  function bnSetActive(id){
    var parent = BN_PARENT[id] || null;
    var nodes = document.querySelectorAll('[data-bn]');
    for(var i=0;i<nodes.length;i++){
      var v = nodes[i].getAttribute('data-bn');
      nodes[i].classList.toggle('bnActive', v === id || (parent && v === parent));
    }
    try{ document.documentElement.setAttribute('data-section', id || ''); }catch(e){}
  }
  window.bnSetActive = bnSetActive;

  function bnCloseAllSections(){
    if(typeof window.dzSetDropBack === 'function') window.dzSetDropBack();
    window.dzCloseAllPanels();
  }

  function bnGo(id, path, open){
    var token = window.dzNavBegin();
    try{
      bnCloseAllSections();
      bnSetActive(id);
      open(token);
    } finally {
      window.dzNavEnd();
      if(path && typeof window.dzRouteAddress === 'function') window.dzRouteAddress(path);
      else if(!path && typeof window.dzRouteAudit === 'function') window.dzRouteAudit();
    }
  }

  function bnGoHome(){
    bnGo('bnHome', null, function(){
      if(!window.bnScrollMemory){
        var hero = document.getElementById('hero');
        if(hero) hero.scrollIntoView({behavior:'smooth', block:'start'});
        else window.scrollTo({top:0, behavior:'smooth'});
      }
    });
  }
  function bnGoGallery(){
    bnGo('bnGallery', '/explore', ddOpenGallery);
  }

  function bnGoUpload(sec){
    bnGo('bnUpload', null, function(){ openPfUpload(sec); });
  }
  function bnGoCommunity(){
    bnGo('bnCommunity', '/community', ddOpenCommunity);
  }
  function bnGoFriends(){
    bnGo('bnFriends', null, function(){
      if(typeof openFriendsPage === 'function') openFriendsPage();
    });
  }
  function bnGoProfile(e){
    if(e) e.stopPropagation();
    bnGo('bnProfile', null, function(token){
      if(currentUser) openOwnProfile(token);
      else openAuthMod();
    });
  }
  bnSetActive('bnHome');

  function ddOpenGallery(){
    filterCat = 'all';
    var catR = document.querySelector('input[name="fltCat"][value="all"]');
    if(catR) catR.checked = true;
    openFG();
  }
  function ddOpenCommunity(){ openCommunityHome(); }
