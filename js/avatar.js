  var PF_AVB_COOLDOWN_MS = 7*24*60*60*1000;
  var PF_AVB_DIMS = {
    avatar      : { w:480,  h:480 },
    banner      : { w:1200, h:900 },
    commission_1: { w:1200, h:900 },
    commission_2: { w:1200, h:900 }
  };
  var PF_BNR_SLOTS = ['banner', 'commission_1', 'commission_2'];
  var PF_AVB_LABEL = {
    avatar:'Profile photo', banner:'Banner',
    commission_1:'Commission 1', commission_2:'Commission 2'
  };
  var PF_AVB_DIR = {
    avatar:'avatars', banner:'banners',
    commission_1:'commissions', commission_2:'commissions'
  };
  var PF_AVB_INPUT = {
    avatar:'pfAvatarFileInput', banner:'pfBannerFileInput',
    commission_1:'pfCommission_1FileInput', commission_2:'pfCommission_2FileInput'
  };
  function pfClearAvBInputs(){
    for(var k in PF_AVB_INPUT){
      var el = document.getElementById(PF_AVB_INPUT[k]);
      if(el) el.value = '';
    }
  }

  function pfRenderAvatarBanner(){
    if(!pf.profile) return;
    var aImg = document.getElementById('pfAvatarImg');
    var aLetter = document.getElementById('pfAvatarLetter');
    var eaImg = document.getElementById('pfEditAvatarImg');
    var eaLetter = document.getElementById('pfEditAvatarLetter');
    if(pf.profile.avatar_url){
      aImg.src = getThumbnailUrl(pf.profile.avatar_url); aImg.style.display='block'; aLetter.style.display='none';
      eaImg.src = getThumbnailUrl(pf.profile.avatar_url); eaImg.style.display='block'; eaLetter.style.display='none';
    } else {
      aImg.style.display='none'; aLetter.style.display='';
      eaImg.style.display='none'; eaLetter.style.display='';
    }
    PF_BNR_SLOTS.forEach(function(kind, i){
      pfPaintBnrSlot(i, pf.profile[kind + '_url']);
    });
  }

  function pfPaintBnrSlot(i, url){
    var src = url ? getViewUrl(url) : '';
    [['pfBnrImg', 'pfBnrNone'], ['pfEditBnrImg', 'pfEditBnrNone']].forEach(function(pair){
      var img = document.getElementById(pair[0] + i);
      var none = document.getElementById(pair[1] + i);
      if(img){
        if(src){ img.src = src; img.style.display = 'block'; }
        else { img.removeAttribute('src'); img.style.display = 'none'; }
      }
      if(none) none.hidden = !!src;
    });
  }

  function pfBnrStill(){
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function pfBnrIndex(rail){
    var w = rail.clientWidth || 1;
    return Math.max(0, Math.min(PF_BNR_SLOTS.length - 1, Math.round(rail.scrollLeft / w)));
  }
  function pfBnrSyncDots(){
    var rail = document.getElementById('pfBnrRail');
    var dots = document.getElementById('pfBnrDots');
    if(!rail || !dots) return;
    var at = pfBnrIndex(rail);
    var bs = dots.querySelectorAll('.pfBnrDot');
    for(var i = 0; i < bs.length; i++){
      bs[i].classList.toggle('on', i === at);
      if(i === at) bs[i].setAttribute('aria-current', 'true');
      else bs[i].removeAttribute('aria-current');
    }
  }
  function pfBnrGo(i){
    var rail = document.getElementById('pfBnrRail');
    if(!rail || !rail.children[i]) return;
    var left = rail.children[i].offsetLeft - rail.offsetLeft;
    if(rail.scrollTo) rail.scrollTo({ left: left, behavior: pfBnrStill() ? 'auto' : 'smooth' });
    else rail.scrollLeft = left;
  }
  function pfBnrReset(){
    var rail = document.getElementById('pfBnrRail');
    if(!rail) return;
    var prev = rail.style.scrollBehavior;
    rail.style.scrollBehavior = 'auto';
    rail.scrollLeft = 0;
    rail.style.scrollBehavior = prev;
    pfBnrSyncDots();
  }

  document.addEventListener('DOMContentLoaded', function(){
    var rail = document.getElementById('pfBnrRail');
    var dots = document.getElementById('pfBnrDots');
    if(!rail || !dots) return;
    var queued = false;
    rail.addEventListener('scroll', function(){
      if(queued) return;
      queued = true;
      requestAnimationFrame(function(){ queued = false; pfBnrSyncDots(); });
    }, { passive:true });
    dots.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('[data-bnr]');
      if(b) pfBnrGo(+b.getAttribute('data-bnr'));
    });
    window.addEventListener('resize', pfBnrSyncDots);
  });

  function pfAvBCooldownLeft(updatedAt){
    if(!updatedAt) return 0;
    var elapsed = Date.now() - new Date(updatedAt).getTime();
    return Math.max(0, PF_AVB_COOLDOWN_MS - elapsed);
  }
  function pfAvBCooldownMsg(msLeft){
    var days = Math.ceil(msLeft/(24*60*60*1000));
    return 'You can re-upload in '+days+' day'+(days===1?'':'s')+'.';
  }

  function openPfAvBPicker(what, at, input){
    if(!pf.isOwner){ showToast('You can only edit your own profile'); return; }
    var left = pfAvBCooldownLeft(pf.profile && pf.profile[at]);
    if(left>0){ showToast(what+' was updated recently. '+pfAvBCooldownMsg(left)); return; }
    document.getElementById(input).click();
  }
  function openPfAvatarPicker(){ openPfAvBPicker('Profile photo', 'avatar_updated_at', 'pfAvatarFileInput'); }
  function openPfBnrPicker(kind){
    openPfAvBPicker(PF_AVB_LABEL[kind] || 'Image', kind + '_updated_at', PF_AVB_INPUT[kind]);
  }

  function handlePfAvBFile(e, kind){
    var f = e.target.files[0]; if(!f) return;
    if(!f.type.startsWith('image/')){ showToast('Please select an image'); e.target.value=''; return; }
    var r = new FileReader();
    r.onload = function(ev){ openPfAvBCrop(f, ev.target.result, kind); };
    r.readAsDataURL(f);
  }

  var pfAvBCropPending = null;
  var pfAvBCrop = { kind:'avatar', natW:0, natH:0, stageW:280, stageH:280, x:50, y:50, axis:null, dragging:false, sx:0, sy:0, ox:50, oy:50 };
  function openPfAvBCrop(file, dataUrl, kind){
    pfAvBCropPending = file;
    pfAvBCrop.kind = kind;
    var stageEl = document.getElementById('pfAvBCropStage');
    var isAv = (kind === 'avatar');
    stageEl.classList.toggle('cropStage--banner', !isAv);
    document.getElementById('pfAvBCropTitle').textContent = 'Set ' + (PF_AVB_LABEL[kind] || 'Image');
    document.getElementById('pfAvBCropSub').textContent = isAv
      ? 'Drag the photo to choose what shows in the square frame.'
      : 'Drag the photo to choose what shows on the card.';
    var img = document.getElementById('pfAvBCropImg');
    img.onload = function(){
      var rect = stageEl.getBoundingClientRect();
      pfAvBCrop.stageW = rect.width || 280; pfAvBCrop.stageH = rect.height || 280;
      pfAvBCrop.natW = img.naturalWidth; pfAvBCrop.natH = img.naturalHeight;
      var boxRatio = pfAvBCrop.stageW/pfAvBCrop.stageH;
      var srcRatio = pfAvBCrop.natW/pfAvBCrop.natH;
      pfAvBCrop.axis = srcRatio > boxRatio ? 'x' : (srcRatio < boxRatio ? 'y' : null);
      pfAvBCrop.x = 50; pfAvBCrop.y = 50;
      pfAvBCropRender();
      document.getElementById('pfAvBCropMod').classList.add('open');
    };
    img.src = dataUrl;
  }
  function pfAvBCropRender(){
    document.getElementById('pfAvBCropImg').style.objectPosition = pfAvBCrop.x+'% '+pfAvBCrop.y+'%';
  }
  window.dzDragStage('pfAvBCropStage', pfAvBCrop,
    function(){ return !!pfAvBCrop.axis; },
    function(p){
      var boxRatio = pfAvBCrop.stageW/pfAvBCrop.stageH;
      var srcRatio = pfAvBCrop.natW/pfAvBCrop.natH;
      var ratio = pfAvBCrop.axis==='x' ? (srcRatio/boxRatio) : (boxRatio/srcRatio);
      var overflowPx = pfAvBCrop.axis==='x' ? pfAvBCrop.stageW*(ratio-1) : pfAvBCrop.stageH*(ratio-1);
      if(overflowPx <= 0) return;
      var dPx = pfAvBCrop.axis==='x' ? (p.clientX-pfAvBCrop.sx) : (p.clientY-pfAvBCrop.sy);
      var dPct = -(dPx/overflowPx)*100;
      var val = Math.max(0, Math.min(100, (pfAvBCrop.axis==='x'?pfAvBCrop.ox:pfAvBCrop.oy) + dPct));
      if(pfAvBCrop.axis==='x') pfAvBCrop.x = val; else pfAvBCrop.y = val;
      pfAvBCropRender();
    });
  function cancelPfAvBCrop(){
    document.getElementById('pfAvBCropMod').classList.remove('open');
    pfAvBCropPending = null;
    pfClearAvBInputs();
  }
  function confirmPfAvBCrop(){
    if(!pfAvBCropPending) return;
    var kind = pfAvBCrop.kind;
    var dims = PF_AVB_DIMS[kind];
    var natW = pfAvBCrop.natW, natH = pfAvBCrop.natH;
    var targetRatio = dims.w/dims.h;
    var srcRatio = natW/natH;
    var cropW, cropH;
    if(srcRatio > targetRatio){ cropH = natH; cropW = natH*targetRatio; }
    else { cropW = natW; cropH = natW/targetRatio; }
    var cropX = (natW-cropW) * (pfAvBCrop.x/100);
    var cropY = (natH-cropH) * (pfAvBCrop.y/100);
    var canvas = document.createElement('canvas');
    canvas.width = dims.w; canvas.height = dims.h;
    var ctx = canvas.getContext('2d');
    var img = document.getElementById('pfAvBCropImg');
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, dims.w, dims.h);
    var btn = document.getElementById('pfAvBCropBtn');
    btn.disabled = true; btn.textContent = 'SAVING…';
    canvas.toBlob(function(blob){
      doPfAvBUpload(kind, blob).finally(function(){
        btn.disabled = false; btn.textContent = 'Use This';
        document.getElementById('pfAvBCropMod').classList.remove('open');
        pfAvBCropPending = null;
      });
    }, 'image/jpeg', 0.9);
  }
  async function doPfAvBUpload(kind, blob){
    try{
      if(!currentUser){ showToast('Sign in required'); return; }
      var label = PF_AVB_LABEL[kind] || 'Image';
      var left = pfAvBCooldownLeft(pf.profile && pf.profile[kind+'_updated_at']);
      if(left>0){ showToast(label+' was updated recently. '+pfAvBCooldownMsg(left)); return; }
      var oldPath = pf.profile && pf.profile[kind+'_storage_path'];
      var path = (PF_AVB_DIR[kind] || kind+'s')+'/'+currentUser.id+'/'+Date.now()+'.jpg';
      var publicUrl = await s3Upload(BUCKET,path,blob);
      var nowIso = new Date().toISOString();
      var updates = {};
      updates[kind+'_url'] = publicUrl;
      updates[kind+'_storage_path'] = path;
      updates[kind+'_updated_at'] = nowIso;
      var{error:de}=await sb.from('profiles').update(updates).eq('id',currentUser.id);
      if(de) throw de;

      var ledger = (kind==='avatar') ? 'avatar' : (kind==='banner' ? 'banner' : null);
      await dzRecordUpload({
        imageKind: ledger,
        fileKind: null, url: publicUrl, path: path, file: blob
      });

        // new picture is already saved; a failed sweep of the old file is not a failed upload, so keep it out of the catch
      if(oldPath){
        try{ await s3Delete(BUCKET, oldPath); }
        catch(sweep){ console.warn('old '+kind+' not removed:', (sweep && sweep.message) || sweep); }
      }
      if(window.dzCache){
        try{ window.dzCache.invalidateProfile(currentUser.id, pf.profile && pf.profile.username); }catch(e){}
      }
      if(oldPath && window.dzCache && pf.profile && pf.profile[kind+'_url']){
        try{ window.dzCache.purgeImages([pf.profile[kind+'_url']]); }catch(e){}
      }
      Object.assign(pf.profile, updates);
      pfRenderAvatarBanner();
      if(pf.profile.username){
        pfMediaCache[pf.profile.username] = { avatar_url: pf.profile.avatar_url||null, banner_url: pf.profile.banner_url||null };
      }
      // the artist cache behind every card and chip holds the old picture
      if((kind==='avatar' || kind==='banner') &&
         typeof dzArtistCache !== 'undefined' && dzArtistCache && dzArtistCache[currentUser.id]){
        dzArtistCache[currentUser.id][kind+'_url'] = publicUrl;
      }
      if(kind==='avatar'){
        currentUserAvatarUrl = publicUrl;
        syncAuthBtn();
        if(typeof cpAuthors !== 'undefined' && cpAuthors){
          cpAuthors[String(currentUser.id)] = {
            name  : (pf.profile.display_name || pf.profile.username || 'User'),
            avatar: publicUrl
          };
          try{ if(typeof cpRender === 'function') cpRender(); }catch(e){}
        }
      }
      showToast(label+' updated');
    }catch(err){ console.error('Error: '+err.message);
      if(window.meritDenied && window.meritDenied(err, 'upload')) return;
      showToast(safeErr(err, 'Upload failed \u2014 try again')); }
    finally{ pfClearAvBInputs(); }
  }

  let tT;
  function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(tT);tT=setTimeout(()=>t.classList.remove('show'),3000);}
