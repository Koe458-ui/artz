  var upq = { jobs: [], seq: 0, modalJob: null, modalSnap: null };

  var UPQ_STAGE_LABEL = { uploading:'UPLOADING', finalizing:'ALMOST DONE', live:'LIVE', failed:'FAILED' };

  function upqStart(snap){
    var job = {
      id: 'upq_' + (++upq.seq) + '_' + Date.now(),
      stage: 'uploading',
      name: snap.name, desc: snap.desc, tags: snap.tags, cats: snap.cats,
      software: snap.software, file: snap.file, pageFiles: snap.pageFiles,
      extra: snap.extra || {},
      thumbFocus: snap.thumbFocus, preview: snap.preview,
      albums: (snap.albums || []).slice(),
      publishAt: snap.publishAt || '',
      upDone: 0, upTotal: 1 + snap.pageFiles.length,
      uploadedPaths: [],
      landed: false,
      failReason: null
    };
    upq.jobs.unshift(job);
    upqSync();
    upqRun(job);
  }

  function upqFind(id){ return upq.jobs.find(function(j){ return j.id===id; }); }

  function upqRemove(id){
    var i = upq.jobs.findIndex(function(j){ return j.id===id; });
    if(i!==-1) upq.jobs.splice(i,1);
    if(upq.modalJob===id) upqCloseModal();
    upqSync();
  }

  function upqSync(){
    if(currentUser && pf.profile && String(pf.profile.id)===String(currentUser.id) && Array.isArray(pf.galleryRows)){
      pfRenderGallery();
    }
    if(typeof mwRenderArt==='function' && typeof mw==='object' && mw && Array.isArray(mw.art)){
      mwRenderArt();
    }
    upqRenderModal();
  }

  function upqOwnQueueHTML(){
    if(!currentUser || !upq.jobs.length) return '';
    return upq.jobs.map(function(j){
      var hint = '';
      if(j.stage==='uploading')       hint = j.upTotal>1 ? ('Transferring '+Math.min(j.upDone+1,j.upTotal)+' of '+j.upTotal+' images') : 'Transferring image';
      else if(j.stage==='finalizing') hint = 'Publishing';
      return '<div class="upqCard'+(j.stage==='live'?' upqLive':'')+'" onclick="upqOpenModal(\''+j.id+'\')" role="status" title="Tap for status">'+
        '<div class="upqImgWrap">'+
          (j.preview ? '<img class="upqImg" src="'+j.preview+'" alt="" style="'+thumbStyle(j.thumbFocus.x, j.thumbFocus.y, j.thumbFocus.z)+'">' : '')+
          '<div class="upqOvl">'+
            '<div class="upqSpin"></div>'+
            '<div class="upqCheck">\u2713</div>'+
            '<div class="upqStage">'+(UPQ_STAGE_LABEL[j.stage]||'UPLOADING')+'</div>'+
            (hint ? '<div class="upqSub">'+esc(hint)+'</div>' : '')+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  async function upqRun(job){
    try{
      job.stage='uploading'; job.upDone=0; upqSync();
      var phash = (window.ImageHash && typeof ImageHash.phashOf==='function')
        ? await ImageHash.phashOf(job.file) : null;
      var uniq = Date.now()+'_'+job.id.split('_')[1];
      var ext = safeSlug(job.file.name.split('.').pop(), 8) || 'jpg';
      var path = 'artworks/'+currentUser.id+'/'+uniq+'_'+safeSlug(job.name)+'.'+ext;
      const publicUrl = await s3Upload(BUCKET, path, job.file);
      job.uploadedPaths.push(path);
      job.upDone=1; upqSync();
      var artPageUrls = [];
      for(var ai=0; ai<job.pageFiles.length; ai++){
        var af = job.pageFiles[ai];
        var aext = safeSlug(af.name.split('.').pop(), 8) || 'jpg';
        var apath = 'artworks/'+currentUser.id+'/'+uniq+'_i'+ai+'.'+aext;
        var aUrl = await s3Upload(BUCKET, apath, af);
        job.uploadedPaths.push(apath);
        artPageUrls.push(aUrl);
        job.upDone = 1+ai+1; upqSync();
      }

      job.stage='finalizing'; upqSync();

      var x = {}, ek;
      for(ek in (job.extra||{})) x[ek] = job.extra[ek];
      var _f = job.file || {};
      var _em = /\.([a-z0-9]{1,8})$/i.exec(String(_f.name||''));
      x.file_ext  = _em ? _em[1].toLowerCase() : ((_f.type||'').split('/')[1] || null);
      x.file_size = _f.size || null;
      if(typeof dzImageDims === 'function'){
        var _d = await dzImageDims(_f);
        var _dm = _d && /^(\d+)×(\d+)/.exec(_d);
        if(_dm){ x.width = +_dm[1]; x.height = +_dm[2]; }
      }
      x.seo_title = (typeof dzSeoTitle === 'function') ? dzSeoTitle(job.name) : null;
      x.seo_description = (typeof dzSeoDesc === 'function') ? dzSeoDesc(job.desc, job.desc) : null;
      x.slug = (typeof dzSlugify === 'function')
        ? (dzSlugify(job.name).slice(0,110) + '-' + String(Date.now()).slice(-6))
        : null;
      var _mature = !!x.declared_mature;

      if(job.publishAt){
        const{error:se}=await sb.from('scheduled_uploads').insert({
          user_id:currentUser.id, publish_at:job.publishAt,
          name:job.name, description:job.desc||null, tags:job.tags, category:job.cats,
          image_url:publicUrl, storage_path:path,
          thumb_x:job.thumbFocus.x, thumb_y:job.thumbFocus.y, thumb_zoom:job.thumbFocus.z||1,
          pages:artPageUrls.length?artPageUrls:null, kind:ART_KIND_ART,
          software:job.software||null, phash:phash,
          album_ids: (job.albums && job.albums.length) ? job.albums : null,
          content_rating:_mature ? 'MATURE' : 'SAFE', is_mature:_mature,
          extra: x
        });
        if(se) throw se;
        job.stage='done'; upqSync();
        upqRemove(job.id);
        uschLoad();
        return;
      }
      var artRow = {
        name:job.name, description:job.desc||null, tags:job.tags, category:job.cats,
        image_url:publicUrl, storage_path:path,
        thumb_x:job.thumbFocus.x, thumb_y:job.thumbFocus.y, thumb_zoom:job.thumbFocus.z||1,
        pages:artPageUrls.length?artPageUrls:null, kind:ART_KIND_ART,
        user_id:currentUser.id, software:job.software||null, phash:phash,
        status: 'approved',
        content_rating:_mature ? 'MATURE' : 'SAFE', is_mature:_mature
      };
      ['summary','subject_matter','medium','software_list','license','commercial_use',
       'attribution_required','modification_allowed','credits','process_notes',
       'external_links','comments_allowed','visibility','featured',
       'seo_title','seo_description','slug','file_ext','file_size','width','height'
      ].forEach(function(k){ if(x[k] !== undefined) artRow[k] = x[k]; });

      const{data:rows,error:de}=await sb.from('artworks').insert(artRow).select();
      if(de) throw de;
        // Artwork is in the table. Anything failing after this leaves a live artwork behind, so the sweep must not take
        // its picture. The list stays, because the media rows below are written from it.
      job.landed = true;

      var _newRow = rows && rows[0];
      if(_newRow && job.albums && job.albums.length) await albAttach(_newRow.id, job.albums);

      if(_newRow){
        await dzRecordUpload({
          imageKind:'artworkImage', fileKind:'artworkFile', parentId:_newRow.id,
          url:publicUrl, path:path, file:job.file, position:0
        });
        for(var mi=0; mi<job.pageFiles.length; mi++){
          await dzRecordUpload({
            imageKind:'artworkImage', fileKind:'artworkFile', parentId:_newRow.id,
            url:artPageUrls[mi], path:job.uploadedPaths[mi+1],
            file:job.pageFiles[mi], position:mi+1
          });
        }
      }

      job.stage = 'live';
      upqSync();
      var row = rows && rows[0];

      if(row && typeof window.dzArtworkChanged === 'function'){
        window.dzArtworkChanged(row.id, { userId: row.user_id || (currentUser && currentUser.id) });
      }
      setTimeout(function(){
        if(row){
          if(pf.profile && String(pf.profile.id)===String(currentUser.id) && Array.isArray(pf.galleryRows) &&
             pf.galleryRows.findIndex(function(i){return String(i.id)===String(row.id);})===-1){
            pf.galleryRows.unshift(row);
            if(typeof pfGalleryAdopt==='function') pfGalleryAdopt(row.id);
            if(typeof window.pfBumpArtCount === 'function') window.pfBumpArtCount(1);
          }
          if(images.findIndex(function(i){return String(i.id)===String(row.id);})===-1) images.unshift(row);
          if(typeof mw==='object' && mw && Array.isArray(mw.art) && mw.art.findIndex(function(i){return String(i.id)===String(row.id);})===-1) mw.art.unshift(row);
          if(typeof renderHome==='function') renderHome();
          var _fgEl=document.getElementById('fg'); if(_fgEl && _fgEl.classList.contains('open') && typeof renderFG==='function') renderFG();
          if(typeof window.dzGalleryStore==='function') window.dzGalleryStore();
        }
        upqRemove(job.id);
      }, 1600);
      showToast('\u201C'+(job.name||'Artwork')+'\u201D is live');
    }catch(err){
      if(!job.landed){
        for(var d=0; d<job.uploadedPaths.length; d++){
          try{ await s3Delete(BUCKET, job.uploadedPaths[d]); }
          catch(e){ console.error('upq cleanup:', e.message); }
        }
      }
      job.stage='failed';
      if(err && /row-level security|violates row-level|42501/i.test((err.message||'')+' '+(err.code||''))){
        job.failReason = 'Your merit is below 80 \u2014 uploads are paused until it recovers (+2/day).';
      } else {
        job.failReason = safeErr(err, 'Upload failed \u2014 please try again');
      }
      console.error('upq failed:', err && err.message);
      upqOpenModal(job.id);
    }
  }

  function upqOpenModal(id){
    var j = upqFind(id);
    if(!j) return;
    if(j.stage==='failed'){
      upq.modalSnap = j; upq.modalJob = null;
      var i = upq.jobs.indexOf(j); if(i!==-1) upq.jobs.splice(i,1);
      upqSync();
    } else {
      upq.modalJob = id; upq.modalSnap = null;
    }
    upqRenderModal();
    document.getElementById('upqBackdrop').classList.add('open');
  }
  function upqCloseModal(){
    upq.modalJob = null; upq.modalSnap = null;
    var bd = document.getElementById('upqBackdrop');
    if(bd) bd.classList.remove('open');
  }

  function upqTrackRow(state, name, sub, last){
    var cls = state==='run' ? 'run' : (state==='pass' ? 'pass' : (state==='flag'||state==='block'||state==='fail') ? 'fail' : 'pend');
    var ico = cls==='pass' ? '\u2713' : cls==='fail' ? '\u2715' : '';
    var lbl = cls==='pass' ? 'Done' : cls==='fail' ? 'Failed' : cls==='run' ? 'Working\u2026' : 'Pending';
    return '<div class="upqTrk '+cls+'">'+
      '<div class="upqTrkRail"><div class="upqTrkIco">'+ico+'</div>'+(last?'':'<div class="upqTrkLine"></div>')+'</div>'+
      '<div class="upqTrkTx"><div class="upqTrkName">'+name+'</div>'+
      (sub ? '<div class="upqTrkSub">'+esc(sub)+'</div>' : '')+'</div>'+
      '<div class="upqTrkState">'+lbl+'</div>'+
    '</div>';
  }

  function upqRenderModal(){
    var j = upq.modalSnap || (upq.modalJob && upqFind(upq.modalJob));
    if(!j) return;
    var title = document.getElementById('upqMTitle');
    var body  = document.getElementById('upqMBody');
    if(!title || !body) return;
    var failed = j.stage==='failed';
    title.textContent = failed ? 'UPLOAD FAILED' : 'UPLOAD STATUS';
    var order = ['uploading','finalizing','live'];
    var si = order.indexOf(j.stage);
    var transferState = j.stage==='uploading' ? 'run' : (si>0 ? 'pass' : '');
    var publishState  = j.stage==='finalizing' ? 'run' : (j.stage==='live' ? 'pass' : '');
    var transferSub = j.stage==='uploading'
      ? (j.upTotal>1 ? (Math.min(j.upDone+1,j.upTotal)+' of '+j.upTotal+' images') : 'Sending your image')
      : (si>0 ? 'Done' : '');
    var html = '';
    if(failed){
      html += '<div class="upqFailBox">'+
        '<div class="upqFailIco">!</div>'+
        '<div><div class="upqFailTitle">\u201C'+esc(j.name||'Untitled')+'\u201D was not published</div>'+
        '<div class="upqFailReason">'+esc(j.failReason||'The artwork could not be published.')+'</div></div>'+
      '</div>';
    }
    var rows = [
      ['pass', 'Upload received', ''],
      ['pass', 'File integrity & format', ''],
      [transferState, 'Secure transfer', transferSub],
      [publishState, 'Publish', j.stage==='live' ? 'Your artwork is live' : '']
    ];
    for(var ri=0; ri<rows.length; ri++){
      html += upqTrackRow(rows[ri][0], rows[ri][1], rows[ri][2], ri===rows.length-1);
    }
    if(failed){
      html += '<div class="upqFin fail">Upload stopped \u2014 nothing was published</div>';
      html += '<div class="upqFailNote">Any transferred file has been removed from storage. Fix the issue above and upload again whenever you\u2019re ready.</div>';
    } else if(j.stage==='live'){
      html += '<div class="upqFin ok">Done \u2014 your artwork is live</div>';
    } else {
      html += '<div class="upqFin busy">Publishing your artwork now\u2026</div>';
    }
    body.innerHTML = html;
  }

  function upqBusy(){
    for(var i = 0; i < upq.jobs.length; i++){
      var st = upq.jobs[i].stage;
      if(st === 'uploading' || st === 'finalizing') return true;
    }
    return false;
  }
  window.upqBusy = upqBusy;

  window.addEventListener('beforeunload', function(e){
    if(!upqBusy()) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
