(function(){
  'use strict';
  var KIND = { resources:'resource', blog:'blog', marketplace:'marketplace', jobs:'job' };
  var cur = { sec:null, idx:-1 };
  var curExt = null;
  var profCache = {};

  function H(){ return window.dzHelpers || { money:function(){return '';}, bytes:function(){return '';}, ago:function(){return '';} }; }
  function safeHref(u){ return /^https?:\/\//i.test(String(u||'')) ? String(u) : ''; }
  function rows(){ return (typeof window.dzGetRows==='function' ? window.dzGetRows(cur.sec) : []) || []; }
  function dzc(){ return window.dzCached ? window.dzCached() : null; }

  var CM_PAGE = 20;
  function cmRow(c, kind, id, listId){
    var mine = window.currentUser && c.user_id === currentUser.id;
    return '<div class="avCm">'+
      '<div class="avCmAv">'+esc((c.username||'?').charAt(0).toUpperCase())+'</div>'+
      '<div class="avCmMain"><div class="avCmHead"><span class="avCmName">'+esc(c.username||'artist')+'</span>'+
      '<span class="avCmTime">'+esc(H().ago(c.created_at))+'</span>'+
      (mine ? '<button class="avCmDel" onclick="dzCmDelAsk('+c.id+',\''+esc(kind)+'\',\''+esc(id)+'\',\''+listId+'\')" aria-label="Delete comment">\u2715</button>' : '')+
      '</div><div class="avCmBody">'+esc(c.body)+'</div></div></div>';
  }
  function cmMoreBtn(listId, show, busy){
    var b = document.getElementById(listId+'_more');
    if(!b){
      var list = document.getElementById(listId);
      if(!list || !list.parentNode) return;
      b = document.createElement('button');
      b.type = 'button';
      b.id = listId+'_more';
      b.className = 'vwMore';
      b.hidden = true;
      b.onclick = function(){ window.dzCmMore(listId); };
      list.parentNode.insertBefore(b, list.nextSibling);
    }
    b.hidden = !show;
    b.disabled = !!busy;
    b.textContent = busy ? 'LOADING\u2026' : 'LOAD 20 MORE';
  }
  async function cmPage(listId, token, first){
    var host = document.getElementById(listId);
    if(!host || !sb) return;
    var kind = host.dataset.cmKind, id = host.dataset.cmSid;
    var off = parseInt(host.dataset.cmOff, 10) || 0;
    if(!first) cmMoreBtn(listId, true, true);
    try{
      var cmLoad = async function(){
        var r = await sb.from('item_comments')
          .select('id,user_id,username,body,created_at')
          .eq('kind',kind).eq('subject_id',id)
          .order('created_at',{ascending:false})
          .range(off, off + CM_PAGE - 1);
        if(r && r.error) throw r.error;
        return (r && r.data) || [];
      };
      var c = dzc();
      var list = (c && off === 0)
        ? await c.getOrSet('comments:' + kind + ':' + id + ':page:0', cmLoad, 'comments')
        : await cmLoad();
      host = document.getElementById(listId);
      if(!host || host.dataset.cmToken !== token) return;
      var html = list.map(function(c){ return cmRow(c, kind, id, listId); }).join('');
      if(first) host.innerHTML = html || '<div class="avCmEmpty">NO COMMENTS YET \u2014 BE THE FIRST</div>';
      else if(html) host.insertAdjacentHTML('beforeend', html);
      host.dataset.cmOff = String(off + list.length);
      cmMoreBtn(listId, list.length === CM_PAGE, false);
    }catch(e){
      host = document.getElementById(listId);
      if(host && host.dataset.cmToken === token && first){
        host.innerHTML = '<div class="avCmEmpty">COULD NOT LOAD COMMENTS</div>';
      }
      cmMoreBtn(listId, false, false);
    }
  }
  window.dzCmLoad = function(kind, id, listId){
    var host = document.getElementById(listId);
    if(!host || !id || !sb) return;
    host.dataset.cmKind = String(kind);
    host.dataset.cmSid  = String(id);
    host.dataset.cmOff  = '0';
    var token = host.dataset.cmToken = String(Math.random());
    host.innerHTML = '<div class="avCmEmpty">LOADING\u2026</div>';
    cmMoreBtn(listId, false, false);
    return cmPage(listId, token, true);
  };
  window.dzCmMore = function(listId){
    var host = document.getElementById(listId);
    if(!host) return;
    cmPage(listId, host.dataset.cmToken, false);
  };
  window.dzCmPost = async function(kind, id, inputId, listId){
    if(!id) return;
    if(!window.currentUser){
      if(typeof pfGuestGate==='function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return;
    }
    var input = document.getElementById(inputId);
    var body = input ? String(input.value||'').trim() : '';
    if(!body) return;
    if(input) input.disabled = true;
    try{
      var res = await sb.from('item_comments').insert({ kind:kind, subject_id:id, user_id:currentUser.id, body:body });
      if(res.error) throw res.error;
      if(input) input.value = '';
      var cPost = dzc();
      if(cPost) { try{ await cPost.invalidateComments(kind, id); }catch(e2){} }
      if(kind !== 'job' && typeof window.dzAnTrack === 'function'){
        window.dzAnTrack('comment', String(id), { scope: kind });
      }
      window.dzCmLoad(kind, id, listId);
    }catch(e){
      showToast(typeof safeErr === 'function'
        ? safeErr(e, 'Could not post the comment')
        : 'Could not post the comment');
    }
    finally{ if(input) input.disabled = false; }
  };
  window.dzCmDelAsk = function(cid, kind, id, listId){
    window.dzConfirm('Delete your comment?',
      'This removes it for everyone. It cannot be undone.', 'Delete',
      function(){ window.dzCmDel(cid, kind, id, listId); });
  };
  window.dzCmDel = async function(cid, kind, id, listId){
    try{
      var res = await sb.from('item_comments').delete().eq('id', cid);
      if(res.error) throw res.error;
      var cDel = dzc();
      if(cDel) { try{ await cDel.invalidateComments(kind, id); }catch(e2){} }
      window.dzCmLoad(kind, id, listId);
    }catch(e){ showToast('Could not delete'); }
  };

  window.dzReportItem = function(kind, id){
    if(!window.currentUser){
      if(typeof pfGuestGate==='function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return;
    }
    var reason = prompt('Why are you reporting this?');
    if(reason === null) return;
    reason = String(reason).trim();
    if(reason.length < 3){ showToast('Add a short reason'); return; }
    sb.from('item_reports').insert({ kind:kind, subject_id:id, reporter_id:currentUser.id, reason:reason.slice(0,500) })
      .then(function(res){ showToast(res.error ? 'Could not send the report' : 'Report sent'); });
  };

  window.dzOpenArtwork = function(id){
    try{
      if(typeof openArtworkById === 'function' && openArtworkById(id, true)) return;
    }catch(e){}
    try{ location.href = '/artwork/' + encodeURIComponent(id); }catch(e){}
  };
  window.dzOpenListing = async function(id){
    if(!sb) return;
    try{
      var sel = (typeof window.dzSelectFor === 'function')
                ? window.dzSelectFor('marketplace') : 'id,title,preview_url,description';
      var res = await sb.from('marketplace_items').select(sel).eq('id', id).single();
      if(res && res.data) window.dzOpenRow('marketplace', res.data);
      else showToast('That listing is no longer available');
    }catch(e){ showToast('Could not open that listing'); }
  };

  async function fillRelated(r){
    var host = document.getElementById('dzvRelated');
    if(!host || !sb) return;
    var token = host.dataset.relToken = String(Math.random());
    var art = (r.related_artworks || []).slice(0, 10);
    var itm = (r.related_items || []).slice(0, 10);
    var out = '';
    try{
      if(art.length){
        // published only, the way the related listings ask: linking a draft from a post must not put it on a public rail
        var a = await sb.from('artworks').select('id,name,title,image_url')
                  .in('id', art).eq('status','approved')
                  .eq('visibility','published').limit(10);
        var arows = (a && a.data) || [];
        if(arows.length){
          out += '<div><div class="avBlockH">Related artwork</div><div class="dzvRelRow">'+
            arows.map(function(x){
              var nm = x.name || x.title || 'Untitled';
              return '<div class="dzvRelCard" onclick="dzOpenArtwork(\''+esc(x.id)+'\')">'+
                (x.image_url ? '<img src="'+esc(getThumbnailUrl(x.image_url))+'" alt="" loading="lazy">'
                             : '<span class="dzvRelNo"></span>')+
                '<span class="dzvRelNm">'+esc(nm)+'</span></div>';
            }).join('')+'</div></div>';
        }
      }
      if(itm.length){
        var m = await sb.from('marketplace_items').select('id,title,preview_url')
                  .in('id', itm).eq('status','approved').eq('visibility','published').limit(10);
        var mrows = (m && m.data) || [];
        if(mrows.length){
          out += '<div><div class="avBlockH">Related listings</div><div class="dzvRelRow">'+
            mrows.map(function(x){
              return '<div class="dzvRelCard" onclick="dzOpenListing(\''+esc(x.id)+'\')">'+
                (x.preview_url ? '<img src="'+esc(getThumbnailUrl(x.preview_url))+'" alt="" loading="lazy">'
                               : '<span class="dzvRelNo"></span>')+
                '<span class="dzvRelNm">'+esc(x.title||'Untitled')+'</span></div>';
            }).join('')+'</div></div>';
        }
      }
    }catch(e){ out = ''; }
    host = document.getElementById('dzvRelated');
    if(!host || host.dataset.relToken !== token) return;
    host.innerHTML = out;
  }

  var VW_ICO = {
    close : '<path d="M6 6 18 18"/><path d="M18 6 6 18"/>',
    like  : '<path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.3a5 5 0 1 1 7.5 6.3Z"/>',
    bm    : '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/>',
    dl    : '<path d="M12 4v10"/><path d="m8 11 4 4 4-4"/>'+
            '<path d="M5 16.5v2A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-2"/>',
    cart  : '<circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>'+
            '<path d="M2.5 3.5h2.6l2.3 11a1.6 1.6 0 0 0 1.6 1.3h7.4a1.6 1.6 0 0 0 1.6-1.3l1.5-7.3H5.7"/>',
    share : '<circle cx="18" cy="5.5" r="2.4"/><circle cx="6" cy="12" r="2.4"/>'+
            '<circle cx="18" cy="18.5" r="2.4"/><path d="m8.2 10.8 7.6-4"/><path d="m8.2 13.2 7.6 4"/>',
    report: '<path d="M5 21V4"/><path d="M5 5c4-2 8 2 12 0v8c-4 2-8-2-12 0"/>',
    friend: '<path d="M16 20v-1.4a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.6V20"/>'+
            '<circle cx="10" cy="8" r="3.2"/><path d="M18 8v6"/><path d="M21 11h-6"/>',
    msg   : '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    follow: '<path d="M16 20v-1.4a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.6V20"/>'+
            '<circle cx="10" cy="8" r="3.2"/><path d="M18 8v6"/><path d="M21 11h-6"/>',
    check : '<path d="M16 20v-1.4a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.6V20"/>'+
            '<circle cx="10" cy="8" r="3.2"/><path d="m15.6 9.8 1.8 1.8 3.6-3.8"/>'
  };
  function vwSvg(k){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(VW_ICO[k]||'')+'</svg>'; }

  function vwCard(id, close){
    return '<div class="vwCard">'+
      '<div class="vwCardTop">'+
        '<div class="vwAv" id="'+id+'_av" onclick="dzVwProfile(\''+id+'\')"></div>'+
        '<div class="vwWho" onclick="dzVwProfile(\''+id+'\')">'+
          '<div class="vwName" id="'+id+'_nm">Artist</div>'+
          '<div class="vwHandle" id="'+id+'_un"></div>'+
        '</div>'+
        '<button class="vwClose" type="button" onclick="'+close+'" aria-label="Close">'+vwSvg('close')+'</button>'+
      '</div>'+
      '<div class="vwActs" id="'+id+'_acts" hidden></div>'+
    '</div>';
  }
  window.dzVwCard = vwCard;

  function vwActRow(items){
    var out = items.filter(Boolean).map(function(a){
      var common = ' class="vwAct'+(a.cls ? ' '+a.cls : '')+'" data-c="'+a.c+'"'+
        (a.id ? ' id="'+a.id+'"' : '')+(a.attrs || '')+
        (a.press ? ' aria-pressed="false"' : '')+
        ' aria-label="'+esc(a.label)+'" title="'+esc(a.label)+'"';
      return a.href
        ? '<a href="'+esc(a.href)+'" target="_blank" rel="noopener" download'+common+'>'+vwSvg(a.k)+'</a>'
        : '<button type="button"'+common+' onclick="'+a.on+'">'+vwSvg(a.k)+'</button>';
    }).join('');
    return out ? '<div class="vwActRow">'+out+'</div>' : '';
  }
  function vwSecRail(sec, kind, id, r){
    if(sec === 'jobs') return '';
    var dl = sec === 'blog' ? (r.cover_url ? imgResize(r.cover_url, 1600) : '')
           : sec === 'resources' ? (r.file_storage_path ? '1' : '')
           : '';
    // title is dropped into a single-quoted JS string inside an onclick, where a backslash ends it as surely as a quote
    var title = String(r.title || '').replace(/['\\]/g, '');
    return vwActRow([
      { k:'like', c:'red',   id:'vwAct_like', press:1, label:'Like',
        on:'dzVwEng(\'like\',\''+kind+'\',\''+id+'\')' },
      { k:'bm',   c:'amber', id:'vwAct_bm',   press:1, label:'Bookmark',
        on:'dzVwEng(\'bm\',\''+kind+'\',\''+id+'\')' },
      sec === 'marketplace'
        ? { k:'cart', c:'blue', id:'vwAct_cart', press:1, label:'Add to cart',
            on:'dzVwEng(\'cart\',\''+kind+'\',\''+id+'\')' }
        : { k:'dl', c:'green', id:'vwAct_dl',
            on:'dzVwDownload(\''+kind+'\',\''+id+'\',\''+esc(dl)+'\')',
            label: sec === 'blog' ? 'Download cover' : 'Download everything' },
      { k:'share', c:'blue', label:'Share',
        on:'dzVwShare(\''+sec+'\',\''+id+'\',\''+esc(title)+'\')' },
      { k:'report', c:'red', label:'Report',
        on:'dzReportItem(\''+kind+'\',\''+id+'\')' }
    ]);
  }

  var resBusy = {};
  async function dzResourceDownload(id){
    if(!window.currentUser){
      if(typeof pfGuestGate === 'function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      else if(typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    if(!sb || resBusy[id]) return;
    resBusy[id] = true;
    var btn = document.getElementById('vwAct_dl');
    if(btn) btn.setAttribute('aria-busy','true');
    try{
      var ses = await sb.auth.getSession();
      var token = ses && ses.data && ses.data.session && ses.data.session.access_token;
      if(!token){ showToast('Sign in to download'); return; }
      showToast('Preparing your download…');
      var res = await fetch('/api/resource-download', {
        method:'POST', cache:'no-store',
        headers:{ 'content-type':'application/json', authorization:'Bearer '+token },
        body: JSON.stringify({ resource: String(id) })
      });
      if(!res.ok){
        var err = null;
        try{ err = await res.json(); }catch(e){}
        var why = err && err.reason;
        if(why === 'limit'){
          if(typeof window.dzQuotaOpen === 'function') window.dzQuotaOpen(err);
          else showToast('Daily download limit reached');
        }
        else if(why === 'rate') showToast('Too many downloads just now — try again in a minute');
        else if(why === 'auth'){ showToast('Sign in to download'); if(typeof openAuthMod === 'function') openAuthMod(); }
        else showToast((err && err.error) || 'That file is no longer available');
        return;
      }
      var name = 'resource';
      var cd = res.headers.get('content-disposition') || '';
      var m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
      if(m) { try{ name = decodeURIComponent(m[1]); }catch(e){ name = m[1]; } }
      var blob = await res.blob();
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(href); }, 60000);
      var left = res.headers.get('x-downloads-left');
      if(left != null && left !== ''){
        showToast(left + ' download' + (left === '1' ? '' : 's') + ' left today');
      } else {
        showToast('Downloaded');
      }
      if(typeof window.avLoadQuota === 'function') window.avLoadQuota();
    }catch(e){
      showToast('Download failed — try again');
    }finally{
      resBusy[id] = false;
      if(btn) btn.removeAttribute('aria-busy');
    }
  }
  window.dzResourceDownload = dzResourceDownload;

  window.dzVwDownload = async function(kind, id, url){
    if(kind === 'resource') return dzResourceDownload(id);
    if(!url){ showToast('Nothing to download here'); return; }
    if(!window.currentUser){
      if(typeof pfGuestGate === 'function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      else if(typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    if(!sb){ showToast('Backend not configured'); return; }
    var gate = null;
    try{
      var res = await sb.rpc('dz_request_item_download', { p_kind: kind, p_id: id });
      if(res.error) throw res.error;
      gate = res.data || null;
    }catch(e){
      showToast('Could not start the download — try again');
      return;
    }
    if(!gate || !gate.allowed){
      var why = gate && gate.reason;
      if(why === 'limit'){
        if(typeof window.dzQuotaOpen === 'function') window.dzQuotaOpen(gate);
        else showToast('Daily download limit reached');
      }
      else if(why === 'rate') showToast('Too many downloads just now — try again in a minute');
      else if(why === 'auth') showToast('Sign in to download');
      else showToast('That file is not available');
      return;
    }
    if(typeof window.avLoadQuota === 'function') window.avLoadQuota();
    if(typeof gate.remaining === 'number'){
      showToast(gate.own ? 'Downloading your own file — no quota used'
                         : gate.remaining + ' download' + (gate.remaining === 1 ? '' : 's') + ' left today');
    }
    var a = document.createElement('a');
    a.href = url; a.rel = 'noopener'; a.target = '_blank';
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  var VW_PATH = { resources:'resource', blog:'blog', marketplace:'listing', jobs:'job' };
  var VW_IS_ITEM = new RegExp('^/(?:' +
    Object.keys(VW_PATH).map(function(k){ return VW_PATH[k]; }).join('|') + ')/');
  function vwUrl(sec, id){
    var seg = VW_PATH[sec];
    return seg ? (location.origin + '/' + seg + '/' + id) : location.href;
  }
  var VW_SEG = { resource:'resources', blog:'blog', listing:'marketplace', job:'jobs' };
  var VW_TABLE = { resources:'resources', blog:'blog_posts', marketplace:'marketplace_items', jobs:'jobs' };
  window.dzOpenById = async function(seg, id){
    var sec = VW_SEG[seg];
    if(!sec || !sb || typeof window.dzSelectFor !== 'function') return;
    var navToken = window.dzNavToken ? window.dzNavToken() : null;
    try{
      var c = dzc();
      var vwKey = 'section:item:' + sec + ':' + id + ':' + (window.currentUser ? 'member' : 'public');
      var load = async function(){
        var r = await sb.from(VW_TABLE[sec]).select(window.dzSelectFor(sec)).eq('id', id).maybeSingle();
        if(r && r.error) throw r.error;
        return (r && r.data) || null;
      };
      var row = c ? await c.getOrSet(vwKey, load, 'section:item') : await load();
      if(!row){ if(typeof showToast === 'function') showToast('That item is no longer available'); return; }
      if(navToken != null && typeof window.dzNavCurrent === 'function' &&
         !window.dzNavCurrent(navToken)) return;
      if(typeof openFG === 'function') openFG();
      if(typeof fgSwitchSection === 'function') fgSwitchSection(sec === 'resources' ? 'resources' : sec);
      window.dzOpenRow(sec, row);
    }catch(e){ if(typeof showToast === 'function') showToast('Could not open that link'); }
  };
  window.dzVwShare = function(sec, id, title){
    var url = vwUrl(sec, id);
    var t = title || document.title;
    if(KIND[sec] && KIND[sec] !== 'job' && typeof window.dzAnTrack === 'function'){
      window.dzAnTrack('share', String(id), { scope: KIND[sec] });
    }
    if(navigator.share){ navigator.share({ title:t, url:url }).catch(function(){}); return; }
    if(navigator.clipboard){
      navigator.clipboard.writeText(url).then(function(){ showToast('Link copied'); },
        function(){ showToast('Could not copy the link'); });
      return;
    }
    showToast('Share is not supported here');
  };
  window.dzVwActRow = vwActRow;

  var vwWho = {};
  window.dzVwProfile = function(id){
    var p = vwWho[id];
    if(!p || !p.username){ if(typeof showToast==='function') showToast('Profile not found'); return; }
    openProfileByUsername(p.username);
  };

  async function vwFill(id, uid){
    var nm = document.getElementById(id+'_nm');
    if(!nm) return;
    vwWho[id] = null;
    var p = uid ? profCache[uid] : null;
    if(uid && !p && sb){
      try{
        var res = await sb.from('profiles').select('id,username,display_name,avatar_url').eq('id',uid).single();
        p = profCache[uid] = (res && res.data) || null;
      }catch(e){ p = null; }
    }
    nm = document.getElementById(id+'_nm');
    if(!nm) return;
    vwWho[id] = p;
    var name = (p && (p.display_name || p.username)) || 'Artist';
    nm.textContent = name;
    var un = document.getElementById(id+'_un');
    if(un) un.textContent = (p && p.username) ? '@'+p.username : '';
    var av = document.getElementById(id+'_av');
    if(av){
      av.innerHTML = (p && p.avatar_url)
        ? '<img src="'+esc(getThumbnailUrl(p.avatar_url))+'" alt="">'
        : esc(name.charAt(0).toUpperCase());
    }
    var acts = document.getElementById(id+'_acts');
    if(!acts) return;
    var mine = window.currentUser && p && String(p.id) === String(currentUser.id);
    if(!p || mine){ acts.innerHTML = ''; acts.hidden = true; return; }
    acts.hidden = false;
    acts.innerHTML =
      '<button class="pfActBtn pfActBtn--pri" type="button" id="'+id+'_fo" '+
        'onclick="dzVwFollow(\''+id+'\')">'+vwSvg('follow')+
        '<span class="pfActTxt">Follow</span></button>'+
      '<button class="pfActBtn" type="button" id="'+id+'_fr" '+
        'onclick="dzVwFriend(\''+id+'\')">'+vwSvg('friend')+
        '<span class="pfActTxt">Add friend</span></button>';
    vwLoadRel(id, p.id);
  }
  window.dzVwFill = vwFill;

  function vwFrPaint(id, state){
    var b = document.getElementById(id+'_fr'); if(!b) return;
    var map = { none:'Add friend', sent:'Requested', incoming:'Accept', friends:'Message' };
    if(state === 'blocked' || state === 'blocked_by_me'){ b.hidden = true; return; }
    b.hidden = false;
    b.dataset.frState = state || 'none';
    var span = b.querySelector('.pfActTxt');
    if(span) span.textContent = map[state] || 'Add friend';
    b.setAttribute('aria-label', map[state] || 'Add friend');
    b.classList.toggle('pfActBtn--pri', state !== 'sent');
    var svg = b.querySelector('svg');
    if(svg) svg.innerHTML = (state === 'friends') ? VW_ICO.msg : VW_ICO.friend;
  }
  function vwFoPaint(id, on){
    var b = document.getElementById(id+'_fo'); if(!b) return;
    var span = b.querySelector('.pfActTxt');
    if(span) span.textContent = on ? 'Following' : 'Follow';
    b.setAttribute('aria-label', on ? 'Following' : 'Follow');
    b.classList.toggle('on', !!on);
    b.classList.toggle('pfActBtn--pri', !on);
    b.dataset.on = on ? '1' : '';
    var svg = b.querySelector('svg');
    if(svg) svg.innerHTML = on ? VW_ICO.check : VW_ICO.follow;
  }
  async function vwLoadRel(id, uid){
    if(!window.currentUser || !sb) return;
    try{
      if(window.dzFollow){
        await window.dzFollow.load();
        if(vwWho[id] && String(vwWho[id].id) === String(uid)) vwFoPaint(id, window.dzFollow.is(uid));
      }
      if(window.pfFriendBridge){
        await window.pfFriendBridge.load();
        if(vwWho[id] && String(vwWho[id].id) === String(uid)) vwFrPaint(id, window.pfFriendBridge.state(uid));
      }
    }catch(e){   }
  }

  // a follow taken on the profile page repaints the card behind it
  document.addEventListener('dz:follow', function(ev){
    var d = ev && ev.detail;
    if(!d) return;
    Object.keys(vwWho).forEach(function(id){
      if(vwWho[id] && String(vwWho[id].id) === String(d.id)) vwFoPaint(id, !!d.following);
    });
  });
  window.dzVwFriend = async function(id){
    var p = vwWho[id]; if(!p) return;
    if(!window.currentUser){
      if(typeof showToast === 'function') showToast('Sign in to add friends');
      if(typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    if(!window.pfFriendBridge) return;
    var b = document.getElementById(id+'_fr'); if(!b || b.disabled) return;
    var state = b.dataset.frState || 'none';
    if(state === 'friends'){
      window.pfFriendBridge.chat({ id:p.id, username:p.username, avatar_url:p.avatar_url });
      return;
    }
    b.disabled = true;
    try{
      if(state === 'none')          await window.pfFriendBridge.send(p.id);
      else if(state === 'sent')     await window.pfFriendBridge.cancel(p.id);
      else if(state === 'incoming') await window.pfFriendBridge.accept(p.id);
      await window.pfFriendBridge.load();
      if(vwWho[id] && String(vwWho[id].id) === String(p.id)) vwFrPaint(id, window.pfFriendBridge.state(p.id));
    }catch(e){ if(typeof showToast === 'function') showToast('Action failed \u2014 try again'); }
    finally{ b.disabled = false; }
  };
  window.dzVwFollow = async function(id){
    var p = vwWho[id]; if(!p || !window.dzFollow) return;
    if(!window.currentUser){
      if(typeof showToast === 'function') showToast('Sign in to follow artists');
      if(typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    var b = document.getElementById(id+'_fo'); if(!b || b.disabled) return;
    var was = b.dataset.on === '1';
    b.disabled = true;
    try{
      // dzFollow paints through the dz:follow event and reports what landed
      var now = await window.dzFollow.set(p.id, !was);
      vwFoPaint(id, now);
    }finally{ b.disabled = false; }
  };

  var VW_TBL = {
    like: { t:'item_likes',     on:'Liked',   off:'Removed the like' },
    bm:   { t:'item_bookmarks', on:'Saved to bookmarks', off:'Removed from bookmarks' },
    cart: { t:'cart_items',     on:'Added to cart', off:'Removed from cart' }
  };
  var vwEngTok = 0;
  function vwEngRow(what, kind, id){
    return what === 'cart'
      ? { user_id: currentUser.id, item_id: id }
      : { kind: kind, subject_id: id, user_id: currentUser.id };
  }
  var vwEngMatch = vwEngRow;
  async function vwEngPaint(kind, id){
    var tok = ++vwEngTok;
    ['like','bm','cart'].forEach(function(w){
      var b = document.getElementById('vwAct_'+w);
      if(b) b.setAttribute('aria-pressed','false');
    });
    if(!window.currentUser || !sb) return;
    var want = ['like','bm','cart'].filter(function(w){ return document.getElementById('vwAct_'+w); });
    if(!want.length) return;
    try{
      var res = await Promise.all(want.map(function(w){
        var q = sb.from(VW_TBL[w].t).select(w === 'cart' ? 'item_id' : 'kind');
        var m = vwEngMatch(w, kind, id);
        Object.keys(m).forEach(function(k){ q = q.eq(k, m[k]); });
        return q.maybeSingle();
      }));
      if(tok !== vwEngTok) return;
      want.forEach(function(w, i){
        var b = document.getElementById('vwAct_'+w);
        if(b) b.setAttribute('aria-pressed', (res[i] && res[i].data) ? 'true' : 'false');
      });
    }catch(e){   }
  }
  window.dzVwEng = async function(what, kind, id){
    var cfg = VW_TBL[what]; if(!cfg || !sb) return;
    if(!window.currentUser){
      if(typeof pfGuestGate === 'function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      else if(typeof openAuthMod === 'function') openAuthMod();
      return;
    }
    var b = document.getElementById('vwAct_'+what); if(!b || b.disabled) return;
    var on = b.getAttribute('aria-pressed') !== 'true';
    b.disabled = true;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    try{
      var r;
      if(on){ r = await sb.from(cfg.t).insert(vwEngRow(what, kind, id)); }
      else {
        var q = sb.from(cfg.t).delete(), m = vwEngMatch(what, kind, id);
        Object.keys(m).forEach(function(k){ q = q.eq(k, m[k]); });
        r = await q;
      }
      if(r.error && !(on && r.error.code === '23505')) throw r.error;
      if(what !== 'cart' && typeof window.dzAnTrack === 'function'){
        window.dzAnTrack(what === 'like' ? (on ? 'like' : 'unlike')
                                         : (on ? 'bookmark' : 'unbookmark'),
                         String(id), { scope: kind });
      }
      if(typeof showToast === 'function') showToast(on ? cfg.on : cfg.off);
      if(what === 'cart' && typeof window.dzCartPaint === 'function') window.dzCartPaint();
    }catch(e){
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      if(window.meritDenied && window.meritDenied(e, what === 'like' ? 'like' : 'save')) { b.disabled = false; return; }
      if(typeof showToast === 'function') showToast('Action failed \u2014 try again');
    }finally{ b.disabled = false; }
  };

  var cfmFn = null;
  function cfmBox(){
    var box = document.getElementById('vwCfm');
    if(box) return box;
    if(!document.body) return null;
    box = document.createElement('div');
    box.id = 'vwCfm';
    box.hidden = true;
    box.onclick = function(e){ if(e.target === box) window.dzConfirmClose(); };
    box.innerHTML =
      '<div class="vwCfmBox" role="dialog" aria-modal="true" aria-labelledby="vwCfmT">'+
        '<div class="vwCfmT" id="vwCfmT">Are you sure?</div>'+
        '<p class="vwCfmM" id="vwCfmM"></p>'+
        '<div class="vwCfmActs">'+
          '<button class="vwCfmBtn" type="button" id="vwCfmNo">Cancel</button>'+
          '<button class="vwCfmBtn vwCfmBtn--danger" type="button" id="vwCfmYes">Delete</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(box);
    box.querySelector('#vwCfmNo').onclick = function(){ window.dzConfirmClose(); };
    box.querySelector('#vwCfmYes').onclick = function(){ window.dzConfirmYes(); };
    return box;
  }
  window.dzConfirm = function(title, msg, yesLabel, fn, noLabel){
    var box = cfmBox();
    if(!box){ if(window.confirm(title)) fn(); return; }
    cfmFn = fn;
    document.getElementById('vwCfmT').textContent = title;
    var mEl = document.getElementById('vwCfmM');
    mEl.textContent = msg || '';
    mEl.hidden = !msg;
    var y = document.getElementById('vwCfmYes');
    y.textContent = yesLabel || 'Delete';
    var n = document.getElementById('vwCfmNo');
    n.textContent = noLabel || 'Cancel';
    box.hidden = false;
    setTimeout(function(){ try{ document.getElementById('vwCfmNo').focus(); }catch(e){} }, 20);
  };
  window.dzConfirmClose = function(){
    var box = document.getElementById('vwCfm');
    if(box) box.hidden = true;
    cfmFn = null;
  };
  window.dzConfirmYes = function(){
    var fn = cfmFn;
    window.dzConfirmClose();
    if(typeof fn === 'function') fn();
  };
  document.addEventListener('keydown', function(e){
    var box = document.getElementById('vwCfm');
    if(e.key === 'Escape' && box && !box.hidden){ e.stopPropagation(); window.dzConfirmClose(); }
  }, true);

  function metaRow(pairs){
    var out = pairs.filter(function(x){ return x[1]; }).map(function(x){
      return '<div class="dzvMetaRow"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>';
    }).join('');
    return out ? '<div class="dzvMeta">'+out+'</div>' : '';
  }
  function metaBlock(head, pairs){
    var body = metaRow(pairs);
    if(!body) return '';
    return head ? '<div><div class="avBlockH">'+esc(head)+'</div>'+body+'</div>' : body;
  }
  var linkBlock = window.dzLinkBlock;
  function jobBlock(head, body){
    body = String(body == null ? '' : body).trim();
    if(!body) return '';
    return '<div><div class="avBlockH">'+esc(head)+'</div>'+
      '<div class="dzvArticle">'+esc(body).replace(/\n/g,'<br>')+'</div></div>';
  }
  function catLabels(sec, arr){
    if(!Array.isArray(arr) || !arr.length) return '';
    var f = window.dzCatLabel;
    return arr.map(function(c){ return f ? f(sec, c) : c; })
              .filter(Boolean).join(', ');
  }
  function tagBlock(tags){
    if(!Array.isArray(tags) || !tags.length) return '';
    return '<div><div class="avBlockH">Tags</div><div class="avTagList">'+
      tags.map(function(t){ return '<span class="avTagChip">'+esc(t)+'</span>'; }).join('')+
      '</div></div>';
  }
  function updatedAgo(r, h){
    if(!r || !r.updated_at) return '';
    var base = r.published_at || r.created_at;
    if(!base) return '';
    return (new Date(r.updated_at) - new Date(base) > 60000) ? h.ago(r.updated_at) : '';
  }
  function jobDate(v){
    if(!v) return '';
    var t = new Date(v);
    if(!isFinite(t.getTime())) return String(v);
    return t.toLocaleDateString([], {year:'numeric', month:'short', day:'numeric'});
  }
  function adBlock(){
    return (typeof window.dzAdHtml === 'function') ? window.dzAdHtml() : '';
  }
  function cmBlock(kind, id){
    return '<div class="avCmBlock"><div class="avBlockH">Comments</div>'+
      '<div class="avCmBar">'+
      '<input class="avCmIn" id="dzvCmIn" type="text" maxlength="1000" placeholder="Write a comment\u2026" '+
      'onkeydown="if(event.key===\'Enter\')dzCmPost(\''+kind+'\',\''+id+'\',\'dzvCmIn\',\'dzvCmList\')">'+
      '<button class="avCmSend" onclick="dzCmPost(\''+kind+'\',\''+id+'\',\'dzvCmIn\',\'dzvCmList\')" aria-label="Send">\u27a4</button>'+
      '</div>'+
      '<div class="avCmList" id="dzvCmList"></div>'+
      '<button class="vwMore" type="button" id="dzvCmList_more" hidden onclick="dzCmMore(\'dzvCmList\')">LOAD 20 MORE</button>'+
      '</div>';
  }

  function render(){
    var host = document.getElementById('dzvBody');
    var r = curExt || rows()[cur.idx];
    if(!host || !r) return;
    host.scrollTop = 0;
    var sec = cur.sec, kind = KIND[sec], id = esc(r.id), h = H(), html = '';
    var vw = document.getElementById('dzView');
    if(vw) vw.setAttribute('data-sec', sec);
    var img = function(u, alt, more){
      if(!u && !more) return '';
      return '<div class="dzvMedia">'+
        (u ? '<img src="'+esc(getViewUrl(u))+'" alt="'+esc(alt||'')+'" loading="lazy" draggable="false">' : '')+
        (more || '')+
      '</div>';
    };

    if(sec === 'resources'){
      var resRights = r.resource_type ? [
        r.commercial_use ? 'Commercial use allowed' : 'Personal use only',
        r.modification_allowed ? 'Modification allowed' : 'No modification',
        r.attribution_required ? 'Attribution required' : ''
      ].filter(Boolean).join(' \u00b7 ') : '';
      html = img(r.preview_url, r.title) +
        '<div class="dzvCol">'+
        vwCard('dzvCard', 'dzCloseView()')+
        vwSecRail(sec, kind, id, r)+
        (r.featured ? '<p class="dzvExcerpt">\u2605 Featured resource</p>' : '')+
        '<h1 class="dzvTitle">'+esc(r.title)+'</h1>'+
        (r.summary ? '<p class="dzvExcerpt">'+esc(r.summary)+'</p>' : '')+
        '<div class="dzvFileCard"><span class="dzvExt">'+esc((r.file_ext||'FILE').toUpperCase())+'</span>'+
        '<div><div class="dzvFileName">'+esc(r.file_name||r.title)+'</div>'+
        '<div class="dzvFileMeta">'+esc(h.bytes(r.file_size))+
          (r.file_count ? ' \u00b7 '+esc(String(r.file_count))+' file'+(r.file_count===1?'':'s') : '')+
          ' \u00b7 '+esc(String(r.download_count||0))+' downloads</div></div>'+
        (r.file_storage_path ? '<button type="button" class="vwFileDl" '+
          'onclick="dzVwDownload(\''+kind+'\',\''+id+'\',\'\')" '+
          'aria-label="Download this file" title="Download this file">'+vwSvg('dl')+'</button>' : '')+
        '</div>'+
        (r.description ? '<p class="dzvDesc">'+esc(r.description)+'</p>' : '')+
        jobBlock('What\u2019s included', r.whats_included)+
        jobBlock('Installation and use', r.instructions)+
        metaBlock('Details',
                [['Type', r.resource_type],
                 ['Category', catLabels('resources', r.category)],
                 ['Subcategory', r.subcategory],
                 ['License', r.license],
                 ['Rights', resRights],
                 ['Made with', r.software],
                 ['Works with', (r.compatible_software||[]).join(', ')],
                 ['Versions', r.compatible_versions],
                 ['Version', r.version],
                 ['Resolution', r.dimensions],
                 ['Format', (r.file_ext||'').toUpperCase()],
                 ['Posted', h.ago(r.created_at)],
                 ['Updated', updatedAgo(r, h)]])+
        jobBlock('Content notes', r.safety_notes)+
        linkBlock('Links', r.external_links)+
        tagBlock(r.tags)+
        adBlock()+
        cmBlock(kind, id)+
        '</div>';
    }
    else if(sec === 'blog'){
      var hasRelated = (r.related_artworks||[]).length || (r.related_items||[]).length;

      html = img(r.cover_url, r.title) +
        '<div class="dzvCol">'+
        vwCard('dzvCard', 'dzCloseView()')+
        vwSecRail(sec, kind, id, r)+
        (r.featured ? '<p class="dzvExcerpt">★ Featured post</p>' : '')+
        '<h1 class="dzvTitle">'+esc(r.title)+'</h1>'+
        (r.excerpt ? '<p class="dzvExcerpt">'+esc(r.excerpt)+'</p>' : '')+
        (r.author_bio ? '<p class="dzvAuthBio">'+esc(r.author_bio)+'</p>' : '')+
        metaRow([['Type', r.content_type],
                 ['Category', catLabels('blog', r.category)],
                 ['Published', h.ago(r.published_at || r.created_at)],
                 ['Read time', (r.read_minutes||1)+' min'],
                 ['Updated', updatedAgo(r, h)]])+
        '<div class="dzvArticle">'+esc(r.body||'').replace(/\n/g,'<br>')+'</div>'+
        linkBlock('Sources', r.external_refs)+
        (hasRelated ? '<div id="dzvRelated"></div>' : '')+
        tagBlock(r.tags)+
        adBlock()+
        cmBlock(kind, id)+
        '</div>';
    }
    else if(sec === 'marketplace'){
      var hasFile = r.file_ext ? 1 : 0;
      var galleryHtml = '';
      if(Array.isArray(r.gallery) && r.gallery.length){
        galleryHtml = '<div class="dzvGallery">'+ r.gallery.map(function(g){
          if(!g || !g.url) return '';
          var full = safeHref(getViewUrl(g.url));
          if(!full) return '';
          return '<a href="'+esc(full)+'" target="_blank" rel="noopener">'+
            '<img src="'+esc(full)+'" alt="" loading="lazy" draggable="false"></a>';
        }).join('') +'</div>';
      }
      var rights = r.product_type ? [
        r.commercial_use ? 'Commercial use allowed' : 'Personal use only',
        r.personal_use ? 'Personal use allowed' : '',
        r.modification_allowed ? 'Modification allowed' : '',
        r.attribution_required ? 'Attribution required' : '',
        r.source_files_included ? 'Source files included' : ''
      ].filter(Boolean).join(' · ') : '';
      var lockNote = hasFile ? '<div class="dzvLock" id="dzvLock-'+id+'">'+
            '<span class="dzvLockIco" aria-hidden="true">🔒</span>'+
            '<div><b>Files are locked</b><div class="dzvLockSub">They unlock for you as soon as '+
            'the payment is confirmed, and stay in Settings → My Purchases to re-download '+
            'any time. Subscription tiers do not unlock marketplace files.</div></div>'+
          '</div>' : '';
      var reqUrl = safeHref(r.apply_url);
      var reqBtn =
        (reqUrl
          ? '<a class="avActWide" href="'+esc(reqUrl)+'" target="_blank" rel="noopener">Request this ↗</a>'
          : '')+
        (r.apply_email
          ? '<a class="avActWide" href="mailto:'+esc(r.apply_email)+'">Request by email ✉</a>'
          : '');

      html = img(r.preview_url, r.title, galleryHtml) +
        '<div class="dzvCol">'+
        vwCard('dzvCard', 'dzCloseView()')+
        vwSecRail(sec, kind, id, r)+
        (r.featured ? '<p class="dzvExcerpt">★ Featured listing</p>' : '')+
        '<h1 class="dzvTitle">'+esc(r.title)+'</h1>'+
        (r.summary ? '<p class="dzvExcerpt">'+esc(r.summary)+'</p>' : '')+
        (window.dzSlot ? window.dzSlot(r, id, hasFile, 'view') : '')+
        lockNote+
        reqBtn+
        (r.description ? '<p class="dzvDesc">'+esc(r.description)+'</p>' : '')+
        jobBlock('What you get', r.buyer_gets)+
        metaBlock('Details',
                [['Type', r.item_type],['Product', r.product_type],
                 ['Category', catLabels('marketplace', r.category)],
                 ['Subcategory', r.subcategory],
                 ['License', r.license],
                 ['Rights', rights],
                 ['File format', r.file_format],
                 ['Files', r.file_count ? String(r.file_count) : ''],
                 ['Size', r.file_size_mb != null ? r.file_size_mb+' MB' : ''],
                 ['Dimensions', r.dimensions],
                 ['Made with', r.software]])+
        metaBlock('Delivery and support',
                [['Delivery', r.delivery_type === 'custom' ? 'Custom delivery' : 'Instant download'],
                 ['Delivery time', r.delivery_days ? r.delivery_days+' days' : ''],
                 ['Revisions', r.revision_count != null ? String(r.revision_count) : ''],
                 ['Support', r.support_period],
                 ['Custom requests', r.custom_requests ? 'Accepted' : ''],
                 ['Stock', r.stock != null ? String(r.stock) : ''],
                 ['Closes', jobDate(r.closing_date)],
                 ['Listed', h.ago(r.created_at)],
                 ['Updated', updatedAgo(r, h)]])+
        jobBlock('Delivery notes', r.delivery_notes)+
        jobBlock('Refund policy', r.refund_policy)+
        (r.preview_watermark ? jobBlock('Previews', 'Preview images are watermarked. The files you receive are not.') : '')+
        jobBlock('Content notes', r.safety_notes)+
        jobBlock('From the seller', r.seller_note)+
        tagBlock(r.tags)+
        adBlock()+
        cmBlock(kind, id)+
        '</div>';
    }
    else {
      var jw = window.dzJobWhere ? window.dzJobWhere(r)
             : (r.is_remote ? 'Remote' : [r.location_city, r.location_country].filter(Boolean).join(', '));
      var jp = window.dzJobPay ? window.dzJobPay(r) : '';
      var jmode = window.dzJobMode ? window.dzJobMode(r) : (r.is_remote ? 'remote' : 'onsite');
      var jmodeLbl = (window.dzJobModeLbl || {})[jmode] || '';
      var exp = [r.experience_level,
                 (r.years_experience != null ? r.years_experience + '+ yrs' : '')]
                .filter(Boolean).join(' \u00b7 ');
      var sends = [r.portfolio_required ? 'Portfolio' : '', r.resume_required ? 'Resume / CV' : '',
                   r.cover_letter_required ? 'Cover letter' : ''].filter(Boolean).join(' \u00b7 ');
      var applyUrl = safeHref(r.apply_url);
      var applyBtn =
        (applyUrl
          ? '<a class="avActWide" href="'+esc(applyUrl)+'" target="_blank" rel="noopener">Apply \u2197</a>'
          : '')+
        (r.apply_email
          ? '<a class="avActWide" href="mailto:'+esc(r.apply_email)+'">Apply by email \u2709</a>'
          : '');

      html = '<div class="dzvCol">'+
        vwCard('dzvCard', 'dzCloseView()')+
        (r.featured ? '<p class="dzvExcerpt">\u2605 Featured posting</p>' : '')+
        '<h1 class="dzvTitle">'+esc(r.title)+'</h1>'+
        '<p class="dzvExcerpt">'+esc(r.company||'')+
          (safeHref(r.company_url)
            ? ' \u00b7 <a href="'+esc(safeHref(r.company_url))+'" target="_blank" rel="noopener">website</a>'
            : '')+'</p>'+
        metaRow([
          ['Location', jw],
          ['Work mode', jmodeLbl],
          ['Type', String(r.employment_type||'').replace(/_/g,' ')],
          ['Experience', exp],
          ['Pay', jp],
          ['Openings', r.openings ? String(r.openings) : ''],
          ['Starts', jobDate(r.start_date)],
          ['Closes', jobDate(r.valid_through)]
        ])+
        applyBtn+
        jobBlock('About the company', r.about_company)+
        jobBlock('Overview', r.description)+
        jobBlock('Responsibilities', r.responsibilities)+
        jobBlock('Requirements', r.requirements)+
        jobBlock('Required skills', r.required_skills)+
        jobBlock('Nice to have', r.nice_to_have_skills)+
        jobBlock('Benefits', r.benefits)+
        metaBlock('Role details', [
          ['Category', catLabels('jobs', r.category)],
          ['Remote from', (jmode === 'remote' && (r.applicant_countries||[]).length)
                          ? (r.applicant_countries||[]).join(', ') : ''],
          ['Timezone', r.timezone],
          ['Working hours', r.working_hours],
          ['Schedule', r.schedule],
          ['Duration', r.contract_duration],
          ['Posted', h.ago(r.created_at)],
          ['Updated', updatedAgo(r, h)]
        ])+
        jobBlock('How to apply', r.application_instructions)+
        jobBlock('What to send', r.application_materials)+
        (sends ? jobBlock('Required with every application', sends) : '')+
        jobBlock('Questions to answer', r.application_questions)+
        tagBlock(r.tags)+
        '<button class="avReportBtn" onclick="dzReportItem(\'job\',\''+id+'\')">\u2691 Report</button>'+
        '</div>';
    }
    host.innerHTML = html;
    if(typeof window.dzExtras === 'function') window.dzExtras();
    if(typeof window.dzAdMount === 'function') window.dzAdMount(host);

    var total = rows().length;
    var multi = !curExt && total > 1;
    var pb=document.getElementById('dzvPrev'), nb=document.getElementById('dzvNext');
    if(pb) pb.style.visibility = (multi && cur.idx > 0) ? 'visible' : 'hidden';
    if(nb) nb.style.visibility = (multi && cur.idx < total - 1) ? 'visible' : 'hidden';

    vwFill('dzvCard', r.user_id);
    if(sec !== 'jobs') vwEngPaint(kind, String(r.id));
    if(sec === 'blog') fillRelated(r);
    if(sec !== 'jobs') window.dzCmLoad(kind, String(r.id), 'dzvCmList');
  }

  var pushed = false;
  var vwReturnUrl = null;
  window.dzOpenView = function(sec, id){
    curExt = null;
    var list = (typeof window.dzGetRows==='function' ? window.dzGetRows(sec) : []) || [];
    var idx = list.findIndex(function(x){ return String(x.id)===String(id); });
    if(idx === -1){
      var cr = (typeof window.dzCartRows === 'function' ? window.dzCartRows() : []) || [];
      var one = cr.filter(function(x){ return String(x.id)===String(id); })[0];
      if(one){ window.dzOpenRow(sec, one); return; }
      return;
    }
    cur = { sec:sec, idx:idx };
    render();
    var v = document.getElementById('dzView');
    if(v) v.classList.add('open');
    document.body.style.overflow = 'hidden';
    vwMark(sec, id);
  };
  window.dzOpenRow = function(sec, row){
    if(!row) return;
    curExt = row; cur = { sec:sec, idx:-1 };
    render();
    var v = document.getElementById('dzView'); if(v) v.classList.add('open');
    document.body.style.overflow = 'hidden';
    vwMark(sec, row.id);
  };
  function vwMark(sec, id){
    var an = KIND[sec];
    if(an && an !== 'job' && typeof window.dzAnItemView === 'function'){
      window.dzAnItemView(an, String(id));
    }
    var path = VW_PATH[sec] ? ('/'+VW_PATH[sec]+'/'+id) : null;
    try{
      var here = path && window.location.pathname === path;
      if(!pushed && !here){
        vwReturnUrl = window.location.pathname + window.location.search;
        history.pushState({dzv:1, sec:sec, id:String(id)}, '', path || undefined);
        pushed = true;
      } else {
        history.replaceState({dzv:1, sec:sec, id:String(id)}, '', path || undefined);
      }
    }catch(e){}
  }

  window.addEventListener('popstate', function(){
    vwReturnUrl = null;
    var v = document.getElementById('dzView');
    if(v && v.classList.contains('open')){ pushed = false; dzCloseView(); }
  });
  window.dzViewNav = function(dir){
    if(curExt) return;
    var n = rows().length;
    if(!n) return;
    var next = cur.idx + dir;
    if(next < 0 || next >= n) return;
    cur.idx = next;
    render();
    var r = rows()[cur.idx];
    if(r) vwMark(cur.sec, r.id);
  };
  function vwUnlock(){
    if(typeof restoreScroll === 'function') restoreScroll();
    else document.body.style.overflow = '';
  }
  window.dzCloseView = function(){
    var v = document.getElementById('dzView');
    if(v) v.classList.remove('open');
    if(typeof window.dzLightClose === 'function') window.dzLightClose();
    vwUnlock();
    curExt = null;
    if(pushed || VW_IS_ITEM.test(window.location.pathname)){
      try{ history.replaceState({}, '', vwReturnUrl || '/'); }catch(e){}
    }
    pushed = false;
    vwReturnUrl = null;
  };
  window.dzCloseViewSilent = function(){
    var v = document.getElementById('dzView');
    if(v) v.classList.remove('open');
    if(typeof window.dzLightClose === 'function') window.dzLightClose();
    vwUnlock();
    pushed = false;
    vwReturnUrl = null;
  };

  (function(){
    var DZ_GROUND = '#dzView, #dzView .dzvBody, #dzView .dzvMedia, #dzView .dzvCol';
    document.addEventListener('DOMContentLoaded', function(){
      var v = document.getElementById('dzView');
      if(!v) return;
      v.addEventListener('click', function(e){
        if(!(window.matchMedia && matchMedia('(min-width:900px)').matches)) return;
        var t = e.target;
        if(t && t.matches && t.matches(DZ_GROUND)) dzCloseView();
      });
    });
  })();
  document.addEventListener('keydown', function(e){
    var v = document.getElementById('dzView');
    if(!v || !v.classList.contains('open')) return;
    if(window.dzLightIsOpen && window.dzLightIsOpen()) return;
    if(e.key === 'Escape') dzCloseView();
    else if(e.key === 'ArrowLeft') dzViewNav(-1);
    else if(e.key === 'ArrowRight') dzViewNav(1);
  });
})();
