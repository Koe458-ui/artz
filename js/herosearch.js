  var hsState = { q:'', mode:'artwork', seq:0, timer:null, rows:[] };
  var HS_ART_CAP = 40, HS_WHO_CAP = 24;
  var HS_MODES = {
    artwork: { ph:'Search artworks',
               label:'Search artworks',
               swap:'Switch to searching artists' },
    artist:  { ph:'Search artists',
               label:'Search artists',
               swap:'Switch to searching artworks' }
  };

  var hsArtistMemo = {}, hsArtistKeys = [];

  function hsEl(id){ return document.getElementById(id); }
  function hsClient(){ return (typeof sb !== 'undefined' && sb) ? sb : null; }
  function hsMode(){ return HS_MODES[hsState.mode] || HS_MODES.artwork; }

  function hsPaintMode(){
    var bar = hsEl('hsBar'), input = hsEl('hsIn'), btn = hsEl('hsModeBtn');
    var m = hsMode();
    if(bar) bar.setAttribute('data-mode', hsState.mode);
    if(input){
      input.placeholder = m.ph;
      input.setAttribute('aria-label', m.label);
    }
    if(btn){
      btn.setAttribute('aria-label', m.swap);
      btn.title = m.swap;
    }
  }

  function hsStand(on){
    var sec = hsEl('artworks');
    if(sec) sec.classList.toggle('hsOn', !!on);
  }

  function hsShowGrid(){
    var grid = hsEl('hsResults'), box = hsEl('hsEmpty');
    if(box) box.hidden = true;
    if(grid) grid.hidden = false;
    hsStand(true);
    return grid;
  }

  function hsShowNote(title, text){
    var grid = hsEl('hsResults'), box = hsEl('hsEmpty');
    var head = hsEl('hsEmptyTitle'), body = hsEl('hsEmptyText');
    if(grid){ grid.hidden = true; grid.innerHTML = ''; }
    if(head){ head.textContent = title || ''; head.hidden = !title; }
    if(body) body.textContent = text || '';
    if(box) box.hidden = false;
    hsStand(true);
  }

  function hsStandDown(){
    var grid = hsEl('hsResults'), box = hsEl('hsEmpty');
    if(grid){ grid.hidden = true; grid.innerHTML = ''; }
    if(box) box.hidden = true;
    hsStand(false);
  }

  function hsArtworks(raw){
    if(typeof window.fgSearchArtworks !== 'function') return [];
    return window.fgSearchArtworks(raw).slice(0, HS_ART_CAP);
  }

  function hsMemoPut(key, rows){
    if(!hsArtistMemo[key]) hsArtistKeys.push(key);
    hsArtistMemo[key] = rows;
    while(hsArtistKeys.length > 30) delete hsArtistMemo[hsArtistKeys.shift()];
  }

  function hsArtists(raw, done){
    var db = hsClient();
    var pattern = (typeof window.fgArtistPattern === 'function') ? window.fgArtistPattern(raw) : '';
    if(!db || !pattern){ done(null); return; }
    var key = pattern.toLowerCase();
    if(hsArtistMemo[key]){ done(hsArtistMemo[key]); return; }
    db.from('profiles')
      .select(window.DZ_ARTIST_COLS || 'id,username,display_name,avatar_url,banner_url,bio,follower_count')
      .or('username.ilike.' + pattern + ',display_name.ilike.' + pattern)
      .order('username', { ascending:true }).limit(HS_WHO_CAP)
      .then(function(r){
        // a failed query resolves with data:null; memoising it as empty tells this reader there are no such artists all session
        if(r && r.error){ done(null); return; }
        var rows = (r && r.data) || [];
        hsMemoPut(key, rows);
        done(rows);
      }, function(){ done(null); });
  }

  function hsRender(rows){
    hsState.rows = rows || [];
    var raw = String(hsState.q || '').trim();

    if(!hsState.rows.length){
      hsShowNote('No results found',
                 'It seems we can’t find any results based on your search.');
      return;
    }

    var grid = hsShowGrid();
    if(!grid) return;
    grid.innerHTML = '';

    if(hsState.mode === 'artist'){
      hsState.rows.forEach(function(p){
        if(p && p.id && typeof dzArtistCache !== 'undefined') dzArtistCache[p.id] = p;
      });
      hsState.rows.forEach(function(p){
        if(typeof buildArtistCard === 'function') grid.appendChild(buildArtistCard(p.id));
      });
      if(typeof window.dzPaintPeople === 'function'){
        window.dzPaintPeople(hsState.rows.map(function(p){ return p && p.id; }).filter(Boolean));
      }
    } else {
      hsState.rows.forEach(function(r){
        if(typeof buildAwCard !== 'function') return;
        var card = buildAwCard(r);
        window.dzCardActivate(card, function(){ hsOpen(r.id); });
        grid.appendChild(card);
      });
    }
    hsLog(raw);
  }

  function hsOpen(id){
    var row = hsState.rows.find(function(x){ return String(x.id) === String(id); });
    if(!row) return;
    var term = String(hsState.q || '').trim();
    if(term && typeof window.dzAnTrack === 'function'){
      window.dzAnTrack('search_click', String(id), { term: term, scope:'artwork' });
    }
    if(typeof openLB !== 'function') return;
    var cats = catList(row.category).length ? catList(row.category)
             : (catList(row.tags).length ? catList(row.tags) : ['others']);
    openLB(row.image_url, row.name, cats[0] || '', row.description || '',
           String(row.id), false, hsState.rows);
  }

  var hsLogTimer = null, hsLogged = '';
  function hsLog(term){
    clearTimeout(hsLogTimer);
    if(hsState.mode !== 'artwork') return;
    if(typeof window.dzAnSearch !== 'function') return;
    var q = String(term || '').trim();
    if(q.length < 2 || q === hsLogged) return;
    hsLogTimer = setTimeout(function(){
      if(String(hsState.q || '').trim() !== q) return;
      if(!hsState.rows.length) return;
      window.dzAnSearch(hsState.rows.slice(0, 12).map(function(r){ return String(r.id); }),
                        q, 'artwork');
      hsLogged = q;
    }, 1200);
  }

  function hsRun(){
    var raw = String(hsState.q || '').trim();
    if(!raw){ hsState.rows = []; hsStandDown(); return; }

    var mySeq = ++hsState.seq;

    if(hsState.mode === 'artwork'){
      hsRender(hsArtworks(raw));
      return;
    }

    if(!hsClient()){
      hsState.rows = [];
      hsShowNote('Search unavailable',
                 'Artist search needs a connection — try again in a moment.');
      return;
    }
    hsShowNote('', 'Searching…');
    hsArtists(raw, function(rows){
      if(mySeq !== hsState.seq) return;
      if(rows === null){
        hsState.rows = [];
        hsShowNote('Something went wrong', 'Artists couldn’t be searched — try again.');
        return;
      }
      hsRender(rows);
    });
  }

  function hsInput(v){
    hsState.q = String(v || '');
    clearTimeout(hsState.timer);
    hsState.timer = setTimeout(hsRun, 220);
  }

  function hsToggleMode(){
    hsState.mode = hsState.mode === 'artwork' ? 'artist' : 'artwork';
    hsPaintMode();
    hsState.rows = [];
    clearTimeout(hsState.timer);
    var input = hsEl('hsIn');
    if(input){ try{ input.focus(); }catch(e){} }
    if(String(hsState.q || '').trim()) hsRun();
    else hsStandDown();
  }

  function hsReset(){
    var input = hsEl('hsIn');
    if(input) input.value = '';
    clearTimeout(hsState.timer);
    hsState.q = '';
    hsState.rows = [];
    hsState.seq++;
    hsStandDown();
  }

  (function(){
    var bar = hsEl('hsBar');
    if(!bar) return;

    hsPaintMode();

    var input = hsEl('hsIn');
    if(input){
      input.addEventListener('keydown', function(e){
        if(e.key === 'Escape'){ hsReset(); return; }
        if(e.key !== 'Enter') return;
        e.preventDefault();
        clearTimeout(hsState.timer);
        hsRun();
      });
    }

    var prevRebuild = window.rebuildGalCarousels;
    if(typeof prevRebuild === 'function'){
      window.rebuildGalCarousels = function(){
        var out = prevRebuild.apply(this, arguments);
        if(hsState.mode === 'artwork' && String(hsState.q || '').trim()) hsRun();
        return out;
      };
    }
  })();

  window.hsInput      = hsInput;
  window.hsToggleMode = hsToggleMode;
  window.hsReset      = hsReset;
