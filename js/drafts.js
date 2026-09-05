  var UPDR_TTL = 7*24*60*60*1000, UPDR_MAX = 12, UPDR_SLOTS = 4;
  var updrActiveId = null;
  var updrUrls = [];
  var updrStore = window.dzIdb('digiartz-drafts', 'drafts');
  var updrTx = updrStore.run;
  var updrAll = updrStore.all;
  var updrDel = updrStore.del;
  async function updrSave(){
    if(pfGuestGate()) return;
    if(document.getElementById('pfUpEditId').value) return;
    if(!pf.upFile){ showToast('Pick an image first'); return; }
    try{
      var all = await updrAll();
      if(!updrActiveId && (all||[]).length >= UPDR_MAX){ showToast('Draft limit reached ('+UPDR_MAX+') — delete one first'); return; }
      var rec = {
        id: updrActiveId || ('dr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
        name: document.getElementById('pfUpNm').value.trim(),
        desc: document.getElementById('pfUpDesc').value.trim(),
        tags: document.getElementById('pfUpTags').value,
        cats: (pf.upCats||[]).slice(),
        software: document.getElementById('pfUpSoftware').value || '',
        file: pf.upFile, fname: pf.upFile.name || 'draft.png', ftype: pf.upFile.type || 'image/png',
        pages: (pf.upPageFiles||[]).slice(),
        thumb: pf.upThumbFocus ? {x:pf.upThumbFocus.x, y:pf.upThumbFocus.y, z:pf.upThumbFocus.z||1} : {x:50,y:50,z:1},
        extra: (typeof dzArtSnapshot === 'function') ? dzArtSnapshot() : null,
        created: Date.now()
      };
      await updrTx('readwrite', function(st){ st.put(rec); });
      updrActiveId = null;
      showToast('Saved to drafts, kept for 7 days');
      openPfUpload();
    }catch(e){ console.error('draft save: '+(e&&e.message)); showToast('Could not save draft on this device'); }
  }
  var upPvUrl = null;
  function upPvRow(label, val){
    if(val===null || val===undefined || val==='') return '';
    return '<div class="upPvRow"><div class="upPvLbl">'+esc(label)+'</div><div class="upPvVal">'+esc(String(val))+'</div></div>';
  }
  function upPvChips(label, arr){
    var list = (arr||[]).filter(function(v){ return v!==null && v!==undefined && String(v).trim()!==''; });
    if(!list.length) return '';
    return '<div class="upPvRow"><div class="upPvLbl">'+esc(label)+'</div><div class="upPvChips">'+
      list.map(function(v){ return '<span class="upPvChip">'+esc(String(v).trim())+'</span>'; }).join('')+'</div></div>';
  }
  function upPvClose(){
    document.getElementById('upPvMod').classList.remove('open');
    if(upPvUrl){ try{ URL.revokeObjectURL(upPvUrl); }catch(_){} upPvUrl = null; }
  }
  function upPvOpen(d){
    document.getElementById('upPvKind').textContent = d.label || '';
    var img = document.getElementById('upPvImg');
    img.src = d.src || '';
    img.alt = d.name || '';
    document.getElementById('upPvMeta').innerHTML =
      upPvRow('Title', d.name || 'Untitled') +
      upPvRow('Description', d.desc || '') +
      upPvChips('Categories', d.cats) +
      upPvChips('Tags', d.tags) +
      upPvRow('Software', d.software || '') +
      (d.pages ? upPvRow('Extra images', d.pages + (d.pages===1?' page':' pages')) : '');
    document.getElementById('upPvFoot').innerHTML = d.footHtml || '';
    document.getElementById('upPvMod').classList.add('open');
  }
  async function updrPreview(id){
    try{
      var rec = await updrTx('readonly', function(st){ return st.get(id); });
      if(!rec){ showToast('Draft not found'); updrLoadStrip(); return; }
      if(upPvUrl){ try{ URL.revokeObjectURL(upPvUrl); }catch(_){} }
      upPvUrl = URL.createObjectURL(rec.file);
      var daysLeft = Math.max(1, Math.ceil((rec.created + UPDR_TTL - Date.now())/(24*60*60*1000)));
      var _drSw = (rec.extra && rec.extra.software_list)
        ? String(rec.extra.software_list).split('\n').filter(Boolean).join(', ')
        : (rec.software || '');
      upPvOpen({
        label:'DRAFT', src:upPvUrl, name:rec.name, desc:rec.desc,
        tags:(rec.tags||'').split(','), cats:rec.cats, software:_drSw,
        pages:(rec.pages&&rec.pages.length)||0,
        footHtml:'<span class="upPvWhen">Auto-deletes in <b>'+daysLeft+'d</b></span>'+
          '<button class="upBtnSec" onclick="upPvClose();updrResume(\''+esc(String(id))+'\')">Edit</button>'+
          '<button class="upBtnPri" onclick="updrPublishNow(\''+esc(String(id))+'\')">📤 Upload Now</button>'
      });
    }catch(e){ showToast('Could not open that draft'); }
  }
  async function updrPublishNow(id){
    upPvClose();
    await updrResume(id);
    setTimeout(function(){ doPfUp(); }, 350);
  }
  async function uschPreview(id){
    try{
      var res = await sb.from('scheduled_uploads')
        .select('id,name,description,tags,category,software,image_url,publish_at,publish_error,pages')
        .eq('id', id).single();
      var r = res && res.data;
      if(!r){ showToast('Schedule not found'); uschLoad(); return; }
      var foot;
      if(r.publish_error){
        foot = '<span class="upPvWhen bad">'+esc(r.publish_error)+'</span>'+
               '<button class="upBtnSec" onclick="upPvClose();uschCancel(\''+esc(String(id))+'\')">Dismiss</button>';
      }else{
        foot = '<span class="upPvWhen">Publishes in <b>'+esc(uschLeft(r.publish_at))+'</b> \u00B7 '+esc(uschFmt(r.publish_at))+'</span>'+
               '<button class="upBtnSec" onclick="upPvClose();uschCancel(\''+esc(String(id))+'\')">Cancel schedule</button>';
      }
      upPvOpen({
        label:'SCHEDULED', src:r.image_url, name:r.name, desc:r.description,
        tags:r.tags, cats:r.category, software:r.software,
        pages:(r.pages&&r.pages.length)||0, footHtml:foot
      });
    }catch(e){ showToast('Could not open that schedule'); }
  }

  var pfSched = { y:null, m:null, d:null, vy:0, vm:0 };
  var PF_SCHED = {
    dd:'pfUpSchedDd', h:'pfUpSchedH', m:'pfUpSchedM', grid:'pfUpSchedGrid',
    mon:'pfUpSchedMon', lbl:'pfUpSchedLbl', hint:'pfUpSchedHint', val:'pfUpSched',
    pick:'pfSchedPick', iso:true, fmt:function(v){ return uschFmt(v); },
    tail:'verified now, re-checked at publish.'
  };
  function pfSchedToggle(e){
    if(e){ e.stopPropagation(); }
    var dd = document.getElementById('pfUpSchedDd');
    if(typeof dzCloseMenus === 'function') dzCloseMenus(dd);
    var open = dd.classList.toggle('open');
    if(open){
      closePfCatDd();
      if(pfSched.y===null){
        var n = new Date();
        pfSched.vy = n.getFullYear(); pfSched.vm = n.getMonth();
      }
      pfSchedBuildTime();
      pfSchedRender();
    }
  }
  function pfSchedClose(){ window.dzSchedUI.close(PF_SCHED); }
  window.dzSchedUI.watchOutside(PF_SCHED);
  function pfSchedBuildTime(){ window.dzSchedUI.hours(PF_SCHED); }
  function pfSchedNav(delta, e){
    if(e){ e.stopPropagation(); }
    window.dzSchedUI.nav(pfSched, delta);
    pfSchedRender();
  }
  function pfSchedRender(){ window.dzSchedUI.grid(PF_SCHED, pfSched); }
  function pfSchedPick(y, m, d, e){
    if(e){ e.stopPropagation(); }
    pfSched.y=y; pfSched.m=m; pfSched.d=d;
    pfSchedRender();
    pfSchedApply();
  }
  function pfSchedApply(){ window.dzSchedUI.apply(PF_SCHED, pfSched); }
  function pfSchedClear(e){
    if(e){ e.stopPropagation(); }
    pfSched.y = pfSched.m = pfSched.d = null;
    document.getElementById('pfUpSched').value = '';
    pfSchedRender();
    pfSchedHint();
    pfSchedClose();
  }
  function pfSchedDone(e){
    if(e){ e.stopPropagation(); }
    pfSchedClose();
  }
  function pfSchedReset(){
    pfSched.y = pfSched.m = pfSched.d = null;
    var n = new Date();
    pfSched.vy = n.getFullYear(); pfSched.vm = n.getMonth();
    var el = document.getElementById('pfUpSched'); if(el) el.value = '';
    pfSchedClose();
    pfSchedHint();
  }
  function pfSchedHint(){ window.dzSchedUI.hint(PF_SCHED); }
  function uschPicked(){ return window.dzSchedUI.picked(PF_SCHED); }
  function uschFmt(iso){ return window.dzSchedUI.fmt(iso, false); }
  function uschLeft(iso){
    var ms = new Date(iso).getTime() - Date.now();
    if(ms <= 0) return 'due';
    var m = Math.round(ms/60000);
    if(m < 60) return m+'m';
    var h = Math.round(m/60);
    if(h < 24) return h+'h';
    return Math.round(h/24)+'d';
  }
  function uschGhost(){ return window.dzGhost('\u23F1', '--'); }
  async function uschLoad(){
    var sec = document.getElementById('upSchedSec');
    var row = document.getElementById('upSchedRow');
    if(!sec || !row) return;
    var edEl = document.getElementById('pfUpEditId');
    if(edEl && edEl.value) return;
    sec.style.display = '';
    var list = [];
    if(currentUser && typeof sb!=='undefined'){
      try{
        var res = await sb.from('scheduled_uploads')
          .select('id,name,publish_at,image_url,storage_path,thumb_x,thumb_y,thumb_zoom,publish_error')
          .eq('user_id', currentUser.id).order('publish_at', {ascending:true}).limit(24);
        list = (res && res.data) ? res.data : [];
      }catch(e){ list = []; }
    }
    row.innerHTML = list.map(function(r){
      var bad = !!r.publish_error;
      var tip = esc(r.name||'Untitled') + ' \u00B7 ' + (bad ? esc(r.publish_error) : esc(uschFmt(r.publish_at)));
      return '<div class="upDraftCard'+(bad?' upSchedBad':'')+'" onclick="uschPreview(\''+esc(String(r.id))+'\')" role="button" tabindex="0" title="'+tip+'" aria-label="'+(bad?'Failed: ':'Scheduled: ')+esc(r.name||'Untitled')+'">'+
        '<img src="'+esc(getThumbnailUrl(r.image_url))+'" alt="" style="'+thumbStyle(r.thumb_x, r.thumb_y, r.thumb_zoom)+'">'+
        '<button type="button" class="upDraftX" onclick="uschCancel(\''+esc(String(r.id))+'\',event)" aria-label="'+(bad?'Dismiss':'Cancel schedule')+'">✕</button>'+
        '<span class="upDraftExp'+(bad?'':' upSchedMark')+'">'+(bad?'!':uschLeft(r.publish_at))+'</span>'+
      '</div>';
    }).join('') + Array(Math.max(0, UPDR_SLOTS - list.length) + 1).join(uschGhost());
  }
  async function uschCancel(id, e){
    if(e){ e.stopPropagation(); }
    try{
      var got = await sb.from('scheduled_uploads').select('storage_path').eq('id', id).single();
      var del = await sb.from('scheduled_uploads').delete().eq('id', id);
      if(del && del.error) throw del.error;
      if(got && got.data && got.data.storage_path){
        try{ await s3Delete(BUCKET, got.data.storage_path); }catch(_){}
      }
      uschLoad();
      showToast('Schedule cancelled');
    }catch(err){ showToast('Could not cancel that schedule'); }
  }

  function updrGhost(){ return window.dzGhost('\u2726'); }
  async function updrLoadStrip(){
    var sec = document.getElementById('upDraftSec');
    var row = document.getElementById('upDraftRow');
    if(!sec || !row) return;
    var edEl = document.getElementById('pfUpEditId');
    if(edEl && edEl.value){ return; }
    sec.style.display = '';
    var list = [];
    if(currentUser && window.indexedDB){
      try{
        list = (await updrAll()) || [];
        var now = Date.now(), dead = list.filter(function(r){ return (now - r.created) > UPDR_TTL; });
        for(var i=0;i<dead.length;i++){ await updrDel(dead[i].id); }
        if(dead.length) list = list.filter(function(r){ return (now - r.created) <= UPDR_TTL; });
      }catch(e){ list = []; }
    }
    updrUrls.forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(_){}}); updrUrls = [];
    list.sort(function(a,b){ return b.created - a.created; });
    row.innerHTML = list.map(function(r){
      var daysLeft = Math.max(1, Math.ceil((r.created + UPDR_TTL - Date.now())/(24*60*60*1000)));
      var u = URL.createObjectURL(r.file); updrUrls.push(u);
      return '<div class="upDraftCard" onclick="updrPreview(\''+r.id+'\')" role="button" tabindex="0" title="'+esc(r.name||'Untitled draft')+'" aria-label="Preview draft: '+esc(r.name||'Untitled draft')+'">'+
        '<img src="'+u+'" alt="" style="'+thumbStyle(r.thumb&&r.thumb.x, r.thumb&&r.thumb.y, r.thumb&&r.thumb.z)+'">'+
        '<button type="button" class="upDraftX" onclick="updrRemove(\''+r.id+'\',event)" aria-label="Delete draft">✕</button>'+
        '<span class="upDraftExp">'+daysLeft+'d</span>'+
      '</div>';
    }).join('') + Array(Math.max(0, UPDR_SLOTS - list.length) + 1).join(updrGhost());
  }
  async function updrResume(id){
    try{
      var rec = await updrTx('readonly', function(st){ return st.get(id); });
      if(!rec){ showToast('Draft not found'); updrLoadStrip(); return; }
      openPfUpload();
      updrActiveId = rec.id;
      pf.upFile = new File([rec.file], rec.fname, {type:rec.ftype});
      pf.upThumbFocus = rec.thumb || {x:50,y:50,z:1};
      if(typeof dzAutoScan === 'function') dzAutoScan('artwork');
      document.getElementById('pfUpNm').value = rec.name||'';
      document.getElementById('pfUpDesc').value = rec.desc||'';
      pfUpdateCount('pfUpNm','pfUpNmCount',100);
      pfUpdateCount('pfUpDesc','pfUpDescCount',5000);
      pfSetTagsFromArray((rec.tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean));
      pfSetCats(rec.cats&&rec.cats.length?rec.cats:['others']);
      if(typeof pfSetSoftware==='function') pfSetSoftware(rec.software||'');
      if(rec.extra && typeof dzArtRestore === 'function') dzArtRestore(rec.extra);
      var u = URL.createObjectURL(pf.upFile); updrUrls.push(u);
      var p = document.getElementById('pfUpPrev');
      p.src = u;
      p.style.cssText = thumbStyle(pf.upThumbFocus.x, pf.upThumbFocus.y, pf.upThumbFocus.z);
      pfPaintPicked({
        name: rec.name || (pf.upFile && pf.upFile.name) || 'Draft image',
        size: pf.upFile && pf.upFile.size,
        note: 'From your draft'
      });
      if(typeof upGrowAll === 'function') upGrowAll();
      if(rec.pages && rec.pages.length){
        handlePfPagesFile({target:{files:rec.pages.map(function(b,i){ return new File([b], 'page'+(i+1)+'.png', {type:b.type||'image/png'}); })}});
      }
      showToast('Draft loaded, finish it up');
    }catch(e){ console.error('draft resume: '+(e&&e.message)); showToast('Could not load that draft'); }
  }
  async function updrRemove(id, e){
    if(e){ e.stopPropagation(); }
    try{
      await updrDel(id);
      if(updrActiveId===id) updrActiveId=null;
      updrLoadStrip();
      showToast('Draft deleted');
    }catch(err){ showToast('Could not delete draft'); }
  }

  var pfCropPending = null;
  var pfCrop = { natW:0, natH:0, stage:280, x:50, y:50, z:1, axis:null, dragging:false, sx:0, sy:0, ox:50, oy:50 };
  function openPfCrop(file, dataUrl, seed){
    pfCropPending = file;
    var img = document.getElementById('pfCropImg');
    var ready = function(){
      var stageEl = document.getElementById('pfCropStage');
      pfCrop.stage = stageEl.getBoundingClientRect().width || 280;
      pfCrop.natW = img.naturalWidth; pfCrop.natH = img.naturalHeight;
      pfCrop.axis = (pfCrop.natW/pfCrop.natH) > 1 ? 'x' : (pfCrop.natW/pfCrop.natH) < 1 ? 'y' : null;
      pfCrop.x = (seed && isFinite(+seed.x)) ? Math.max(0,Math.min(100,+seed.x)) : 50;
      pfCrop.y = (seed && isFinite(+seed.y)) ? Math.max(0,Math.min(100,+seed.y)) : 50;
      pfCrop.z = (seed && isFinite(+seed.z)) ? Math.max(1,Math.min(2,+seed.z)) : 1;
      var zs = document.getElementById('pfCropZoom');
      if(zs) zs.value = Math.round(pfCrop.z*100);
      pfCropRender();
      document.getElementById('pfCropMod').classList.add('open');
    };
    img.onload = ready;
    img.src = dataUrl;
    if(img.complete && img.naturalWidth) ready();
  }
  function reopenPfCrop(){
    var prev = document.getElementById('pfUpPrev');
    if(!pf.upFile || !prev.src){ showToast('Choose an image first'); return; }
    openPfCrop(pf.upFile, prev.src, pf.upThumbFocus);
  }
  function pfCropRender(){
    var img = document.getElementById('pfCropImg');
    img.style.objectPosition = pfCrop.x+'% '+pfCrop.y+'%';
    img.style.transform = pfCrop.z>1 ? 'scale('+pfCrop.z+')' : '';
    img.style.transformOrigin = pfCrop.z>1 ? (pfCrop.x+'% '+pfCrop.y+'%') : '';
  }
  function pfCropSetZoom(v){
    pfCrop.z = Math.max(1, Math.min(2, (+v||100)/100));
    pfCropRender();
  }
  function pfCropNudgeZoom(d){
    var zs = document.getElementById('pfCropZoom');
    if(!zs) return;
    var v = Math.max(100, Math.min(200, (+zs.value||100) + d));
    zs.value = v;
    pfCropSetZoom(v);
  }
  window.dzDragStage('pfCropStage', pfCrop,
    function(){ return !!pfCrop.axis || pfCrop.z > 1; },
    function(p){
      var rx = pfCrop.natW>=pfCrop.natH ? pfCrop.natW/pfCrop.natH : 1;
      var ry = pfCrop.natH>pfCrop.natW ? pfCrop.natH/pfCrop.natW : 1;
      var oxPx = pfCrop.stage*(rx*pfCrop.z-1);
      var oyPx = pfCrop.stage*(ry*pfCrop.z-1);
      if(oxPx<=0 && oyPx<=0) return;
      if(oxPx>0) pfCrop.x = Math.max(0, Math.min(100, pfCrop.ox - ((p.clientX-pfCrop.sx)/oxPx)*100));
      if(oyPx>0) pfCrop.y = Math.max(0, Math.min(100, pfCrop.oy - ((p.clientY-pfCrop.sy)/oyPx)*100));
      pfCropRender();
    });
  function cancelPfCrop(){
    document.getElementById('pfCropMod').classList.remove('open');
    pfCropPending = null;
    document.getElementById('pfUpF').value = '';
  }
  function confirmPfCrop(){
    pf.upFile = pfCropPending;
    if(typeof dzAutoScan === 'function') dzAutoScan('artwork');
    pf.upThumbFocus = { x: Math.round(pfCrop.x), y: Math.round(pfCrop.y), z: Math.round(pfCrop.z*100)/100 };
    var p = document.getElementById('pfUpPrev');
    p.src = document.getElementById('pfCropImg').src;
    p.style.cssText = thumbStyle(pfCrop.x, pfCrop.y, pfCrop.z);
    pfPaintPicked({
      name: (pf.upFile && pf.upFile.name) || 'Selected image',
      size: pf.upFile && pf.upFile.size
    });
    document.getElementById('pfCropMod').classList.remove('open');
    pfCropPending = null;
  }
  var PF_PAGES_MAX = 10;
  function handlePfPagesFile(e){
    if(pfGuestGate(e)) return;
    var picked = Array.from(e.target.files||[]);
    if(!Array.isArray(pf.upPageFiles)) pf.upPageFiles = [];
    var room = Math.max(0, PF_PAGES_MAX - pf.upPageFiles.length);
    var files = [], overSize = false;
    picked.forEach(function(f){
      if(f.size > dzImageMax()){ overSize = true; return; }
      if(files.length < room) files.push(f);
    });
    if(overSize) showToast('Each image has to be ' + dzImageMaxMb() + 'MB or under');
    else if(files.length < picked.length) showToast('That is the limit — ' + PF_PAGES_MAX + ' extra images');
    if(!files.length){ e.target.value = ''; return; }
    pf.upPageFiles = pf.upPageFiles.concat(files);
    var wrap = document.getElementById('pfPagesPreview');
    files.forEach(function(f){
      var r = new FileReader();
      r.onload = function(ev){
        var img = document.createElement('img');
        img.src = ev.target.result;
        wrap.appendChild(img);
      };
      r.readAsDataURL(f);
    });
  }
  var pfDzEl = document.getElementById('pfDz');
  if(pfDzEl){
    ['dragenter','dragover'].forEach(function(ev){ pfDzEl.addEventListener(ev,function(e){e.preventDefault();pfDzEl.classList.add('over');}); });
    ['dragleave','drop'].forEach(function(ev){ pfDzEl.addEventListener(ev,function(e){e.preventDefault();pfDzEl.classList.remove('over');}); });
    pfDzEl.addEventListener('drop',function(e){ var f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) handlePfFile({target:{files:[f]}}); });
  }

  async function doPfUp(){
    if(pfGuestGate()) return;
    var editIdEl = document.getElementById('pfUpEditId');
    var editId = editIdEl ? editIdEl.value : '';
    var nm = document.getElementById('pfUpNm').value.trim();
    var desc = document.getElementById('pfUpDesc').value.trim();
    var tags = document.getElementById('pfUpTags').value.split(',').map(function(t){return t.trim();}).filter(Boolean);
    var extra = (typeof dzArtValues === 'function') ? dzArtValues() : {};
    var software = (extra.software_list && extra.software_list[0]) || '';

    if(!nm){ showToast('Enter a title'); return; }
    if(nm.length < 3){ showToast('The title needs at least 3 characters'); return; }
    if(!editId && !pf.upFile){ showToast('Select an image'); return; }
    if(!desc){ showToast('Add a description'); return; }
    if(desc.length < 20){ showToast('The description needs at least 20 characters'); return; }
    if(!tags.length){ showToast('Add at least one tag'); return; }
    if(typeof dzArtValidate === 'function'){
      var bad = dzArtValidate();
      if(bad){
        if(typeof dzFieldFail === 'function') dzFieldFail('artwork', bad.k, bad.msg);
        else showToast(bad.msg);
        return;
      }
    }
    var _sched = window.dzVisibilitySchedule(extra.visibility, uschPicked(),
                                             'artwork is not shown');
    if(_sched.error){ showToast(_sched.error); return; }
    var _when = _sched.when;
    extra.visibility = _sched.vis;
    var btn = document.getElementById('pfUpBtn');
    btn.disabled = true;
    try{
      if(editId){
        btn.textContent='SAVING…';
        var editCats = pf.upCats.length ? pf.upCats : ['others'];
        var editPatch = {
          name:nm, description:desc||null, tags:tags, category:editCats,
          software:software||null, updated_at:new Date().toISOString()
        };
        ['summary','subject_matter','medium','software_list','license','commercial_use',
         'attribution_required','modification_allowed','credits','process_notes',
         'external_links','comments_allowed','visibility','featured'].forEach(function(k){
          if(k in extra) editPatch[k] = extra[k];
        });
        editPatch.is_mature = !!extra.declared_mature || !!pf.upEditModMature;
        const{error}=await sb.from('artworks').update(editPatch).eq('id',editId);
        if(error) throw error;
        var idx = images.findIndex(function(i){return String(i.id)===String(editId);});
        if(idx!==-1){ images[idx].name=nm; images[idx].description=desc||null; images[idx].tags=tags; images[idx].category=editCats; images[idx].software=software||null; }
        var mwIdx = mw.art.findIndex(function(i){return String(i.id)===String(editId);});
        if(mwIdx!==-1){ mw.art[mwIdx].name=nm; mw.art[mwIdx].description=desc||null; mw.art[mwIdx].tags=tags; mw.art[mwIdx].category=editCats; mw.art[mwIdx].software=software||null; }
        var pgIdx = Array.isArray(pf.galleryRows) ? pf.galleryRows.findIndex(function(i){return String(i.id)===String(editId);}) : -1;
        if(pgIdx!==-1){ pf.galleryRows[pgIdx].name=nm; pf.galleryRows[pgIdx].description=desc||null; pf.galleryRows[pgIdx].tags=tags; pf.galleryRows[pgIdx].category=editCats; pf.galleryRows[pgIdx].software=software||null; }
        pfRenderGallery();
        if(typeof mwRenderArt==='function') mwRenderArt();
        if(typeof renderHome==='function') renderHome();
        if(typeof window.dzArtworkChanged === 'function'){
          await window.dzArtworkChanged(editId, {
            userId: (currentUser && currentUser.id) || null,
            ranking: false
          });
        }
        if(typeof window.dzGalleryStore === 'function') window.dzGalleryStore();
        closePfUpload(); showToast('Artwork updated');
      } else {
        var prevEl = document.getElementById('pfUpPrev');
        var _schedAt = _when;
        upqStart({
          name: nm, desc: desc, tags: tags, software: software,
          extra: extra,
          cats: (pf.upCats && pf.upCats.length) ? pf.upCats.slice() : ['others'],
          file: pf.upFile,
          pageFiles: (pf.upPageFiles || []).slice(),
          thumbFocus: pf.upThumbFocus ? { x: pf.upThumbFocus.x, y: pf.upThumbFocus.y, z: pf.upThumbFocus.z || 1 } : { x: 50, y: 50, z: 1 },
          preview: (prevEl && prevEl.src) ? prevEl.src : '',
          albums: (pf.upAlbums || []).slice(),
          publishAt: _schedAt
        });
        if(updrActiveId){ updrDel(updrActiveId); updrActiveId = null; }
        if(_schedAt){
          openPfUpload();
          showToast('Scheduled, publishes ' + uschFmt(_schedAt));
          return;
        }
        pfUpResetSession();
        closePfUpload();
        openOwnProfile();
        if(typeof bnSetActive==='function') bnSetActive('bnProfile');
        showToast('Verifying your artwork, watch it on your profile');
      }
    }catch(err){ console.error('Error: '+err.message);
      if(window.meritDenied && window.meritDenied(err, 'upload')) return;
      showToast(safeErr(err, 'Upload failed \u2014 try again')); }
    finally{ btn.disabled=false; btn.textContent = editId ? '📤 Save Changes' : '📤 Upload Artwork'; }
  }
