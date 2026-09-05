  var MW_TABS = ['art', 'marketplace', 'blog', 'resources'];
  var mw = { art: [], tab: 'art', rows: {}, loaded: {} };

  var MW_SEC = {
    marketplace: {
      table:'marketplace_items', noun:'listing', done:'Listing removed', icon:'\u{1F6CD}',
      media:[['marketplace_image','item_id'], ['marketplace_file','item_id']],
      select:'id,user_id,title,summary,description,category,subcategory,tags,item_type,product_type,'+
             'price_cents,sale_price_cents,currency,file_name,file_ext,file_size,file_format,file_count,'+
             'file_size_mb,dimensions,software,source_files_included,preview_url,gallery,license,'+
             'commercial_use,personal_use,modification_allowed,attribution_required,stock,delivery_type,'+
             'delivery_days,delivery_notes,custom_requests,revision_count,support_period,refund_policy,'+
             'preview_watermark,safety_notes,seller_note,apply_url,apply_email,buyer_gets,visibility,'+
             'featured,closing_date,status,created_at'
    },
    blog: {
      table:'blog_posts', noun:'post', done:'Post removed', icon:'\u{1F4DD}',
      media:[['blog_image','post_id']],
      paths:['cover_storage_path'],
      select:'id,user_id,title,excerpt,body,cover_url,cover_storage_path,category,tags,content_type,'+
             'related_artworks,related_items,external_refs,visibility,featured,status,created_at'
    },
    resources: {
      table:'resources', noun:'resource', done:'Resource removed', icon:'\u{1F4E6}',
      media:[['resources_image','resource_id'], ['resources_file','resource_id']],
      paths:['preview_storage_path'],
      select:'id,user_id,title,summary,description,resource_type,category,subcategory,tags,preview_url,'+
             'preview_storage_path,file_name,file_ext,file_size,file_count,dimensions,license,'+
             'commercial_use,attribution_required,modification_allowed,software,compatible_software,'+
             'compatible_versions,whats_included,instructions,version,external_links,safety_notes,'+
             'visibility,featured,status,created_at'
    }
  };

  function openMyWorkPage(){
    if(!currentUser){ showToast('Sign in first'); return; }
    dzPanelOpen('pfMyWorkPage');
    mwSwitchTab('art');
    mwLoadData();
  }
  function closeMyWorkPage(){ dzPanelShut('pfMyWorkPage'); }
  function mwSwitchTab(tab){
    if(MW_TABS.indexOf(tab) === -1) tab = 'art';
    mw.tab = tab;
    MW_TABS.forEach(function(t){
      var b = document.getElementById('mwTab-'+t), p = document.getElementById('mwPanel-'+t);
      if(b){ b.classList.toggle('active', t === tab); b.setAttribute('aria-selected', t === tab ? 'true' : 'false'); }
      if(p) p.classList.toggle('active', t === tab);
    });
    if(tab !== 'art') mwLoadSec(tab);
  }
  async function mwLoadData(){
    if(!sb || !currentUser) return;
    try{
      const{data:art,error:ae} = await sb.from('artworks').select('*').eq('user_id',currentUser.id).eq('kind',ART_KIND_ART).order('created_at',{ascending:false});
      if(ae) throw ae;
      mw.art = art||[];
    }catch(e){ console.error('Error loading your work: '+e.message); mw.art=[]; }
    mwRenderArt();
  }

  async function mwLoadSec(sec, force){
    var cfg = MW_SEC[sec];
    if(!cfg) return;
    if(mw.loaded[sec] && !force){ mwRenderSec(sec); return; }
    if(!sb || !currentUser){ mwRenderSec(sec); return; }
    var grid = document.getElementById('mwGrid-'+sec);
    if(grid && !mw.loaded[sec]) grid.innerHTML = '<div class="pfEmpty" style="grid-column:1/-1;">Loading…</div>';
    try{
      var res = await sb.from(cfg.table).select(cfg.select)
                  .eq('user_id', currentUser.id).order('created_at',{ascending:false});
      if(res && res.error) throw res.error;
      mw.rows[sec] = (res && res.data) || [];
      mw.loaded[sec] = true;
    }catch(e){
      console.error('Error loading your ' + cfg.noun + 's: ' + ((e && e.message) || e));
      mw.rows[sec] = mw.rows[sec] || [];
    }
    mwRenderSec(sec);
  }

  function mwCardHTML(row){
    var idStr = esc(String(row.id));
    var img = dzThumbAttrs(row.image_url);
    var title = esc(row.name||'Untitled');
    return '<div class="admCard" data-id="'+idStr+'">'+
      '<div class="admCardThumb">'+
        '<img class="admCardImg" '+img+' alt="'+title+'" loading="lazy" style="'+thumbStyle(row.thumb_x, row.thumb_y, row.thumb_zoom)+'">'+
      '</div>'+
      '<div class="admCardBody">'+
        '<div class="admCardTitle">'+title+'</div>'+
        '<div class="admCardMeta">'+(row.created_at?new Date(row.created_at).toLocaleDateString():'')+'</div>'+
        '<div class="admCardActions">'+
          '<button class="mwEditBtn" onclick="mwEditArt(\''+idStr+'\',event)">✎ Edit</button>'+
          '<button class="mwDeleteBtn" onclick="mwDeleteArt(\''+idStr+'\',event)">✕ Delete</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }
  function mwRenderArt(){
    var grid = document.getElementById('mwGrid-art'), empty = document.getElementById('mwEmpty-art');
    if(!grid) return;
    var qHtml = (typeof upq==='object' && currentUser) ? upqOwnQueueHTML() : '';
    grid.innerHTML = qHtml + mw.art.map(mwCardHTML).join('');
    empty.style.display = (mw.art.length || qHtml) ? 'none' : 'block';
  }

  function mwSecCardHTML(sec, row){
    var cfg = MW_SEC[sec];
    var idStr = esc(String(row.id));
    var pic = row.preview_url || row.cover_url || '';
    var title = esc(row.title || 'Untitled');
    var thumb = pic
      ? '<img class="admCardImg" '+dzThumbAttrs(pic)+' alt="'+title+'" loading="lazy">'
      : '<span class="admCardNoImg" aria-hidden="true">'+cfg.icon+'</span>';
    var bits = [];
    if(row.created_at) bits.push(new Date(row.created_at).toLocaleDateString());
    if(row.status && row.status !== 'approved') bits.push(String(row.status).toUpperCase());
    else if(row.visibility && row.visibility !== 'published') bits.push(String(row.visibility).toUpperCase());
    return '<div class="admCard" data-id="'+idStr+'">'+
      '<div class="admCardThumb">'+thumb+'</div>'+
      '<div class="admCardBody">'+
        '<div class="admCardTitle">'+title+'</div>'+
        '<div class="admCardMeta">'+esc(bits.join(' · '))+'</div>'+
        '<div class="admCardActions">'+
          '<button class="mwEditBtn" onclick="mwEditSec(\''+sec+'\',\''+idStr+'\',event)">✎ Edit</button>'+
          '<button class="mwDeleteBtn" onclick="mwDeleteSec(\''+sec+'\',\''+idStr+'\',event)">✕ Delete</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }
  function mwRenderSec(sec){
    var grid = document.getElementById('mwGrid-'+sec), empty = document.getElementById('mwEmpty-'+sec);
    if(!grid) return;
    var rows = mw.rows[sec] || [];
    grid.innerHTML = rows.map(function(r){ return mwSecCardHTML(sec, r); }).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }
    // sections.js calls this once an edit has saved, so the card behind the form catches up
  function mwSecChanged(sec){ if(MW_SEC[sec]) mwRenderSec(sec); }

  function mwAsk(noun, fn){
    var q = 'Are you sure you want to delete this ' + noun + '?';
    if(typeof window.dzConfirm === 'function'){ window.dzConfirm(q, '', 'Yes', fn, 'No'); return; }
    if(confirm(q)) fn();
  }

  function mwEditArt(id, e){
    if(e) e.stopPropagation();
    var art = mw.art.find(function(r){ return String(r.id)===String(id); });
    if(!art){ showToast('Artwork not found'); return; }
    if(!currentUser || String(art.user_id)!==String(currentUser.id)){ showToast('You can only edit your own artwork'); return; }
    pf.upFile = null;
    pf.upThumbFocus = null;
    if(typeof window.dzEditClose === 'function') window.dzEditClose();
    if(typeof upSwitchSection === 'function') upSwitchSection('artwork', true);
    if(typeof window.dzUpEditChrome === 'function') window.dzUpEditChrome(true);
    document.getElementById('pfUpEditId').value = String(art.id);
    document.getElementById('pfUpTitle').textContent = 'Edit Artwork';
    document.getElementById('pfUpSubtitle').textContent = 'Update the details for this piece.';
    document.getElementById('pfUpNavTitle').textContent = 'EDIT ARTWORK';
    document.getElementById('pfDzTxt').textContent = 'Drag & drop your artwork here';
    document.getElementById('pfUpCatField').style.display = '';
    document.getElementById('pfComicPagesWrap').style.display = 'none';
    var _swF = document.getElementById('pfUpSoftwareField');
    if(_swF) _swF.style.display = 'none';
    var _albF2 = document.getElementById('pfUpAlbumField'); if(_albF2) _albF2.style.display = 'none';
    document.getElementById('pfUpNm').value = art.name||'';
    document.getElementById('pfUpDesc').value = art.description||'';
    pfUpdateCount('pfUpNm','pfUpNmCount',100);
    pfUpdateCount('pfUpDesc','pfUpDescCount',5000);
    pfSetTagsFromArray(art.tags||[]);
    pfSetCats(catList(art.category).length?catList(art.category):['others']);
    if(typeof pfSetSoftware==='function') pfSetSoftware(art.software||'');
    if(typeof dzArtRestore === 'function' && typeof dzArtFromRow === 'function'){
      dzArtRestore(dzArtFromRow(art));
    }
    pf.upEditModMature = (art.content_rating === 'MATURE');
    closePfCatDd();
    document.getElementById('pfDz').style.display='';
    var prev = document.getElementById('pfUpPrev');
    prev.src = art.image_url ? getViewUrl(art.image_url) : '';
    prev.style.cssText = thumbStyle(art.thumb_x, art.thumb_y, art.thumb_zoom);
    if(art.image_url){
      pfPaintPicked({ name: art.name || 'Current image', meta: 'Current image', note: 'Published', locked: true });
    } else {
      pfPaintPicked(null);
    }
    if(typeof upGrowAll === 'function') upGrowAll();
    document.getElementById('upDraftSec').style.display = 'none';
    document.getElementById('upSchedSec').style.display = 'none';
    var _schF2 = document.getElementById('pfUpSchedField'); if(_schF2) _schF2.style.display = 'none';
    var _drB2 = document.getElementById('pfDraftBtn'); if(_drB2) _drB2.style.display = 'none';
    var _bkB2 = document.getElementById('pfUpBackBtn'); if(_bkB2) _bkB2.style.display = '';
    document.getElementById('pfUpBtn').textContent = '📤 Save Changes';
    document.getElementById('pfUpMod').classList.add('open');
  }
  function mwDeleteArt(id, e){
    if(e) e.stopPropagation();
    var art = mw.art.find(function(r){ return String(r.id)===String(id); });
    if(!art){ return; }
    if(!currentUser || String(art.user_id)!==String(currentUser.id)){ showToast('You can only delete your own artwork'); return; }
    mwAsk('artwork', function(){ mwDoDeleteArt(id, art); });
  }
  async function mwDoDeleteArt(id, art){
    try{
    // Row goes first. File-first meant a refused delete left an artwork with its picture gone. A stranded file is only a file
      const{error}=await sb.from('artworks').delete().eq('id',id);
      if(error) throw error;
      if(art.storage_path){
        try{ await s3Delete(BUCKET,art.storage_path); }
        catch(sweep){ console.warn('artwork file not removed:', (sweep && sweep.message) || sweep); }
      }
      if(typeof window.dzArtworkChanged === 'function'){
        await window.dzArtworkChanged(id, { userId: art.user_id, images: [art.image_url] });
      }
      mw.art = mw.art.filter(function(r){ return String(r.id)!==String(id); });
      mwRenderArt();
      images = images.filter(function(i){ return String(i.id)!==String(id); });
      renderHome();
      if(document.getElementById('fg').classList.contains('open')) renderFG();
      if(pf.profile && currentUser && pf.profile.id===currentUser.id){
        pf.galleryRows = pf.galleryRows.filter(function(r){ return String(r.id)!==String(id); });
        if(typeof pfGalleryForget==='function') pfGalleryForget(id);
        pfRenderGallery();
      }
      injectGallerySEO();
      if(typeof window.dzGalleryStore === 'function') window.dzGalleryStore();
      showToast('Artwork removed');
    }catch(err){ console.error('Error: '+err.message); }
  }

  function mwSecRow(sec, id){
    return (mw.rows[sec] || []).find(function(r){ return String(r.id) === String(id); });
  }

  function mwEditSec(sec, id, e){
    if(e) e.stopPropagation();
    var cfg = MW_SEC[sec];
    if(!cfg) return;
    var row = mwSecRow(sec, id);
    if(!row){ showToast('That ' + cfg.noun + ' is no longer here'); return; }
    if(!currentUser || String(row.user_id) !== String(currentUser.id)){
      showToast('You can only edit your own ' + cfg.noun); return;
    }
    if(typeof window.dzOpenEdit !== 'function'){ showToast('Editing is not available right now'); return; }
    window.dzOpenEdit(sec, row);
  }

  function mwDeleteSec(sec, id, e){
    if(e) e.stopPropagation();
    var cfg = MW_SEC[sec];
    if(!cfg) return;
    var row = mwSecRow(sec, id);
    if(!row) return;
    if(!currentUser || String(row.user_id) !== String(currentUser.id)){
      showToast('You can only delete your own ' + cfg.noun); return;
    }
    mwAsk(cfg.noun, function(){ mwDoDeleteSec(sec, id, row); });
  }

    // Read the media rows before the parent goes, because deleting it cascades them away
  async function mwSecFiles(sec, id, row){
    var cfg = MW_SEC[sec], out = [];
    (cfg.paths || []).forEach(function(k){
      if(row[k]) out.push({ bucket: BUCKET, path: row[k] });
    });
    for(var i = 0; i < (cfg.media || []).length; i++){
      var m = cfg.media[i];
      try{
        var res = await sb.from(m[0]).select('storage_bucket,storage_path').eq(m[1], id);
        if(res && res.error) throw res.error;
        ((res && res.data) || []).forEach(function(f){
          if(f && f.storage_path) out.push({ bucket: f.storage_bucket || BUCKET, path: f.storage_path });
        });
      }catch(e){
        console.warn('could not list ' + m[0] + ' for cleanup:', (e && e.message) || e);
      }
    }
    if(Array.isArray(row.gallery)){
      row.gallery.forEach(function(g){ if(g && g.path) out.push({ bucket: BUCKET, path: g.path }); });
    }
    return out;
  }

  async function mwDoDeleteSec(sec, id, row){
    var cfg = MW_SEC[sec];
    if(!sb){ showToast('Backend not configured'); return; }
    try{
      var files = await mwSecFiles(sec, id, row);
        // Row goes first, same as artwork: a refused delete must not strip the files off a live listing
      var del = await sb.from(cfg.table).delete().eq('id', id).eq('user_id', currentUser.id);
      if(del && del.error) throw del.error;
      for(var i = 0; i < files.length; i++){
        try{ await s3Delete(files[i].bucket, files[i].path); }
        catch(sweep){ console.warn(cfg.noun + ' file not removed:', (sweep && sweep.message) || sweep); }
      }
      mw.rows[sec] = (mw.rows[sec] || []).filter(function(r){ return String(r.id) !== String(id); });
      mwRenderSec(sec);
      if(typeof window.dzSecReset === 'function') window.dzSecReset(sec);
      var c = (typeof window.dzCached === 'function') ? window.dzCached() : null;
      if(c && c.invalidateSection){ try{ await c.invalidateSection(sec, id); }catch(e){} }
      showToast(cfg.done);
    }catch(err){
      showToast((err && err.message) ? err.message : ('Could not delete that ' + cfg.noun));
    }
  }

  var cpComments = [];
  var cpMsgCache = {};

  var CM_CHANNELS = {
    official: { name:'DigiArtz Official', desc:'Official community of DigiArtz. Get updates, announcements and more.', readOnly:true,
                icon:'🎨', grad:'linear-gradient(135deg,#4c1d95 0%,#7c3aed 55%,#a855f7 100%)' },
    arttalk : { name:'Art Talk',         desc:'Discuss about art, share your thoughts, ask questions and grow together.',
                icon:'💬', grad:'linear-gradient(135deg,#0f766e 0%,#0891b2 55%,#22d3ee 100%)' },
    feedback: { name:'Art Feedback',     desc:'Share your work and get constructive feedback from the community.',
                icon:'📝', grad:'linear-gradient(135deg,#9d174d 0%,#db2777 55%,#f97316 100%)' },
    collab  : { name:'Collab Hub',       desc:'Find artists to collaborate with on projects and bring ideas to life.',
                icon:'🤝', grad:'linear-gradient(135deg,#065f46 0%,#059669 55%,#22d3ee 100%)' },
    tips    : { name:'Tips & Resources', desc:'Share helpful tips, tutorials, tools and resources for artists.',
                icon:'💡', grad:'linear-gradient(135deg,#78350f 0%,#b45309 55%,#facc15 100%)' },
    showcase: { name:'Showcase',         desc:'Share your latest work, celebrate progress and inspire others.', type:'showcase', cooldownMs:3600000,
                icon:'✦', grad:'linear-gradient(135deg,#701a75 0%,#a21caf 55%,#6366f1 100%)' }
  };
  var cpCurrentChannel = 'arttalk';

  function cpGetAvatarLetter(){
    if(currentUser){
      var name = (currentUser.user_metadata && currentUser.user_metadata.username) || '';
      return name ? name.charAt(0).toUpperCase() : '?';
    }
    return '?';
  }

  function cpGetDisplayName(){
    if(currentUser){
      return (currentUser.user_metadata && currentUser.user_metadata.username) || 'User';
    }
    return 'Guest';
  }

  function cpSyncAvatar(){
    paintAvatarChip('cpBarAvatarImg', 'cpBarAvatarTxt', currentUser ? currentUserAvatarUrl : null, cpGetAvatarLetter());
  }

function hideCommentThumbnail(){
  var box=document.getElementById('cpSelectedImage');
  if(box) box.style.display='none';
}

  function openCommunityHome(){
    dzPanelOpen('communityPage');
    if(typeof cmChatPanelReset === 'function') cmChatPanelReset();
    cmCloseChat();
    if(typeof cmHomeReset === 'function') cmHomeReset();
    cmLoadMine();
  }

  function closeCommunityPage(){
    clearInterval(cpPoll); cpPoll = null;
    dzPanelShut('communityPage');
    if(typeof cmChatPanelReset === 'function') cmChatPanelReset();
    document.getElementById('cpBar').style.display = 'none';
    var lockNote = document.getElementById('cpLockNote');
    if(lockNote) lockNote.style.display = 'none';
    cpCurrentChannel = null;
  }

  async function cmOpenCommunity(id){
    if(!currentUser){
      showToast('Please login to join this community.');
      openAuthMod();
      return;
    }
    var chan = CM_CHANNELS[id];
    if(!chan && /^c:/.test(id)){
      var uc = cmMineCache[id];
      if(uc){
        chan = { name: uc.name, desc: uc.description || 'Community', type: 'chat', readOnly: false,
                 avatar: uc.avatar_url || null,
                 grad: 'linear-gradient(135deg,#1e3a8a 0%,#3b82f6 55%,#60a5fa 100%)' };
        CM_CHANNELS[id] = chan;
      }
    }
    if(!chan){
      showToast('This community is coming soon');
      return;
    }
    var state = await cmStateOf(id);
    if(state.state === 'locked'){
      showToast(state.mine
        ? 'Your Max subscription ended — renew to reopen this community'
        : 'This community is closed — its subscription ended');
      if(state.mine && typeof openSubscription === 'function') openSubscription();
      return;
    }

    cpCurrentChannel = id;

    var inpEl      = document.getElementById('cpBarInput');
    var attachBtn  = document.getElementById('cpAttachBtn');
    var isShowcase = chan.type === 'showcase';
    if(inpEl)   inpEl.placeholder = isShowcase ? 'Write a caption for your artwork...' : ('Message #' + chan.name);
    if(attachBtn) attachBtn.style.display = isShowcase ? 'flex' : 'none';

    if(typeof cmHdrChatMode === 'function'){
      cmHdrChatMode({
        name  : chan.name,
        sub   : chan.desc || 'Community',
        avatar: chan.avatar || null,
        emoji : chan.icon || null,
        letter: (chan.name || '?').charAt(0).toUpperCase(),
        grad  : chan.grad || null,
        tap   : function(){ cmiOpen(id); }
      });
    }

    var canPost = !chan.readOnly || isDev;
    var bar = document.getElementById('cpBar');
    var lockNote = document.getElementById('cpLockNote');
    if(bar) bar.style.display = canPost ? 'flex' : 'none';
    if(lockNote) lockNote.style.display = canPost ? 'none' : 'flex';
    cmPaintGrace(state);

    var dmChat = document.getElementById('dmChatView');
    var chat = document.getElementById('cmChatView');
    if(dmChat) dmChat.style.display = 'none';
    if(chat) chat.style.display = 'flex';
    if(typeof cmChatPanelOpen === 'function') cmChatPanelOpen();
    cpOffset = 0;
    cpLastSig = '';
    cpComments = cpMsgCache[id] || cpSavedMessages(id) || [];
    try{ cpRender(); }catch(e){}
    await cpLoadComments();

    if(cpCurrentChannel !== id) return;

    cpSyncAvatar();
    var thumb=document.getElementById('cpSelectedImage');
    var thumbImg=document.getElementById('cpSelectedImageImg');
    if(thumb) thumb.style.display = 'none';
    if(thumbImg) thumbImg.src = '';

    clearInterval(cpPoll);
    cpPoll = setInterval(function(){
      if(document.visibilityState === 'visible' && cpCurrentChannel === id){
        cpLoadComments(true);
      }
    }, CP_POLL_MS);
  }

  function cmCloseChat(){
    clearInterval(cpPoll); cpPoll = null;
    if(typeof cmChatPanelClose === 'function') cmChatPanelClose();
    if(typeof cmHdrHomeMode === 'function') cmHdrHomeMode();
    cpCurrentChannel = null;
  }

  var cmStateCache = {};
  async function cmStateOf(chanId){
    var out = { state:'live', mine:false, until:null };
    if(!/^c:/.test(String(chanId || ''))) return out;
    var cid = String(chanId).slice(2);
    var hit = cmStateCache[cid];
    if(hit && (Date.now() - hit.at) < 60000) return hit.val;
    try{
      var r = await sb.rpc('cm_state', { cid: cid });
      if(r.error) throw r.error;
      out.state = r.data || 'live';
      if(out.state === 'grace'){
        var g = await sb.rpc('cm_grace_until', { cid: cid });
        if(!g.error && g.data) out.until = new Date(g.data);
      }
      var mine = cmMineCache['c:' + cid];
      out.mine = !!(currentUser && mine && mine.owner_id === currentUser.id);
    }catch(e){
      return out;
    }
    cmStateCache[cid] = { at: Date.now(), val: out };
    return out;
  }

  function cmPaintGrace(state){
    var host = document.getElementById('cmChatView');
    var old  = document.getElementById('cmGraceBar');
    if(old) old.parentNode.removeChild(old);
    if(!host || !state || state.state !== 'grace') return;
    var left = state.until
      ? Math.max(1, Math.ceil((state.until.getTime() - Date.now()) / 86400000))
      : 3;
    var bar = document.createElement('div');
    bar.id = 'cmGraceBar';
    bar.className = 'cmGraceBar';
    bar.innerHTML =
      '<span class="cmGraceTxt">' +
        (state.mine
          ? 'Your Max subscription ended. This community closes in ' +
            left + ' day' + (left === 1 ? '' : 's') + '.'
          : 'This community\u2019s subscription ended. It closes in ' +
            left + ' day' + (left === 1 ? '' : 's') + '.') +
      '</span>' +
      (state.mine
        ? '<button type="button" class="cmGraceBtn" onclick="openSubscription()">Renew</button>'
        : '');
    host.insertBefore(bar, host.firstChild);
  }

  var CM_ROLE_LABEL = { owner:'Owner', admin:'Admin', sr_mod:'Senior Mod', jr_mod:'Junior Mod', member:'Member' };
  var CM_RANK = { owner:5, admin:4, sr_mod:3, jr_mod:2, member:1 };
  var CM_TIMEOUTS = [
    { m:5,     lbl:'5 minutes' },
    { m:60,    lbl:'1 hour'    },
    { m:1440,  lbl:'1 day'     },
    { m:10080, lbl:'7 days'    },
    { m:43200, lbl:'1 month'   },
    { m:0,     lbl:'Clear timeout' }
  ];
  var cmMineCache = {};
  var cmMineRows  = [];
  var CM_MAX_JOINED = 50;
  window.CM_MAX_JOINED = CM_MAX_JOINED;

  function cmErr(e){
    var m = (e && e.message) || '';
    if(/CM_LEVEL/.test(m))         return 'You need artist Level 100, or a Max subscription, to create a community.';
    if(/CM_ALREADY_OWNER/.test(m)) return 'You already own every community your level and plan allow.';
    if(/CM_LOCKED/.test(m))        return 'That community is closed — its subscription ended.';
    if(/CM_OWNER_LEAVE/.test(m))   return 'You own this community — delete it instead of leaving.';
    if(/communities_text_len_chk/.test(m))
      return 'One of those is too long — name 40, short description 120, description 500, rules 2000.';
    if(/CM_MAX_JOINED/.test(m))    return 'You’re in ' + CM_MAX_JOINED + ' communities — the most allowed. Leave one to join another.';
    if(/Too many .* in a short time/i.test(m)) return m;
    if(/CM_NAME_TAKEN/.test(m) || /communities_name_lower_idx/.test(m))
                                   return 'That community name is already taken.';
    if(/CM_NOT_FOUND/.test(m))     return 'No community matches that name and join ID.';
    if(/CM_BANNED/.test(m))        return 'You are banned from that community.';
    if(/CM_FORBIDDEN/.test(m))     return 'You don\u2019t have permission for that.';
    if(/CM_RANK/.test(m))          return 'You can\u2019t act on someone at or above your rank.';
    if(/CM_SELF/.test(m))          return 'You can\u2019t do that to yourself.';
    if(/CM_NOT_MEMBER/.test(m))    return 'That person isn\u2019t a member.';
    return 'Something went wrong — try again.';
  }

  function cmCloseMod(id){
    var m = document.getElementById(id);
    if(m) m.classList.remove('open');
  }
  function cmOpenMod(id){
    var m = document.getElementById(id);
    if(m) m.classList.add('open');
  }

  document.addEventListener('focusin', function(e){
    var t = e.target;
    if(!t || !t.matches || !t.matches('input, textarea')) return;
    if(!t.closest('.cmMod, .rptMod, #cmInfoPage')) return;
    setTimeout(function(){
      try{ t.scrollIntoView({ block:'center', behavior:'smooth' }); }catch(err){}
    }, 320);
  });

  async function cmCreateCommunity(){
    if(!currentUser){ openAuthMod(); return; }
    document.getElementById('cmNewName').value = '';
    document.getElementById('cmNewDesc').value = '';
    var sub = document.getElementById('cmCreateSub');
    sub.textContent = 'Requires artist Level 100, or a Max subscription.';
    cmOpenMod('cmCreateMod');
    try{
      var pr = await sb.rpc('get_artist_progress', { target: currentUser.id });
      var lvl = (pr.data && pr.data[0] && pr.data[0].level) || 1;
      var isMax = typeof dzTier === 'function' && dzTier() === 'max';
      sub.textContent =
        lvl >= 100 ? 'You\u2019re Level ' + lvl + ' — you can create a community.'
      : isMax      ? 'Max includes a community. It stays open while your subscription does.'
                   : 'You\u2019re Level ' + lvl + '. Level 100, or a Max subscription, is required.';
    }catch(e){}
  }

  async function cmDoCreate(){
    var name = document.getElementById('cmNewName').value.trim();
    var desc = document.getElementById('cmNewDesc').value.trim();
    if(name.length < 3){ showToast('Name must be at least 3 characters'); return; }
    var btn = document.getElementById('cmCreateGo');
    btn.disabled = true; btn.textContent = 'CREATING…';
    try{
      var r = await sb.rpc('cm_create', { p_name: name, p_desc: desc || null });
      if(r.error) throw r.error;
      cmCloseMod('cmCreateMod');
      showToast('Community created');
      cmLoadMine();
    }catch(e){ showToast(cmErr(e)); }
    finally{ btn.disabled = false; btn.textContent = 'Create'; }
  }

  function cmOpenJoin(){
    if(!currentUser){ openAuthMod(); return; }
    if(cmAtJoinCap()) return;
    document.getElementById('cmJoinName').value = '';
    document.getElementById('cmJoinCode').value = '';
    cmOpenMod('cmJoinMod');
  }

  function cmAtJoinCap(){
    if(cmMineRows.length < CM_MAX_JOINED) return false;
    showToast('You’re in ' + CM_MAX_JOINED + ' communities — the most allowed. Leave one to join another.');
    return true;
  }

  async function cmDoJoin(){
    var name = document.getElementById('cmJoinName').value.trim();
    var code = document.getElementById('cmJoinCode').value.trim();
    if(!name || !code){ showToast('Enter both the name and the join ID'); return; }
    if(cmAtJoinCap()){ cmCloseMod('cmJoinMod'); return; }
    var btn = document.getElementById('cmJoinGo');
    btn.disabled = true; btn.textContent = 'JOINING…';
    try{
      var r = await sb.rpc('cm_join', { p_name: name, p_code: code });
      if(r.error) throw r.error;
      cmCloseMod('cmJoinMod');
      showToast('Joined ' + name);
      cmLoadMine();
    }catch(e){ showToast(cmErr(e)); }
    finally{ btn.disabled = false; btn.textContent = 'Join'; }
  }

  async function cmLoadMine(){
    var wrap = document.getElementById('cmMineWrap');
    var grid = document.getElementById('cmMineGrid');
    if(!wrap || !grid || !sb || !currentUser){ if(wrap) wrap.style.display='none'; return; }
    if(cmMineRows.length) cmRenderMine(cmMineRows);
    try{
      var mem = await sb.from('community_members')
        .select('role,banned,community_id,communities(id,name,description,avatar_url,owner_id,join_code)')
        .eq('user_id', currentUser.id).eq('banned', false);
      if(mem.error) throw mem.error;
      var rows = (mem.data || []).filter(function(r){ return r.communities; });
      cmMineRows = rows;
      cmRenderMine(rows);
    }catch(e){ if(!cmMineRows.length && wrap) wrap.style.display='none'; }
  }

  function cmAvatar(box, url, name, style){
    var letter = String(name || '?').charAt(0).toUpperCase();
    box.textContent = '';
    if(!url){ box.textContent = letter; return; }
    var im = document.createElement('img');
    im.src = getThumbnailUrl(url);
    im.alt = '';
    if(style) im.style.cssText = style;
    im.onerror = function(){ im.remove(); box.textContent = letter; };
    box.appendChild(im);
  }

  function cmRenderMine(rows){
    var wrap = document.getElementById('cmMineWrap');
    var grid = document.getElementById('cmMineGrid');
    if(!wrap || !grid) return;
    if(!rows.length){
      wrap.style.display='none';
      grid.innerHTML='';
      if(typeof cmSyncCount === 'function') cmSyncCount();
      return;
    }
    wrap.style.display = '';
    grid.innerHTML = '';
    rows.forEach(function(r){
        var c = r.communities;
        var card = document.createElement('div');
        card.className = 'cmCard';
        var ico = document.createElement('div');
        ico.className = 'cmCardIcon';
        ico.style.background = 'linear-gradient(135deg,#1e3a8a 0%,#3b82f6 55%,#60a5fa 100%)';
        cmAvatar(ico, c.avatar_url, c.name,
                 'width:100%;height:100%;object-fit:cover;border-radius:inherit;');
        var meta = document.createElement('div');
        meta.className = 'cmCardMeta';
        var nm = document.createElement('div');
        nm.className = 'cmCardName';
        nm.textContent = c.name;
        var badge = document.createElement('span');
        badge.className = 'cmBadge';
        badge.textContent = CM_ROLE_LABEL[r.role] || 'Member';
        nm.appendChild(badge);
        var p = document.createElement('p');
        p.textContent = c.description || 'No description yet.';
        meta.appendChild(nm); meta.appendChild(p);
        card.appendChild(ico); card.appendChild(meta);
        var chKey = 'c:' + c.id;
        cmMineCache[chKey] = c;
        card.onclick = function(){ cmOpenCommunity(chKey); };
        if((CM_RANK[r.role] || 1) >= 2){
          var mg = document.createElement('button');
          mg.className = 'cmModBtn';
          mg.style.cssText = 'flex-shrink:0;margin-left:auto;font-size:.6rem;padding:.4rem .7rem;';
          mg.textContent = 'MANAGE';
          mg.onclick = function(ev){ ev.stopPropagation(); cmiOpen('c:' + c.id); };
          card.appendChild(mg);
        }
        grid.appendChild(card);
      });
    if(typeof cmSyncCount === 'function') cmSyncCount();
  }

  async function cmMod(rpc, args){
    try{
      var r = await sb.rpc(rpc, args);
      if(r.error) throw r.error;
      cmCloseMod('cmUserMod');
      showToast('Done');
      if(cmi.cid) cmiLoadMembers();
    }catch(e){ showToast(cmErr(e)); }
  }

  var cmi = { key:null, cid:null, c:null, role:null, rank:0, isOwner:false,
              isMember:false, memRows:[], memTab:'all', builtin:null };

  function cmiEl(id){ return document.getElementById(id); }

  function cmiOpen(key){
    if(!key) return;
    cmi.key = key;
    cmi.cid = /^c:/.test(key) ? key.slice(2) : null;
    cmi.builtin = cmi.cid ? null : (CM_CHANNELS[key] || null);
    cmi.memTab = 'all';
    var page = cmiEl('cmInfoPage'); if(!page) return;
    page.classList.add('open');
    document.body.style.overflow = 'hidden';
    page.scrollTop = 0;
    if(cmi.cid) cmiLoadCommunity();
    else cmiPaintBuiltin();
  }
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    var page = document.getElementById('cmInfoPage');
    if(!page || !page.classList.contains('open')) return;
    e.stopImmediatePropagation();
    cmiClose();
  });

  function cmiClose(){
    var page = cmiEl('cmInfoPage');
    if(page) page.classList.remove('open');
    var chat = document.getElementById('cmChatPanel');
    var home = document.getElementById('communityPage');
    if(!(chat && chat.classList.contains('open')) &&
       !(home && home.classList.contains('open')) &&
       typeof restoreScroll === 'function'){
      restoreScroll();
    }
  }

  function cmiPaintBuiltin(){
    var ch = cmi.builtin || {};
    cmiSetIcon(null, ch.icon || (ch.name || '?').charAt(0).toUpperCase(), ch.grad);
    cmiEl('cmiName').textContent  = ch.name || 'Community';
    cmiEl('cmiShort').textContent = ch.desc || '';
    cmiEl('cmiVis').textContent   = 'OPEN TO EVERYONE';
    cmiEl('cmiRole').hidden = true;
    cmiEl('cmiCount').parentNode.hidden = true;
    cmiSecText('cmiAboutSec','cmiDesc', ch.desc || '');
    cmiSecText('cmiRulesSec','cmiRules', '');
    cmiEl('cmiMemSec').hidden = true;
    cmiEl('cmiSetSec').hidden = true;
    ['cmiJoinBtn','cmiLeaveBtn','cmiDeleteBtn'].forEach(function(id){ cmiEl(id).hidden = true; });
    cmiEl('cmiReportBtn').hidden = !!ch.readOnly;
    cmiEl('cmiActNote').textContent = ch.readOnly
      ? 'An official DigiArtz room. Everyone can read it; only DigiArtz posts.'
      : 'A room DigiArtz runs. Everyone signed in can read and post here.';
  }

  async function cmiLoadCommunity(){
    cmiEl('cmiName').textContent = 'Loading…';
    try{
      var c = await sb.from('communities').select('*').eq('id', cmi.cid).maybeSingle();
      if(c.error || !c.data) throw (c.error || new Error('missing'));
      cmi.c = c.data;
      cmi.isOwner = !!(currentUser && c.data.owner_id === currentUser.id);
      var mem = currentUser
        ? await sb.from('community_members').select('role,banned')
            .eq('community_id', cmi.cid).eq('user_id', currentUser.id).maybeSingle()
        : { data:null };
      cmi.role      = (mem.data && !mem.data.banned) ? mem.data.role : null;
      cmi.isMember  = !!cmi.role;
      cmi.rank      = CM_RANK[cmi.role] || 0;
      cmiPaint();
      cmiPaintRole();
      cmiLoadMembers();
    }catch(e){
      cmiEl('cmiName').textContent = 'Couldn\u2019t load this community';
      showToast('Couldn\u2019t load this community');
    }
  }

  function cmiSetIcon(url, letter, grad){
    var el = cmiEl('cmiIcon');
    el.textContent = '';
    el.style.background = grad || 'linear-gradient(135deg,#1e3a8a 0%,#3b82f6 55%,#60a5fa 100%)';
    if(url){
      var im = document.createElement('img');
      im.src = getThumbnailUrl(url); im.alt = '';
      im.onerror = function(){ im.remove(); el.textContent = letter || '?'; };
      el.appendChild(im);
    } else {
      el.textContent = letter || '?';
    }
  }
  function cmiSecText(secId, txtId, value){
    var sec = cmiEl(secId), txt = cmiEl(txtId);
    if(txt) txt.textContent = value || '';
    if(sec) sec.hidden = !value;
  }

  function cmiPaint(){
    var c = cmi.c || {};
    cmiSetIcon(c.avatar_url, (c.name || '?').charAt(0).toUpperCase(), null);
    cmiEl('cmiName').textContent  = c.name || 'Community';
    cmiEl('cmiShort').textContent = c.short_description || '';
    var vis = cmiEl('cmiVis');
    vis.hidden = false;
    vis.textContent = c.is_public ? 'PUBLIC' : 'PRIVATE';
    var role = cmiEl('cmiRole');
    role.hidden = !cmi.isMember;
    role.textContent = (CM_ROLE_LABEL[cmi.role] || 'Member').toUpperCase();
    cmiEl('cmiCount').parentNode.hidden = false;
    cmiSecText('cmiAboutSec','cmiDesc',  c.description || '');
    cmiSecText('cmiRulesSec','cmiRules', c.rules || '');
  }

  function cmiPaintRole(){
    var isStaff = cmi.rank >= 2;
    document.querySelectorAll('#cmInfoPage [data-cmi]').forEach(function(el){
      var need = el.getAttribute('data-cmi');
      el.hidden = (need === 'owner') ? !cmi.isOwner : !isStaff;
    });
    cmiEl('cmiSeg').hidden = !isStaff;
    if(!isStaff && cmi.memTab === 'ban') cmi.memTab = 'all';

    cmiEl('cmiMemSec').hidden = false;
    cmiEl('cmiJoinBtn').hidden   = cmi.isMember || !(cmi.c && cmi.c.is_public);
    cmiEl('cmiLeaveBtn').hidden  = !cmi.isMember || cmi.isOwner;
    cmiEl('cmiReportBtn').hidden = !currentUser || cmi.isOwner;

    var note = '';
    if(cmi.isOwner) note = 'You own this community. Leaving is not one of the options — delete it instead.';
    else if(!cmi.isMember && !(cmi.c && cmi.c.is_public)) note = 'This community is private. Joining needs its name and join ID.';
    cmiEl('cmiActNote').textContent = note;

    if(cmi.isOwner && cmi.c){
      cmiEl('cmiJoinCode').textContent  = cmi.c.join_code || '------';
      cmiPaintIconPreview();
      cmiEl('cmiSetName').value   = cmi.c.name || '';
      cmiEl('cmiSetShort').value  = cmi.c.short_description || '';
      cmiEl('cmiSetDesc').value   = cmi.c.description || '';
      cmiEl('cmiSetRules').value  = cmi.c.rules || '';
      cmiEl('cmiSetPublic').checked = !!cmi.c.is_public;
    }
  }

  function cmiMemTab(tab){
    cmi.memTab = tab;
    cmiEl('cmiSegAll').classList.toggle('active', tab === 'all');
    cmiEl('cmiSegBan').classList.toggle('active', tab === 'ban');
    cmiRenderMembers();
  }

  async function cmiLoadMembers(){
    var list = cmiEl('cmiMemList');
    if(!list || !cmi.cid) return;
    list.innerHTML = '<div class="dmSearchNote">LOADING…</div>';
    try{
      var r = await sb.from('community_members')
        .select('user_id,role,banned,timeout_until,profiles(username,display_name,avatar_url)')
        .eq('community_id', cmi.cid);
      if(r.error) throw r.error;
      cmi.memRows = (r.data || []).slice().sort(function(a,b){
        return (CM_RANK[b.role]||1) - (CM_RANK[a.role]||1);
      });
      cmiEl('cmiCount').textContent = cmi.memRows.filter(function(x){ return !x.banned; }).length;
      cmiRenderMembers();
    }catch(e){
      list.innerHTML = '<div class="dmSearchNote">COULDN\u2019T LOAD MEMBERS</div>';
    }
  }

  function cmiRenderMembers(){
    var list = cmiEl('cmiMemList'); if(!list) return;
    var banned = cmi.memTab === 'ban';
    var rows = cmi.memRows.filter(function(m){ return !!m.banned === banned; });
    list.innerHTML = '';
    if(!rows.length){
      list.innerHTML = '<div class="dmSearchNote">' +
        (banned ? 'NOBODY IS BANNED' : 'NO MEMBERS YET') + '</div>';
      return;
    }
    rows.forEach(function(m){
      var p = m.profiles || {};
      var row = document.createElement('div');
      row.className = 'cmMemRow';
      var ava = document.createElement('div');
      ava.className = 'cmMemAva';
      cmAvatar(ava, p.avatar_url, p.display_name || p.username);
      var nm = document.createElement('div');
      nm.className = 'cmMemName';
      nm.textContent = p.display_name || p.username || 'User';
      var badge = document.createElement('span');
      var isTimedOut = m.timeout_until && new Date(m.timeout_until) > new Date();
      badge.className = 'cmMemRole cmMemRole--' + (m.banned ? 'banned' : m.role);
      badge.textContent = m.banned ? 'BANNED'
                        : isTimedOut ? 'TIMED OUT'
                        : (CM_ROLE_LABEL[m.role] || 'Member');
      row.appendChild(ava); row.appendChild(nm); row.appendChild(badge);
      row.onclick = function(){
        cmUserOpen({
          id     : m.user_id,
          name   : p.display_name || p.username || 'User',
          username: p.username || null,
          avatar : p.avatar_url || null
        }, m);
      };
      list.appendChild(row);
    });
  }

  var CM_TEXT_LIMITS = [
    { id:'cmiSetName',  label:'Name',              min:3, max:40   },
    { id:'cmiSetShort', label:'Short description', min:0, max:120  },
    { id:'cmiSetDesc',  label:'Description',       min:0, max:500  },
    { id:'cmiSetRules', label:'Rules',             min:0, max:2000 }
  ];
  function cmiTextProblem(){
    for(var i = 0; i < CM_TEXT_LIMITS.length; i++){
      var f = CM_TEXT_LIMITS[i], v = (cmiEl(f.id).value || '').trim();
      if(v.length < f.min) return f.label + ' must be at least ' + f.min + ' characters';
      if(v.length > f.max) return f.label + ' is over ' + f.max + ' characters';
    }
    return null;
  }

  async function cmiSave(){
    if(!cmi.isOwner || !cmi.cid) return;
    var btn = cmiEl('cmiSaveBtn');
    var name = cmiEl('cmiSetName').value.trim();
    var problem = cmiTextProblem();
    if(problem){ showToast(problem); return; }
    btn.disabled = true; btn.textContent = 'SAVING…';
    try{
      var upd = {
        name             : name,
        short_description: cmiEl('cmiSetShort').value.trim() || null,
        description      : cmiEl('cmiSetDesc').value.trim()  || null,
        rules            : cmiEl('cmiSetRules').value.trim() || null,
        is_public        : cmiEl('cmiSetPublic').checked
      };
      var r = await sb.from('communities').update(upd).eq('id', cmi.cid);
      if(r.error) throw r.error;
      Object.keys(upd).forEach(function(k){ cmi.c[k] = upd[k]; });
      cmiPaint();
      showToast('Community updated');
      delete CM_CHANNELS['c:' + cmi.cid];
      cmLoadMine();
    }catch(e){ showToast(cmErr(e)); }
    finally{ btn.disabled = false; btn.textContent = 'Save settings'; }
  }

  var CMI_ICON_PX = 256;

  function cmiPaintIconPreview(){
    var el = cmiEl('cmiIconPrev'); if(!el) return;
    var url = cmi.c && cmi.c.avatar_url;
    cmAvatar(el, url, cmi.c && cmi.c.name);
    var clear = cmiEl('cmiIconClear');
    if(clear) clear.hidden = !url;
  }

  function cmiPickIcon(){
    if(!cmi.isOwner) return;
    var f = cmiEl('cmiIconFile');
    if(f){ f.value = ''; f.click(); }
  }

  function cmiIconChosen(input){
    var file = input && input.files && input.files[0];
    if(!file || !cmi.isOwner || !cmi.cid) return;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){ showToast('PNG, JPEG or WebP only'); return; }
    if(file.size > 8 * 1024 * 1024){ showToast('That image is over 8MB — pick a smaller one'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){
      URL.revokeObjectURL(url);
      var side = Math.min(img.naturalWidth, img.naturalHeight);
      if(side < 64){ showToast('That image is too small — 64×64 or larger'); return; }
      var sx = (img.naturalWidth  - side) / 2;
      var sy = (img.naturalHeight - side) / 2;
      var cv = document.createElement('canvas');
      cv.width = cv.height = CMI_ICON_PX;
      cv.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, CMI_ICON_PX, CMI_ICON_PX);
      cv.toBlob(function(blob){
        if(blob) { cmiUploadIcon(blob); return; }
        cv.toBlob(function(fallback){ if(fallback) cmiUploadIcon(fallback); }, 'image/jpeg', 0.9);
      }, 'image/webp', 0.9);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); showToast('Couldn’t read that image'); };
    img.src = url;
  }

  async function cmiUploadIcon(blob){
    var btn = cmiEl('cmiIconBtn');
    btn.disabled = true; btn.textContent = 'UPLOADING…';
    try{
      var ext = ({ 'image/webp':'webp', 'image/png':'png' })[blob.type] || 'jpg';
      var path = 'communities/' + currentUser.id + '/' + cmi.cid + '-' + Date.now() + '.' + ext;
      var publicUrl = await s3Upload(BUCKET, path, blob);
      var old = cmi.c.avatar_storage_path || null;
      var r = await sb.from('communities')
        .update({ avatar_url: publicUrl, avatar_storage_path: path })
        .eq('id', cmi.cid);
      if(r.error) throw r.error;
      cmi.c.avatar_url = publicUrl;
      cmi.c.avatar_storage_path = path;
      if(old){ try{ await s3Delete(BUCKET, old); }catch(e){} }
      cmiPaintIconPreview();
      cmiSetIcon(publicUrl, (cmi.c.name || '?').charAt(0).toUpperCase(), null);
      delete CM_CHANNELS['c:' + cmi.cid];
      cmLoadMine();
      showToast('Icon updated');
    }catch(e){
      if(window.meritDenied && window.meritDenied(e, 'upload')) return;
      showToast(cmErr(e));
    }
    finally{ btn.disabled = false; btn.textContent = 'Upload an image'; }
  }

  async function cmiClearIcon(){
    if(!cmi.isOwner || !cmi.cid || !cmi.c.avatar_url) return;
    try{
      var old = cmi.c.avatar_storage_path || null;
      var r = await sb.from('communities')
        .update({ avatar_url: null, avatar_storage_path: null }).eq('id', cmi.cid);
      if(r.error) throw r.error;
      cmi.c.avatar_url = null; cmi.c.avatar_storage_path = null;
      if(old){ try{ await s3Delete(BUCKET, old); }catch(e){} }
      cmiPaintIconPreview();
      cmiSetIcon(null, (cmi.c.name || '?').charAt(0).toUpperCase(), null);
      delete CM_CHANNELS['c:' + cmi.cid];
      cmLoadMine();
      showToast('Icon removed');
    }catch(e){ showToast(cmErr(e)); }
  }

  function cmiCopyCode(){
    var code = (cmi.c && cmi.c.join_code) || '';
    if(!code) return;
    if(navigator.clipboard) navigator.clipboard.writeText(code).then(function(){ showToast('Join ID copied'); });
    else showToast(code);
  }

  async function cmiJoin(){
    if(!currentUser){ openAuthMod(); return; }
    if(cmAtJoinCap()) return;
    try{
      var r = await sb.rpc('cm_join_public', { cid: cmi.cid });
      if(r.error) throw r.error;
      showToast('Joined ' + ((cmi.c && cmi.c.name) || 'community'));
      cmLoadMine();
      cmiLoadCommunity();
    }catch(e){ showToast(cmErr(e)); }
  }

  async function cmiLeave(){
    if(!cmi.cid) return;
    var nm = (cmi.c && cmi.c.name) || 'this community';
    if(!confirm('Leave ' + nm + '? You can join again later if it lets you.')) return;
    try{
      var r = await sb.rpc('cm_leave', { cid: cmi.cid });
      if(r.error) throw r.error;
      showToast('You left ' + nm);
      cmiClose();
      cmCloseChat();
      cmLoadMine();
    }catch(e){ showToast(cmErr(e)); }
  }

  async function cmiDelete(){
    if(!cmi.isOwner || !cmi.cid) return;
    var nm = (cmi.c && cmi.c.name) || 'this community';
    if(!confirm('Delete ' + nm + '? Every message in it is deleted too, and this cannot be undone.')) return;
    var typed = prompt('Type the community name to confirm:', '');
    if(typed === null) return;
    if(typed.trim().toLowerCase() !== nm.trim().toLowerCase()){ showToast('That didn\u2019t match — nothing was deleted'); return; }
    try{
      var r = await sb.rpc('cm_delete', { cid: cmi.cid });
      if(r.error) throw r.error;
      showToast(nm + ' deleted');
      cmiClose();
      cmCloseChat();
      cmLoadMine();
    }catch(e){ showToast(cmErr(e)); }
  }

  function cmiReport(){
    if(!currentUser){ openAuthMod(); return; }
    cmRptOpen('community', cmi.cid, null, 'Report ' + ((cmi.c && cmi.c.name) || 'this community'));
  }

  document.addEventListener('DOMContentLoaded', function(){
    var i = document.getElementById('cmBrwIn');
    if(i) i.addEventListener('input', function(){
      clearTimeout(cmBrw.timer);
      cmBrw.q = i.value.trim();
      cmBrw.timer = setTimeout(cmBrowseReload, 280);
    });
  });

  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    var pg = document.getElementById('cmBrowsePage');
    if(!pg || !pg.classList.contains('open')) return;
    e.stopImmediatePropagation();
    cmCloseBrowse();
  });

  var CM_BRW_PAGE = 30;
  var cmBrw = { q:'', offset:0, busy:false, done:false, timer:null };

  function cmOpenBrowse(){
    var pg = document.getElementById('cmBrowsePage'); if(!pg) return;
    cmBrw.lastFocus = document.activeElement;
    document.getElementById('cmBrwIn').value = '';
    cmBrw.q = '';
    pg.classList.add('open');
    document.body.style.overflow = 'hidden';
    cmBrowseReload();
    setTimeout(function(){ try{ document.getElementById('cmBrwIn').focus(); }catch(e){} }, 60);
  }
  function cmCloseBrowse(){
    var pg = document.getElementById('cmBrowsePage');
    if(!pg || !pg.classList.contains('open')) return;
    pg.classList.remove('open');
    clearTimeout(cmBrw.timer);
    var back = cmBrw.lastFocus; cmBrw.lastFocus = null;
    if(back && back.isConnected && back.focus){
      try{ back.focus({preventScroll:true}); }catch(e){ try{ back.focus(); }catch(e2){} }
    }
  }
  function cmBrowseClear(){
    var i = document.getElementById('cmBrwIn');
    if(i){ i.value = ''; try{ i.focus(); }catch(e){} }
    cmBrw.q = '';
    cmBrowseReload();
  }
  function cmBrwNote(msg){
    var n = document.getElementById('cmBrwNote');
    if(n){ n.textContent = msg || ''; n.hidden = !msg; }
  }
  function cmBrowseReload(){
    cmBrw.offset = 0; cmBrw.done = false;
    document.getElementById('cmBrwList').innerHTML = '';
    document.getElementById('cmBrwMore').hidden = true;
    cmBrowseMore();
  }
  function cmBrowseMore(){ cmBrowseLoad(); }

  async function cmBrowseLoad(){
    if(cmBrw.busy || cmBrw.done) return;
    cmBrw.busy = true;
    var more = document.getElementById('cmBrwMore');
    if(more) more.hidden = true;
    if(!cmBrw.offset) cmBrwNote('Loading…');
    try{
      var r = await sb.rpc('cm_browse', {
        p_q: cmBrw.q || null, p_limit: CM_BRW_PAGE, p_offset: cmBrw.offset
      });
      if(r.error) throw r.error;
      var rows = r.data || [];
      cmBrowseRender(rows);
      cmBrw.offset += rows.length;
      cmBrw.done = rows.length < CM_BRW_PAGE;
      if(more) more.hidden = cmBrw.done;
      if(!cmBrw.offset){
        cmBrwNote(cmBrw.q ? 'No community matches that.'
                          : 'No communities yet — create the first one.');
      } else cmBrwNote('');
    }catch(e){
      cmBrwNote('Couldn’t load communities — try again.');
    }finally{ cmBrw.busy = false; }
  }

  function cmBrowseRender(rows){
    var list = document.getElementById('cmBrwList');
    rows.forEach(function(c, i){
      var rank = cmBrw.offset + i + 1;
      var card = document.createElement('div');
      card.className = 'cmBrwRow';

      var num = document.createElement('span');
      num.className = 'cmBrwRank'; num.textContent = rank;

      var ico = document.createElement('div');
      ico.className = 'cmCardIcon cmBrwIco';
      cmAvatar(ico, c.avatar_url, c.name);

      var meta = document.createElement('div');
      meta.className = 'cmBrwMeta';
      var nm = document.createElement('div');
      nm.className = 'cmCardName';
      nm.textContent = c.name;
      var desc = document.createElement('p');
      desc.textContent = c.short_description || c.description || 'No description yet.';
      var cnt = document.createElement('div');
      cnt.className = 'cmBrwCount';
      cnt.textContent = c.members + (Number(c.members) === 1 ? ' member' : ' members');
      meta.appendChild(nm); meta.appendChild(desc); meta.appendChild(cnt);

      var btn = document.createElement('button');
      btn.className = 'cmBrwJoin';
      if(c.joined){
        btn.textContent = 'Open';
        btn.classList.add('cmBrwJoin--in');
        cmMineCache['c:' + c.id] = c;
        btn.onclick = function(){ cmCloseBrowse(); cmOpenCommunity('c:' + c.id); };
      } else {
        btn.textContent = 'Join';
        btn.onclick = function(){ cmJoinAsk(c); };
      }

      card.appendChild(num); card.appendChild(ico); card.appendChild(meta); card.appendChild(btn);
      card.addEventListener('click', function(e){
        if(e.target.closest('.cmBrwJoin')) return;
        cmCloseBrowse();
        cmiOpen('c:' + c.id);
      });
      list.appendChild(card);
    });
  }

  var cmJoinAskC = null;
  function cmJoinAsk(c){
    if(!currentUser){ openAuthMod(); return; }
    if(cmAtJoinCap()) return;
    cmJoinAskC = c;
    document.getElementById('cmJoinAskTitle').textContent = 'Join ' + c.name + '?';
    document.getElementById('cmJoinAskSub').textContent =
      'You will be able to read and post in it, and you can leave whenever you like.';
    cmOpenMod('cmJoinAsk');
  }
  async function cmJoinAskGo(){
    var c = cmJoinAskC; if(!c) return;
    cmCloseMod('cmJoinAsk');
    var btn = document.getElementById('cmJoinAskGo');
    btn.disabled = true;
    try{
      var r = await sb.rpc('cm_join_public', { cid: c.id });
      if(r.error) throw r.error;
      showToast('Joined ' + c.name);
      cmLoadMine();
      cmBrowseReload();
    }catch(e){ showToast(cmErr(e)); }
    finally{ btn.disabled = false; cmJoinAskC = null; }
  }

  var cmuUser = null, cmuView = 'main';

  function cmActItem(host, label, fn, danger){
    var b = document.createElement('button');
    b.className = 'cmActItem' + (danger ? ' cmActItem--danger' : '');
    b.textContent = label;
    b.onclick = fn;
    host.appendChild(b);
    return b;
  }
  function cmuAct(label, fn, danger){
    cmActItem(document.getElementById('cmuActs'), label, fn, danger);
  }

  function cmUserOpen(p, mem, view){
    if(!p || !p.id) return;
    cmuUser = p;
    cmuView = view || 'main';
    cmAvatar(document.getElementById('cmuAva'), p.avatar, p.name);
    document.getElementById('cmuName').textContent   = p.name || 'User';
    document.getElementById('cmuHandle').textContent = p.username ? ('@' + p.username) : '…';
    var acts = document.getElementById('cmuActs');
    acts.innerHTML = '';

    var isSelf = !!(currentUser && String(currentUser.id) === String(p.id));
    var m = mem || cmuMemberRow(p.id);
    var canModerate = !!(cmi.cid && m && !isSelf && cmi.rank >= 2 &&
                         (CM_RANK[m.role] || 1) < cmi.rank);

    if(cmuView === 'role' || cmuView === 'timeout'){
      cmuAct('\u2039 Back', function(){ cmUserOpen(p, m, 'main'); });
      if(cmuView === 'role'){
        var targetRank = CM_RANK[m.role] || 1;
        ['member','jr_mod','sr_mod','admin'].forEach(function(role){
          if(CM_RANK[role] >= cmi.rank) return;
          if(role === m.role) return;
          var verb = CM_RANK[role] > targetRank ? 'Promote to ' : 'Demote to ';
          cmuAct(verb + CM_ROLE_LABEL[role], function(){
            cmMod('cm_set_role', { cid: cmi.cid, target: p.id, new_role: role });
          });
        });
      } else {
        CM_TIMEOUTS.forEach(function(t){
          cmuAct(t.m ? ('Mute for ' + t.lbl) : 'Clear timeout', function(){
            cmMod('cm_timeout', { cid: cmi.cid, target: p.id, minutes: t.m });
          });
        });
      }
      cmOpenMod('cmUserMod');
      return;
    }

    if(p.username){
      cmuAct('View profile', function(){
        cmCloseMod('cmUserMod');
        openProfileByUsername(p.username, true);
      });
    }

    if(!isSelf){
      cmuAct('Report ' + (p.username ? '@' + p.username : 'this member'), function(){
        cmCloseMod('cmUserMod');
        if(!currentUser){ openAuthMod(); return; }
        cmRptOpen('community_member', p.id, null, 'Report ' + (p.name || 'this member'));
      });
    }

    if(canModerate){
      if(cmi.rank >= 4) cmuAct('Change role…', function(){ cmUserOpen(p, m, 'role'); });
      cmuAct('Timeout…', function(){ cmUserOpen(p, m, 'timeout'); });
      cmuAct('Remove from community', function(){
        if(confirm('Remove ' + (p.name || 'this member') + '? They can join again.'))
          cmMod('cm_kick', { cid: cmi.cid, target: p.id });
      }, true);
      if(cmi.rank >= 3){
        cmuAct(m.banned ? 'Unban' : 'Ban from community', function(){
          cmMod('cm_set_ban', { cid: cmi.cid, target: p.id, do_ban: !m.banned });
        }, true);
      }
    }

    if(!acts.children.length){
      var note = document.createElement('div');
      note.className = 'cmModSub';
      note.style.margin = '.4rem 0 0';
      note.textContent = isSelf ? 'This is you.' : 'Nothing to do here.';
      acts.appendChild(note);
    }
    cmOpenMod('cmUserMod');
  }

  function cmuMemberRow(uid){
    for(var i = 0; i < cmi.memRows.length; i++){
      if(String(cmi.memRows[i].user_id) === String(uid)) return cmi.memRows[i];
    }
    return null;
  }

  async function cmUserOpenById(uid){
    if(!uid) return;
    var a = cpAuthors[String(uid)] || null;
    cmUserOpen({ id:uid, name:(a && a.name) || 'User', username:null, avatar:(a && a.avatar) || null }, null);
    try{
      var r = await sb.from('profiles').select('username,display_name,avatar_url').eq('id', uid).maybeSingle();
      if(r.error || !r.data) return;
      if(!cmuUser || String(cmuUser.id) !== String(uid)) return;
      cmUserOpen({
        id: uid,
        name: r.data.display_name || r.data.username || 'User',
        username: r.data.username || null,
        avatar: r.data.avatar_url || (a && a.avatar) || null
      }, null, cmuView);
    }catch(e){}
  }

  function cmTxtOpen(mid){
    var msg = null;
    for(var i = 0; i < cpComments.length; i++){
      if(String(cpComments[i].id) === String(mid)){ msg = cpComments[i]; break; }
    }
    if(!msg) return;
    document.getElementById('cmTxtQuote').textContent = msg.text || '';
    var acts = document.getElementById('cmTxtActs');
    acts.innerHTML = '';
    function add(label, fn, danger){ cmActItem(acts, label, fn, danger); }
    var mine = !!(currentUser && msg.user_id && String(msg.user_id) === String(currentUser.id));
    var canModerate = cmi.cid && cmi.rank >= 2;

    add('Copy text', function(){
      cmCloseMod('cmTxtMod');
      if(navigator.clipboard) navigator.clipboard.writeText(msg.text || '').then(function(){ showToast('Copied'); });
    });
    if(msg.user_id && !mine){
      add('View ' + (msg.user || 'author'), function(){
        cmCloseMod('cmTxtMod');
        cmUserOpenById(msg.user_id);
      });
      add('Report this message', function(){
        cmCloseMod('cmTxtMod');
        if(!currentUser){ openAuthMod(); return; }
        cmRptOpen('community_message', cmi.cid || null, String(msg.id), 'Report this message');
      });
    }
    if(mine || canModerate){
      add(mine ? 'Delete my message' : 'Delete this message', function(){ cmTxtDelete(msg); }, true);
    }
    cmOpenMod('cmTxtMod');
  }

  async function cmTxtDelete(msg){
    if(!confirm('Delete this message? It cannot be undone.')) return;
    try{
      var r = await sb.from('comments').delete().eq('id', msg.id);
      if(r.error) throw r.error;
      cmCloseMod('cmTxtMod');
      showToast('Message deleted');
      cpLastSig = '';
      var cDel = window.dzCached && window.dzCached();
      if(cDel){ try{ await cDel.invalidateCommunity(cpCurrentChannel); }catch(e2){} }
      await cpLoadComments();
    }catch(e){ showToast('Couldn’t delete that message'); }
  }

  var CM_RPT_REASONS = [
    'Spam or advertising',
    'Harassment or bullying',
    'Hate speech',
    'Sexual or explicit content',
    'Violence or threats',
    'Impersonation',
    'Something else'
  ];
  var cmRpt = null;

  function cmRptOpen(kind, subjectId, subjectRef, title){
    if(!currentUser){ openAuthMod(); return; }
    if(!subjectId){ showToast('Nothing to report here'); return; }
    cmRpt = { kind: kind, id: subjectId, ref: subjectRef || null, reason: null };
    document.getElementById('cmRptTitle').textContent = title || 'Report';
    document.getElementById('cmRptDetails').value = '';
    var box = document.getElementById('cmRptReasons');
    box.innerHTML = '';
    CM_RPT_REASONS.forEach(function(reason){
      var b = cmActItem(box, reason, function(){
        cmRpt.reason = reason;
        Array.prototype.forEach.call(box.children, function(c){ c.classList.remove('cmActItem--on'); });
        b.classList.add('cmActItem--on');
      });
    });
    cmOpenMod('cmRptMod');
  }

  async function cmRptSubmit(){
    if(!cmRpt) return;
    if(!cmRpt.reason){ showToast('Pick a reason first'); return; }
    var btn = document.getElementById('cmRptGo');
    btn.disabled = true; btn.textContent = 'SENDING…';
    try{
      var detail = document.getElementById('cmRptDetails').value.trim();
      var r = await sb.from('item_reports').insert({
        kind       : cmRpt.kind,
        subject_id : cmRpt.id,
        subject_ref: cmRpt.ref,
        reporter_id: currentUser.id,
        reason     : detail ? (cmRpt.reason + ' — ' + detail).slice(0, 500) : cmRpt.reason
      });
      if(r.error && r.error.code !== '23505') throw r.error;
      cmCloseMod('cmRptMod');
      showToast('Report sent — thank you');
    }catch(e){ showToast(cmErr(e)); }
    finally{ btn.disabled = false; btn.textContent = 'Send report'; }
  }

  var cpOffset = 0;
  var CP_INITIAL_LOAD = function(){ return 25; };
  var CP_LOAD_STEP = 25;
    // whether the channel holds messages older than the ones fetched
  var cpHasMore = false;
  var cpLoadingOlder = false;
  var cpPoll = null;
  var CP_POLL_MS = 5000;
  var cpLastSig = '';

    // Looked up when called. Reading them here works only while this file loads after app-core.js; dm.js broke on that
  function cpHHMM (iso) { return window.dzHHMM ? window.dzHHMM(iso) : ''; }
  function cpDayChip (d) { return window.dzDayChip ? window.dzDayChip(d) : ''; }

  var cpAuthors = {};

  async function cpLoadAuthors(list){
    if(!sb || !list || !list.length) return;
    var ids = [];
    list.forEach(function(c){
      if(c.user_id && ids.indexOf(String(c.user_id)) === -1) ids.push(String(c.user_id));
    });
    if(!ids.length) return;
    try{
      var r = await sb.from('profiles')
        .select('id,username,display_name,avatar_url')
        .in('id', ids);
      if(r.error) throw r.error;
      (r.data || []).forEach(function(p){
        cpAuthors[String(p.id)] = {
          name  : p.display_name || p.username || 'User',
          avatar: p.avatar_url || null
        };
      });
    }catch(e){   }
  }

  function cpAvatarHTML(c, extraCls){
    var a = c.user_id ? cpAuthors[String(c.user_id)] : null;
    var cls = 'cpAvatar' + (extraCls ? ' ' + extraCls : '');
    var uid = c.user_id ? ' data-uid="' + esc(String(c.user_id)) + '"' : '';
    if(a && a.avatar){
      return '<div class="' + cls + '"' + uid + '>' +
               '<img class="cpAvatarImg" src="' + esc(getThumbnailUrl(a.avatar)) +
               '" alt="" loading="lazy" decoding="async">' +
             '</div>';
    }
    return '<div class="' + cls + '"' + uid + '>' + esc(c.initial) + '</div>';
  }

  function cpAuthorName(c){
    var a = c.user_id ? cpAuthors[String(c.user_id)] : null;
    return (a && a.name) ? a.name : c.user;
  }

  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('[data-uid]');
    if(!t) return;
    if(!t.closest('#communityPage') && !t.closest('#cmChatPanel')) return;
    e.preventDefault(); e.stopPropagation();
    cmUserOpenById(t.getAttribute('data-uid'));
  });

  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('.cpMsgAct');
    if(!t) return;
    e.preventDefault(); e.stopPropagation();
    cmTxtOpen(t.getAttribute('data-mid'));
  });

  function cpRender(){
    var body  = document.getElementById('cpBody');
    var empty = document.getElementById('cpEmpty');
    if(!body) return;

    if(cpOffset === 0) cpOffset = CP_INITIAL_LOAD();

    var sig = cpComments.length + '|' + cpOffset + '|' +
              (cpComments.length ? (cpComments[cpComments.length - 1].raw_time || '') : '');
    var firstPaint = (cpLastSig === '');
    if(sig === cpLastSig) return;
    cpLastSig = sig;

    var prevHeight = body.scrollHeight;
    var prevTop    = body.scrollTop;
    var atBottom   = (prevHeight - prevTop - body.clientHeight) < 80;

    body.querySelectorAll('.cpComment, .cpShowcase, .cpMsgRow, .chatDay').forEach(function(el){ el.remove(); });

    if(cpComments.length === 0){
      if(empty) empty.style.display = 'flex';
      return;
    }
    if(empty) empty.style.display = 'none';

    var showCount = Math.min(cpOffset, cpComments.length);
    var toShow = cpComments.slice(cpComments.length - showCount);

    var isShowcase = cpCurrentChannel === 'showcase';

    var cpLastDayKey = '', cpLastSenderKey = null, cpLastTs = 0;

    toShow.forEach(function(c){
      var div = document.createElement('div');
      if(isShowcase){
        div.className = 'cpShowcase';

        var scShot = (typeof getViewUrl === 'function')
                       ? getViewUrl(c.image_url || '')
                       : (c.image_url || '');
        var scName = cpAuthorName(c);
        div.innerHTML =
          '<div class="cpShowcaseHead">' +
            cpAvatarHTML(c) +
            '<div class="cpShowcaseMeta">' +
              '<div class="cpCommentUser"' + (c.user_id ? ' data-uid="' + esc(String(c.user_id)) + '"' : '') + '>' + esc(scName) + '</div>' +
              '<div class="cpCommentTime">' + esc(c.time) + '</div>' +
            '</div>' +
          '</div>' +
          (c.image_url ? ('<img class="cpShowcaseImg" src="' + esc(getThumbnailUrl(c.image_url||'')) + '" alt="' + esc(scName) + '\'s artwork">') : '') +
          '<div class="cpShowcaseText">' + esc(c.text) + '</div>';

        var scImg = div.querySelector('.cpShowcaseImg');
        if(scImg && scShot) scImg.addEventListener('click', function(){
          if(typeof dzLightOpen === 'function') dzLightOpen(scShot, scName + '\u2019s artwork');
        });
      } else {
        if(!c.text){ return; }
        var mine = !!(typeof currentUser !== 'undefined' && currentUser && c.user_id && String(c.user_id) === String(currentUser.id));
        var d = c.raw_time ? new Date(c.raw_time) : null;
        var dayKey = d ? d.toDateString() : '';
        if(dayKey && dayKey !== cpLastDayKey){
          var chip = document.createElement('div');
          chip.className = 'chatDay';
          chip.innerHTML = '<span>' + cpDayChip(d) + '</span>';
          body.appendChild(chip);
          cpLastDayKey = dayKey;
          cpLastSenderKey = null;
        }
        var senderKey = c.user_id != null ? 's:'+c.user_id : 'n:'+c.user;
        var ts = d ? d.getTime() : 0;
        var cont = cpLastSenderKey === senderKey && ts && (ts - cpLastTs) < 300000;
        cpLastSenderKey = senderKey; cpLastTs = ts;

        var shortTime = cpHHMM(c.raw_time) || esc(c.time);

        div.className = 'cpMsgRow ' + (mine ? 'cpMsgRow--me' : 'cpMsgRow--them') + (cont ? ' cpMsgRow--cont' : '');
        var act = c.id != null
          ? '<button class="cpMsgAct" type="button" data-mid="' + esc(String(c.id)) + '" title="Message options" aria-label="Message options">⋯</button>'
          : '';
        div.innerHTML =
          (!mine ? cpAvatarHTML(c, 'cpMsgAvatar' + (cont ? ' cpMsgAvatar--ghost' : '')) : '') +
          '<div class="cpBubble' + (act ? ' cpBubble--act' : '') + '">' +
            (!mine && !cont ? '<div class="cpBubbleName"' + (c.user_id ? ' data-uid="' + esc(String(c.user_id)) + '"' : '') + '>' + esc(cpAuthorName(c)) + '</div>' : '') +
            '<span class="cpBubbleText">' + esc(c.text) + '</span>' +
            '<span class="cpBubbleTime">' + shortTime + '</span>' +
            act +
          '</div>';
      }
      body.appendChild(div);
    });

    if(cpLoadingOlder){
      body.scrollTop = prevTop + (body.scrollHeight - prevHeight);
      cpLoadingOlder = false;
    } else if(firstPaint || atBottom){
      body.scrollTop = body.scrollHeight;
    } else {
      body.scrollTop = prevTop;
    }
  }

  (function(){
    var _cpRefreshing = false;
    var _cpRefreshTimer = null;

    function cpTriggerRefresh(){
      if(_cpRefreshing) return;
        // more to reveal from what is loaded, or more still on the server
      if(cpOffset >= cpComments.length && !cpHasMore) return;
      _cpRefreshing = true;
      var wrap = document.getElementById('cpRefreshWrap');
      if(wrap) wrap.classList.add('visible');

      cpLoadingOlder = true;
      cpOffset += CP_LOAD_STEP;

      cpLoadComments().then(function(){
        setTimeout(function(){
          if(wrap) wrap.classList.remove('visible');
          _cpRefreshing = false;
        }, 800);
      }).catch(function(){
        if(wrap) wrap.classList.remove('visible');
        _cpRefreshing = false;
        cpLoadingOlder = false;
      });
    }

    document.addEventListener('DOMContentLoaded', function(){
      var body = document.getElementById('cpBody');
      if(!body) return;

      body.addEventListener('scroll', function(){
        var nearTop = body.scrollTop <= 40;
        if(nearTop && !_cpRefreshing){
          clearTimeout(_cpRefreshTimer);
          _cpRefreshTimer = setTimeout(function(){
            var page = document.getElementById('communityPage');
            if(page && page.classList.contains('open')){
              cpTriggerRefresh();
            }
          }, 300);
        }
      }, {passive:true});
    });
  })();

  async function cpSend(){
    var inp=document.getElementById('cpBarInput');
    var text=inp?inp.value.trim():'';
    if(!text) return;

    if(!currentUser){
      showToast('Please login to comment.');
      return;
    }

    var chan = CM_CHANNELS[cpCurrentChannel];
    if(chan && chan.readOnly && !isDev){
      showToast('Only DigiArtz can post in this channel.');
      return;
    }

    if(chan && chan.type === 'showcase'){
      var thumbEl = document.getElementById('cpSelectedImage');
      var hasImage = thumbEl && thumbEl.style.display !== 'none';
      if(!hasImage){
        showToast('Tap + and pick one of your artworks or comics first.');
        return;
      }
      var remaining = cpShowcaseCooldownRemaining();
      if(remaining > 0){
        showToast('You can showcase again in ' + cpFormatCooldown(remaining) + '.');
        return;
      }
    }

    var wait = window.dzChat.check(text);
    if(wait){ showToast(wait); return; }

    const ok=await cpSaveComment(text);
    if(!ok) return;

    if(inp) inp.value='';
    await cpLoadComments();
  }

  function cpShowcaseCooldownRemaining(){
    if(!currentUser) return 0;
    var last = 0;
    cpComments.forEach(function(c){
      if(c.user_id === currentUser.id && c.raw_time){
        var t = new Date(c.raw_time).getTime();
        if(t > last) last = t;
      }
    });
    if(!last) return 0;
    var cooldownMs = (CM_CHANNELS.showcase && CM_CHANNELS.showcase.cooldownMs) || 3600000;
    var remaining = cooldownMs - (Date.now() - last);
    return remaining > 0 ? remaining : 0;
  }

  function cpFormatCooldown(ms){
    var mins = Math.ceil(ms / 60000);
    if(mins >= 60) return Math.ceil(mins / 60) + 'h';
    return mins + 'm';
  }

  function cpOpenShowcasePicker(){
    if(!currentUser){ showToast('Please login first.'); openAuthMod(); return; }
    var body  = document.getElementById('spBody');
    var empty = document.getElementById('spEmpty');
    if(!body) return;
    body.innerHTML = '';

      // `comics` was a second list and exists nowhere now, so reading it threw and the picker never opened
    var items = (images || [])
      .filter(function(a){ return a.user_id === currentUser.id; })
      .map(function(a){ return { url:a.image_url, name:a.name || 'Untitled' }; });

    if(items.length === 0){
      if(empty) empty.style.display = 'flex';
    } else {
      if(empty) empty.style.display = 'none';
      items.forEach(function(it){
        if(!it.url) return;
        var div = document.createElement('div');
        div.className = 'spItem';
        div.innerHTML = '<img src="' + esc(it.url) + '" alt="' + esc(it.name) + '"><span>' + esc(it.name) + '</span>';
        div.addEventListener('click', function(){ cpPickShowcaseImage(it.url); });
        body.appendChild(div);
      });
    }

    var el = document.getElementById('showcasePicker');
    if(el) el.classList.add('open');
  }

  function cpPickShowcaseImage(url){
    var thumb    = document.getElementById('cpSelectedImage');
    var thumbImg = document.getElementById('cpSelectedImageImg');
    if(thumb && thumbImg){
      thumbImg.src = url;
      thumb.style.display = 'flex';
    }
    closeShowcasePicker();
  }

  function closeShowcasePicker(){
    var el = document.getElementById('showcasePicker');
    if(el) el.classList.remove('open');
  }

  document.addEventListener('DOMContentLoaded', function(){
    var inp = document.getElementById('cpBarInput');
    if(inp){
      inp.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); cpSend(); }
      });
    }
  });

  function cpMsgKey(channel){
    var c = window.dzCached ? window.dzCached() : null;
    return (c && channel) ? c.ukey('community', channel) : null;
  }
  function cpSavedMessages(channel){
    var c = window.dzCached && window.dzCached(), k = cpMsgKey(channel);
    if(!c || !k) return null;
    var got = c.peek(k, 'community:posts', { any:true });
    return (got && got.length) ? got : null;
  }
  function cpSaveMessages(channel, rows){
    var c = window.dzCached && window.dzCached(), k = cpMsgKey(channel);
    if(!c || !k || !rows) return;
    c.set(k, rows.slice(-50), 'community:posts');
  }

  async function cpLoadComments(silent){
    if(!sb){
      if(silent) return;
      cpComments = [];
      cpRender();
      return;
    }
    try{
      var forChannel = cpCurrentChannel;
      var emptyEl = document.getElementById('cpEmpty');
      if(emptyEl && cpComments.length === 0){
        emptyEl.innerHTML = '<div class="cpEIco">◎</div><div>LOADING…</div>';
        emptyEl.style.display = 'flex';
      }
        // Only as far back as the reader scrolled. It used to ask for the whole channel every five seconds, and past the row cap returned the OLDEST page
      var want = Math.max(cpOffset, CP_INITIAL_LOAD()) + CP_LOAD_STEP;
      var result = await sb.from('comments')
        .select('*')
        .eq('channel', forChannel)
        .order('created_at', { ascending: false })
        .limit(want);
      if(result.error) throw result.error;
      if(cpCurrentChannel !== forChannel) return;
      var rows = (result.data || []).slice().reverse();
      cpHasMore = (result.data || []).length >= want;
      cpComments = rows.map(function(row){
        var displayName = row.username || 'User';
        return {
          id        : row.id,
          initial   : displayName.charAt(0).toUpperCase(),
          user      : displayName,
          user_id   : row.user_id || null,
          text      : row.comment_text || '',
          time      : row.created_at
            ? new Date(row.created_at).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' })
            : '',
          raw_time  : row.created_at || null,
          image_url : row.image_url || null
        };
      });
      await cpLoadAuthors(cpComments);
      if(cpCurrentChannel !== forChannel) return;
      cpMsgCache[forChannel] = cpComments;
      if(emptyEl){
        emptyEl.innerHTML = cpCurrentChannel === 'showcase'
          ? '<div class="cpEIco">◎</div><div>NOTHING SHOWCASED YET</div><div style="font-size:.68rem;opacity:.6;margin-top:.2rem;">BE THE FIRST TO SHARE YOUR WORK</div>'
          : '<div class="cpEIco">◎</div><div>NO COMMENTS YET</div><div style="font-size:.68rem;opacity:.6;margin-top:.2rem;">BE THE FIRST TO LEAVE ONE</div>';
      }
      cpRender();
      cpSaveMessages(forChannel, cpComments);
    }catch(e){
      console.error('cpLoadComments:', e);
      if(silent) return;
      var cachedCp = cpSavedMessages(cpCurrentChannel);
      if(cachedCp && cachedCp.length){
        cpComments = cachedCp;
        cpHasMore = false;   // a saved copy is all there is offline
        cpRender();
        showToast('Offline \u2014 showing saved messages');
        return;
      }
      showToast('Failed to load comments');
      cpComments = [];
      cpRender();
    }
  }

  async function cpSaveComment(text){
    if(!sb){ showToast('Can\u2019t connect \u2014 try again'); return false; }
    if(!currentUser){ showToast('Please login to comment.'); openAuthMod(); return false; }

    var imageUrl = null;
    var thumbEl  = document.getElementById('cpSelectedImage');
    var thumbImg = document.getElementById('cpSelectedImageImg');
    if(thumbEl && thumbEl.style.display !== 'none' && thumbImg && thumbImg.src && thumbImg.src !== window.location.href){
      imageUrl = thumbImg.src;
    }

    var sendBtn = document.getElementById('cpBarSend');
    if(sendBtn){ sendBtn.disabled = true; sendBtn.style.opacity = '.55'; }

    try{
      var commentUsername = (currentUser.user_metadata && currentUser.user_metadata.username) || 'User';
      var result = await sb.from('comments').insert({
        user_id      : currentUser.id,
        username     : commentUsername,
        comment_text : text,
        image_url    : imageUrl,
        channel      : cpCurrentChannel
      }).select('id');
      if(result.error) throw result.error;
      if(!result.data || !result.data.length){
        showToast(await window.dzChat.fromServer(sb));
        return false;
      }
      window.dzChat.note(text);
      if(thumbEl)  thumbEl.style.display = 'none';
      if(thumbImg) thumbImg.src = '';
      return true;
    }catch(e){
      console.error('cpSaveComment:', e);
      var msg = (e && e.message) || '';
      if(/CM_NO_LINKS/.test(msg)){
        showToast('Links aren\u2019t allowed in this community');
        return false;
      }
      if(/^c:/.test(cpCurrentChannel || '') && /row-level security|violates row-level|42501/i.test(msg)){
        showToast('You can\u2019t post here right now — you may be timed out or banned.');
        return false;
      }
      if(window.meritDenied && window.meritDenied(e, 'chat')) return false;
      showToast(safeErr(e, 'Could not send \u2014 try again'));
      return false;
    }finally{
      if(sendBtn){ sendBtn.disabled = false; sendBtn.style.opacity = ''; }
    }
  }
