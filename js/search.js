  var fgSrch = { q:'', scope:'all', seq:0, timer:null, rows:{} };

  var FG_SRCH_GROUPS = [
    { key:'artwork',     label:'Artworks',  how:'card',   wrap:'awGrid' },
    { key:'artist',      label:'Artists',   how:'artist', wrap:'awGrid' },
    { key:'marketplace', label:'Market',    how:'sec' },
    { key:'blog',        label:'Blog',      how:'sec' },
    { key:'resources',   label:'Resources', how:'sec' }
  ];

  var FG_SRCH_UI = {
    page:'fgSearchPage', input:'fgSrchIn', wrap:'fgSrchWrap', note:'fgSrchNote',
    scopes:'fgSrchScopes', groups:FG_SRCH_GROUPS, st:fgSrch,
    run:function(){ fgSearchRun(); }, lastFocus:null
  };

  function fgArtistPattern(q){
    var clean = String(q||'').replace(/[,()"\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
    if(!clean) return '';
    var body = clean.replace(/[^0-9A-Za-z\u00C0-\uFFFF]+/g,'%');
    return body ? '%'+body+'%' : '';
  }

  function fgSearchNote(msg){ window.dzSearchUI.note(FG_SRCH_UI, msg); }
  window.dzSearchUI.trap(FG_SRCH_UI);
  function openFgSearch(){ window.dzSearchUI.open(FG_SRCH_UI); }

  function closeFgSearch(silent){
    var pg = document.getElementById('fgSearchPage');
    if(!pg || !pg.classList.contains('open')) return;
    pg.classList.remove('open');
    if(typeof restoreScroll === 'function') restoreScroll();
    window.dzSearchUI.restoreFocus(FG_SRCH_UI, silent);
  }

  function fgSearchClear(){ window.dzSearchUI.clear(FG_SRCH_UI); }
  function fgSearchInput(v){ window.dzSearchUI.input(FG_SRCH_UI, v); }
  function fgSearchScope(scope){ window.dzSearchUI.scope(FG_SRCH_UI, scope); }

    // After the five scopes the rail carries a few categories per section — not a seventh scope; they fill the field and run
  (function(){
    var rail = document.getElementById('fgSrchScopes');
    if(!rail) return;
    if(typeof window.dzRailWatch === 'function') window.dzRailWatch(rail);
    rail.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-q]') : null;
      if(!b) return;
      var q  = b.getAttribute('data-q') || '';
      var sc = b.getAttribute('data-scope');
        // Each belongs to a section, so it takes the reader there as well as filling the field — otherwise "Sketches"
        // under the Artists scope searches artists and finds nothing. Set directly; scope() would run the old query.
      if(sc && FG_SRCH_UI.st.scope !== sc){
        FG_SRCH_UI.st.scope = sc;
        window.dzSearchUI.paintScopes(FG_SRCH_UI);
      }
      var input = document.getElementById('fgSrchIn');
      if(input){ input.value = q; try{ input.focus(); }catch(err){} }
      window.dzSearchUI.input(FG_SRCH_UI, q);
    });
  })();

    // Every section query goes through here: postgrest resolves rather than rejects, and an error read as empty renders
    // "nothing matches" and caches it under the search key.
  function fgSrchRows(key){
    return function(r){
      if(r && r.error) throw r.error;
      return { key:key, rows:(r && r.data) || [] };
    };
  }

  function fgSearchArtworks(q){
    var all = (typeof window.galleryImages === 'function') ? window.galleryImages() : null;
    if(!all) return [];
    var needle = q.toLowerCase();
    return all.filter(function(a){
      var hay = [a.name, a.description]
        .concat(a.tags || [])
        .concat(a.category || [])
        .join(' ').toLowerCase();
      return hay.indexOf(needle) !== -1;
    }).slice(0, 40);
  }

  async function fgSearchRun(){
    var res = document.getElementById('fgSrchRes');
    if(!res) return;
    var raw = String(fgSrch.q||'').trim();
    if(!raw){
      fgSrch.rows = {};
      res.innerHTML = '';
      fgSearchNote('Type to search the gallery.');
      return;
    }
    var mySeq = ++fgSrch.seq;
    var pattern = window.dzSearchUI.pattern(raw);
    fgSearchNote('Searching…');

    function want(key){ return fgSrch.scope === 'all' || fgSrch.scope === key; }

    var rows = {};
    if(want('artwork')) rows.artwork = fgSearchArtworks(raw);

    function fgSearchJobs(){
      var jobs = [];
      if(sb && pattern){
        if(want('marketplace')){
          jobs.push(sb.from('marketplace_items')
            .select(typeof window.dzSelectFor === 'function' ? window.dzSelectFor('marketplace')
              : 'id,user_id,title,description,category,tags,item_type,currency,file_ext,file_size,preview_url,license,delivery_days,created_at')
            .eq('status','approved').eq('visibility','published').ilike('title',pattern)
            .order('created_at',{ascending:false}).limit(30)
            .then(fgSrchRows('marketplace')));
        }
        if(want('blog')){
          jobs.push(sb.from('blog_posts')
            .select('id,user_id,title,slug,excerpt,body,cover_url,category,tags,read_minutes,'+
                    'content_type,featured,published_at,created_at')
            .eq('status','approved').eq('visibility','published').ilike('title',pattern)
            .order('created_at',{ascending:false}).limit(30)
            .then(fgSrchRows('blog')));
        }
        if(want('resources')){
          jobs.push(sb.from('resources')
            .select('id,user_id,title,summary,description,resource_type,category,tags,'+
                    'file_name,file_ext,file_size,file_count,preview_url,license,'+
                    'featured,download_count,created_at')
            .eq('status','approved').eq('visibility','published').ilike('title',pattern)
            .order('created_at',{ascending:false}).limit(30)
            .then(fgSrchRows('resources')));
        }
        if(want('artist')){
          var who = fgArtistPattern(raw);
          jobs.push(sb.from('profiles')
            .select(window.DZ_ARTIST_COLS || 'id,username,display_name,avatar_url,banner_url,bio,follower_count')
            .or('username.ilike.'+who+',display_name.ilike.'+who)
            .order('username',{ascending:true}).limit(24)
            .then(fgSrchRows('artist')));
        }
      }
      return jobs;
    }
    var fgSearchWanted = !!(sb && pattern) &&
      (want('artist') || want('marketplace') || want('blog') || want('resources'));

    if(fgSearchWanted){
      var out;
      var cSrch = window.dzCached ? window.dzCached() : null;
      var srchKey = cSrch
        ? 'search:sections:' + cSrch.norm(raw) + ':' + (fgSrch.scope || 'all') +
          ':' + (window.currentUser ? 'member' : 'public')
        : null;
      try{
        out = (cSrch && srchKey && raw.length >= 2)
          ? await cSrch.getOrSet(srchKey, function(){ return Promise.all(fgSearchJobs()); }, 'search')
          : await Promise.all(fgSearchJobs());
      }
      catch(e){
        if(mySeq !== fgSrch.seq) return;
        fgSrch.rows = rows;
        fgSearchRender('Some sections couldn\u2019t be searched — try again.');
        return;
      }
      if(mySeq !== fgSrch.seq) return;
      out.forEach(function(o){ rows[o.key] = o.rows; });
    }
    if(mySeq !== fgSrch.seq) return;
    fgSrch.rows = rows;
    fgSearchRender();
    fgSearchLog(raw);
  }

  var fgSrchLogTimer = null, fgSrchLogged = '';
  var FG_SRCH_SCOPE = { artwork:'artwork', marketplace:'marketplace', blog:'blog', resources:'resource' };
  function fgSearchLog(term){
    clearTimeout(fgSrchLogTimer);
    if(typeof window.dzAnSearch !== 'function') return;
    var q = String(term||'').trim();
    if(q.length < 2 || q === fgSrchLogged) return;
    fgSrchLogTimer = setTimeout(function(){
      if(String(fgSrch.q||'').trim() !== q) return;
      var any = false;
      Object.keys(FG_SRCH_SCOPE).forEach(function(g){
        var rows = fgSrch.rows[g] || [];
        if(!rows.length) return;
        any = true;
        window.dzAnSearch(rows.slice(0,12).map(function(r){ return String(r.id); }),
                          q, FG_SRCH_SCOPE[g]);
      });
      if(any) fgSrchLogged = q;
    }, 1200);
  }

  function fgSearchRender(warn){
    var res = document.getElementById('fgSrchRes');
    if(!res) return;
    res.innerHTML = '';
    var total = 0, mounted = false;

    FG_SRCH_GROUPS.forEach(function(g){
      var rows = fgSrch.rows[g.key] || [];
      if(!rows.length) return;
      total += rows.length;

      var sec = document.createElement('section');
      sec.className = 'pfSrchGrp';
      sec.innerHTML = '<div class="pfSrchGrpHd">'+
          '<span class="pfSrchGrpTitle">'+esc(g.label)+'</span>'+
          '<span class="pfSrchGrpCount">'+rows.length+'</span>'+
        '</div>';

      var wrap = document.createElement('div');
      wrap.className = 'pfSrchCards ' +
        (g.wrap || (typeof window.dzSecLayout === 'function' ? window.dzSecLayout(g.key) : 'dzList'));

      if(g.how === 'artist'){
        rows.forEach(function(p){ if(p && p.id) dzArtistCache[p.id] = p; });
        rows.forEach(function(p){
          if(typeof buildArtistCard === 'function') wrap.appendChild(buildArtistCard(p.id));
        });
          // cards carry an artist's whole published totals, a query of their own; it repaints them when it lands
        if(typeof window.dzPaintPeople === 'function'){
          window.dzPaintPeople(rows.map(function(p){ return p && p.id; }).filter(Boolean));
        }
      } else if(g.how === 'card'){
        rows.forEach(function(r){
          if(typeof buildAwCard !== 'function') return;
          var el = buildAwCard(r);
          window.dzCardActivate(el, function(){ fgSearchOpen('artwork', r.id); });
          wrap.appendChild(el);
        });
      } else {
        wrap.innerHTML = rows.map(function(r){
          return (typeof window.dzSecCard === 'function') ? window.dzSecCard(g.key, r) : '';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function(el, i){
          var row = rows[i];
          el.removeAttribute('onclick');
          el.onclick = function(){ fgSearchOpen(g.key, row && row.id); };
        });
        mounted = mounted || g.key === 'marketplace';
      }

      sec.appendChild(wrap);
      res.appendChild(sec);
    });

    if(mounted && typeof window.dzExtras === 'function') window.dzExtras();

    fgSearchNote(warn || (total ? '' : 'Nothing in the gallery matches \u201C'+fgSrch.q.trim()+'\u201D.'));
  }

  function fgSearchOpen(kind, id){
    var rows = fgSrch.rows[kind] || [];
    var row  = rows.find(function(x){ return String(x.id)===String(id); });
    if(!row) return;
    if(FG_SRCH_SCOPE[kind] && typeof window.dzAnTrack === 'function'){
      var sq = String(fgSrch.q||'').trim();
      if(sq) window.dzAnTrack('search_click', String(id), { term: sq, scope: FG_SRCH_SCOPE[kind] });
    }
    if(kind==='artwork'){
      var cats = catList(row.category).length ? catList(row.category)
               : (catList(row.tags).length ? catList(row.tags) : ['others']);
      openLB(row.image_url, row.name, cats[0]||'', row.description||'', String(row.id), false, rows);
      return;
    }
    if(typeof window.dzOpenRow==='function') window.dzOpenRow(kind, row);
  }

  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    var pg = document.getElementById('fgSearchPage');
    if(pg && pg.classList.contains('open')) closeFgSearch();
  });

  document.addEventListener('keydown', function(e){
    if(e.key !== 'k' && e.key !== 'K') return;
    if(!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    var t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var fg = document.getElementById('fg');
    if(!fg || !fg.classList.contains('open')) return;
    e.preventDefault();
    openFgSearch();
  });

  window.openFgSearch = openFgSearch;
  window.closeFgSearch = closeFgSearch;
  window.fgSearchInput = fgSearchInput;
  window.fgSearchClear = fgSearchClear;
  window.fgSearchScope = fgSearchScope;
  window.fgSearchOpen = fgSearchOpen;
  window.fgSearchArtworks = fgSearchArtworks;
  window.fgArtistPattern = fgArtistPattern;

  function openSubscription() {
    dzPanelOpen('subPage');
      // The tier can have moved since the cards were built -- a purchase, a
      // sign-in, an expiry -- and the panel is cheap to repaint on the way in
    if (typeof window.dzPaintPlans === 'function') window.dzPaintPlans();
  }
  function closeSubscription() { dzPanelShut('subPage'); }
