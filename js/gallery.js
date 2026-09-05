  var FG_SECTIONS = {
    resources:   { label:'Resources',   opts:['Tutorials','Brushes','Textures','Fonts','PSD Files','3D Assets','References','Color Palettes','Mockups','Templates','Icons','Plugins'] },
    blog:        { label:'Blog',        opts:['News','Community','Artist Spotlights','Tips & Guides','Interviews','Reviews','Events','Challenges','Releases','Announcements'] },
    marketplace: { label:'Marketplace', opts:['Artwork','Prints','Digital Downloads','Website Templates','UI Kits','Icons','Brushes','3D Models','Commissions','Services'] },
    jobs:        { label:'Jobs',        opts:['Freelance','Full-Time','Part-Time','Remote','Internship','Contest','Hiring Artists','Collaboration'] },
    cart:        { label:'Cart',        opts:['Shopping Cart','Saved for Later','Checkout','Orders','Downloads','Licenses'] }
  };
  var fgSection = 'artworks';
  var fgFltMode = 'artworks';
  var fgSecFilter = {};
  var fgSecQuery  = {};
  var FG_TITLE = {
    artworks:'ARTWORKS', marketplace:'MARKETPLACE', blog:'BLOG',
    resources:'RESOURCES', jobs:'JOBS'
  };

  function fgSwitchSection(id){
    if(!id || !FG_TITLE[id]) return;
    var fg=document.getElementById('fg'); if(fg) fg.scrollTop=0;
    var secs=document.querySelectorAll('#fg .fgSec'), i;
    for(i=0;i<secs.length;i++) secs[i].classList.toggle('active', secs[i].id==='fgSec-'+id);
    fgSection=id;
    var t=document.getElementById('fgTopTitle');
    if(t) t.textContent = FG_TITLE[id];
    if(typeof window.fgHeadBuild==='function') fgHeadBuild(id);
    fgSyncFilterBtn();
    if(id!=='artworks' && typeof dzSecEnter==='function') dzSecEnter(id);
  }

  function fgOpenFilter(sec){
    var id = (sec && FG_TITLE[sec]) ? sec : fgSection;
    if(id==='artworks'){ openFilterPanel(); return; }
    openSecFilter(id);
  }
  function fgFltOn(sec){
    return sec==='artworks'
      ? !!(typeof window.fgArtFiltered==='function' && window.fgArtFiltered())
      : ((fgSecFilter[sec]||'all') !== 'all');
  }
  function fgSyncFilterBtn(){
    var btns=document.querySelectorAll('#fg .fgHeadFlt');
    for(var i=0;i<btns.length;i++){
      var sec=btns[i].id.replace('fgFltBtn-','');
      if(!FG_TITLE[sec]) continue;
      btns[i].classList.toggle('active', fgFltOn(sec));
    }
  }
  window.fgOpenFilter=fgOpenFilter;
  window.fgSyncFilterBtn=fgSyncFilterBtn;

  var fgSecQTimer={};
  function fgSecSearchInput(id,v){
    fgSecQuery[id]=String(v||'');
    clearTimeout(fgSecQTimer[id]);
    fgSecQTimer[id]=setTimeout(function(){
      if(typeof dzSecRender==='function') dzSecRender(id);
    },140);
  }
  function fgSecSearchClear(id){
    if(typeof window.fgHeadSearchClear==='function'){ fgHeadSearchClear(id); return; }
    fgSecSearchInput(id,'');
  }

  function openSecFilter(id){
    var sec=FG_SECTIONS[id]; if(!sec) return;
    fgFltMode=id;
    var cur=fgSecFilter[id]||'all', html='<div class="fltSec"><div class="fltSecLbl">'+
      sec.label.toUpperCase()+'</div><div class="fltOpts" id="fltSecOpts">'+
      '<label class="fltOpt"><input type="radio" name="fltSec" value="all"'+
      (cur==='all'?' checked':'')+'><div class="fltDot"></div>'+fltIco('all')+
      '<span class="fltLbl">ALL</span></label>';
    for(var i=0;i<sec.opts.length;i++){
      var o=sec.opts[i], v=o.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      html+='<label class="fltOpt"><input type="radio" name="fltSec" value="'+v+'"'+
        (cur===v?' checked':'')+'><div class="fltDot"></div>'+fltIco(v)+
        '<span class="fltLbl">'+o.toUpperCase()+'</span></label>';
    }
    html+='</div></div><div class="fltSep"></div>';
    var body=document.getElementById('fltSecBody');
    if(body){ body.innerHTML=html; body.style.display=''; }
    var art=document.getElementById('fltArtBody'); if(art) art.style.display='none';
    var t=document.getElementById('fltPTitle'); if(t) t.textContent=sec.label.toUpperCase();
    document.getElementById('fgFltOvr').classList.add('open');
    document.getElementById('fgFltPanel').classList.add('open');
  }
  function applySecFilter(){
    var id=fgFltMode, r=document.querySelector('input[name="fltSec"]:checked');
    fgSecFilter[id]=r?r.value:'all';
    fgSyncFilterBtn();
    closeFilterPanel();
    if(typeof window.fgHeadSyncCat==='function') fgHeadSyncCat(id);
    if(typeof dzSecRender==='function') dzSecRender(id);
  }

  window.fgSwitchSection=fgSwitchSection;
  window.fgSecSearchInput=fgSecSearchInput;
  window.fgSecSearchClear=fgSecSearchClear;
  window.openSecFilter=openSecFilter;
  window.applySecFilter=applySecFilter;
  function closeFG(){
    if(typeof closeFgSearch==='function') closeFgSearch(true);
    document.getElementById('fg').classList.remove('open');
    restoreScroll();
    filterCat = 'all';
    var catR = document.querySelector('input[name="fltCat"][value="all"]');
    if(catR) catR.checked = true;
    for(var k in fgSecFilter) fgSecFilter[k] = 'all';
    for(var q in fgSecQuery)  fgSecQuery[q]  = '';
    var boxes = document.querySelectorAll('#fg .fgHeadIn');
    for(var i=0;i<boxes.length;i++){
      boxes[i].value = '';
      boxes[i].parentNode.classList.remove('hasQ');
    }
    if(typeof window.fgHeadSyncAll === 'function') fgHeadSyncAll();
    fgSyncFilterBtn();
  }
  var amCloseTimer = null;
  var avNavList = [];
  var avNavIndex = -1;
  var avLbFromGallery = false;
  var avCurrentArt = null;
  var avReturnUrl = null;
  var avImages = [];

  function avImageList(art, src){
    var list = [];
    if(art && art.image_url) list.push(art.image_url);
    else if(src) list.push(src);
    var pages = art && art.pages;
    if(typeof pages === 'string'){ try{ pages = JSON.parse(pages); }catch(e){ pages = null; } }
    if(Array.isArray(pages)){
      pages.forEach(function(u){ if(u && list.indexOf(u) === -1) list.push(u); });
    }
    return list;
  }

  function avBuildStrip(art, src){
    avImages = avImageList(art, src);
    var rest = document.getElementById('avImgStack');
    if(!rest) return;
    if(avImages.length < 2){
      rest.hidden = true; rest.innerHTML = '';
      return;
    }
    rest.hidden = false;
    rest.innerHTML = avImages.slice(1).map(function(u,i){
      return '<img class="avStackImg" src="'+esc(getViewUrl(u))+'" alt="Image '+(i+2)+
             ' of '+avImages.length+'" loading="lazy" decoding="async" draggable="false">';
    }).join('');
  }

  function avCap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

  function avFormatDate(iso){
    if(!iso) return null;
    try{
      var d = new Date(iso);
      if(isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    }catch(e){ return null; }
  }

  function avRenderMeta(m){
    var rows = [], a = m.art || null;
    if(m.hasArt){
      if(m.category) rows.push(['Category', avCap(m.category)]);
      rows.push(['Medium', (a && a.medium) || 'Digital Art']);
      if(a && a.subject_matter) rows.push(['Subject', a.subject_matter]);
      var sw = (a && a.software_list && a.software_list.length)
        ? a.software_list.join(', ') : m.software;
      if(sw) rows.push(['Software', sw]);
    }
    rows.push(['Resolution', '—', 'avMetaResVal']);
    if(m.hasArt){
      if(a && a.license){
        rows.push(['License', a.license]);
        var rights = [
          a.commercial_use ? 'Commercial use allowed' : 'Personal use only',
          a.modification_allowed ? 'Modification allowed' : '',
          a.attribution_required ? 'Attribution required' : ''
        ].filter(Boolean).join(' · ');
        if(rights) rows.push(['Rights', rights]);
      }
      if(a && a.is_mature) rows.push(['Content', 'Mature · 18+']);
    }
    if(m.hasArt && m.createdAt) rows.push(['Uploaded', avFormatDate(m.createdAt) || '—']);
    if(a && a.updated_at && a.created_at &&
       new Date(a.updated_at) - new Date(a.created_at) > 60000){
      rows.push(['Updated', avFormatDate(a.updated_at) || '—']);
    }
    var list = document.getElementById('avMetaList');
    if(!list) return;
    list.innerHTML = rows.map(function(r){
      var valId = r[2] ? ' id="'+r[2]+'"' : '';
      return '<div class="avMetaRow"><span class="avMetaLbl">'+esc(r[0])+'</span><span class="avMetaVal"'+valId+'>'+esc(r[1])+'</span></div>';
    }).join('');
  }
  function avProseBlock(head, body){
    body = String(body == null ? '' : body).trim();
    if(!body) return '';
    return '<div class="avDiv"></div><div><div class="avBlockH">'+esc(head)+'</div>'+
      '<p class="avDescTxt">'+esc(body).replace(/\n/g,'<br>')+'</p></div>';
  }
  function avRenderExtras(art){
    var sEl = document.getElementById('avSummary');
    if(sEl){
      var sm = (art && art.summary) ? String(art.summary).trim() : '';
      sEl.textContent = sm;
      sEl.hidden = !sm;
    }
    var fEl = document.getElementById('avFeatured');
    if(fEl) fEl.hidden = !(art && art.featured);
    var host = document.getElementById('avExtraBlocks');
    if(host){
      var out = '';
      if(art){
        out += avProseBlock('Process notes', art.process_notes);
        if(Array.isArray(art.credits) && art.credits.length){
          out += '<div class="avDiv"></div><div><div class="avBlockH">Credits</div>'+
            '<div class="avTagList">'+art.credits.map(function(c){
              return '<span class="avTagChip">'+esc(c)+'</span>';
            }).join('')+'</div></div>';
        }
      }
      host.innerHTML = out;
    }
    var links = document.getElementById('avLinkBlocks');
    if(links){
      var lo = art ? window.dzLinkBlock('Links', art.external_links) : '';
      links.innerHTML = lo ? '<div class="avDiv"></div>' + lo : '';
    }
    var off = !!(art && art.comments_allowed === false);
    var bar = document.querySelector('#artModal .avCmBar');
    if(bar) bar.style.display = off ? 'none' : '';
    var note = document.getElementById('avCmOff');
    if(note) note.hidden = !off;
  }

  function avUpdateResolution(w,h){
    var el = document.getElementById('avMetaResVal');
    if(el && w && h) el.textContent = w+' × '+h+' px';
  }

  function avHost(id, afterId){
    var el = document.getElementById(id);
    if(el) return el;
    var scroll = document.querySelector('#artModal .avSideScroll');
    if(!scroll) return null;
    el = document.createElement('div');
    el.id = id;
    var after = afterId && document.getElementById(afterId);
    if(after && after.parentNode === scroll) scroll.insertBefore(el, after.nextSibling);
    else scroll.insertBefore(el, scroll.firstChild);
    return el;
  }

  var avWide = window.matchMedia ? window.matchMedia('(min-width:900px)') : null;
  function avPlaceCard(){
    var card = document.getElementById('avAuthorCard');
    if(!card) return;
    var body = document.querySelector('#artModal .avBody');
    var scroll = document.querySelector('#artModal .avSideScroll');
    if(!body || !scroll) return;
    if(avWide && avWide.matches){
      if(card.parentNode !== scroll) scroll.insertBefore(card, scroll.firstChild);
    } else if(card.parentNode !== body){
      body.insertBefore(card, body.firstChild);
    }
  }
  if(avWide){
    var onAvWide = function(){ avPlaceCard(); };
    if(avWide.addEventListener) avWide.addEventListener('change', onAvWide);
    else if(avWide.addListener) avWide.addListener(onAvWide);
  }

  function avRenderCard(art){
    avPlaceCard();
    var host = avHost('avAuthorCard');
    if(!host || typeof window.dzVwCard !== 'function') return;
    host.innerHTML = window.dzVwCard('avCard', 'closeLB()');
    if(typeof window.dzVwFill === 'function') window.dzVwFill('avCard', art && art.user_id);
  }
  function avRenderRail(art){
    var host = avHost('avActRail', 'avAuthorCard');
    if(!host || typeof window.dzVwActRow !== 'function') return;
    var id = art && art.id ? String(art.id) : '';
    host.innerHTML = window.dzVwActRow([
      { k:'like', c:'red',   cls:'engLike', press:1, label:'Like',
        attrs:' data-id="'+esc(id)+'"', on:'' },
      { k:'bm',   c:'amber', cls:'engBm',   press:1, label:'Bookmark',
        attrs:' data-id="'+esc(id)+'"', on:'' },
      { k:'dl',    c:'green', label:'Download', on:'avDownload()' },
      { k:'share', c:'blue',  label:'Share',    on:'avShare()' },
      { k:'report',c:'red',   label:'Report artwork', on:'avReport()' }
    ]);
    if(typeof window.dzRepaintEng === 'function') window.dzRepaintEng();
  }

  function avSetupNav(id, navSource){
    var prevBtn = document.getElementById('avPrevBtn');
    var nextBtn = document.getElementById('avNextBtn');
    var source = (navSource && navSource.length) ? navSource : images;
    if(!id || !source || !source.length){
      avNavList=[]; avNavIndex=-1;
      if(prevBtn) prevBtn.style.visibility='hidden';
      if(nextBtn) nextBtn.style.visibility='hidden';
      return;
    }
    avNavList = source;
    avNavIndex = avNavList.findIndex(function(a){ return String(a.id)===String(id); });
    var show = avNavIndex!==-1 && avNavList.length>1;
    if(prevBtn) prevBtn.style.visibility = (show && avNavIndex>0) ? 'visible' : 'hidden';
    if(nextBtn) nextBtn.style.visibility = (show && avNavIndex<avNavList.length-1) ? 'visible' : 'hidden';
  }
  function avNav(dir){
    if(avNavIndex===-1 || !avNavList.length) return;
    var next=avNavIndex+dir;
    if(next<0 || next>=avNavList.length) return;
    var art=avNavList[next];
    if(!art) return;
    var cats=catList(art.category).length?catList(art.category):['others'];
    openLB(art.image_url, art.name, cats[0]||'', art.description||'', String(art.id), 'replace', avNavList);
  }

  var avDlBusy=false;

  function avDlFileName(serverName, name){
    var m=/\.([a-z0-9]{2,4})$/i.exec(serverName||'');
    var ext=m ? m[1].toLowerCase() : 'jpg';
    var base=String(name||'').replace(/[^\w\-. ]+/g,'').trim().replace(/\s+/g,'-').slice(0,60);
    if(!base) return serverName || ('artwork.'+ext);
    return base+'.'+ext;
  }

  var avDlSaveBlob = window.dzSaveBlob;

  async function avDownload(){
    if(avDlBusy) return;
    var artId=avCurrentArt && avCurrentArt.id;
    if(!artId){ showToast('Nothing to download'); return; }
    if(!sb){ showToast('Downloads are unavailable right now'); return; }
    if(!currentUser){
      showToast('Sign in to download');
      if(typeof openAuthMod==='function') openAuthMod();
      return;
    }

    var btns=document.querySelectorAll('#artModal .avDlBtn');
    avDlBusy=true;
    btns.forEach(function(b){ b.disabled=true; b.setAttribute('aria-busy','true'); });
    try{
      var token='';
      try{
        var sess=await sb.auth.getSession();
        token=(sess && sess.data && sess.data.session && sess.data.session.access_token) || '';
      }catch(e){}
      if(!token){
        showToast('Sign in to download');
        if(typeof openAuthMod==='function') openAuthMod();
        return;
      }

      var res;
      try{
        res=await fetch('/api/download', {
          method:'POST',
          headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json' },
          body:JSON.stringify({ artwork:String(artId) })
        });
      }catch(e){
        showToast('Download failed \u2014 check your connection');
        return;
      }

      if(!res.ok){
        var info={};
        try{ info=await res.json(); }catch(e){}
        if(res.status===429 && info.reason==='limit'){
          avPaintQuota({signed_in:true, remaining:0, limit:info.limit});
          dzQuotaOpen(info);
        }else if(res.status===429){
          showToast('Too many download requests — wait a moment');
        }else if(res.status===403 && info.reason!=='limit'){
          showToast(info.error || 'Download blocked');
        }else if(res.status===401){
          showToast('Sign in to download');
          if(typeof openAuthMod==='function') openAuthMod();
        }else if(res.status===404){
          showToast('This artwork is no longer available');
        }else{
          showToast(info.error || 'Download failed \u2014 try again');
        }
        return;
      }

      var blob=await res.blob();
      var name=(document.getElementById('lbNm')||{}).textContent || (avCurrentArt && avCurrentArt.name);
      avDlSaveBlob(blob, avDlFileName(dispName(res), name));

      var left=parseInt(res.headers.get('X-Dz-Remaining'),10);
      var cap =parseInt(res.headers.get('X-Dz-Limit'),10);
      if(!isNaN(left)){
        if(!isNaN(cap)) avPaintQuota({signed_in:true, remaining:left, limit:cap});
        showToast(left>0
          ? left+' download'+(left===1?'':'s')+' left today'
          : 'That was your last download for today');
      }
      try{ window.registerArtworkDownload(artId); }catch(e){}
      if(avCurrentArt) avCurrentArt.download_count = (parseInt(avCurrentArt.download_count,10)||0) + 1;
    }finally{
      avDlBusy=false;
      btns.forEach(function(b){ b.disabled=false; b.removeAttribute('aria-busy'); });
    }
  }

  function dispName(res){
    var cd=res.headers.get('Content-Disposition') || '';
    var m=/filename="([^"]+)"/.exec(cd);
    return m ? m[1] : '';
  }

  function avPaintQuota(q){
    var note=document.getElementById('avDlNote');
    if(!note) return;
    if(!q || !q.signed_in || typeof q.remaining!=='number'){ note.hidden=true; note.textContent=''; return; }
    note.textContent=q.remaining+' of '+q.limit+' download'+(q.limit===1?'':'s')+' left today';
    note.classList.toggle('avDlNote--out', q.remaining<=0);
    note.hidden=false;
  }
  function avLoadQuota(){
    if(!sb || !currentUser){ avPaintQuota(null); return; }
    sb.rpc('dz_download_quota').then(function(res){
      if(!res.error) avPaintQuota(res.data);
    }, function(){});
  }

  function dzQuotaOpen(gate){
    var m=document.getElementById('dlQuotaMod');
    if(!m){
      showToast('Daily download limit reached \u2014 upgrade for more');
      if(typeof openSubscription==='function') openSubscription();
      return;
    }
    var lim=gate && typeof gate.limit==='number' ? gate.limit : null;
    var sub=document.getElementById('dlQuotaSub');
    if(sub){
      sub.textContent='You have used '+(lim!==null?'all '+lim+' of your':'all of your')+
                      ' downloads for today. To continue downloading more, you need to buy a subscription.';
    }
    var meta=document.getElementById('dlQuotaMeta');
    if(meta){
      var bits=[];
      if(gate && gate.tier) bits.push((gate.tier==='guest'?'Free':avCap(gate.tier))+' plan');
      if(lim!==null) bits.push(lim+' downloads / day');
      if(gate && gate.resets_at){
        var d=new Date(gate.resets_at);
        if(!isNaN(d)) bits.push('Resets '+d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}));
      }
      meta.textContent=bits.join('  \u00b7  ');
    }
    m.classList.add('open');
    setTimeout(function(){
      var b=m.querySelector('.dlqBtn--go');
      if(b) b.focus();
    },40);
  }
  function dzQuotaClose(){
    var m=document.getElementById('dlQuotaMod');
    if(m) m.classList.remove('open');
  }
  function dzQuotaBuy(){
    dzQuotaClose();
    closeLB();
    if(typeof openSubscription==='function') openSubscription();
  }
  window.dzQuotaOpen=dzQuotaOpen;
  window.dzQuotaClose=dzQuotaClose;
  window.dzQuotaBuy=dzQuotaBuy;
  window.avLoadQuota=avLoadQuota;
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape') return;
    var m=document.getElementById('dlQuotaMod');
    if(m && m.classList.contains('open')){ dzQuotaClose(); e.stopPropagation(); }
  },true);
  function avShare(){
    var url=window.location.href;
    var title=(document.getElementById('lbNm')||{}).textContent||'Artwork';
    if(avCurrentArt && avCurrentArt.id && typeof window.dzAnTrack==='function'){
      window.dzAnTrack('share', String(avCurrentArt.id));
    }
    if(navigator.share){ navigator.share({title:title,url:url}).catch(function(){}); }
    else if(navigator.clipboard){ navigator.clipboard.writeText(url).then(function(){ showToast('Link copied'); }); }
    else { showToast('Share not supported'); }
  }
  var rptArt = null, rptBusy = false;

  function avReport(){
    if(!currentUser){ showToast('Sign in to report artwork'); openAuthMod(); return; }
    if(!avCurrentArt){ showToast('Nothing to report'); return; }
    rptArt = avCurrentArt;
    var m = document.getElementById('rptMod'); if(!m) return;
    var chosen = m.querySelector('input[name="rptReason"]:checked'); if(chosen) chosen.checked = false;
    document.getElementById('rptDetails').value = '';
    document.getElementById('rptBlock').checked = false;
    document.getElementById('rptHide').checked  = false;
    var isOwn = rptArt.user_id && currentUser && rptArt.user_id === currentUser.id;
    document.getElementById('rptBlock').closest('.rptCheck').style.display = isOwn ? 'none' : '';
    m.classList.add('open');
  }

  function rptClose(){
    var m = document.getElementById('rptMod');
    if(m) m.classList.remove('open');
    rptArt = null;
  }

  async function rptSubmit(){
    if(rptBusy || !rptArt) return;
    var m = document.getElementById('rptMod');
    var picked = m.querySelector('input[name="rptReason"]:checked');
    if(!picked){ showToast('Pick a reason first'); return; }
    var btn = document.getElementById('rptSubmit');
    rptBusy = true; btn.disabled = true; btn.textContent = 'SENDING…';
    var art = rptArt;
    try{
      var ins = await sb.from('artwork_reports').insert({
        artwork_id : art.id,
        reporter_id: currentUser.id,
        reason     : picked.value,
        details    : (document.getElementById('rptDetails').value.trim() || null)
      });
      if(ins.error && ins.error.code !== '23505') throw ins.error;

      if(document.getElementById('rptHide').checked){
        await sb.from('hidden_artworks')
          .insert({ user_id: currentUser.id, artwork_id: art.id });
        if(window.markArtworkHidden) window.markArtworkHidden(art.id);
      }
      if(document.getElementById('rptBlock').checked && art.user_id && art.user_id !== currentUser.id){
        if(window.pfFriendBridge && window.pfFriendBridge.block){
          await window.pfFriendBridge.block(art.user_id);
        }
      }
      rptClose();
      showToast('Report submitted — thank you');
    }catch(e){
      showToast('Couldn\u2019t submit report — try again');
    }finally{
      rptBusy = false; btn.disabled = false; btn.textContent = '🚩 Submit Report';
    }
  }

  var dzLightFocus = null;
  function dzLightNat(img){
    if(!img || !img.naturalWidth) return;
    img.style.setProperty('--natW', img.naturalWidth + 'px');
    img.style.setProperty('--natH', img.naturalHeight + 'px');
  }
  function dzLightOpen(src, alt){
    var box = document.getElementById('dzLight');
    var img = document.getElementById('dzLightImg');
    if(!box || !img || !src) return;

    if(img.getAttribute('src') !== src){
      img.removeAttribute('src');
      img.style.removeProperty('--natW');
      img.style.removeProperty('--natH');
      img.src = src;
    }
    img.alt = alt || '';
    dzLightNat(img);
    dzLightFocus = document.activeElement;
    box.classList.add('open');
    try{ box.focus({ preventScroll:true }); }catch(e){}
  }
  function dzLightClose(){
    var box = document.getElementById('dzLight');
    if(!box || !box.classList.contains('open')) return;
    box.classList.remove('open');
    if(typeof restoreScroll === 'function') restoreScroll();
    if(dzLightFocus && dzLightFocus.focus){
      try{ dzLightFocus.focus({ preventScroll:true }); }catch(e){}
    }
    dzLightFocus = null;
  }
  function dzLightIsOpen(){
    var box = document.getElementById('dzLight');
    return !!(box && box.classList.contains('open'));
  }
  window.dzLightOpen   = dzLightOpen;
  window.dzLightClose  = dzLightClose;
  window.dzLightIsOpen = dzLightIsOpen;

  (function(){
    document.addEventListener('DOMContentLoaded', function(){
      var pic = document.getElementById('lbImg');
      if(pic) pic.addEventListener('click', function(){
        dzLightOpen(pic.currentSrc || pic.src, pic.alt);
      });
      var rest = document.getElementById('avImgStack');
      if(rest) rest.addEventListener('click', function(e){
        var img = e.target.closest ? e.target.closest('img') : null;
        if(img) dzLightOpen(img.currentSrc || img.src, img.alt);
      });
      var box = document.getElementById('dzLight');
      if(box) box.addEventListener('click', function(e){
        if(e.target !== document.getElementById('dzLightImg')) dzLightClose();
      });

      var view = document.getElementById('dzView');
      if(view) view.addEventListener('click', function(e){
        var shot = e.target.closest ? e.target.closest('.dzvGallery a') : null;
        if(shot){
          if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
          var pic = shot.querySelector('img');
          e.preventDefault();
          dzLightOpen(shot.getAttribute('href'), pic ? pic.alt : '');
          return;
        }
        var media = e.target.closest ? e.target.closest('.dzvMedia img') : null;
        if(media) dzLightOpen(media.currentSrc || media.src, media.alt);
      });
    });
    window.addEventListener('popstate', function(){ dzLightClose(); });
    document.addEventListener('keydown', function(e){
      if(e.key !== 'Escape' || !dzLightIsOpen()) return;
      dzLightClose();
      e.stopPropagation();
    }, true);
  })();

  (function(){
    function canTake(el, dy){
      if(!el || el.nodeType !== 1) return false;
      var cs = getComputedStyle(el), ov = cs.overflowY;
      if(ov !== 'auto' && ov !== 'scroll') return false;
      var room = el.scrollHeight - el.clientHeight;
      if(room <= 1) return false;
      return dy > 0 ? el.scrollTop < room - 1 : el.scrollTop > 1;
    }
    function wheelPx(e, el){
      if(e.deltaMode === 1){
        var lh = parseFloat(getComputedStyle(el).lineHeight);
        return e.deltaY * (lh > 0 ? lh : 16);
      }
      if(e.deltaMode === 2) return e.deltaY * el.clientHeight;
      return e.deltaY;
    }
    function scrollerUnder(from, dy, stop){
      var el = from;
      while(el && el.nodeType === 1 && el !== stop){
        if(canTake(el, dy)) return el;
        el = el.parentElement;
      }
      return null;
    }

    document.addEventListener('DOMContentLoaded', function(){
      document.addEventListener('wheel', function(e){
        var modal = document.getElementById('artModal');
        if(!modal || !modal.classList.contains('open')) return;
        if(dzLightIsOpen()){ e.preventDefault(); return; }
        var pane = modal.querySelector('.avImgPane');
        var side = modal.querySelector('.avSideScroll');
        if(!pane || !side) return;
        var dy = wheelPx(e, side);
        if(!dy) return;
        if(scrollerUnder(e.target, dy, null)) return;
        var edge = side.getBoundingClientRect().left;
        var first = e.clientX >= edge ? side : pane;
        var second = first === side ? pane : side;
        var t = canTake(first, dy) ? first : (canTake(second, dy) ? second : null);
        if(!t) return;
        t.scrollTop += dy;
        e.preventDefault();
      }, { passive:false });

      var dzv = document.getElementById('dzView');
      if(dzv) dzv.addEventListener('wheel', function(e){
        if(dzLightIsOpen()){ e.preventDefault(); return; }
        var media = dzv.querySelector('.dzvMedia'), col = dzv.querySelector('.dzvCol');
        if(!media || !col) return;
        var dy = wheelPx(e, col);
        if(!dy) return;
        if(scrollerUnder(e.target, dy, dzv)) return;
        var t = canTake(media, dy) ? media : (canTake(col, dy) ? col : null);
        if(!t) return;
        t.scrollTop += dy;
        e.preventDefault();
      }, { passive:false });
    });
  })();

  var AV_GROUND = '#artModal, #artModal .avBox, #artModal .avBody,' +
                  '#artModal .avImgPane, #artModal .avImgViewport,' +
                  '#artModal .avImgStack, #artModal .avSide, #artModal .avSideScroll';
  function avGroundClick(e){
    if(!(window.matchMedia && matchMedia('(min-width:900px)').matches)) return;
    var t = e.target;
    if(t && t.matches && t.matches(AV_GROUND)) closeLB();
  }
  (function(){
    document.addEventListener('DOMContentLoaded', function(){
      var modal = document.getElementById('artModal');
      if(!modal) return;
      modal.addEventListener('click', avGroundClick);
    });
  })();

  function openLB(src,name,cat,desc,id,pushUrl,navSource){
    var art = id ? findArtworkById(id) : null;
    if(!art && id && navSource && navSource.length){
      art = navSource.find(function(a){ return String(a.id)===String(id); }) || null;
    }
    avCurrentArt = art;
    var modal=document.getElementById('artModal');
    var _fgAtOpen = document.getElementById('fg');
    avLbFromGallery = !!(_fgAtOpen && _fgAtOpen.classList.contains('open'));
    if(amCloseTimer){clearTimeout(amCloseTimer);amCloseTimer=null;}
    if(modal) modal.classList.remove('closing');

    (function(){
      var cl=document.getElementById('avCmList');
      if(cl) cl.innerHTML='<div class="avCmEmpty">LOADING\u2026</div>';
      var ci=document.getElementById('avCmIn'); if(ci) ci.value='';
      var st=document.getElementById('avImgStack'); if(st){ st.hidden=true; st.innerHTML=''; }
      var pane=document.querySelector('#artModal .avImgPane');
      if(pane) pane.scrollTop=0;
      var side=document.querySelector('#artModal .avSideScroll');
      if(side) side.scrollTop=0;
      var bdy=document.querySelector('#artModal .avBody');
      if(bdy) bdy.scrollTop=0;
    })();

    var viewport=document.getElementById('avImgViewport');
    if(viewport) viewport.classList.add('loading');
    var imgEl=document.getElementById('lbImg');
    if(imgEl){
      imgEl.removeAttribute('src');
      imgEl.src=getViewUrl(src);
      imgEl.alt=name||'Untitled artwork';
      imgEl.onload=function(){
        if(viewport) viewport.classList.remove('loading');
        avUpdateResolution(imgEl.naturalWidth, imgEl.naturalHeight);
      };
      imgEl.onerror=function(){ if(viewport) viewport.classList.remove('loading'); };
      if(imgEl.complete && imgEl.naturalWidth){
        if(viewport) viewport.classList.remove('loading');
        avUpdateResolution(imgEl.naturalWidth, imgEl.naturalHeight);
      }
    }

    avBuildStrip(art, src);

    document.getElementById('lbNm').textContent=name||'';

    var tags = art ? ((art.tags && art.tags.length) ? art.tags : catList(art.category)) : (cat ? [cat] : []);
    if(typeof catHidden === 'function') tags = (tags||[]).filter(function(t){ return !catHidden(t); });
    var catLabelStr = (cat && !(typeof catHidden === 'function' && catHidden(cat))) ? cat : (tags[0]||'');
    var subType = document.getElementById('avSubType');
    if(subType) subType.textContent = catLabelStr ? avCap(catLabelStr)+' Artwork' : 'Digital Artwork';

    var descEl=document.getElementById('lbDesc');
    var descBlock=document.getElementById('avDescBlock');
    var descDiv=document.getElementById('avDescDiv');
    if(descEl){
      if(desc){ descEl.textContent=desc; descBlock.hidden=false; descDiv.hidden=false; }
      else{ descEl.textContent=''; descBlock.hidden=true; descDiv.hidden=true; }
    }

    var tagListEl=document.getElementById('avTagList');
    var tagsBlock=document.getElementById('avTagsBlock');
    var tagsDiv=document.getElementById('avTagsDiv');
    if(tagListEl){
      if(tags && tags.length){
        tagListEl.innerHTML=tags.map(function(t){return '<span class="avTagChip">'+esc(avCap(t))+'</span>';}).join('');
        tagsBlock.hidden=false; tagsDiv.hidden=false;
      } else { tagListEl.innerHTML=''; tagsBlock.hidden=true; tagsDiv.hidden=true; }
    }

    if(typeof window.dzAdSlot === 'function') window.dzAdSlot('avAdSlot');

    avRenderMeta({ category:catLabelStr, software: art?art.software:null,
                   createdAt: art?art.created_at:null, hasArt: !!art, art: art });
    avRenderExtras(art);
    avRenderCard(art);
    avRenderRail(art);
    avPaintQuota(null); avLoadQuota();
    avSetupNav(id, navSource);
    if(id && typeof window.dzCmLoad==='function') window.dzCmLoad('artwork', String(id), 'avCmList');

    modal.setAttribute('data-state','open');
    modal.classList.add('open');
    document.body.style.overflow='hidden';
    setTimeout(function(){
      var closeBtn=document.querySelector('#artModal .vwClose');
      if(closeBtn) closeBtn.focus({preventScroll:true});
    },50);
    if(id){
      if(pushUrl!==false && window.location.pathname!=='/artwork/'+id){
        try{
          if(pushUrl === 'replace') history.replaceState({artId:id},'', '/artwork/'+id);
          else {
            avReturnUrl = window.location.pathname + window.location.search;
            history.pushState({artId:id},'', '/artwork/'+id);
          }
        }catch(e){}
      }
      updateArtworkSEO({id:id,name:name,description:desc,category:cat,image_url:src});
    }
  }
  function closeLB(keepUrl){
    var modal=document.getElementById('artModal');
    if(!modal || !modal.classList.contains('open'))return;
    dzLightClose();
    modal.classList.add('closing');
    if(amCloseTimer)clearTimeout(amCloseTimer);
    amCloseTimer=setTimeout(function(){
      modal.classList.remove('open');
      modal.classList.remove('closing');
      modal.setAttribute('data-state','closed');
      restoreScroll();
      var imgEl=document.getElementById('lbImg');
      if(imgEl){imgEl.src='';imgEl.alt='';}
      avCurrentArt=null;
    },230);
    if(!keepUrl && /^\/artwork\//.test(window.location.pathname)){
      try{ history.replaceState({},'', avReturnUrl || '/'); }catch(e){}
      avReturnUrl = null;
      resetArtworkSEO();
    }
  }

  function handleArtClick(e,id){
    if(e){
      if(dzModifiedClick(e)) return true;
      e.preventDefault();
    }
    var el = document.querySelector('.gItem[data-id="'+id+'"]');
    if(!el) return false;
    openLB(el.getAttribute('data-fullsrc'), el.getAttribute('data-name'), el.getAttribute('data-cat'), el.getAttribute('data-desc'), id);
    return false;
  }

  function findArtworkById(id){
    if(!id) return null;
    var idS = String(id);
    for(var i=0;i<images.length;i++){
      if(String(images[i].id)===idS) return images[i];
    }
    return null;
  }

  function openArtworkById(id,pushUrl){
    var art = findArtworkById(id);
    if(!art) return false;
    var cats=catList(art.category).length?catList(art.category):['others'];
    openLB(art.image_url, art.name, cats[0]||'', art.description||'', String(art.id), pushUrl);
    return true;
  }

  var SITE_NAME = 'Digiartz';
  var SITE_URL  = 'https://digiartz.net';
  function setMeta(selector, attr, value){
    var el = document.querySelector(selector);
    if(el) el.setAttribute(attr, value);
  }
  function updateArtworkSEO(art){
    if(!art) return;
    var title = (art.name||'Untitled artwork') + ' — ' + SITE_NAME;
    var desc = (art.description && art.description.trim())
      ? art.description.trim().slice(0,300)
      : ('View "'+(art.name||'this artwork')+'"'+(catList(art.category).length?(' in the '+catList(art.category).join(', ')+' collection'):'')+' on '+SITE_NAME+', the digital art community.');
    var url = SITE_URL + '/artwork/' + art.id;
    document.title = title;
    setMeta('meta[name="description"]','content',desc);
    setMeta('link[rel="canonical"]','href',url);
    setMeta('meta[property="og:title"]','content',title);
    setMeta('meta[property="og:description"]','content',desc);
    var ogImg = art.image_url ? imgResize(art.image_url, 1200) : '';
    setMeta('meta[property="og:image"]','content',ogImg);
    setMeta('meta[property="og:url"]','content',url);
    setMeta('meta[property="og:type"]','content','article');
    setMeta('meta[name="twitter:title"]','content',title);
    setMeta('meta[name="twitter:description"]','content',desc);
    setMeta('meta[name="twitter:image"]','content',ogImg);
    setMeta('meta[name="twitter:card"]','content','summary_large_image');
    var ld = document.getElementById('ldArtwork');
    if(!ld){
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'ldArtwork';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      '@context':'https://schema.org',
      '@type':'ImageObject',
      'contentUrl':ogImg,
      'name':art.name||'Untitled artwork',
      'description':desc,
      'url':url,
      'creator':{'@type':'Organization','name':'DigiArtz'},
      'representativeOfPage':true
    });
  }
  function resetArtworkSEO(){
    document.title = SITE_DEFAULT_TITLE;
    setMeta('meta[name="description"]','content',SITE_DEFAULT_DESC);
    setMeta('link[rel="canonical"]','href',SITE_URL+'/');
    setMeta('meta[property="og:title"]','content',SITE_DEFAULT_TITLE);
    setMeta('meta[property="og:description"]','content',SITE_DEFAULT_DESC);
    setMeta('meta[property="og:image"]','content',SITE_DEFAULT_IMAGE);
    setMeta('meta[property="og:url"]','content',SITE_URL+'/');
    setMeta('meta[property="og:type"]','content','website');
    setMeta('meta[name="twitter:title"]','content',SITE_DEFAULT_TITLE);
    setMeta('meta[name="twitter:description"]','content',SITE_DEFAULT_DESC);
    setMeta('meta[name="twitter:image"]','content',SITE_DEFAULT_IMAGE);
    var ld = document.getElementById('ldArtwork');
    if(ld) ld.remove();
  }

  window.addEventListener('popstate', function(){
    avReturnUrl = null;
    var m = window.location.pathname.match(/^\/artwork\/([^/]+)\/?$/);
    var pm = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/);
    if(m){
      var artId = dzDecodeSeg(m[1]);
      var _am = document.getElementById('artModal');
      if(_am && _am.classList.contains('open') &&
         avCurrentArt && String(avCurrentArt.id) === String(artId)) return;
      var _fromGal = avLbFromGallery;
      if(document.getElementById('profilePage').classList.contains('open')) closeProfilePage(false);
      if(_fromGal){
        var _fgBack = document.getElementById('fg');
        if(_fgBack && !_fgBack.classList.contains('open')){
          _fgBack.classList.add('open');
          if(typeof bnSetActive==='function') bnSetActive('bnGallery');
        }
      }
      openArtworkById(artId, false);
    } else if(pm){
      var uname = dzDecodeSeg(pm[1]);
      var _pp = document.getElementById('profilePage');
      var shown = (typeof pf === 'object' && pf && pf.profile) ? pf.profile.username : null;
      if(_pp && _pp.classList.contains('open') && shown &&
         String(shown).toLowerCase() === String(uname).toLowerCase()) return;
      openProfileByUsername(uname, false);
    } else if(window.location.pathname === '/login'){
      openAuthMod();
    } else {
      closeLB();
      resetArtworkSEO();
      if(document.getElementById('profilePage').classList.contains('open')) closeProfilePage(false, true);
      closeAuthMod(false);
    }
  });

  var opsFor = null, opsInflight = null;

  function opsLoad(uid){
    if(opsFor === uid) {
      if(typeof dzOpsMenu === 'function') dzOpsMenu();
      return Promise.resolve(true);
    }
    if(opsInflight) return opsInflight;

    opsInflight = Promise.resolve().then(function(){
      if(typeof sb === 'undefined' || !sb) return false;
      return sb.auth.getSession().then(function(s){
        var session = s && s.data && s.data.session;
        if(!session) return false;
        return fetch('/api/ops', {
          headers: { authorization: 'Bearer ' + session.access_token },
          cache: 'no-store'
        }).then(function(res){
          // JavaScript or nothing: a routing miss falls to the SPA shell with a 200, and a bad blob script never fires onerror
          var ct = res.headers.get('content-type') || '';
          return (res.ok && /javascript|ecmascript/i.test(ct)) ? res.text() : null;
        }).then(function(code){
          if(!code) return false;
          if(opsFor && typeof dzOpsReset === 'function') dzOpsReset();
          var url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
          return new Promise(function(ok, no){
            var el = document.createElement('script');
            el.src = url;
            el.onload  = function(){ URL.revokeObjectURL(url); ok(true); };
            el.onerror = function(){ URL.revokeObjectURL(url); no(new Error('load failed')); };
            document.head.appendChild(el);
          });
        });
      });
    }).then(function(ok){
      opsInflight = null;
      if(ok) opsFor = uid;
      return !!ok;
    }, function(){ opsInflight = null; return false; });

    return opsInflight;
  }

  function syncAdmBtn(){
    var staff   = typeof dzIsStaff   === 'function' && dzIsStaff();
    var partner = typeof dzIsPartner === 'function' && dzIsPartner();
    var uid = (window.currentUser && currentUser.id) ? String(currentUser.id) : null;

    if(!uid || (!staff && !partner)){
      if(opsFor && typeof dzOpsReset === 'function') dzOpsReset();
      else {
        var b = document.getElementById('smAdmBtn');
        if(b && b.parentNode) b.parentNode.removeChild(b);
      }
      opsFor = null;
      return;
    }
    opsLoad(uid);
  }
