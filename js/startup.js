  (
  async function init(){
    var boot = window.dzNavToken ? window.dzNavToken() : null;

    var loading = loadDB();
    await dzDomReady();

    var revealed = false;
    function reveal(){
      if(revealed) return;
      revealed = true;
      if(typeof window._heroLoadCb === 'function') window._heroLoadCb(null);
    }
    var headStart = setTimeout(reveal, 2500);

    try{ await loading; }
    catch(e){ console.error(e); }
    clearTimeout(headStart);
    try{ renderHome(); }
    catch(e){ console.error(e); }
    reveal();
    var stillBooting = (boot === null) ||
                       (typeof window.dzNavCurrent !== 'function') ||
                       window.dzNavCurrent(boot);
    var m = window.location.pathname.match(/^\/artwork\/([^/]+)\/?$/);
    if(m && stillBooting) openArtworkById(dzDecodeSeg(m[1]), false);
    var pm = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/);
    if(pm && stillBooting) openProfileByUsername(dzDecodeSeg(pm[1]), false);
    var sm = window.location.pathname.match(/^\/(resource|blog|listing|job)\/([^/]+)\/?$/);
    if(sm && stillBooting && typeof window.dzOpenById === 'function') window.dzOpenById(sm[1], sm[2]);
    injectGallerySEO();
  })();

  function injectGallerySEO(){
    if(!images.length) return;
    var here = window.location.pathname;
    if(here !== '/' && here !== '/index.html') return;
    var ld = document.getElementById('ldGallery');
    if(!ld){
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'ldGallery';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      '@context':'https://schema.org',
      '@type':'ImageGallery',
      'name':'Digiartz Gallery',
      'url':SITE_URL+'/',
      'image':images.slice(0,100).map(function(a){
        return {
          '@type':'ImageObject',
          'contentUrl':a.image_url||'',
          'name':a.name||'Untitled artwork',
          'description':(a.description&&a.description.trim())?a.description.trim().slice(0,300):undefined,
          'url':SITE_URL+'/artwork/'+a.id
        };
      })
    });
  }

  var awArtworksCache = [];

  function buildAwCard(item, eager){
    var fullSrc = item.image_url || '';
    var name    = item.name || 'Untitled';
    var cat     = catList(item.category)[0] || 'others';
    var desc    = item.description || '';
    var id      = item.id;

    var card = document.createElement('a');
    card.className = 'awCard';
    card.setAttribute('aria-label','View ' + name);
    if(id !== undefined && id !== null && id !== ''){
      card.href = '/artwork/' + encodeURIComponent(String(id));
    } else {
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
    }

    var wrap = document.createElement('div');
    wrap.className = 'awImgWrap awLoading';

    var img = document.createElement('img');
    img.onload  = function(){ wrap.classList.remove('awLoading'); };
    img.onerror = function(){ wrap.classList.remove('awLoading'); };

    img.loading = eager ? 'eager' : 'lazy';
    if(eager) img.setAttribute('fetchpriority', 'high');
    img.decoding = 'async';
    img.draggable = false;
    img.alt = name;
    img.style.cssText = thumbStyle(item.thumb_x, item.thumb_y, item.thumb_zoom);

    dzApplyThumb(img, fullSrc);

    wrap.appendChild(img);
    if(typeof dzBuildHoverReveal === 'function') wrap.appendChild(dzBuildHoverReveal(item.user_id));

    var meta = document.createElement('div');
    meta.className = 'awMeta';

    var nm = document.createElement('div');
    nm.className = 'awName';
    nm.textContent = name;

    var ct = document.createElement('div');
    ct.className = 'awCat';
    ct.textContent = cat;

    meta.appendChild(nm);
    meta.appendChild(ct);
    card.appendChild(wrap);
    card.appendChild(meta);

    (function(s,n,c,d,i){
      window.dzCardActivate(card, function(){ openLB(s,n,c,d,i); });
    })(fullSrc, name, cat, desc, id);
    return card;
  }

  var awRList = [], awRShown = 0, awSent = null;
