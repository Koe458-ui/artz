(function(){
  'use strict';

  var dzSecRows = {}, dzBusy = {}, dzLoaded = {};
  function dzc(){ return window.dzCached ? window.dzCached() : null; }

  var SEC = {
    resources: {
      table:'resources', kind:'grid', noun:'resource',
      eq:{ visibility:'published' },
      order:[['featured',false],['created_at',false]],
      select:'id,user_id,title,summary,description,resource_type,category,subcategory,tags,'+
             'file_storage_path,file_name,file_ext,file_size,file_count,dimensions,preview_url,'+
             'license,commercial_use,attribution_required,modification_allowed,'+
             'software,compatible_software,compatible_versions,whats_included,instructions,'+
             'version,external_links,safety_notes,featured,download_count,updated_at,created_at'
    },
    blog: {
      table:'blog_posts', kind:'list', noun:'post',
      eq:{ visibility:'published' },
      order:[['featured',false],['created_at',false]],
      select:'id,user_id,title,excerpt,body,cover_url,category,tags,read_minutes,'+
             'content_type,related_artworks,related_items,external_refs,featured,'+
             'author_bio,like_count,view_count,bookmark_count,'+
             'published_at,updated_at,created_at'
    },
    marketplace: {
      table:'marketplace_items', kind:'grid', noun:'item',
      eq:{ visibility:'published' },
      order:[['featured',false],['created_at',false]],
      select:'id,user_id,title,summary,description,category,subcategory,tags,item_type,product_type,'+
             'currency,file_ext,file_size,file_format,file_count,file_size_mb,dimensions,software,'+
             'source_files_included,preview_url,gallery,license,commercial_use,personal_use,'+
             'modification_allowed,attribution_required,stock,delivery_type,delivery_days,'+
             'delivery_notes,custom_requests,revision_count,support_period,refund_policy,'+
             'preview_watermark,safety_notes,seller_note,apply_url,apply_email,'+
             'buyer_gets,featured,closing_date,created_at'
    },
    jobs: {
      table:'jobs', kind:'list', noun:'job',
      eq:{ visibility:'public' },
      order:[['featured',false],['created_at',false]],
      select:'id,user_id,title,company,company_url,about_company,description,category,tags,'+
             'employment_type,experience_level,years_experience,openings,'+
             'responsibilities,requirements,required_skills,nice_to_have_skills,benefits,'+
             'work_mode,is_remote,location_city,location_country,applicant_countries,'+
             'timezone,working_hours,schedule,start_date,contract_duration,'+
             'salary_min,salary_max,salary_currency,salary_unit,apply_url,apply_email,'+
             'application_instructions,application_materials,application_questions,'+
             'portfolio_required,resume_required,cover_letter_required,'+
             'valid_through,featured,created_at'
    }
  };

  function bytes(n){
    n = Number(n)||0;
    if(n <= 0) return '';
    var u = ['B','KB','MB','GB'], i = 0;
    while(n >= 1024 && i < u.length-1){ n /= 1024; i++; }
    return (n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }
  function ago(ts){
    if(!ts) return '';
    var s = (Date.now() - new Date(ts).getTime())/1000;
    if(s < 60) return 'just now';
    var m = [[31536000,'y'],[2592000,'mo'],[604800,'w'],[86400,'d'],[3600,'h'],[60,'m']];
    for(var i=0;i<m.length;i++){ if(s >= m[i][0]) return Math.floor(s/m[i][0]) + m[i][1] + ' ago'; }
    return 'just now';
  }
  function money(cents, cur){
    if(!cents) return 'Free';
    try{
      return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD'}).format(cents/100);
    }catch(e){ return ((cents/100).toFixed(2)) + ' ' + (cur||'USD'); }
  }
  function slot(r, id, hasFile, view){
    if(!window.currentUser) return '';
    return '<div class="dzSlot" data-i="'+id+'" data-p="'+(Number(r.price_cents)||0)+
           '" data-c="'+esc(r.currency||'USD')+'" data-f="'+(hasFile?1:0)+
           '" data-t="'+esc(r.title||'')+'" data-th="'+esc(r.preview_url||'')+
           '" data-v="'+view+'"></div>';
  }
  window.dzSlot = slot;

  var DZ_CURRENCIES = [['USD','USD'],['INR','INR'],['EUR','EUR'],['GBP','GBP'],
    ['JPY','JPY'],['AUD','AUD'],['CAD','CAD'],['SGD','SGD'],['CHF','CHF'],
    ['HKD','HKD'],['NZD','NZD'],['SEK','SEK']];
  function dzPrefCurrency(){
    return (window.__dzStore && window.__dzStore.currency) || 'USD';
  }

  function slugify(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function labelOf(sec, slug){
    var o = (window.FG_SECTIONS && FG_SECTIONS[sec] && FG_SECTIONS[sec].opts) || [];
    for(var i=0;i<o.length;i++){ if(slugify(o[i]) === slug) return o[i]; }
    return slug;
  }

  function dzSecEnter(sec){
    if(sec === 'cart'){ dzCartRender(); return; }
    if(!SEC[sec] || dzLoaded[sec] || dzBusy[sec]) { dzSecRender(sec); return; }
    dzSecLoad(sec);
  }

  function openCartPage(){
    if(typeof bnCloseAllSections === 'function') bnCloseAllSections();
    if(!dzPanelOpen('cartPage')) return;
    dzCartRender();
    if(typeof window.dzRouteAudit === 'function') window.dzRouteAudit();
  }
  function closeCartPage(){ dzPanelShut('cartPage'); }
  function dzGoCart(){
    if(!window.currentUser){
      if(typeof openAuthMod === 'function'){ openAuthMod(); return; }
    }
    openCartPage();
  }
  window.openCartPage  = openCartPage;
  window.closeCartPage = closeCartPage;
  window.dzGoCart      = dzGoCart;

  async function dzCartRender(){
    var host = document.getElementById('fgSecC-cart');
    if(!host) return;
    if(!window.currentUser){
      host.innerHTML = '<div class="dzEmpty">SIGN IN TO USE YOUR CART</div>';
      dzCartBadge(0);
      return;
    }
    if(!sb){ host.innerHTML = '<div class="dzEmpty">BACKEND NOT CONFIGURED</div>'; return; }
    host.innerHTML = '<div class="dzEmpty">LOADING…</div>';
    try{
      var c = await sb.from('cart_items').select('item_id,created_at')
                .eq('user_id', currentUser.id).order('created_at',{ascending:false}).limit(100);
      var ids = ((c && c.data) || []).map(function(x){ return x.item_id; });
      dzCartBadge(ids.length);
      if(!ids.length){ host.innerHTML = '<div class="dzEmpty">YOUR CART IS EMPTY</div>'; return; }
      var m = await sb.from('marketplace_items').select(selectFor('marketplace')).in('id', ids);
      var rows = (m && m.data) || [];
      var byId = {};
      rows.forEach(function(r){ byId[String(r.id)] = r; });
      rows = ids.map(function(i){ return byId[String(i)]; }).filter(Boolean);
      dzCartBadge(rows.length);
      if(!rows.length){ host.innerHTML = '<div class="dzEmpty">YOUR CART IS EMPTY</div>'; return; }
      dzCartRows = rows;
      host.innerHTML = '<div class="dzGrid">'+rows.map(function(r){
        return '<div class="dzCartCell">'+card('marketplace', r)+
          '<button class="vwMore dzCartRm" type="button" onclick="dzCartRemove(\''+esc(r.id)+'\')">'+
          'REMOVE FROM CART</button></div>';
      }).join('')+'</div>';
      if(typeof window.dzExtras === 'function') window.dzExtras();
    }catch(e){
      host.innerHTML = '<div class="dzEmpty">COULD NOT LOAD YOUR CART</div>';
    }
  }
  var dzCartRows = [];
  function dzCartBadge(n){
    var b = document.getElementById('dzCartCount');
    if(!b) return;
    n = +n || 0;
    b.textContent = n > 99 ? '99+' : (n ? String(n) : '');
    b.parentNode.classList.toggle('hasItems', n > 0);
  }
  async function dzCartCountLoad(){
    if(!window.currentUser || !sb){ dzCartBadge(0); return; }
    try{
      var r = await sb.from('cart_items')
                .select('item_id', { count:'exact', head:true })
                .eq('user_id', currentUser.id);
      dzCartBadge((r && r.count) || 0);
    }catch(e){   }
  }
  window.dzCartBadge  = dzCartBadge;
  window.dzCartCount  = dzCartCountLoad;
  window.dzCartRows   = function(){ return dzCartRows; };
  window.dzCartPaint  = dzCartRender;
  window.dzCartRemove = async function(id){
    if(!window.currentUser || !sb) return;
    try{
      var r = await sb.from('cart_items').delete()
                .eq('user_id', currentUser.id).eq('item_id', id);
      if(r.error) throw r.error;
      showToast('Removed from cart');
      dzCartRender();
    }catch(e){ showToast('Could not remove it — try again'); }
  };
  function selectFor(sec){
    var s = SEC[sec].select;
    if(sec === 'marketplace' && window.currentUser) s += ',price_cents,sale_price_cents';
    return s;
  }
  window.dzSelectFor = selectFor;
  window.dzCatLabel  = labelOf;

  function dzSecKey(sec){
    return 'section:' + sec + ':list:' + (window.currentUser ? 'member' : 'public');
  }

  function dzSecLoad(sec){
    var cfg = SEC[sec], host = document.getElementById('fgSecC-'+sec);
    if(!cfg || !host) return;
    if(!sb){ host.innerHTML = '<div class="dzEmpty">BACKEND NOT CONFIGURED</div>'; return; }

    var c = dzc(), key = dzSecKey(sec), policy = 'section:' + sec;

    var warm = c ? c.peek(key, policy, { any:true }) : null;
    if(warm && warm.length){
      dzSecRows[sec] = warm;
      dzLoaded[sec] = true;
      dzBusy[sec] = false;
      dzSecRender(sec);
    } else {
      dzBusy[sec] = true;
      host.innerHTML = '<div class="dzBusy">LOADING…</div>';
    }

    var load = function(){
      var q = sb.from(cfg.table).select(selectFor(sec)).eq('status','approved');
      if(cfg.eq) Object.keys(cfg.eq).forEach(function(k){ q = q.eq(k, cfg.eq[k]); });
      (cfg.order || [['created_at',false]]).forEach(function(o){
        q = q.order(o[0], {ascending:!!o[1]});
      });
      return q.limit(200).then(function(res){
        if(res && res.error) throw res.error;
        return (res && res.data) || [];
      });
    };

    var apply = function(rows){
      dzBusy[sec] = false; dzLoaded[sec] = true;
      dzSecRows[sec] = rows || [];
      dzSecRender(sec);
    };

    (c ? c.getOrSet(key, load, policy, apply) : load())
      .then(apply, function(){
        dzBusy[sec] = false;
        if(dzSecRows[sec] && dzSecRows[sec].length){ dzSecRender(sec); return; }
        host.innerHTML = '<div class="dzEmpty">COULD NOT LOAD — TRY AGAIN</div>';
      });
  }

  function matches(row, q){
    if(!q) return true;
    var hay = [row.title, row.description, row.excerpt, row.company]
                .concat(row.tags||[]).concat(row.category||[]).join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }
  function dzSecRender(sec){
    var host = document.getElementById('fgSecC-'+sec);
    if(!host || !SEC[sec]) return;
    if(dzBusy[sec]) return;
    if(!dzLoaded[sec]){ host.innerHTML = ''; return; }

    var q   = String((window.fgSecQuery||{})[sec]||'').trim().toLowerCase();
    var cat = (window.fgSecFilter||{})[sec] || 'all';
    var rows = (dzSecRows[sec]||[]).filter(function(r){
      if(cat !== 'all' && (r.category||[]).indexOf(cat) === -1) return false;
      return matches(r, q);
    });

    if(!rows.length){
      host.innerHTML = (q || cat !== 'all')
        ? '<div class="fgEmp">'+
          '<p class="fgEmpTitle">No results found</p>'+
          '<p class="fgEmpText">It seems we can\u2019t find any results based on your search.</p>'+
          '</div>'
        : '<div class="dzEmpty">NOTHING HERE YET</div>';
      return;
    }
    var wrap = SEC[sec].kind === 'grid' ? 'dzGrid' : 'dzList';
    host.innerHTML = '<div class="'+wrap+'">' + rows.map(function(r){ return card(sec, r); }).join('') + '</div>';
    if(typeof window.dzExtras === 'function') window.dzExtras();
  }

  function chips(r){
    var t = (r.tags||[]).slice(0,3);
    if(!t.length) return '';
    return '<div class="dzChipRow">' + t.map(function(x){
      return '<span class="dzChip">'+esc(x)+'</span>'; }).join('') + '</div>';
  }

  function card(sec, r){
    var id = esc(r.id);
    if(sec === 'resources'){
      var thumb = r.preview_url
        ? '<img loading="lazy" decoding="async" '+dzThumbAttrs(r.preview_url)+' alt="'+esc(r.title)+'">'
        : '<span class="dzExt">'+esc((r.file_ext||'FILE').toUpperCase())+'</span>';
      return '<div class="dzCard" onclick="dzOpenView(\'resources\',\''+id+'\')">'+
        '<div class="dzThumb">'+thumb+'<span class="dzBadge">'+esc((r.file_ext||'').toUpperCase())+'</span></div>'+
        '<div class="dzBody"><div class="dzName">'+esc(r.title)+'</div>'+
        (r.summary ? '<div class="dzHint">'+esc(r.summary)+'</div>' : '')+
        '<div class="dzMeta">'+
        (r.featured ? '<span>★ Featured</span>' : '')+
        (r.resource_type ? '<span>'+esc(r.resource_type)+'</span>' : '')+
        '<span>'+esc(bytes(r.file_size))+'</span>'+
        (r.file_count > 1 ? '<span>'+esc(String(r.file_count))+' files</span>' : '')+
        '<span>'+esc(String(r.download_count||0))+' downloads</span>'+
        '<span>'+esc(r.license||'')+'</span></div>'+chips(r)+'</div></div>';
    }
    if(sec === 'marketplace'){
      var mt = r.preview_url
        ? '<img loading="lazy" decoding="async" '+dzThumbAttrs(r.preview_url)+' alt="'+esc(r.title)+'">'
        : '<span class="dzExt">'+esc((r.item_type||'ITEM').toUpperCase())+'</span>';
      var hasFile = r.file_ext ? 1 : 0;
      return '<div class="dzCard" data-id="'+id+'" onclick="dzOpenView(\'marketplace\',\''+id+'\')">'+
        '<div class="dzThumb">'+mt+'<span class="dzBadge">'+esc((r.item_type||'').toUpperCase())+'</span></div>'+
        '<div class="dzBody"><div class="dzName">'+esc(r.title)+'</div>'+
        (r.summary ? '<div class="dzHint">'+esc(r.summary)+'</div>' : '')+
        '<div class="dzMeta">'+
        (r.featured ? '<span>★ Featured</span>' : '')+
        (r.product_type ? '<span>'+esc(r.product_type)+'</span>' : '')+
        '<span>'+esc(r.license||'')+'</span>'+
        (r.delivery_days ? '<span>'+esc(String(r.delivery_days))+'d delivery</span>' : '')+
        '</div>'+chips(r)+slot(r, id, hasFile, 'card')+'</div></div>';
    }
    if(sec === 'blog'){
      var ico = r.cover_url
        ? '<img loading="lazy" decoding="async" src="'+esc(getThumbnailUrl(r.cover_url))+'" alt="">'
        : esc((r.title||'?').charAt(0).toUpperCase());
      var ex = r.excerpt || String(r.body||'').slice(0,140);
      return '<div class="dzRow" data-id="'+id+'" onclick="dzOpenView(\'blog\',\''+id+'\')"><div class="dzRowIco">'+ico+'</div>'+
        '<div style="min-width:0;flex:1"><div class="dzName">'+esc(r.title)+'</div>'+
        '<div class="dzMeta" style="margin:.2rem 0 .3rem">'+
        (r.featured ? '<span>★ Featured</span>' : '')+
        (r.content_type ? '<span>'+esc(r.content_type)+'</span>' : '')+
        '<span>'+esc(ago(r.published_at || r.created_at))+'</span>'+
        '<span>'+esc(String(r.read_minutes||1))+' min read</span></div>'+
        '<div class="dzHint">'+esc(ex)+'</div>'+chips(r)+'</div></div>';
    }
    var where = jobWhere(r), pay = jobPay(r);
    return '<div class="dzRow" data-id="'+id+'" onclick="dzOpenView(\'jobs\',\''+id+'\')">'+
      '<div class="dzRowIco">'+esc((r.company||'?').charAt(0).toUpperCase())+'</div>'+
      '<div style="min-width:0;flex:1"><div class="dzName">'+esc(r.title)+'</div>'+
      '<div class="dzMeta" style="margin:.2rem 0 .3rem">'+
      (r.featured ? '<span>★ Featured</span>' : '')+
      '<span>'+esc(r.company)+'</span>'+
      (where ? '<span>'+esc(where)+'</span>' : '')+
      '<span>'+esc(String(r.employment_type||'').replace(/_/g,' '))+'</span>'+
      (pay ? '<span>'+esc(pay)+'</span>' : '')+
      (r.openings > 1 ? '<span>'+esc(String(r.openings))+' openings</span>' : '')+
      '<span>'+esc(ago(r.created_at))+'</span></div>'+chips(r)+'</div></div>';
  }

  var WORK_MODE_LBL = { remote:'Remote', onsite:'On-site', hybrid:'Hybrid' };
  function jobMode(r){ return r.work_mode || (r.is_remote ? 'remote' : 'onsite'); }
  function jobWhere(r){
    var mode = jobMode(r);
    var place = [r.location_city, r.location_country].filter(Boolean).join(', ');
    if(mode === 'remote') return 'Remote';
    if(mode === 'hybrid') return place ? 'Hybrid · '+place : 'Hybrid';
    return place;
  }
  function jobAmount(x, cur){
    var n = Number(x);
    try{
      return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD',
        maximumFractionDigits: n % 1 ? 2 : 0}).format(n);
    }catch(e){ return (n % 1 ? n.toFixed(2) : String(n)) + ' ' + (cur||'USD'); }
  }
  function jobPay(r){
    if(r.salary_min == null && r.salary_max == null) return '';
    var cur = r.salary_currency;
    var parts = [r.salary_min, r.salary_max].filter(function(x){ return x != null; });
    if(parts.length === 2 && Number(parts[0]) === Number(parts[1])) parts = [parts[0]];
    return parts.map(function(x){ return jobAmount(x, cur); }).join(' – ')
      + (r.salary_unit ? ' / '+String(r.salary_unit).toLowerCase() : '');
  }
  window.dzJobWhere = jobWhere;
  window.dzJobPay   = jobPay;
  window.dzJobMode  = jobMode;
  window.dzJobModeLbl = WORK_MODE_LBL;

  var LICENSE_RES = [['personal','Personal use only'],['commercial','Commercial use OK'],
                     ['cc0','CC0 — public domain'],['cc-by','CC BY — credit required'],['custom','Custom terms']];
  var LICENSE_MKT = [['standard','Standard'],['extended','Extended'],['exclusive','Exclusive'],['custom','Custom']];
  var EMP = [['CONTRACTOR','Freelance / contract'],['FULL_TIME','Full-time'],['PART_TIME','Part-time'],
             ['INTERN','Internship'],['TEMPORARY','Temporary'],['VOLUNTEER','Volunteer / collab'],
             ['PER_DIEM','Per diem'],['OTHER','Other']];
  var EMP_FIXED_TERM = { CONTRACTOR:1, TEMPORARY:1 };

  var EXP_LEVEL = [['Entry','Entry level'],['Junior','Junior'],['Mid','Mid level'],
                   ['Senior','Senior'],['Lead','Lead'],['Principal','Principal'],
                   ['Manager','Manager'],['Director','Director'],['Executive','Executive']];
  var WORK_MODE = [['remote','Remote'],['onsite','On-site'],['hybrid','Hybrid']];
  var PAY_PERIOD = [['HOUR','Per hour'],['DAY','Per day'],['WEEK','Per week'],
                    ['MONTH','Per month'],['YEAR','Per year']];
  var VISIBILITY = [['public','Public — listed in Jobs'],
                    ['unlisted','Unlisted — reachable by link'],
                    ['private','Private — only you']];

  var DZ_SELL_MAX = 50, DZ_GALLERY_MAX = 8;
  var ITEM_TYPE = [['digital','Digital download'],['commission','Commission slot'],['service','Service']];
  var ITEM_SERVICE = { commission:1, service:1 };
  var PRODUCT_TYPE = [['Artwork','Artwork'],['Template','Template'],['Asset','Asset'],
                      ['Preset','Preset'],['Brush','Brush pack'],['Font','Font'],
                      ['Texture','Texture'],['3D Model','3D model'],['UI Kit','UI kit'],
                      ['Icon Set','Icon set'],['Mockup','Mockup'],['Plugin','Plugin'],
                      ['Tutorial','Tutorial'],['Other','Other']];
  var DELIVERY_TYPE = [['instant','Instant download'],['custom','Custom delivery']];
  var MKT_VISIBILITY = [['published','Published — listed in the Marketplace'],
                        ['draft','Draft — kept, not listed'],
                        ['hidden','Hidden — reachable by link only']];
  var MKT_AUTO = [
    ['seo_title',       'SEO title'],
    ['seo_description', 'SEO description'],
    ['slug',            'URL slug']
  ];
  var CONTENT_TYPE = [['Article','Article'],['Tutorial','Tutorial'],['Guide','Guide'],
                      ['Interview','Interview'],['News','News']];
  var BLOG_VISIBILITY = [['published','Published — listed in the Blog'],
                         ['draft','Draft — kept, not listed'],
                         ['scheduled','Scheduled — goes live at the set time'],
                         ['hidden','Hidden — reachable by link only']];
  var BLOG_AUTO = [
    ['seo_title',       'SEO title'],
    ['seo_description', 'SEO description'],
    ['slug',            'URL slug'],
    ['read_minutes',    'Reading time']
  ];

  var ART_MEDIUM = [['Digital painting','Digital painting'],['Digital illustration','Digital illustration'],
                    ['Concept art','Concept art'],['3D render','3D render'],['Pixel art','Pixel art'],
                    ['Vector','Vector'],['Photomanipulation','Photomanipulation'],
                    ['Sketch','Sketch'],['Line art','Line art'],
                    ['Pencil','Pencil — traditional'],['Ink','Ink — traditional'],
                    ['Watercolour','Watercolour — traditional'],['Acrylic','Acrylic — traditional'],
                    ['Oil','Oil — traditional'],['Mixed media','Mixed media'],['Other','Other']];
  var ART_DIGITAL = { 'Digital painting':1, 'Digital illustration':1, 'Concept art':1,
                      '3D render':1, 'Pixel art':1, 'Vector':1, 'Photomanipulation':1 };
  var SOFTWARE_OPTS = [
    'Photoshop','Illustrator','Procreate','Clip Studio Paint','ibisPaint',
    'Krita','MediBang Paint','Paint Tool SAI','GIMP','Corel Painter',
    'Affinity Photo','Affinity Designer','Autodesk SketchBook','Inkscape',
    'Figma','Aseprite','Blender','ZBrush','Maya','Cinema 4D',
    'Substance Painter','Nomad Sculpt','After Effects'
  ];
  var ART_LICENSE = [['All rights reserved','All rights reserved'],
                     ['Personal use only','Personal use only'],
                     ['Commercial use allowed','Commercial use allowed'],
                     ['CC BY','CC BY — credit required'],
                     ['CC BY-SA','CC BY-SA — credit, share alike'],
                     ['CC BY-NC','CC BY-NC — credit, non-commercial'],
                     ['CC0','CC0 — public domain'],
                     ['Custom','Custom terms']];
  var ART_VISIBILITY = [['published','Published — shown in the gallery'],
                        ['draft','Draft — kept, not shown'],
                        ['scheduled','Scheduled — goes live at the set time'],
                        ['hidden','Hidden — reachable by link only']];
  var ART_AUTO = [
    ['file_format',     'File format'],
    ['file_size',       'File size'],
    ['dimensions',      'Dimensions'],
    ['seo_title',       'SEO title'],
    ['seo_description', 'SEO description'],
    ['slug',            'URL slug']
  ];

  var RESOURCE_TYPE = [['Brush','Brush pack'],['Texture','Texture'],['Font','Font'],
                       ['Template','Template'],['3D Model','3D model'],['Asset','Asset pack'],
                       ['Preset','Preset'],['Action','Action / script'],['Plugin','Plugin'],
                       ['Palette','Colour palette'],['Mockup','Mockup'],['Pattern','Pattern'],
                       ['LUT','LUT'],['Other','Other']];
  var RES_VISIBILITY = [['published','Published — listed in Resources'],
                        ['draft','Draft — kept, not listed'],
                        ['scheduled','Scheduled — goes live at the set time'],
                        ['hidden','Hidden — reachable by link only']];
  var YES_NO_PLAIN = [['yes','Yes'],['no','No']];
  var RES_AUTO = [
    ['file_format',     'File format'],
    ['file_size',       'File size'],
    ['file_count',      'File count'],
    ['dimensions',      'Resolution'],
    ['seo_title',       'SEO title'],
    ['seo_description', 'SEO description'],
    ['slug',            'URL slug']
  ];

  var YES_NO = [['yes','Yes — buyers may use it commercially'],
                ['no','No — personal use only']];

  var FORMS = {
    artwork: { title:'Upload Artwork', sub:'Share your creativity with artists around the world.',
      fields:[
        {k:'summary', t:'text', slot:1, label:'Short summary', min:20, max:250,
         ph:'One line shown on the card.'},
        {k:'subject_matter', t:'text', slot:2, label:'Subject matter', min:2, max:100,
         ph:'e.g. Character portrait, sci-fi landscape'},
        {k:'medium', t:'sel', slot:2, label:'Artwork type / medium', req:true,
         options:ART_MEDIUM, def:'Digital painting'},
        {k:'software_list', t:'list', slot:3, cap:10, imin:2, imax:50,
         label:'Software used', reqIf:'digitalart', opts:SOFTWARE_OPTS,
         pick:'Pick your software', ph:'Or type another, then press Enter',
         hint:'Up to 10. Required for digital work, optional for traditional.'},
        {k:'license', t:'sel', slot:4, label:'License / usage rights', req:true,
         options:ART_LICENSE, def:'All rights reserved'},
        {k:'commercial_use', t:'sel', slot:4, label:'Commercial use allowed', req:true,
         options:YES_NO_PLAIN, def:'no'},
        {k:'attribution_required', t:'sel', slot:4, label:'Attribution required', req:true,
         options:YES_NO_PLAIN, def:'yes'},
        {k:'modification_allowed', t:'sel', slot:4, label:'Modification allowed',
         options:YES_NO_PLAIN, def:'no'},
        {k:'is_mature', t:'sel', slot:4, label:'Mature content', req:true,
         options:YES_NO_PLAIN, def:'no',
         hint:'Say so if it is. The review also marks work it judges mature.'},
        {k:'credits', t:'list', slot:4, cap:20, imin:2, imax:300,
         label:'Credits / collaborators', ph:'Name and role, then press Enter',
         hint:'Models, assistants, client, team.'},
        {k:'process_notes', t:'area', slot:4, label:'Process notes', min:20, max:3000, rows:3,
         ph:'WIP notes, a breakdown, what you were trying.'},
        {k:'external_links', t:'list', slot:4, url:1, cap:5, imin:5, imax:200,
         label:'External links', hint:'Portfolio, source, video, reference. Up to 5.'},
        {k:'comments_allowed', t:'sel', slot:4, label:'Comments allowed',
         options:YES_NO_PLAIN, def:'yes'},
        {k:'visibility', t:'sel', slot:5, label:'Visibility', req:true,
         options:ART_VISIBILITY, def:'published'},
        {k:'featured', t:'chk', slot:5, label:'Feature this artwork',
         hint:'Featured work sits at the top of the gallery.'},
        {k:'__auto', t:'auto', slot:5, label:'Read from your upload', items:ART_AUTO}
      ]},
    resources: { title:'Share a Resource', sub:'Brushes, textures, fonts, templates — anything that helps another artist work faster.',
      fields:[
        {k:'file',   t:'file',  label:'Resource file', req:true,
         accept:'.zip,.rar,.7z,.psd,.abr,.brushset,.procreate,.clip,.ttf,.otf,.woff2,.pdf,.obj,.fbx,.blend',
         mb:'asset', hint:'ZIP, PSD, ABR, brushset, fonts, 3D — up to 200MB.'},
        {k:'preview',t:'image', label:'Preview image', req:true,
         accept:'image/jpeg,image/png,image/webp,image/gif',
         hint:'Required. Shown on the card and auto-checked. JPG/PNG/WEBP/GIF up to 25MB.'},
        {k:'title',  t:'text',  label:'Title', req:true, min:3, max:100, ph:'Name your resource…'},
        {k:'summary',t:'text',  label:'Short summary', req:true, min:20, max:250,
         ph:'One line — what it is and who it is for.',
         hint:'Shown on the card and in search results.'},
        {k:'description', t:'area', label:'Description', req:true, min:50, max:5000, rows:6,
         ph:'What it is, how it was made, how it is meant to be used…'},
        {k:'resource_type',t:'sel', label:'Resource type', req:true, options:RESOURCE_TYPE, def:'Brush'},
        {k:'category',t:'cat',  label:'Category', req:true},
        {k:'subcategory',t:'text', label:'Subcategory', min:2, max:50, ph:'e.g. Inking brushes'},
        {k:'tags',    t:'tags', label:'Tags', max:30},
        {k:'license', t:'sel',  label:'License', req:true, options:LICENSE_RES},
        {k:'commercial_use',t:'sel', label:'Commercial use allowed', req:true,
         options:YES_NO_PLAIN, def:'no',
         hint:'Whether someone may sell the work they make with this.'},
        {k:'attribution_required',t:'sel', label:'Attribution required', req:true,
         options:YES_NO_PLAIN, def:'no'},
        {k:'modification_allowed',t:'sel', label:'Modification allowed', req:true,
         options:YES_NO_PLAIN, def:'yes'},
        {k:'software',t:'text', label:'Made with', min:2, max:100, ph:'Photoshop, Procreate…'},
        {k:'compatible_software',t:'list', cap:10, imin:2, imax:50,
         label:'Compatible software', opts:SOFTWARE_OPTS,
         pick:'Pick the software', ph:'Or type another, then press Enter',
         hint:'Up to 10. Pick from the list or press Enter after each.'},
        {k:'compatible_versions',t:'text', label:'Compatible versions', min:2, max:200,
         ph:'e.g. Photoshop CC 2022+'},
        {k:'whats_included',t:'area', label:'What’s included', req:true, min:20, max:2000, rows:4,
         ph:'Every file and asset in the package — one per line.'},
        {k:'instructions',t:'area', label:'Installation / usage instructions', min:20, max:3000, rows:4,
         ph:'How to open, install or load it.'},
        {k:'version',t:'text', label:'Version', min:1, max:30, ph:'e.g. 1.2.4'},
        {k:'external_links',t:'list', url:1, cap:5, imin:5, imax:200,
         label:'External links', hint:'Docs, demo, source, support. Up to 5.'},
        {k:'safety_notes',t:'area', label:'Safety / content notes', min:20, max:500, rows:2,
         ph:'AI assistance, mature content, anything a downloader should know up front.'},
        {k:'visibility',t:'sel', label:'Visibility', req:true, options:RES_VISIBILITY, def:'published'},
        {k:'featured',t:'chk', label:'Feature this resource',
         hint:'Featured resources sit at the top of the list.'},
        {k:'__auto', t:'auto', label:'Read from your upload', items:RES_AUTO}
      ]},
    blog: { title:'Write a Post', sub:'Stories, tips and studio notes for the community.',
      fields:[
        {k:'title', t:'text',  label:'Title', req:true, min:5, max:120,
         ph:'Give the post a headline…'},
        {k:'excerpt',t:'area', label:'Excerpt', req:true, min:20, max:300, rows:2,
         ph:'One or two lines shown in the list.'},
        {k:'body',  t:'area',  label:'Post', req:true, min:100, max:20000, rows:12,
         ph:'Write your post…'},
        {k:'cover', t:'image', label:'Cover image',
         accept:'image/jpeg,image/png,image/webp,image/gif',
         hint:'Optional. JPG/PNG/WEBP/GIF up to 25MB.'},
        {k:'category',t:'cat', label:'Category', req:true},
        {k:'tags',  t:'tags',  label:'Tags', max:30},
        {k:'content_type',t:'sel', label:'Content type', req:true, options:CONTENT_TYPE, def:'Article'},
        {k:'related_artworks',t:'pick', label:'Related artwork', src:'artworks', cap:10,
         hint:'Link up to 10 of your own artworks.'},
        {k:'related_items',t:'pick', label:'Related marketplace items', src:'marketplace', cap:10,
         hint:'Link up to 10 of your own listings.'},
        {k:'external_refs',t:'list', url:1, cap:20, imin:5, imax:200, label:'External references / sources',
         hint:'Press Enter after each link. Up to 20.'},
        {k:'visibility',t:'sel', label:'Visibility', req:true, options:BLOG_VISIBILITY, def:'published'},
        {k:'featured',t:'chk', label:'Feature this post',
         hint:'Featured posts sit at the top of the Blog.'},
        {k:'__auto', t:'auto', label:'Filled in for you', items:BLOG_AUTO}
      ]},
    marketplace: { title:'List a Product', sub:'Sell digital goods, or offer commissions and services.',
      fields:[
        {k:'item_type',t:'sel', label:'Listing type', req:true, options:ITEM_TYPE},
        {k:'product_type',t:'sel', label:'Product type', req:true, options:PRODUCT_TYPE, def:'Artwork'},
        {k:'title',  t:'text',  label:'Title', req:true, min:3, max:100, ph:'Name your listing…'},
        {k:'summary',t:'text',  label:'Short summary', req:true, min:20, max:200,
         ph:'One line — what it is and who it is for.',
         hint:'Shown on the card and in search results.'},
        {k:'description',t:'area', label:'Description', req:true, min:100, max:5000, rows:8,
         ph:'What it is, how it was made, how it is meant to be used…'},
        {k:'category',t:'cat',  label:'Category', req:true},
        {k:'subcategory',t:'text', label:'Subcategory', min:2, max:50, ph:'e.g. Portrait brushes'},
        {k:'tags',   t:'tags',  label:'Tags', max:30},
        {k:'preview',t:'image', label:'Preview image', req:true,
         accept:'image/jpeg,image/png,image/webp,image/gif',
         hint:'Required. Shown on the card and auto-checked. JPG/PNG/WEBP up to 25MB.'},
        {k:'gallery',t:'images', label:'Additional preview images',
         accept:'image/jpeg,image/png,image/webp,image/gif',
         hint:'Optional. Up to 8 more shots, shown on the listing page. 25MB each.'},
        {k:'files',  t:'files', label:'Files to sell', cond:'digital',
         accept:'.zip,.rar,.7z,.psd,.abr,.brushset,.procreate,.clip,.ttf,.otf,.pdf,.obj,.fbx,.blend',
         mb:'asset',
         hint:'Required for a digital download — add every file the buyer receives, up to 200MB each '+
              'and 50 files in all. These are stored privately and stay locked until someone pays.'},
        {k:'buyer_gets',t:'area', label:'What buyer gets', req:true, min:20, max:3000, rows:4,
         ph:'Exactly what is included — one line per thing.'},
        {k:'file_format',t:'text', label:'File format', req:true, min:2, max:100,
         ph:'e.g. ZIP containing PSD + PNG'},
        {k:'file_count',t:'int', label:'File count', nmin:1, nmax:9999, ph:'e.g. 12'},
        {k:'file_size_mb',t:'money', label:'File size (MB)', nmin:0, nmax:100000, ph:'e.g. 240'},
        {k:'dimensions',t:'text', label:'Resolution / dimensions', min:2, max:50,
         ph:'e.g. 4K, or 3000×4000 px'},
        {k:'software',t:'text', label:'Software used', min:2, max:100, ph:'Photoshop, Blender, Figma…'},
        {k:'source_files_included',t:'chk', label:'Source files included',
         hint:'The editable original — PSD, AI, FIG, BLEND.'},
        {k:'license',t:'sel',   label:'License', req:true, options:LICENSE_MKT},
        {k:'commercial_use',t:'sel', label:'Commercial use allowed', req:true, options:YES_NO, def:'yes'},
        {k:'personal_use',t:'chk', label:'Personal use allowed'},
        {k:'modification_allowed',t:'chk', label:'Modification allowed'},
        {k:'attribution_required',t:'chk', label:'Attribution required'},
        {k:'price',  t:'money', label:'Price', req:true, nmin:0, nmax:99999999, ph:'0.00',
         hint:'Enter 0 to list it free.'},
        {k:'currency',t:'sel',  label:'Currency', req:true, options:DZ_CURRENCIES, pref:1},
        {k:'sale_price',t:'money', label:'Discount / sale price', nmin:0, nmax:99999999, ph:'0.00',
         hint:'Optional, and has to be below the price. Recorded on the listing — checkout does '+
              'not charge it yet, so the price above is still what a buyer pays.'},
        {k:'stock',  t:'int',   label:'Stock / quantity', nmin:0, nmax:999999,
         hint:'Leave empty for an unlimited digital download.'},
        {k:'delivery_type',t:'sel', label:'Delivery type', req:true, options:DELIVERY_TYPE},
        {k:'delivery_days',t:'int', label:'Delivery days', req:true, cond:'svc', nmin:0, nmax:365,
         ph:'e.g. 7'},
        {k:'delivery_notes',t:'area', label:'Delivery notes', min:20, max:1000, rows:2,
         ph:'Anything the buyer should know about timing.'},
        {k:'custom_requests',t:'chk', label:'Custom requests accepted'},
        {k:'revision_count',t:'int', label:'Revision count', nmin:0, nmax:99, ph:'e.g. 2'},
        {k:'support_period',t:'text', label:'Support period', min:2, max:50, ph:'e.g. 7 days'},
        {k:'refund_policy',t:'area', label:'Refund policy', min:20, max:500, rows:2,
         ph:'When you refund, and when you do not.'},
        {k:'preview_watermark',t:'chk', label:'Previews are watermarked'},
        {k:'safety_notes',t:'area', label:'Safety / content notes', min:20, max:500, rows:2,
         ph:'AI assistance, mature content, anything a buyer should know up front.'},
        {k:'seller_note',t:'area', label:'Creator / seller note', min:20, max:500, rows:2,
         ph:'Anything else you want buyers to read.'},
        {k:'apply_url',t:'text', label:'Application link', cond:'svc', reqOne:'apply',
         min:10, max:200, ph:'https://…',
         hint:'A commission or service needs a link or an email — either one will do.'},
        {k:'apply_email',t:'text', label:'Application email', cond:'svc', reqOne:'apply',
         min:5, max:254, ph:'you@studio.com',
         hint:'A commission or service needs a link or an email — either one will do.'},
        {k:'visibility',t:'sel', label:'Visibility', req:true, options:MKT_VISIBILITY, def:'published'},
        {k:'featured',t:'chk', label:'Feature / promote this listing',
         hint:'Featured listings sit at the top of the Marketplace.'},
        {k:'closing_date',t:'date', label:'Closing date',
         hint:'Optional. Use it for a limited run or a commission window.'},
        {k:'internal_notes',t:'area', label:'Internal notes', min:20, max:1000, rows:2,
         ph:'Anything the moderators should know.',
         hint:'Only moderators read this. It is never shown to buyers, and it is not readable '+
              'by the site — not even back to you.'},
        {k:'__auto', t:'auto', label:'Filled in for you', items:MKT_AUTO}
      ]},
    jobs: { title:'Post a Job', sub:'Hire an artist, or find someone to build with.',
      fields:[
        {k:'title',  t:'text', label:'Job title', req:true, min:3, max:80,
         ph:'e.g. Character Concept Artist'},
        {k:'company',t:'text', label:'Company / studio', req:true, min:2, max:80,
         ph:'Who is hiring?'},
        {k:'about_company',t:'area', label:'About the company', req:true, min:50, max:2000, rows:4,
         ph:'Who you are, what you make, how the team works…'},
        {k:'company_url',t:'text', label:'Company website', min:5, max:200, ph:'https://…'},
        {k:'category',t:'cat', label:'Category', req:true},
        {k:'employment_type',t:'sel', label:'Employment type', req:true, options:EMP},
        {k:'experience_level',t:'sel', label:'Experience level', req:true, options:EXP_LEVEL, def:'Mid'},
        {k:'years_experience',t:'int', label:'Years of experience', req:true, nmin:0, nmax:60,
         ph:'e.g. 3', hint:'Whole years. 0 means none required.'},
        {k:'openings',t:'int', label:'Number of openings', req:true, nmin:1, nmax:999, ph:'e.g. 1'},
        {k:'description',t:'area', label:'Job overview / description', req:true, min:100, max:5000, rows:8,
         ph:'What the role is, what the team is building, what a week looks like…'},
        {k:'responsibilities',t:'area', label:'Responsibilities', req:true, min:50, max:3000, rows:5,
         ph:'What this person will own — one per line.'},
        {k:'requirements',t:'area', label:'Requirements', req:true, min:50, max:3000, rows:5,
         ph:'What they must bring — one per line.'},
        {k:'required_skills',t:'area', label:'Required skills', req:true, min:10, max:1000, rows:3,
         ph:'e.g. Photoshop, ZBrush, character anatomy'},
        {k:'nice_to_have_skills',t:'area', label:'Nice-to-have skills', min:10, max:1000, rows:3,
         ph:'e.g. Unreal, rigging, motion'},
        {k:'benefits',t:'area', label:'Benefits / perks', min:20, max:2000, rows:3,
         ph:'Health cover, kit budget, paid leave, learning stipend…'},
        {k:'work_mode',t:'sel', label:'Remote / on-site / hybrid', req:true, options:WORK_MODE, def:'remote'},
        {k:'location_city',t:'text', label:'City', req:true, cond:'place', min:2, max:100,
         ph:'e.g. Berlin'},
        {k:'location_country',t:'text', label:'Country code', req:true, cond:'place', min:2, max:2, up:1,
         ph:'e.g. DE', hint:'Two letters, ISO 3166.'},
        {k:'applicant_countries',t:'text', label:'Remote eligible countries', req:true, cond:'remote',
         min:2, max:500, up:1, ph:'e.g. IN, DE, US', hint:'Comma separated country codes.'},
        {k:'timezone',t:'text', label:'Timezone', req:true, min:3, max:50, ph:'e.g. CET (UTC+1)'},
        {k:'working_hours',t:'text', label:'Working hours', req:true, min:3, max:100,
         ph:'e.g. 10:00–18:00, 4h overlap with CET'},
        {k:'schedule',t:'text', label:'Schedule', min:3, max:100, ph:'e.g. Mon–Fri, flexible Fridays'},
        {k:'start_date',t:'date', label:'Start date', req:true, hint:'When the role begins.'},
        {k:'contract_duration',t:'text', label:'Contract duration', req:true, cond:'term', min:2, max:100,
         ph:'e.g. 6 months'},
        {k:'salary_min',t:'money', label:'Pay from', req:true, nmin:0, nmax:99999999, ph:'0'},
        {k:'salary_max',t:'money', label:'Pay to', req:true, nmin:0, nmax:99999999, ph:'0'},
        {k:'salary_currency',t:'sel', label:'Currency', req:true, options:DZ_CURRENCIES, pref:1},
        {k:'salary_unit',t:'sel', label:'Pay period', req:true, options:PAY_PERIOD, def:'MONTH'},
        {k:'apply_url',t:'text', label:'Apply link', reqOne:'apply', min:10, max:200,
         ph:'https://…',
         hint:'A link or an email is required — either one will do, and a posting may carry both.'},
        {k:'apply_email',t:'text', label:'Apply email', reqOne:'apply', min:5, max:254,
         ph:'jobs@studio.com',
         hint:'A link or an email is required — either one will do, and a posting may carry both.'},
        {k:'application_instructions',t:'area', label:'Application instructions', req:true,
         min:20, max:1500, rows:3, ph:'How to apply, what to put in the subject line, what happens next…'},
        {k:'application_materials',t:'area', label:'Required application materials', req:true,
         min:10, max:1000, rows:2, ph:'e.g. Portfolio link, CV, two reference shots'},
        {k:'application_questions',t:'area', label:'Application questions', min:5, max:1000, rows:2,
         ph:'Anything you want every applicant to answer — one per line.'},
        {k:'portfolio_required',t:'chk', label:'Portfolio required'},
        {k:'resume_required',t:'chk', label:'Resume / CV required'},
        {k:'cover_letter_required',t:'chk', label:'Cover letter required'},
        {k:'valid_through',t:'date', label:'Closing date', req:true,
         hint:'Expired postings are hidden automatically.'},
        {k:'tags',  t:'tags', label:'Tags', max:30},
        {k:'visibility',t:'sel', label:'Visibility', req:true, options:VISIBILITY, def:'public'},
        {k:'featured',t:'chk', label:'Feature / promote this posting',
         hint:'Featured postings sit at the top of the jobs list.'}
      ]}
  };

  var S = {};
  function st(sec){
    var s = (S[sec] = S[sec] || {tags:[], files:{}, urls:{}});
    if(!s.urls) s.urls = {};
    return s;
  }

  var TAB_LABEL = {artwork:'Artworks', resources:'Resources', blog:'Blog', marketplace:'Market', jobs:'Jobs'};
  var NAV_TITLE = {artwork:'UPLOAD ARTWORK', marketplace:'LIST A PRODUCT',
                   blog:'WRITE A BLOG POST', resources:'SHARE A RESOURCE',
                   jobs:'POST A JOB'};
  var upSec = 'artwork';

  // ---- Editing a published resource, post or listing -------------------------
  // The same form the section was uploaded with, minus everything that cannot move
  // once it is live: the stored files and images, and the automatic SEO panel.
  var dzEdit = null;
  function dzEditing(sec){ return (dzEdit && dzEdit.sec === sec) ? dzEdit : null; }

  var DZ_EDIT_LOCK = {
    resources:   { file:1, preview:1 },
    blog:        { body:1, cover:1 },
    marketplace: { item_type:1, preview:1, gallery:1, files:1 }
  };
    // internal_notes is write-only -- authenticated may UPDATE it but never SELECT it,
    // so an edit form has nothing to put in the box and saving it would wipe the note
  var DZ_EDIT_DROP = { marketplace: { internal_notes:1 } };

  var DZ_EDIT_HEAD = {
    resources:   ['Edit Resource', 'Update the details for this resource.', 'EDIT RESOURCE'],
    blog:        ['Edit Post',     'Update the details for this post.',     'EDIT POST'],
    marketplace: ['Edit Listing',  'Update the details for this listing.',  'EDIT LISTING']
  };
  var DZ_EDIT_DONE = { resources:'Resource updated', blog:'Post updated', marketplace:'Listing updated' };

  var DZ_LOCK_NOTE = {
    file:     'The resource file stays as it was uploaded.',
    preview:  'The preview image stays as it was uploaded.',
    cover:    'The cover image stays as it was uploaded.',
    body:     'The post itself stays as it was published.',
    gallery:  'The extra preview images stay as they were uploaded.',
    files:    'The files buyers receive stay as they were uploaded.',
    item_type:'The listing type stays as published, because its files cannot be changed.'
  };

  function upGuideBtnShow(on){
    var b = document.getElementById('upGuideBtn');
    if(b) b.style.display = on ? '' : 'none';
  }
    // Editing sheds the two things that only belong to an upload: the guidelines
    // button in the header, and the automatic panel that reads the file and the SEO
    // fields off it. The artwork extras are built once and cached in their slots, so
    // that panel is hidden rather than rebuilt.
  function dzUpEditChrome(on){
    upGuideBtnShow(!on);
    var el = document.querySelector('#pfUpMod .upPopBody [data-fk="__auto"]');
    if(el) el.style.display = on ? 'none' : '';
  }

  function dzLockThumb(url, alt){
    if(!url) return '';
    return '<span class="dzLockThumb"><img src="'+esc(getThumbnailUrl(url))+'" alt="'+esc(alt||'')+'" loading="lazy"></span>';
  }
  function dzLockValue(sec, fd, row){
    row = row || {};
    if(fd.k === 'preview'){
      return { html: dzLockThumb(row.preview_url, 'Preview') || '<span class="dzLockTx">Preview image</span>',
               value: row.preview_url || '' };
    }
    if(fd.k === 'cover'){
      return { html: dzLockThumb(row.cover_url, 'Cover') || '<span class="dzLockTx">No cover image</span>',
               value: row.cover_url || '' };
    }
    if(fd.k === 'file'){
      var nm = row.file_name || 'Resource file';
      var sz = row.file_size ? ' · ' + bytes(row.file_size) : '';
      return { html:'<span class="dzLockTx">'+esc(nm + sz)+'</span>', value: nm };
    }
    if(fd.k === 'gallery'){
      var gal = Array.isArray(row.gallery) ? row.gallery : [];
      var pics = gal.slice(0, 8).map(function(g){ return dzLockThumb(g && g.url, ''); }).join('');
      return { html: pics || '<span class="dzLockTx">No extra preview images</span>',
               value: String(gal.length) };
    }
    if(fd.k === 'files'){
      var c = Number(row.file_count) || 0;
      var t = c ? (c + (c === 1 ? ' file' : ' files')) : (row.file_name || 'No files');
      return { html:'<span class="dzLockTx">'+esc(t)+'</span>', value: row.file_name || '' };
    }
    if(fd.k === 'body'){
      return { html:'<div class="dzLockBody">'+esc(row.body || '')+'</div>', value: row.body || '' };
    }
    if(fd.t === 'sel'){
      var lab = '', o = fd.options || [];
      for(var i=0;i<o.length;i++){ if(String(o[i][0]) === String(row[fd.k])){ lab = o[i][1]; break; } }
      return { html:'<span class="dzLockTx">'+esc(lab || row[fd.k] || '—')+'</span>', value: row[fd.k] || '' };
    }
    return { html:'<span class="dzLockTx">'+esc(row[fd.k] || '—')+'</span>', value: row[fd.k] || '' };
  }
    // The hidden input keeps the field readable to val(), so the conditional fields
    // and the length checks still see what the row actually holds
  function dzLockedField(sec, fd, row){
    var v = dzLockValue(sec, fd, row);
    return fcard(fd.k, fd.t,
      '<span class="upLbl">'+esc(fd.label)+' <span class="upOpt">locked</span></span>'+
      '<div class="dzLocked">'+v.html+'</div>'+
      '<div class="dzHint">'+esc(DZ_LOCK_NOTE[fd.k] || 'This cannot be changed after publishing.')+'</div>'+
      '<input type="hidden" id="dz_'+sec+'_'+fd.k+'" value="'+esc(v.value == null ? '' : String(v.value))+'">',
      ' dzFLock');
  }

  function dzYesNo(v){ return v ? 'yes' : 'no'; }
  function dzCat1(v){ return (Array.isArray(v) ? v[0] : v) || ''; }
  function dzLines(v){ return (Array.isArray(v) ? v : []).join('\n'); }
  function dzCommas(v){ return (Array.isArray(v) ? v : []).join(','); }
  function dzFromCents(c){ return (c == null) ? '' : String((Number(c) || 0) / 100); }

  var DZ_EDIT_VALS = {
    resources: function(r){
      return {
        title:r.title||'', summary:r.summary||'', description:r.description||'',
        resource_type:r.resource_type||'', category:dzCat1(r.category), subcategory:r.subcategory||'',
        license:r.license||'', commercial_use:dzYesNo(r.commercial_use),
        attribution_required:dzYesNo(r.attribution_required),
        modification_allowed:dzYesNo(r.modification_allowed),
        software:r.software||'', compatible_software:dzLines(r.compatible_software),
        compatible_versions:r.compatible_versions||'', whats_included:r.whats_included||'',
        instructions:r.instructions||'', version:r.version||'',
        external_links:dzLines(r.external_links), safety_notes:r.safety_notes||'',
        visibility:r.visibility||'published', featured:!!r.featured
      };
    },
    blog: function(r){
      return {
        title:r.title||'', excerpt:r.excerpt||'', category:dzCat1(r.category),
        content_type:r.content_type||'Article',
        related_artworks:dzCommas(r.related_artworks), related_items:dzCommas(r.related_items),
        external_refs:dzLines(r.external_refs),
        visibility:r.visibility||'published', featured:!!r.featured
      };
    },
    marketplace: function(r){
      return {
        item_type:r.item_type||'digital', product_type:r.product_type||'',
        title:r.title||'', summary:r.summary||'', description:r.description||'',
        category:dzCat1(r.category), subcategory:r.subcategory||'',
        buyer_gets:r.buyer_gets||'', file_format:r.file_format||'',
        file_count:r.file_count == null ? '' : String(r.file_count),
        file_size_mb:r.file_size_mb == null ? '' : String(r.file_size_mb),
        dimensions:r.dimensions||'', software:r.software||'',
        source_files_included:!!r.source_files_included,
        license:r.license||'standard', commercial_use:dzYesNo(r.commercial_use),
        personal_use:!!r.personal_use, modification_allowed:!!r.modification_allowed,
        attribution_required:!!r.attribution_required,
        price:dzFromCents(r.price_cents), currency:r.currency||dzPrefCurrency(),
        sale_price:dzFromCents(r.sale_price_cents),
        stock:r.stock == null ? '' : String(r.stock),
        delivery_type:r.delivery_type||'instant',
        delivery_days:r.delivery_days == null ? '' : String(r.delivery_days),
        delivery_notes:r.delivery_notes||'', custom_requests:!!r.custom_requests,
        revision_count:r.revision_count == null ? '' : String(r.revision_count),
        support_period:r.support_period||'', refund_policy:r.refund_policy||'',
        preview_watermark:!!r.preview_watermark, safety_notes:r.safety_notes||'',
        seller_note:r.seller_note||'', apply_url:r.apply_url||'', apply_email:r.apply_email||'',
        visibility:r.visibility||'published', featured:!!r.featured,
        closing_date:String(r.closing_date||'').slice(0,10)
      };
    }
  };

  function dzEditReset(sec){
    var old = S[sec];
    if(old && old.urls) Object.keys(old.urls).forEach(function(k){ dzRevoke(old.urls[k]); });
    S[sec] = {tags:[], files:{}, urls:{}};
    dzAutoReset(sec);
  }

  function dzEditFill(sec, row){
    var make = DZ_EDIT_VALS[sec];
    if(!make) return;
    var vals = make(row || {});
    st(sec).tags = ((row && row.tags) || []).slice();
    (FORMS[sec] ? FORMS[sec].fields : []).forEach(function(fd){
      if(fd.t === 'tags' || fd.t === 'auto') return;
      if(!(fd.k in vals)) return;
      var el = document.getElementById('dz_'+sec+'_'+fd.k);
      if(!el) return;
      if(el.type === 'checkbox') el.checked = !!vals[fd.k];
      else el.value = vals[fd.k] == null ? '' : String(vals[fd.k]);
    });
    dzSelSyncAll(sec);
    renderTags(sec);
    dzCountAll(sec);
    upGrowAll();
  }

  function dzOpenEdit(sec, row){
    if(!FORMS[sec] || !SEC[sec] || !row) return false;
    if(!DZ_EDIT_VALS[sec]) return false;
    dzEditReset(sec);
    dzEdit = { sec:sec, id:row.id, row:row };
    var idEl = document.getElementById('pfUpEditId');
    if(idEl) idEl.value = String(row.id);
    dzUpEditChrome(true);
    upSwitchSection(sec, true);
    var head = DZ_EDIT_HEAD[sec];
    var h = document.getElementById('pfUpTitle');       if(h)   h.textContent = head[0];
    var p = document.getElementById('pfUpSubtitle');    if(p)   p.textContent = head[1];
    var nav = document.getElementById('pfUpNavTitle');  if(nav) nav.textContent = head[2];
    dzEditFill(sec, row);
    var mod = document.getElementById('pfUpMod');
    if(mod) mod.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return true;
  }

  function dzEditClose(){
    dzUpEditChrome(false);
    if(!dzEdit) return;
    var sec = dzEdit.sec;
    dzEdit = null;
    var idEl = document.getElementById('pfUpEditId');
    if(idEl) idEl.value = '';
    dzEditReset(sec);
    var box = document.getElementById('upSecForms');
    if(box) box.innerHTML = '';
  }

  function dzEditCancel(){
    if(typeof closePfUpload === 'function'){ closePfUpload(); return; }
    dzEditClose();
  }

  function dzEditPatch(sec, orig){
    var row = {}, s = st(sec);
    if(sec === 'resources'){
      dzCopy(sec, row,
        'title summary description whats_included resource_type:? category:[] ' +
        'subcategory:? license:?personal commercial_use:y attribution_required:y ' +
        'modification_allowed:Y software:? compatible_versions:? instructions:? ' +
        'version:? safety_notes:? featured:b');
      row.tags = s.tags;
      row.compatible_software = dzRefList('dz_resources_compatible_software').slice(0, 10);
      row.external_links = dzRefList('dz_resources_external_links').slice(0, 5);
      row.visibility = val(sec,'visibility') || 'published';
      row.seo_title = dzSeoTitle(val(sec,'title'));
      row.seo_description = dzSeoDesc(val(sec,'summary'), val(sec,'description'));
      return row;
    }
    if(sec === 'blog'){
      dzCopy(sec, row, 'category:[] content_type:?Article featured:b');
      row.title = val(sec,'title');
      row.excerpt = val(sec,'excerpt');
      row.tags = s.tags;
      row.related_artworks = dzUuids(val(sec,'related_artworks'));
      row.related_items = dzUuids(val(sec,'related_items'));
      row.external_refs = dzRefList('dz_blog_external_refs').slice(0, 20);
      row.visibility = val(sec,'visibility') || 'published';
      row.seo_title = dzSeoTitle(row.title);
      row.seo_description = dzSeoDesc(row.excerpt, (orig && orig.body) || '');
      return row;
    }

    var type = val(sec,'item_type') || (orig && orig.item_type) || 'digital';
    var isSvc = !!ITEM_SERVICE[type];

    var mkPrice = parseFloat(val(sec,'price'));
    if(!isFinite(mkPrice)) throw new Error('Add a price — enter 0 to list it free');
    var mkCents = Math.round(mkPrice * 100);

    var saleRaw = val(sec,'sale_price'), saleCents = null;
    if(saleRaw !== ''){
      var saleNum = parseFloat(saleRaw);
      if(!isFinite(saleNum)) throw new Error('That sale price is not a number');
      saleCents = Math.round(saleNum * 100);
      if(saleCents >= mkCents) throw new Error('The sale price has to be below the price');
    }

    var mkUrl = dzWebUrl(val(sec,'apply_url')), mkMail = val(sec,'apply_email');
    if(isSvc){
      if(!mkUrl && !mkMail) throw new Error('A commission or service needs an application link or email');
      if(mkMail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mkMail)) throw new Error('That application email does not look right');
      if(mkUrl && (mkUrl.length < 10 || mkUrl.length > 200)) throw new Error('The application link has to be 10–200 characters');
    }

    dzCopy(sec, row,
      'title description summary buyer_gets file_format category:[] subcategory:? ' +
      'product_type:? file_count:# file_size_mb:. dimensions:? software:? ' +
      'source_files_included:b license:?standard commercial_use:Y personal_use:b ' +
      'modification_allowed:b attribution_required:b stock:# delivery_type:?instant ' +
      'delivery_notes:? custom_requests:b revision_count:# support_period:? ' +
      'refund_policy:? preview_watermark:b safety_notes:? seller_note:? ' +
      'visibility:?published featured:b closing_date:?');
    row.tags = s.tags;
    row.price_cents = mkCents;
    row.sale_price_cents = saleCents;
    row.currency = val(sec,'currency') || dzPrefCurrency();
    row.delivery_days = isSvc ? dzInt(val(sec,'delivery_days')) : null;
    row.apply_url  = isSvc ? (mkUrl  || null) : null;
    row.apply_email = isSvc ? (mkMail || null) : null;
    row.seo_title = dzSeoTitle(val(sec,'title'));
    row.seo_description = dzSeoDesc(val(sec,'summary'), val(sec,'description'));
    return row;
  }

  async function dzSaveEdit(sec){
    var ed = dzEditing(sec);
    if(!ed) return;
    if(!sb){ showToast('Backend not configured'); return; }
    if(!window.currentUser){
      if(typeof pfGuestGate === 'function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return;
    }
    var lock = DZ_EDIT_LOCK[sec] || {};
    var miss = FORMS[sec].fields.filter(function(fd){
      if(!fd.req || fd.t === 'auto' || dzIsFileType(fd.t) || lock[fd.k]) return false;
      if(!dzCondShow(sec, fd)) return false;
      var v = val(sec, fd.k);
      if((fd.t === 'int' || fd.t === 'money') && v === '0') return false;
      return !v;
    });
    if(miss.length){ dzFieldFail(sec, miss[0].k, 'Missing: ' + miss[0].label); return; }

    var bad = dzLimits(sec);
    if(bad){ dzFieldFail(sec, bad.k, bad.msg); return; }

    var btn = document.getElementById('dzSubmit-'+sec);
    if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
    try{
      var patch = dzEditPatch(sec, ed.row);
      var res = await sb.from(SEC[sec].table).update(patch)
                  .eq('id', ed.id).eq('user_id', currentUser.id);
      if(res && res.error) throw res.error;
      Object.keys(patch).forEach(function(k){ ed.row[k] = patch[k]; });
      dzLoaded[sec] = false;
      var c = dzc();
      if(c){ try{ await c.invalidateSection(sec, ed.id); }catch(e){} }
      if(typeof window.mwSecChanged === 'function') window.mwSecChanged(sec);
      showToast(DZ_EDIT_DONE[sec] || 'Saved');
      dzEditCancel();
    }catch(err){
      showToast((err && err.message) ? err.message : 'Could not save your changes');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '📤 Save Changes'; }
    }
  }

  var DZ_ZONE_SVG = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'+
    '<path d="m7 9 5-5 5 5"/><path d="M12 4v12"/>';
  function zoneIco(){
    return '<span class="upDzBadge" aria-hidden="true">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" '+
      'stroke-linejoin="round">'+DZ_ZONE_SVG+'</svg></span>';
  }

  var SEC_COLOR = {
    artwork:'var(--upcViolet)', resources:'var(--upcGreen)', blog:'var(--upcIndigo)',
    marketplace:'var(--upcOrange)', jobs:'var(--upcSky)'
  };

  function upMountForm(sec){
    var box = document.getElementById('upSecForms');
    if(!box) return;
    box.innerHTML = buildForm(sec);
    renderTags(sec);
    dzPaintFiles(sec);
    dzCountAll(sec);
    upGrowAll();
    dzSchReset();
    dzDraftStrip(sec);
    dzSchedStrip(sec);
  }

  function upSwitchSection(sec, silent){
    upSec = sec;
    upGuideRender();
    var nav = document.getElementById('pfUpNavTitle');
    if(nav) nav.textContent = NAV_TITLE[sec] || 'UPLOAD';
    var art = document.querySelector('#uploadPage .upPopBody') || document.querySelector('.upPopBody');
    var box = document.getElementById('upSecForms');
    var h   = document.getElementById('pfUpTitle');
    var p   = document.getElementById('pfUpSubtitle');
    if(sec === 'artwork'){
      if(art) art.style.display = '';
      if(box){ box.style.display = 'none'; }
      dzArtExtras();
      if(!silent){
        if(h) h.textContent = 'Upload Artwork';
        if(p) p.textContent = 'Share your creativity with artists around the world.';
      }
      return;
    }
    if(art) art.style.display = 'none';
    if(box) box.style.display = '';
    if(h) h.textContent = FORMS[sec].title;
    if(p) p.textContent = FORMS[sec].sub;

    if(sec === 'jobs'){ dzJobGateMount(); return; }
    upMountForm(sec);
  }

  var dzJobQ = null, dzJobQAt = 0, dzJobQFly = null;
  var DZ_JOB_Q_TTL = 60000;

  function dzJobQuota(force){
    if(!sb || !window.currentUser){
      return Promise.resolve({allowed:false, reason:'auth', limit:0, used:0, remaining:0});
    }
    if(!force && dzJobQ && (Date.now() - dzJobQAt) < DZ_JOB_Q_TTL){
      return Promise.resolve(dzJobQ);
    }
    if(!force && dzJobQFly) return dzJobQFly;
    dzJobQFly = sb.rpc('dz_job_quota').then(function(res){
      dzJobQFly = null;
      if(res.error) throw res.error;
      dzJobQ = res.data || {allowed:false, reason:'plan', limit:0, used:0, remaining:0};
      dzJobQAt = Date.now();
      return dzJobQ;
    }, function(err){
      dzJobQFly = null;
      throw err;
    });
    return dzJobQFly;
  }
  function dzJobQuotaForget(){ dzJobQ = null; dzJobQAt = 0; }

  var DZ_JOB_PLANS = [
    {id:'premium', name:'Premium', tone:'var(--upcIndigo)', n:1,
     line:'1 job posting a month', cta:'Join Premium'},
    {id:'max', name:'Max', tone:'var(--upcOrange)', n:2,
     line:'2 job postings a month', cta:'Get Max'}
  ];

  function dzJobPlanCards(){
    return '<div class="upGatePlans">'+
      DZ_JOB_PLANS.map(function(pl){
        return '<div class="upGatePlan" style="--gpC:'+pl.tone+'">'+
          '<div class="upGatePlanName">'+esc(pl.name)+'</div>'+
          '<div class="upGatePlanNum">'+pl.n+'</div>'+
          '<div class="upGatePlanLine">'+esc(pl.line)+'</div>'+
          '<button type="button" class="upBtnPri upGatePlanBtn" '+
            'onclick="dzJobGateSubscribe()">'+esc(pl.cta)+'</button>'+
        '</div>';
      }).join('')+
    '</div>';
  }

  function dzJobGateShell(kicker, title, body, inner){
    return '<div class="upGate">'+
      '<div class="upGateIco" aria-hidden="true">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '+
        'stroke-linecap="round" stroke-linejoin="round">'+
        '<rect x="2" y="7" width="20" height="14" rx="2"/>'+
        '<path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>'+
      '</div>'+
      '<div class="upGateKicker">'+esc(kicker)+'</div>'+
      '<h3 class="upGateTitle">'+esc(title)+'</h3>'+
      '<p class="upGateBody">'+esc(body)+'</p>'+
      (inner || '')+
    '</div>';
  }

  function dzJobFmtDate(iso){
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    try{
      return d.toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});
    }catch(e){ return d.toISOString().slice(0,10); }
  }

  function dzJobGateHtml(q){
    if(!q || q.reason === 'auth'){
      return dzJobGateShell(
        'POST A JOB',
        'Sign in to hire an artist',
        'Job postings are tied to an account and a plan. Sign in, then pick '+
        'Premium or Max to post your first role.',
        '<div class="upGateActs">'+
          '<button type="button" class="upBtnPri" onclick="dzJobGateSignIn()">Sign in</button>'+
        '</div>');
    }

    if(q.reason === 'limit'){
      var isMax   = String(q.tier || '') === 'max';
      var resets  = dzJobFmtDate(q.period_end);
      var used    = Number(q.used) || 0;
      var lim     = Number(q.limit) || 0;
      var inner   = '<div class="upGateMeter"><span>'+used+' of '+lim+' used</span>'+
                    (resets ? '<span>Resets '+esc(resets)+'</span>' : '')+'</div>';
      if(!isMax){
        inner += '<div class="upGatePlans upGatePlans--one">'+
          '<div class="upGatePlan" style="--gpC:var(--upcOrange)">'+
            '<div class="upGatePlanName">Max</div>'+
            '<div class="upGatePlanNum">2</div>'+
            '<div class="upGatePlanLine">2 job postings a month</div>'+
            '<button type="button" class="upBtnPri upGatePlanBtn" '+
              'onclick="dzJobGateSubscribe()">Upgrade to Max</button>'+
          '</div></div>';
      }
      return dzJobGateShell(
        'POST A JOB',
        isMax ? 'Both Max postings are live this month'
              : 'Your Premium posting is live this month',
        isMax
          ? ('Max carries 2 postings a plan month. Yours are both up' +
             (resets ? ' — the next two unlock on ' + resets + '.' : '.'))
          : ('Premium carries 1 posting a plan month' +
             (resets ? ', and yours renews on ' + resets + '.' : '.') +
             ' Max posts two.'),
        inner);
    }

    return dzJobGateShell(
      'POST A JOB',
      'Hiring is for Premium and Max',
      'Anyone can read a posting and apply to it. Putting one up is part of a '+
      'subscription — Premium posts one role a month, Max posts two.',
      dzJobPlanCards());
  }

  function dzJobQuotaStrip(q){
    if(!q || q.staff || q.limit == null) return '';
    var left = Number(q.remaining) || 0;
    var lim  = Number(q.limit) || 0;
    var when = dzJobFmtDate(q.period_end);
    return '<div class="upQuotaBar">'+
      '<span class="upQuotaDot" aria-hidden="true"></span>'+
      '<span class="upQuotaTx"><b>'+left+' of '+lim+'</b> job '+
      (lim === 1 ? 'posting' : 'postings')+' left on '+
      esc(String(q.tier || '').replace(/^./, function(c){ return c.toUpperCase(); }))+
      ' this month</span>'+
      (when ? '<span class="upQuotaWhen">Resets '+esc(when)+'</span>' : '')+
    '</div>';
  }

  function dzJobGateMount(){
    var box = document.getElementById('upSecForms');
    if(!box) return;
    box.innerHTML = '<div class="upGate upGate--wait"><div class="upGateKicker">POST A JOB</div>'+
                    '<p class="upGateBody">Checking your plan\u2026</p></div>';
    dzJobQuota().then(dzJobGateApply, function(){
      if(upSec === 'jobs') upMountForm('jobs');
    });
  }

  function dzJobGateApply(q){
    if(upSec !== 'jobs') return;
    var box = document.getElementById('upSecForms');
    if(!box) return;
    if(!q || !q.allowed){ box.innerHTML = dzJobGateHtml(q); return; }
    upMountForm('jobs');
    var strip = dzJobQuotaStrip(q);
    if(!strip) return;
    var main = box.querySelector('.upMain');
    if(main) main.insertAdjacentHTML('afterbegin', strip);
  }

  function dzJobGateSubscribe(){
    if(typeof closePfUpload === 'function') closePfUpload();
    if(typeof openSubscription === 'function') openSubscription();
  }
  function dzJobGateSignIn(){
    if(typeof pfGuestGate === 'function'){
      pfGuestGate({preventDefault:function(){}, stopPropagation:function(){}});
    }
  }

  var GUIDE = {
    artwork: {
      guide: [
        ['🖼','Original work only','Make sure you own the rights to what you post.'],
        ['✦','High quality recommended','Best results come from high resolution files.'],
        ['🛡','Appropriate content','No offensive, hateful or explicit content.'],
        ['❤','Give proper credit','Credit references if you were inspired by others.']
      ],
      tips: ['Use a clear and attractive thumbnail','Add a relevant title and description','Choose the right category','Use relevant tags']
    },
    resources: {
      guide: [
        ['📦','Package it cleanly','ZIP related files together and name folders clearly.'],
        ['🖼','Show a real preview','The preview must depict the actual asset — no AI art.'],
        ['📋','List what is inside','What’s included is required — say every file the download holds.'],
        ['🔖','Answer the licence questions','Commercial use, attribution and modification are all required.'],
        ['🛡','Yours to share','Only upload files you made or are licensed to distribute.']
      ],
      tips: ['Use a descriptive, searchable title','Write the summary for someone skimming a grid',
             'Show the asset in use in the preview','Name the software and versions it opens in',
             'Add installation steps if it is not a double-click',
             'The format, size, file count and resolution are read from your upload']
    },
    blog: {
      guide: [
        ['✍️','Write for artists','Studio notes, tutorials and stories land best.'],
        ['🖼','Add a cover','A strong cover image lifts clicks in the feed.'],
        ['📏','Give it length','Posts need at least 100 characters — aim for a real read.'],
        ['🔗','Show your sources','Link the references a claim rests on, and the work it is about.'],
        ['🛡','Keep it appropriate','No hateful, explicit or plagiarised content.']
      ],
      tips: ['Open with a hook in the first line','Break long posts into short paragraphs',
             'Write the excerpt for someone skimming a list','Pick one clear category',
             'Link your own artwork so readers can see what you mean',
             'The search snippet, slug, reading time and byline are filled in for you']
    },
    marketplace: {
      guide: [
        ['💾','Digital needs a file','A digital download must include the product file — up to 50 of them.'],
        ['🖼','Preview sells','Show exactly what the buyer receives, and add up to 8 more shots.'],
        ['📦','Say what is in the box','What the buyer gets, the file format and the license are all required.'],
        ['💲','Price fairly','Enter 0 to list free; be clear on delivery time.'],
        ['🛡','Deliver what you list','Misleading listings are removed.']
      ],
      tips: ['Lead with your strongest preview','Write the one-line summary for someone skimming a grid',
             'Spell out every file included and its format','State delivery days for commissions',
             'Answer the license questions — buyers filter on them',
             'The search snippet and the listing address are filled in for you']
    },
    jobs: {
      guide: [
        ['🎟','A plan to post','Hiring is a Premium or Max feature — Premium posts one role a plan month, Max posts two.'],
        ['🧭','Be specific','A real title, scope and skill list draws better applicants.'],
        ['📍','Location or remote','On-site and hybrid roles need a city and country code; a remote one needs the countries you can hire from.'],
        ['💰','Say what it pays','A pay range, a currency and a period are all required — postings without them get ignored.'],
        ['🔗','A way to apply','Include an apply link or email — it is required.'],
        ['🛡','Genuine roles only','No spam, MLM or pay-to-apply postings.']
      ],
      tips: ['Put must-have skills up top','Split responsibilities and requirements — one per line reads best',
             'Name the timezone and the hours you expect overlap in','Describe the team and workflow',
             'Set a closing date so it expires cleanly']
    }
  };

  function upGuideRender(){
    var body = document.getElementById('upGuideBody');
    if(!body) return;
    var g = GUIDE[upSec] || {guide:[], tips:[]};
    var kick = document.getElementById('upGuideKicker');
    if(kick) kick.textContent = (TAB_LABEL[upSec] || 'Upload').toUpperCase();
    var mod = document.getElementById('upGuideMod');
    if(mod) mod.style.setProperty('--upGdC', SEC_COLOR[upSec] || C_VIO);
    var out = '';
    if(g.guide.length){
      out += '<div class="upGdSec"><h3>What we ask</h3><ul class="upGuideList">'+
        g.guide.map(function(x){
          return '<li><span class="upGIco">'+x[0]+'</span><div><strong>'+esc(x[1])+'</strong>'+esc(x[2])+'</div></li>';
        }).join('')+'</ul></div>';
    }
    if(g.tips.length){
      out += '<div class="upGdSec"><h3>Tips for better visibility</h3><ul class="upTipList">'+
        g.tips.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul></div>';
    }
    body.innerHTML = out || '<p class="dzHint">Nothing to add for this section yet.</p>';
  }
  function upGuideOpen(){
    var m = document.getElementById('upGuideMod');
    if(!m) return;
    upGuideRender();
    m.classList.add('open');
  }
  function upGuideClose(){
    var m = document.getElementById('upGuideMod');
    if(m) m.classList.remove('open');
  }
  function upGuideBackdrop(e){ if(e && e.target && e.target.id === 'upGuideMod') upGuideClose(); }

  function dzGhostCard(){ return window.dzGhost('✦'); }
  function dzSchedGhostCard(){ return window.dzGhost('⏱', '--'); }
  function dzGhost4(){ return dzGhostCard().repeat(4); }
  function dzSchedGhost4(){ return dzSchedGhostCard().repeat(4); }

  function dzSchedField(){
    return ''+
    '<div class="upField upFCard" id="dzSchedField" style="--fc:var(--upcTeal)">'+
      '<span class="upFIco" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
        'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+
        '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4"/>'+
        '<path d="M8 2.5v4"/><path d="M3 10h18"/><path d="M12 13.5v3l2 1"/></svg></span>'+
      '<div class="upFBody">'+
      '<span class="upLbl" id="dzSchedFieldLbl">Schedule <span class="upOpt">optional</span></span>'+
      '<div class="upCatDd" id="dzSchedDd">'+
        '<button type="button" class="upCatTrigger" id="dzSchedTrigger" onclick="dzSchToggle(event)" '+
          'aria-haspopup="dialog" aria-labelledby="dzSchedFieldLbl dzSchedLbl">'+
          '<span id="dzSchedLbl" class="upSchedPh">__/__/____&nbsp;&nbsp;__:__</span><span class="upChev">⌄</span>'+
        '</button>'+
        '<input type="hidden" id="dzSchedVal" value=""/>'+
        '<div class="upCatPanel upSchedPanel" id="dzSchedPanel">'+
          '<div class="upSchedNav">'+
            '<button type="button" class="upSchedNavBtn" onclick="dzSchNav(-1,event)" aria-label="Previous month">‹</button>'+
            '<span id="dzSchedMon">—</span>'+
            '<button type="button" class="upSchedNavBtn" onclick="dzSchNav(1,event)" aria-label="Next month">›</button>'+
          '</div>'+
          '<div class="upSchedDows"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>'+
          '<div class="upSchedGrid" id="dzSchedGrid"></div>'+
          '<div class="upSchedTime"><span class="upSchedTimeLbl">Time</span>'+
            '<select class="upSchedSel" id="dzSchedH" onchange="dzSchApply()" aria-label="Hour"></select>'+
            '<span class="upSchedColon">:</span>'+
            '<select class="upSchedSel" id="dzSchedM" onchange="dzSchApply()" aria-label="Minute"></select>'+
          '</div>'+
          '<div class="upSchedActs">'+
            '<button type="button" class="upBtnSec" onclick="dzSchClear(event)">Clear</button>'+
            '<button type="button" class="upBtnPri" onclick="dzSchDone(event)">Done</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="upSchedHint" id="dzSchedHint">Leave empty to publish immediately.</div>'+
      '</div>'+
    '</div>';
  }

  function buildForm(sec){
    var f = FORMS[sec], ed = dzEditing(sec);
    var drop = DZ_EDIT_DROP[sec] || {};
    var fields = f.fields.filter(function(fd){
      if(!ed) return true;
      return fd.t !== 'auto' && !drop[fd.k];
    }).map(function(fd){ return field(sec, fd); }).join('');

    if(ed){
      return ''+
      '<div class="dzUpWrap dzUpWrap--edit">'+
        '<div class="dzUpForm"><div class="upMain">'+
          '<div class="upCard"><div class="upFieldsCol">'+ fields +'</div></div>'+
          '<div class="upActions">'+
            '<button type="button" class="upBtnSec" onclick="dzEditCancel()">\u2039 Back</button>'+
            '<button type="button" class="upBtnPri" id="dzSubmit-'+sec+'" onclick="dzSaveEdit(\''+sec+'\')">\uD83D\uDCE4 Save Changes</button>'+
          '</div>'+
          '<p class="dzHint" style="margin-top:.9rem">Your changes go live as soon as you save. Files and images stay as they were uploaded.</p>'+
        '</div></div>'+
      '</div>';
    }

    return ''+
    '<div class="dzUpWrap">'+
      '<div class="dzUpForm"><div class="upMain">'+
        '<div class="upCard"><div class="upFieldsCol">'+
          fields +
          dzSchedField() +
        '</div></div>'+
        '<div class="upActions">'+
          '<button type="button" class="upBtnSec" id="dzDraftBtn-'+sec+'" onclick="dzSaveDraft(\''+sec+'\')">💾 Save Draft</button>'+
          '<button type="button" class="upBtnPri" id="dzSubmit-'+sec+'" onclick="dzSubmit(\''+sec+'\')">📤 Publish</button>'+
        '</div>'+
        '<p class="dzHint" style="margin-top:.9rem">Posts are reviewed before they appear publicly.</p>'+
      '</div></div>'+
      '<aside class="dzUpSide">'+
        '<div class="upSideCard">'+
          '<div class="upDraftTitle">SCHEDULED</div>'+
          '<p class="upDraftNote">Publishes automatically at the set time</p>'+
          '<div class="upDraftRow" id="dzSchedRow-'+sec+'">'+dzSchedGhost4()+'</div>'+
        '</div>'+
        '<div class="upSideCard">'+
          '<div class="upDraftTitle">SAVED DRAFTS</div>'+
          '<p class="upDraftNote">Saved on this device · auto-deleted after 7 days</p>'+
          '<div class="upDraftRow" id="dzDraftRow-'+sec+'">'+dzGhost4()+'</div>'+
        '</div>'+
      '</aside>'+
    '</div>';
  }

  var ICO_PENCIL = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      ICO_LINES  = '<path d="M4 6h16"/><path d="M4 12h11"/><path d="M4 18h7"/>',
      ICO_TAG    = '<path d="M12.9 2.9H4.6A1.7 1.7 0 0 0 2.9 4.6v8.3a2 2 0 0 0 .6 1.4l7.2 7.2a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8l-7.2-7.2a2 2 0 0 0-1.4-.6z"/><circle cx="7.4" cy="7.4" r="1.3"/>',
      ICO_HASH   = '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
      ICO_SLIDER = '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1.5 14h5"/><path d="M9.5 8h5"/><path d="M17.5 16h5"/>',
      ICO_MONEY  = '<path d="M12 1.8v20.4"/><path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      ICO_CAL    = '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4"/><path d="M8 2.5v4"/><path d="M3 10h18"/>',
      ICO_CHECK  = '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
      ICO_SHIELD = '<path d="M12 21.6s7.6-3.8 7.6-9.6V5.4L12 2.4 4.4 5.4v6.6c0 5.8 7.6 9.6 7.6 9.6Z"/>',
      ICO_SCREEN = '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 16.5V21"/>',
      ICO_BUILD  = '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M9 7h2"/><path d="M13 7h2"/><path d="M9 11h2"/><path d="M13 11h2"/><path d="M10 21.5v-4h4v4"/>',
      ICO_LINK   = '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
      ICO_MAIL   = '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/>',
      ICO_PIN    = '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
      ICO_COIN   = '<circle cx="12" cy="12" r="9"/><path d="M15 9.4a3.6 3.6 0 1 0 0 5.2"/>',
      ICO_GRID   = '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
      ICO_CLOCK  = '<circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.2 2"/>',
      ICO_STAIR  = '<path d="M3 20h4v-4h5v-4h5V8h4"/><path d="M3 20v-4"/>',
      ICO_USERS  = '<path d="M16 20v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.4"/><path d="M22 20v-1.8a4 4 0 0 0-3-3.87"/><path d="M16.5 3.6a4 4 0 0 1 0 7.75"/>',
      ICO_LIST   = '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4.5 6h.01"/><path d="M4.5 12h.01"/><path d="M4.5 18h.01"/>',
      ICO_CLIP   = '<path d="M15.5 3.5H8.5A2 2 0 0 0 6.5 5.5v13a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2Z"/><path d="M9.5 3.5V2h5v1.5"/><path d="M9.5 9h5"/><path d="M9.5 13h5"/>',
      ICO_STAR   = '<path d="m12 2.8 2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.65 6.2 20.7l1.1-6.45-4.7-4.6 6.5-.95Z"/>',
      ICO_EYE    = '<path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12Z"/><circle cx="12" cy="12" r="3"/>',
      ICO_GLOBE  = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/>',
      ICO_SPARK  = '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M4.9 7.5 8 9.3"/><path d="M16 14.7l3.1 1.8"/><path d="M4.9 16.5 8 14.7"/><path d="M16 9.3l3.1-1.8"/><circle cx="12" cy="12" r="3"/>',
      ICO_GIFT   = '<rect x="2.8" y="8.5" width="18.4" height="4" rx="1"/><path d="M4.5 12.5V20a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7.5"/><path d="M12 8.5V21"/><path d="M12 8.5S10.8 3.5 8 3.5a2.5 2.5 0 0 0 0 5Z"/><path d="M12 8.5s1.2-5 4-5a2.5 2.5 0 0 1 0 5Z"/>',
      ICO_PLANE  = '<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8Z"/>';

  var C_VIO='var(--upcViolet)', C_GRN='var(--upcGreen)',  C_BLU='var(--upcBlue)',
      C_AMB='var(--upcAmber)',  C_PNK='var(--upcPink)',   C_CYN='var(--upcCyan)',
      C_TEA='var(--upcTeal)',   C_ORG='var(--upcOrange)', C_PUR='var(--upcPurple)',
      C_ROS='var(--upcRose)',   C_YEL='var(--upcYellow)', C_LIL='var(--upcLilac)';

  var FIELD_ICO = {
    title:[C_VIO,ICO_PENCIL],
    description:[C_GRN,ICO_LINES], excerpt:[C_GRN,ICO_LINES], body:[C_GRN,ICO_LINES],
    category:[C_AMB,ICO_TAG],
    tags:[C_CYN,ICO_HASH],
    software:[C_PNK,ICO_SCREEN], software_list:[C_PNK,ICO_SCREEN],
    license:[C_ROS,ICO_SHIELD],
    price:[C_GRN,ICO_MONEY], salary_min:[C_GRN,ICO_MONEY], salary_max:[C_GRN,ICO_MONEY],
    currency:[C_YEL,ICO_COIN], salary_currency:[C_YEL,ICO_COIN],
    item_type:[C_PUR,ICO_GRID], employment_type:[C_PUR,ICO_GRID],
    delivery_days:[C_TEA,ICO_CLOCK], salary_unit:[C_TEA,ICO_CLOCK],
    company:[C_BLU,ICO_BUILD], about_company:[C_BLU,ICO_BUILD],
    company_url:[C_BLU,ICO_LINK], apply_url:[C_BLU,ICO_LINK],
    apply_email:[C_CYN,ICO_MAIL],
    location_city:[C_ORG,ICO_PIN], location_country:[C_ORG,ICO_PIN],
    applicant_countries:[C_ORG,ICO_GLOBE], is_remote:[C_ORG,ICO_PIN],
    work_mode:[C_ORG,ICO_GLOBE],
    valid_through:[C_TEA,ICO_CAL], start_date:[C_TEA,ICO_CAL],
    experience_level:[C_PUR,ICO_STAIR], years_experience:[C_PUR,ICO_STAIR],
    openings:[C_PNK,ICO_USERS],
    responsibilities:[C_GRN,ICO_LIST], requirements:[C_GRN,ICO_LIST],
    required_skills:[C_CYN,ICO_SPARK], nice_to_have_skills:[C_LIL,ICO_SPARK],
    benefits:[C_ROS,ICO_GIFT],
    timezone:[C_TEA,ICO_GLOBE], working_hours:[C_TEA,ICO_CLOCK], schedule:[C_TEA,ICO_CAL],
    contract_duration:[C_AMB,ICO_CLOCK],
    application_instructions:[C_BLU,ICO_PLANE], application_materials:[C_BLU,ICO_CLIP],
    application_questions:[C_CYN,ICO_LINES],
    portfolio_required:[C_VIO,ICO_CHECK], resume_required:[C_VIO,ICO_CLIP],
    cover_letter_required:[C_VIO,ICO_PENCIL],
    visibility:[C_YEL,ICO_EYE], featured:[C_AMB,ICO_STAR],
    cover:[C_VIO,ICO_SCREEN],
    content_type:[C_PUR,ICO_GRID],
    related_artworks:[C_PNK,ICO_SCREEN], related_items:[C_AMB,ICO_GRID],
    external_refs:[C_BLU,ICO_LINK],
    __auto:[C_TEA,ICO_CHECK],
    summary:[C_GRN,ICO_LINES], product_type:[C_PUR,ICO_GRID],
    buyer_gets:[C_GRN,ICO_GIFT], file_format:[C_BLU,ICO_CLIP],
    file_count:[C_BLU,ICO_HASH], file_size_mb:[C_BLU,ICO_HASH],
    dimensions:[C_ORG,ICO_GRID], subcategory:[C_AMB,ICO_TAG],
    source_files_included:[C_ROS,ICO_CLIP], commercial_use:[C_ROS,ICO_SHIELD],
    personal_use:[C_ROS,ICO_SHIELD], modification_allowed:[C_ROS,ICO_SHIELD],
    attribution_required:[C_ROS,ICO_SHIELD],
    sale_price:[C_GRN,ICO_MONEY], stock:[C_TEA,ICO_HASH],
    delivery_type:[C_TEA,ICO_PLANE], delivery_notes:[C_TEA,ICO_LINES],
    custom_requests:[C_LIL,ICO_SPARK], revision_count:[C_LIL,ICO_HASH],
    support_period:[C_TEA,ICO_CLOCK], refund_policy:[C_ROS,ICO_SHIELD],
    preview_watermark:[C_VIO,ICO_SHIELD], safety_notes:[C_ROS,ICO_SHIELD],
    seller_note:[C_PNK,ICO_PENCIL], internal_notes:[C_YEL,ICO_CLIP],
    closing_date:[C_TEA,ICO_CAL],
    file:[C_GRN,ICO_CLIP], preview:[C_VIO,ICO_SCREEN],
    resource_type:[C_PUR,ICO_GRID],
    compatible_software:[C_PNK,ICO_SCREEN], compatible_versions:[C_PNK,ICO_HASH],
    whats_included:[C_GRN,ICO_GIFT], instructions:[C_BLU,ICO_LIST],
    version:[C_TEA,ICO_HASH], external_links:[C_BLU,ICO_LINK]
  };
  var TYPE_ICO = {
    text:[C_VIO,ICO_PENCIL], area:[C_GRN,ICO_LINES], num:[C_GRN,ICO_MONEY],
    int:[C_GRN,ICO_HASH], money:[C_GRN,ICO_MONEY],
    date:[C_TEA,ICO_CAL], sel:[C_LIL,ICO_SLIDER], cat:[C_AMB,ICO_TAG],
    tags:[C_CYN,ICO_HASH], chk:[C_TEA,ICO_CHECK]
  };
  function fieldIco(k, t){ return FIELD_ICO[k] || TYPE_ICO[t] || [C_VIO,ICO_PENCIL]; }

  var DZ_CHEV = '<span class="upChev" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" '+
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="m6 9 6 6 6-6"/></svg></span>';

  function dzSelField(id, opts, want){
    opts = opts || [];
    var cur = null, i;
    for(i=0;i<opts.length;i++){ if(String(opts[i][0]) === String(want)){ cur = opts[i]; break; } }
    if(!cur) cur = opts[0] || ['',''];
    return '<div class="upCatDd" id="'+id+'_dd">'+
      '<button type="button" class="upCatTrigger" id="'+id+'_tr" '+
        'onclick="dzSelToggle(event,\''+id+'\')" aria-haspopup="listbox">'+
        '<span id="'+id+'_lb">'+esc(cur[1])+'</span>'+DZ_CHEV+
      '</button>'+
      '<div class="upCatPanel" id="'+id+'_pn" role="listbox">'+
        opts.map(function(o){
          return '<label class="upCatOpt"><input type="radio" name="'+id+'_r" value="'+esc(o[0])+'"'+
            (String(o[0])===String(cur[0]) ? ' checked' : '')+
            ' onchange="dzSelPick(\''+id+'\',this.value,this.parentNode.textContent)"> '+esc(o[1])+'</label>';
        }).join('')+
      '</div>'+
      '<input type="hidden" id="'+id+'" value="'+esc(cur[0])+'">'+
    '</div>';
  }
  function dzCloseMenus(except){
    var open = document.querySelectorAll('#upSecForms .upCatDd.open, #pfUpMod .upCatDd.open');
    for(var i=0;i<open.length;i++){ if(open[i] !== except) open[i].classList.remove('open'); }
  }
  function dzSelToggle(e, id){
    if(e) e.stopPropagation();
    var dd = document.getElementById(id+'_dd'); if(!dd) return;
    dzCloseMenus(dd);
    dzSchClose();
    dd.classList.toggle('open');
  }
  function dzSelPick(id, v, label){
    var hid = document.getElementById(id);
    if(hid) hid.value = v;
    var lb = document.getElementById(id+'_lb');
    if(lb) lb.textContent = String(label||'').trim() || v;
    var dd = document.getElementById(id+'_dd');
    if(dd) dd.classList.remove('open');
    dzCondApply(upSec);
  }
  function dzSelSync(id){
    var hid = document.getElementById(id), pn = document.getElementById(id+'_pn');
    if(!hid || !pn) return;
    var opts = pn.querySelectorAll('input[type=radio]');
    for(var i=0;i<opts.length;i++){
      var on = String(opts[i].value) === String(hid.value);
      opts[i].checked = on;
      if(on){
        var lb = document.getElementById(id+'_lb');
        if(lb) lb.textContent = String(opts[i].parentNode.textContent||'').trim();
      }
    }
  }
  function dzEachField(sec, kinds, fn){
    (FORMS[sec] ? FORMS[sec].fields : []).forEach(function(fd){
      if(kinds.indexOf(fd.t) !== -1) fn('dz_'+sec+'_'+fd.k, fd);
    });
  }
  function dzSelSyncAll(sec){ dzEachField(sec, ['sel','cat'], dzSelSync); }
  document.addEventListener('click', function(ev){
    var open = document.querySelectorAll('#upSecForms .upCatDd.open, #pfUpMod .upCatDd.open');
    for(var i=0;i<open.length;i++){
      if(!open[i].contains(ev.target)) open[i].classList.remove('open');
    }
  });
  function fcard(k, t, inner, extra){
    var ic = fieldIco(k, t);
    return '<div class="upField upFCard'+(extra||'')+'" style="--fc:'+ic[0]+'" data-fk="'+esc(k)+'">'+
      '<span class="upFIco" aria-hidden="true">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '+
        'stroke-linecap="round" stroke-linejoin="round">'+ic[1]+'</svg>'+
      '</span>'+
      '<div class="upFBody">'+inner+'</div>'+
    '</div>';
  }

  function limitAttrs(fd){
    var out = '';
    if(fd.min) out += ' data-min="'+fd.min+'"';
    if(fd.max) out += ' data-cmax="'+fd.max+'"';
    if(fd.up)  out += ' data-up="1"';
    return out;
  }
  function labelFor(id, fd){
    var mark = fd.req    ? ' <span class="upReq">*</span>'
             : fd.reqOne ? ' <span class="upReq" id="'+id+'_r">*</span>'
             : '';
    var lbl = '<label class="upLbl" for="'+id+'">'+esc(fd.label)+mark+'</label>';
    if(!fd.min || fd.t === 'tags') return lbl;
    return '<div class="upLblRow">'+lbl+
      '<span class="upCount upCountInline" id="'+id+'_c" aria-live="off"></span></div>';
  }

  function field(sec, fd){
    var ed = dzEditing(sec);
    if(ed && (DZ_EDIT_LOCK[sec] || {})[fd.k]) return dzLockedField(sec, fd, ed.row);
    var id = 'dz_'+sec+'_'+fd.k;
    var lbl = labelFor(id, fd);
    var hint = fd.hint
      ? '<div class="dzHint"' + (fd.mb ? ' data-dz-mb="'+fd.mb+'"' : '') + '>'+esc(fd.hint)+'</div>'
      : '';
    var cond = fd.cond ? ' upFCond' : '';
    var body = '';

    if(fd.t === 'text'){
      body = '<input class="upIn" id="'+id+'" type="text" maxlength="'+(fd.max||200)+'"'+
             limitAttrs(fd)+' placeholder="'+esc(fd.ph||'')+'">';
    } else if(fd.t === 'num'){
      body = '<input class="upIn" id="'+id+'" type="number" min="0" step="'+(fd.step||'1')+
             '" placeholder="'+esc(fd.ph||'')+'">';
    } else if(fd.t === 'int' || fd.t === 'money'){
      body = '<input class="upIn" id="'+id+'" type="text" autocomplete="off" '+
             'inputmode="'+(fd.t === 'int' ? 'numeric' : 'decimal')+'" '+
             'data-num="'+fd.t+'" data-nmin="'+(fd.nmin != null ? fd.nmin : 0)+'" '+
             'data-nmax="'+(fd.nmax != null ? fd.nmax : 999999999)+'" '+
             'placeholder="'+esc(fd.ph||'')+'">';
    } else if(fd.t === 'date'){
      body = '<input class="upIn" id="'+id+'" type="date">';
    } else if(fd.t === 'area'){
      body = '<textarea class="upIn" id="'+id+'" rows="'+(fd.rows||4)+'" maxlength="'+(fd.max||2000)+'"'+
             limitAttrs(fd)+' placeholder="'+esc(fd.ph||'')+'"></textarea>';
    } else if(fd.t === 'sel'){
      var want = fd.pref ? dzPrefCurrency() : (fd.def != null ? fd.def : null);
      var sOpts = fd.options || [];
        // Scheduling is an upload-time choice -- an edit has no schedule field to pair it with
      if(ed && fd.k === 'visibility'){
        sOpts = sOpts.filter(function(o){ return o[0] !== 'scheduled'; });
      }
      body = dzSelField(id, sOpts, want);
    } else if(fd.t === 'chk'){
      return fcard(fd.k, fd.t, '<label class="upCatOpt upFChk">'+
             '<input type="checkbox" id="'+id+'"> '+esc(fd.label)+'</label>'+hint, cond);
    } else if(fd.t === 'cat'){
      var opts = (window.FG_SECTIONS && FG_SECTIONS[sec] && FG_SECTIONS[sec].opts) || [];
      body = dzSelField(id, opts.map(function(o){ return [slugify(o), o]; }), null);
    } else if(fd.t === 'pick'){
      body = '<div class="upCatDd" id="'+id+'_dd">'+
        '<button type="button" class="upCatTrigger" id="'+id+'_tr" aria-haspopup="listbox" '+
          'onclick="dzPickToggle(event,\''+id+'\',\''+esc(fd.src||'artworks')+'\','+(fd.cap||10)+')">'+
          '<span id="'+id+'_lb">Nothing linked</span>'+DZ_CHEV+
        '</button>'+
        '<div class="upCatPanel" id="'+id+'_pn" role="listbox">'+
          '<div class="dzHint" style="padding:.4rem .5rem">Open to load your work…</div>'+
        '</div>'+
        '<input type="hidden" id="'+id+'" value="">'+
      '</div>';
    } else if(fd.t === 'list'){
      var isUrl = !!fd.url;
      var menu = '';
      if(fd.opts && fd.opts.length){
        menu = '<div class="upCatDd upRefDd" id="'+id+'_dd">'+
          '<button type="button" class="upCatTrigger" id="'+id+'_tr" aria-haspopup="listbox" '+
            'onclick="dzRefMenu(event,\''+id+'\')">'+
            '<span id="'+id+'_lb" data-ph="'+esc(fd.pick || 'Pick from the list')+'">'+
              esc(fd.pick || 'Pick from the list')+'</span>'+DZ_CHEV+
          '</button>'+
          '<div class="upCatPanel" id="'+id+'_pn" role="listbox">'+
            fd.opts.map(function(o){
              return '<label class="upCatOpt"><input type="checkbox" value="'+esc(o)+'" '+
                'onchange="dzRefOpt(\''+id+'\',this,'+(fd.cap||10)+')"> '+esc(o)+'</label>';
            }).join('')+
          '</div>'+
        '</div>';
      }
      body = menu+
        '<div class="upTagBox" onclick="document.getElementById(\''+id+'_in\').focus()">'+
        '<span id="'+id+'_chips"></span>'+
        '<input class="upTagInput" id="'+id+'_in" type="'+(isUrl ? 'url' : 'text')+'" '+
          'maxlength="'+(fd.imax||200)+'" '+
          'placeholder="'+esc(fd.ph || (isUrl ? 'https://… then press Enter' : 'Type one, then press Enter'))+'" '+
          'onkeydown="dzRefKey(event,\''+id+'\','+(fd.cap||10)+','+(fd.imin||1)+','+
            (fd.imax||200)+','+(isUrl?1:0)+')"></div>'+
        '<input type="hidden" id="'+id+'" value="">';
    } else if(fd.t === 'auto'){
      return fcard(fd.k, fd.t,
        '<span class="upLbl">'+esc(fd.label)+' <span class="upOpt">automatic</span></span>'+
        '<div class="dzvMeta upAutoList" style="margin-top:.35rem">'+
          (fd.items||[]).map(function(x){
            return '<div class="dzvMetaRow"><span>'+esc(x[1])+'</span>'+
              '<b id="dzAuto_'+sec+'_'+esc(x[0])+'">'+DZ_AUTO_EMPTY+'</b></div>';
          }).join('')+
        '</div>', cond);
    } else if(fd.t === 'tags'){
      return fcard(fd.k, fd.t, lbl+
        '<div class="upTagBox" onclick="document.getElementById(\''+id+'\').focus()">'+
        '<span id="dzTags-'+sec+'"></span>'+
        '<input class="upTagInput" id="'+id+'" maxlength="'+((fd.max||20)*10+20)+'" '+
        'placeholder="character, birds, nature, etc." '+
        'onkeydown="dzTagKey(event,\''+sec+'\')" '+
        'onblur="dzTagBlur(event,\''+sec+'\')" '+
        'onpaste="dzTagPaste(event,\''+sec+'\')"></div>'+hint, cond);
    } else if(fd.t === 'file' || fd.t === 'image'){
      var acc   = fd.accept ? fd.accept : (fd.t === 'image' ? 'image/*' : '');
      var isImg = fd.t === 'image';
      var args  = '\''+sec+'\',\''+fd.k+'\'';
      return '<div class="upField dzFileField'+cond+'" data-fk="'+esc(fd.k)+'">'+lbl+
        '<div class="dzFileZone" id="'+id+'_z"'+
          ' ondragenter="dzDragOn(event,\''+id+'\')" ondragover="dzDragOn(event,\''+id+'\')"'+
          ' ondragleave="dzDragOff(event,\''+id+'\')" ondrop="dzDropFile(event,'+args+')">'+
          '<input class="dzFileIn" id="'+id+'" type="file" accept="'+esc(acc)+'"'+
            ' aria-label="'+esc(fd.label)+'"'+
            ' onclick="if(typeof pfGuestGate===\'function\'&&pfGuestGate(event))return;"'+
            ' onchange="dzPick('+args+',this)">'+
          '<div class="dzFileEmpty">'+
            zoneIco()+
            '<div class="dzFileCopy">'+
              '<div class="dzFileTitle">Drag &amp; drop your '+(isImg ? 'image' : 'file')+' here</div>'+
              '<div class="dzFileSub">or browse from your device</div>'+
            '</div>'+
            '<span class="dzFileBtn">'+(isImg ? 'Select image' : 'Select file')+'</span>'+
            '<div class="dzFileTypes">'+esc(acceptLabel(acc, isImg))+'</div>'+
          '</div>'+
          '<div class="dzFilePicked" id="'+id+'_pk"></div>'+
        '</div>'+hint+'</div>';
    } else if(fd.t === 'files' || fd.t === 'images'){
      var isPics = fd.t === 'images';
      var macc  = fd.accept || (isPics ? 'image/*' : '');
      var margs = '\''+sec+'\',\''+fd.k+'\'';
      return '<div class="upField dzFileField'+cond+'" data-fk="'+esc(fd.k)+'">'+lbl+
        '<div class="dzFileZone dzFileZone--multi" id="'+id+'_z"'+
          ' ondragenter="dzDragOn(event,\''+id+'\')" ondragover="dzDragOn(event,\''+id+'\')"'+
          ' ondragleave="dzDragOff(event,\''+id+'\')" ondrop="dzDropFile(event,'+margs+')">'+
          '<input class="dzFileIn" id="'+id+'" type="file" multiple accept="'+esc(macc)+'"'+
            ' aria-label="'+esc(fd.label)+'"'+
            ' onclick="if(typeof pfGuestGate===\'function\'&&pfGuestGate(event))return;"'+
            ' onchange="dzPick('+margs+',this)">'+
          '<div class="dzFileEmpty">'+
            zoneIco()+
            '<div class="dzFileCopy">'+
              '<div class="dzFileTitle">'+(isPics
                 ? 'Drag &amp; drop more preview images'
                 : 'Drag &amp; drop the files you are selling')+'</div>'+
              '<div class="dzFileSub">or browse from your device — you can add several</div>'+
            '</div>'+
            '<span class="dzFileBtn">'+(isPics ? 'Select images' : 'Select files')+'</span>'+
            '<div class="dzFileTypes">'+esc(acceptLabel(macc, isPics))+'</div>'+
          '</div>'+
          '<div class="dzFilePicked dzFileMulti" id="'+id+'_pk"></div>'+
        '</div>'+hint+'</div>';
    }
    return fcard(fd.k, fd.t, lbl+body+hint, cond);
  }

  var PICK_SRC = {
    artworks:    { table:'artworks', label:'name', extra:'title', where:{kind:'art'}, empty:'You have not uploaded any artwork yet.' },
    marketplace: { table:'marketplace_items', label:'title', where:null, empty:'You have no marketplace listings yet.' }
  };
  function dzPickIds(id){
    var hid = document.getElementById(id);
    return String((hid && hid.value) || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
  }
  function dzPickLabel(id, cap){
    var n = dzPickIds(id).length;
    var lb = document.getElementById(id+'_lb');
    if(lb) lb.textContent = n ? (n + ' of ' + cap + ' linked') : 'Nothing linked';
  }
  function dzPickToggle(e, id, src, cap){
    if(e) e.stopPropagation();
    var dd = document.getElementById(id+'_dd'); if(!dd) return;
    dzCloseMenus(dd);
    dzSchClose();
    var opening = !dd.classList.contains('open');
    dd.classList.toggle('open', opening);
    if(opening && !dd.dataset.loaded) dzPickLoad(id, src, cap);
  }
  function dzPickLoad(id, src, cap){
    var pn = document.getElementById(id+'_pn'), dd = document.getElementById(id+'_dd');
    var cfg = PICK_SRC[src];
    if(!pn || !cfg) return;
    if(!sb || !window.currentUser){
      pn.innerHTML = '<div class="dzHint" style="padding:.4rem .5rem">Sign in to link your work.</div>';
      return;
    }
    pn.innerHTML = '<div class="dzHint" style="padding:.4rem .5rem">Loading…</div>';
    var cols = ['id', cfg.label].concat(cfg.extra ? [cfg.extra] : []).join(',');
    var q = sb.from(cfg.table).select(cols).eq('user_id', currentUser.id);
    if(cfg.where) Object.keys(cfg.where).forEach(function(k){ q = q.eq(k, cfg.where[k]); });
    q.order('created_at', {ascending:false}).limit(200).then(function(res){
        // postgrest hands an error back on the success side; unread, it reads here as "you have nothing" — a different sentence
      if(res && res.error) throw res.error;
      var rows = (res && res.data) || [];
      if(!rows.length){
        pn.innerHTML = '<div class="dzHint" style="padding:.4rem .5rem">'+esc(cfg.empty)+'</div>';
        return;
      }
      var chosen = dzPickIds(id), mark = {};
      chosen.forEach(function(x){ mark[x] = 1; });
      pn.innerHTML = rows.map(function(r){
        var name = r[cfg.label] || (cfg.extra && r[cfg.extra]) || 'Untitled';
        return '<label class="upCatOpt"><input type="checkbox" value="'+esc(r.id)+'"'+
          (mark[r.id] ? ' checked' : '')+
          ' onchange="dzPickSet(\''+id+'\','+cap+')"> '+esc(name)+'</label>';
      }).join('');
      if(dd) dd.dataset.loaded = '1';
      dzPickLabel(id, cap);
    }).catch(function(){
      pn.innerHTML = '<div class="dzHint" style="padding:.4rem .5rem">Could not load your work.</div>';
    });
  }
  function dzPickSet(id, cap){
    var pn = document.getElementById(id+'_pn'), hid = document.getElementById(id);
    if(!pn || !hid) return;
    var boxes = pn.querySelectorAll('input[type=checkbox]'), out = [];
    for(var i=0;i<boxes.length;i++){
      if(!boxes[i].checked) continue;
      if(out.length >= cap){
        boxes[i].checked = false;
        showToast('That is the limit — ' + cap);
        continue;
      }
      out.push(boxes[i].value);
    }
    hid.value = out.join(',');
    dzPickLabel(id, cap);
  }
  function dzPickSyncAll(sec){
    (FORMS[sec] ? FORMS[sec].fields : []).forEach(function(fd){
      if(fd.t !== 'pick') return;
      var id = 'dz_'+sec+'_'+fd.k, dd = document.getElementById(id+'_dd');
      if(dd) delete dd.dataset.loaded;
      dzPickLabel(id, fd.cap || 10);
    });
  }

  function dzRefList(id){
    var hid = document.getElementById(id);
    return String((hid && hid.value) || '').split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  }
  function dzRefsRender(id){
    var host = document.getElementById(id+'_chips');
    if(!host) return;
    var list = dzRefList(id);
    host.innerHTML = list.map(function(u, i){
      var show = u.replace(/^https?:\/\//i, '').slice(0, 40);
      return '<span class="upTagChip" title="'+esc(u)+'">'+esc(show)+
        '<button type="button" onclick="dzRefDel(\''+id+'\','+i+')" aria-label="Remove link">✕</button></span>';
    }).join('');
    dzRefMenuSync(id, list);
  }
  function dzRefMenuSync(id, list){
    var pn = document.getElementById(id+'_pn');
    if(!pn) return;
    list = list || dzRefList(id);
    var boxes = pn.querySelectorAll('input[type=checkbox]');
    for(var i=0;i<boxes.length;i++){
      boxes[i].checked = list.indexOf(boxes[i].value) !== -1;
    }
    var lb = document.getElementById(id+'_lb');
    if(lb) lb.textContent = list.length
      ? list.length + ' selected'
      : (lb.getAttribute('data-ph') || 'Pick from the list');
  }
  var dzRefMenu = dzSelToggle;
  function dzRefOpt(id, box, cap){
    var hid = document.getElementById(id);
    if(!hid) return;
    var list = dzRefList(id), at = list.indexOf(box.value);
    if(box.checked){
      if(at === -1){
        if(list.length >= cap){
          box.checked = false;
          showToast('That is the limit — ' + cap + ' entries');
          return;
        }
        list.push(box.value);
      }
    } else if(at !== -1){
      list.splice(at, 1);
    }
    hid.value = list.join('\n');
    dzRefsRender(id);
  }
  function dzRefKey(e, id, cap, imin, imax, isUrl){
    if(e.key !== 'Enter') return;
    e.preventDefault();
    var inp = e.target, hid = document.getElementById(id);
    if(!hid) return;
    imin = imin || 1; imax = imax || 200;
    var v = String(inp.value||'').trim();
    if(isUrl) v = dzWebUrl(v);
    if(!v) return;
    if(v.length < imin || v.length > imax){
      showToast((isUrl ? 'A link' : 'Each entry') + ' has to be '+imin+'–'+imax+' characters');
      return;
    }
    var list = dzRefList(id);
    if(list.length >= cap){
      showToast('That is the limit — ' + cap + (isUrl ? ' links' : ' entries'));
      return;
    }
    if(list.indexOf(v) === -1) list.push(v);
    hid.value = list.join('\n');
    inp.value = '';
    dzRefsRender(id);
  }
  function dzRefDel(id, i){
    var hid = document.getElementById(id);
    if(!hid) return;
    var list = dzRefList(id);
    list.splice(i, 1);
    hid.value = list.join('\n');
    dzRefsRender(id);
  }
  function dzRefsAll(sec){ dzEachField(sec, ['list'], dzRefsRender); }

  var COND = {
    place:   function(v){ return v.work_mode !== 'remote'; },
    remote:  function(v){ return v.work_mode === 'remote'; },
    term:    function(v){ return !!EMP_FIXED_TERM[v.employment_type]; },
    svc:     function(v){ return !!ITEM_SERVICE[v.item_type]; },
    digital: function(v){ return v.item_type === 'digital'; },
    digitalart: function(v){ return !!ART_DIGITAL[v.medium]; }
  };
  function dzCondShow(sec, fd){
    if(!fd || !fd.cond) return true;
    var f = COND[fd.cond];
    if(!f) return true;
    return !!f(dzCondState(sec));
  }
  function dzCondState(sec){
    return {
      work_mode: val(sec,'work_mode'),
      employment_type: val(sec,'employment_type'),
      item_type: val(sec,'item_type'),
      medium: val(sec,'medium')
    };
  }
  function dzCondReq(sec, fd){
    if(!fd) return false;
    if(fd.req) return true;
    if(!fd.reqIf) return false;
    var f = COND[fd.reqIf];
    return !!(f && f(dzCondState(sec)));
  }
  function dzCondApply(sec){
    if(!FORMS[sec]) return;
    FORMS[sec].fields.forEach(function(fd){
      if(!fd.cond) return;
      var el = document.getElementById('dz_'+sec+'_'+fd.k);
      var card = el && el.closest ? el.closest('.upField') : null;
      if(card) card.classList.toggle('upFHide', !dzCondShow(sec, fd));
    });
    dzReqOne(sec);
  }
  function dzReqOne(sec){
    if(!FORMS[sec]) return;
    var groups = {};
    FORMS[sec].fields.forEach(function(fd){
      if(!fd.reqOne) return;
      (groups[fd.reqOne] = groups[fd.reqOne] || []).push(fd);
    });
    Object.keys(groups).forEach(function(g){
      var fds = groups[g];
      var met = fds.some(function(fd){ return !!val(sec, fd.k); });
      fds.forEach(function(fd){
        var m = document.getElementById('dz_'+sec+'_'+fd.k+'_r');
        if(m) m.hidden = met;
      });
    });
  }

  var ART_SLOTS = ['pfUpX1','pfUpX2','pfUpX3','pfUpX4','pfUpX5'];
  function dzArtExtras(){
    if(!FORMS.artwork) return;
    var any = false;
    ART_SLOTS.forEach(function(hostId, i){
      var host = document.getElementById(hostId);
      if(!host) return;
      any = true;
      if(host.getAttribute('data-built')) return;
      var slot = i + 1;
      host.innerHTML = FORMS.artwork.fields.filter(function(fd){
        return fd.slot === slot;
      }).map(function(fd){ return field('artwork', fd); }).join('');
      host.setAttribute('data-built', '1');
    });
    if(!any) return;
    var old = document.getElementById('pfUpSoftwareField');
    if(old) old.style.display = 'none';
    dzCountAll('artwork');
  }
  function dzArtReset(){
    dzAutoReset('artwork');
    ART_SLOTS.forEach(function(id){
      var h = document.getElementById(id);
      if(h) h.removeAttribute('data-built');
    });
    dzArtExtras();
  }
  function dzArtValidate(){
    if(!FORMS.artwork) return null;
    var fds = FORMS.artwork.fields;
    for(var i=0;i<fds.length;i++){
      var fd = fds[i];
      if(fd.t === 'auto' || fd.t === 'chk') continue;
      if(!dzCondReq('artwork', fd)) continue;
      if(!dzCondShow('artwork', fd)) continue;
      if(!val('artwork', fd.k)) return {k:fd.k, msg:'Missing: ' + fd.label};
    }
    return dzLimits('artwork');
  }
  function dzArtSnapshot(){
    var out = {};
    (FORMS.artwork ? FORMS.artwork.fields : []).forEach(function(fd){
      if(fd.t === 'auto') return;
      var el = document.getElementById('dz_artwork_'+fd.k);
      if(!el) return;
      out[fd.k] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    return out;
  }
  function dzArtRestore(data){
    if(!data) return;
    dzArtExtras();
    (FORMS.artwork ? FORMS.artwork.fields : []).forEach(function(fd){
      if(fd.t === 'auto' || !(fd.k in data)) return;
      var el = document.getElementById('dz_artwork_'+fd.k);
      if(!el) return;
      if(el.type === 'checkbox') el.checked = !!data[fd.k];
      else el.value = data[fd.k];
    });
    dzSelSyncAll('artwork');
    dzCountAll('artwork');
  }

  function dzArtFromRow(a){
    a = a || {};
    function yn(v){ return v ? 'yes' : 'no'; }
    var sw = (a.software_list && a.software_list.length)
      ? a.software_list
      : (a.software ? [a.software] : []);
    return {
      summary: a.summary || '',
      subject_matter: a.subject_matter || '',
      medium: a.medium || 'Digital painting',
      software_list: sw.join('\n'),
      license: a.license || 'All rights reserved',
      commercial_use: yn(a.commercial_use),
      attribution_required: yn(a.attribution_required),
      modification_allowed: yn(a.modification_allowed),
      is_mature: yn(a.is_mature),
      credits: (a.credits || []).join('\n'),
      process_notes: a.process_notes || '',
      external_links: (a.external_links || []).join('\n'),
      comments_allowed: a.comments_allowed === false ? 'no' : 'yes',
      visibility: a.visibility || 'published',
      featured: !!a.featured
    };
  }

  function dzArtValues(){
    function v(k){ return val('artwork', k); }
    return {
      summary: v('summary') || null,
      subject_matter: v('subject_matter') || null,
      medium: v('medium') || null,
      software_list: dzRefList('dz_artwork_software_list').slice(0, 10),
      license: v('license') || null,
      commercial_use: v('commercial_use') === 'yes',
      attribution_required: v('attribution_required') === 'yes',
      modification_allowed: v('modification_allowed') === 'yes',
      declared_mature: v('is_mature') === 'yes',
      credits: dzRefList('dz_artwork_credits').slice(0, 20),
      process_notes: v('process_notes') || null,
      external_links: dzRefList('dz_artwork_external_links').slice(0, 5),
      comments_allowed: v('comments_allowed') !== 'no',
      visibility: v('visibility') || 'published',
      featured: v('featured') === true
    };
  }

  var DZ_AUTO_EMPTY = '--';
  var dzAutoRead = {};

  function dzFileExt(f){
    var m = /\.([a-z0-9]{1,8})$/i.exec(String((f && f.name) || ''));
    if(m) return m[1].toUpperCase();
    var t = String((f && f.type) || '').split('/')[1];
    return t ? t.toUpperCase() : null;
  }
  function dzAutoSet(sec, key, v){
    var el = document.getElementById('dzAuto_'+sec+'_'+key);
    if(!el) return;
    el.textContent = (v === null || v === undefined || v === '') ? DZ_AUTO_EMPTY : String(v);
  }
  function dzAutoPaint(sec){
    if(!dzField(sec, '__auto')) return;
    var read = dzAutoRead[sec] || {};
    var title, body;
    if(sec === 'artwork'){
      var nm = document.getElementById('pfUpNm'), ds = document.getElementById('pfUpDesc');
      title = String((nm && nm.value) || '').trim();
      body  = String((ds && ds.value) || '').trim();
      dzAutoSet(sec, 'file_format', read.file_format);
      dzAutoSet(sec, 'file_size',   read.file_size);
      dzAutoSet(sec, 'dimensions',  read.dimensions);
      dzAutoSet(sec, 'seo_title',       title ? dzSeoTitle(title) : null);
      dzAutoSet(sec, 'seo_description', dzSeoDesc(body, body));
      dzAutoSet(sec, 'slug', title ? slugify(title).slice(0, 110) : null);
    } else if(sec === 'blog'){
      title = val(sec, 'title');
      body  = val(sec, 'body');
      dzAutoSet(sec, 'seo_title',       title ? dzSeoTitle(title) : null);
      dzAutoSet(sec, 'seo_description', dzSeoDesc(val(sec, 'excerpt'), body));
      dzAutoSet(sec, 'slug', title ? slugify(title).slice(0, 110) : null);
      dzAutoSet(sec, 'read_minutes', body ? (dzReadMinutes(body) + ' min') : null);
    } else if(sec === 'marketplace'){
      title = val(sec, 'title');
      dzAutoSet(sec, 'seo_title',       title ? dzSeoTitle(title) : null);
      dzAutoSet(sec, 'seo_description', dzSeoDesc(val(sec, 'summary'), val(sec, 'description')));
      dzAutoSet(sec, 'slug', title ? slugify(title).slice(0, 110) : null);
    } else if(sec === 'resources'){
      title = val(sec, 'title');
      dzAutoSet(sec, 'file_format', read.file_format);
      dzAutoSet(sec, 'file_size',   read.file_size);
      dzAutoSet(sec, 'file_count',  read.file_count);
      dzAutoSet(sec, 'dimensions',  read.dimensions);
      dzAutoSet(sec, 'seo_title',       title ? dzSeoTitle(title) : null);
      dzAutoSet(sec, 'seo_description', dzSeoDesc(val(sec, 'summary'), val(sec, 'description')));
      dzAutoSet(sec, 'slug', title ? slugify(title).slice(0, 110) : null);
    }
  }
  async function dzAutoScan(sec){
    if(!dzField(sec, '__auto')) return;
    var main = null, pic = null;
    if(sec === 'artwork'){
      main = pic = (window.pf && pf.upFile) || null;
    } else if(sec === 'resources'){
      main = st(sec).files.file || null;
      pic  = st(sec).files.preview || null;
    }
    function tok(f){ return f ? (f.name+'|'+f.size+'|'+(f.lastModified||0)) : ''; }
    var tm = tok(main), tp = tok(pic);
    var read = dzAutoRead[sec];
    if(read && read.__m === tm && read.__p === tp) return;

    read = dzAutoRead[sec] = { __m:tm, __p:tp,
      file_format: main ? dzFileExt(main) : null,
      file_size:   main ? (bytes(main.size) || null) : null,
      file_count:  null,
      dimensions:  null
    };
    dzAutoPaint(sec);

    if(sec === 'resources' && main){
      var n = await dzZipCount(main);
      if(dzAutoRead[sec] === read){ read.file_count = n; dzAutoPaint(sec); }
    }
    if(pic){
      var d = await dzImageDims(pic);
      if(dzAutoRead[sec] === read){ read.dimensions = d; dzAutoPaint(sec); }
    }
  }
  function dzAutoReset(sec){ delete dzAutoRead[sec]; }

  function dzCountPaint(el){
    if(!el || !el.id) return;
    var c = document.getElementById(el.id+'_c');
    if(!c) return;
    var min = parseInt(el.getAttribute('data-min'), 10) || 0;
    var max = parseInt(el.getAttribute('data-cmax'), 10) || 0;
    var n   = String(el.value == null ? '' : el.value).trim().length;
    c.textContent = max ? (n + '/' + max) : String(n);
    c.classList.toggle('bad', n > 0 && n < min);
  }
  function dzNumClean(el){
    var kind = el.getAttribute('data-num');
    var max  = parseFloat(el.getAttribute('data-nmax'));
    var v    = String(el.value == null ? '' : el.value);
    v = (kind === 'int') ? v.replace(/[^0-9]/g, '') : v.replace(/[^0-9.]/g, '');
    if(kind !== 'int'){
      var p = v.split('.');
      v = p.shift() + (p.length ? '.' + p.join('').slice(0, 2) : '');
    }
    v = v.replace(/^0+(?=[0-9])/, '');
    if(isFinite(max)){
      while(v !== '' && v !== '.' && parseFloat(v) > max) v = v.slice(0, -1);
    }
    if(el.value !== v) el.value = v;
  }
  function dzFormScope(sec){
    return document.getElementById(sec === 'artwork' ? 'pfUpMod' : 'upSecForms');
  }
  function dzCountAll(sec){
    var box = dzFormScope(sec);
    if(!box) return;
    var els = box.querySelectorAll('[data-min],[data-cmax]');
    for(var i=0;i<els.length;i++) dzCountPaint(els[i]);
    dzCondApply(sec);
    dzPickSyncAll(sec);
    dzRefsAll(sec);
    dzAutoScan(sec);
    dzAutoPaint(sec);
    if(typeof dzPaintLimits === 'function') dzPaintLimits();
  }
  document.addEventListener('input', function(e){
    var t = e.target;
    if(!t || !t.id || !t.closest || !t.closest('#upSecForms, #pfUpMod')) return;
    if(t.getAttribute('data-up')){
      var at = t.selectionStart, up = String(t.value||'').toUpperCase();
      if(t.value !== up){ t.value = up; try{ t.setSelectionRange(at, at); }catch(err){} }
    }
    if(t.getAttribute('data-num')) dzNumClean(t);
    dzCountPaint(t);
    dzAutoPaint(upSec);
    dzReqOne(upSec);
  }, true);

  function renderTags(sec){
    var host = document.getElementById('dzTags-'+sec);
    if(!host) return;
    host.innerHTML = st(sec).tags.map(function(t,i){
      return '<span class="upTagChip">'+esc(t)+
        '<button type="button" onclick="dzTagDel(\''+sec+'\','+i+')" aria-label="Remove tag">✕</button></span>';
    }).join('');
  }
  function dzTagCommit(sec, raw){
    var s = st(sec), fd = dzField(sec, 'tags') || {};
    var cap = fd.max || 20, added = 0, full = false, cut = false;
    String(raw == null ? '' : raw).split(/[,\n]/).forEach(function(part){
      var v = part.trim().toLowerCase().replace(/^#+/, '').trim();
      if(!v) return;
      if(v.length > cap){ v = v.slice(0, cap); cut = true; }
      if(s.tags.length >= 10){ full = true; return; }
      if(s.tags.indexOf(v) !== -1) return;
      s.tags.push(v); added++;
    });
    if(full)     showToast('That is the limit — 10 tags');
    else if(cut) showToast('A tag is at most ' + cap + ' characters');
    if(added) renderTags(sec);
    return added;
  }
  function dzTagKey(e, sec){
    var el = e.target;
    if(e.key === 'Enter' || e.key === ','){
      e.preventDefault();
      dzTagCommit(sec, el.value);
      el.value = '';
    } else if(e.key === 'Backspace' && !el.value && st(sec).tags.length){
      st(sec).tags.pop(); renderTags(sec);
    }
  }
  function dzTagBlur(e, sec){
    var el = e.target;
    if(el && String(el.value||'').trim()){ dzTagCommit(sec, el.value); el.value = ''; }
  }
  function dzTagPaste(e, sec){
    var cb = e.clipboardData || window.clipboardData;
    var txt = cb ? cb.getData('text') : '';
    if(!txt || !/[,\n]/.test(txt)) return;
    e.preventDefault();
    var el = e.target;
    dzTagCommit(sec, el.value + txt);
    el.value = '';
  }
  function dzTagDel(sec, i){ st(sec).tags.splice(i,1); renderTags(sec); }

  function acceptLabel(acc, isImg){
    var parts = String(acc||'').split(',').map(function(p){ return p.trim(); }).filter(Boolean);
    var out = [], seen = {};
    parts.forEach(function(p){
      if(p === 'image/*'){ ['JPG','PNG','WEBP','GIF'].forEach(function(x){ if(!seen[x]){ seen[x]=1; out.push(x); } }); return; }
      var x = p.replace(/^\./,'').replace(/^image\//,'').toUpperCase();
      if(x === 'JPEG') x = 'JPG';
      if(x && !seen[x]){ seen[x] = 1; out.push(x); }
    });
    if(!out.length) return isImg ? 'JPG · PNG · WEBP · GIF' : 'Any file type';
    if(out.length > 7) return out.slice(0,7).join(' · ') + ' and more';
    return out.join(' · ');
  }

  function ext(name){
    var m = /\.([a-z0-9]{1,8})$/i.exec(String(name||''));
    return m ? m[1].toUpperCase() : 'FILE';
  }

  function dzRenderFile(sec, key){
    dzAutoScan(sec);
    var id  = 'dz_'+sec+'_'+key,
        z   = document.getElementById(id+'_z'),
        box = document.getElementById(id+'_pk'),
        s   = st(sec), f = s.files[key];
    if(!z || !box) return;
    if(Array.isArray(f)){ dzRenderFileList(sec, key, z, box, f); return; }
    if(!f){
      z.classList.remove('dzHasFile');
      box.innerHTML = '';
      return;
    }
    var url = s.urls[key];
    var thumb = (url && /^image\//.test(f.type||''))
      ? '<span class="dzFileThumb"><img src="'+url+'" alt=""></span>'
      : '<span class="dzFileThumb dzFileThumbExt">'+esc(ext(f.name))+'</span>';
    z.classList.add('dzHasFile');
    box.innerHTML =
      thumb+
      '<div class="dzFileMeta">'+
        '<div class="dzFileNm">'+esc(f.name)+'</div>'+
        '<div class="dzFileSz">'+esc(bytes(f.size) || '—')+' · Ready to publish</div>'+
      '</div>'+
      '<div class="dzFileActs">'+
        '<button type="button" class="dzFileAct" onclick="dzFileReplace(event,\''+sec+'\',\''+key+'\')">Replace</button>'+
        '<button type="button" class="dzFileAct dzFileActRm" onclick="dzFileClear(event,\''+sec+'\',\''+key+'\')">Remove</button>'+
      '</div>';
  }

  function dzRenderFileList(sec, key, z, box, list){
    if(!list.length){
      z.classList.remove('dzHasFile');
      box.innerHTML = '';
      return;
    }
    z.classList.add('dzHasFile');
    var fd = dzField(sec, key), pics = !!fd && fd.t === 'images';
    var urls = st(sec).urls[key];
    if(!Array.isArray(urls)) urls = [];
    var total = 0;
    list.forEach(function(f){ total += (f && f.size) || 0; });
    box.innerHTML =
      '<div class="dzFileRows">' +
        list.map(function(f, i){
          var thumb = (pics && urls[i])
            ? '<span class="dzFileThumb"><img src="'+esc(urls[i])+'" alt=""></span>'
            : '<span class="dzFileThumb dzFileThumbExt">'+esc(ext(f.name))+'</span>';
          return '<div class="dzFileRow">'+
            thumb+
            '<div class="dzFileMeta">'+
              '<div class="dzFileNm">'+esc(f.name)+'</div>'+
              '<div class="dzFileSz">'+esc(bytes(f.size) || '—')+'</div>'+
            '</div>'+
            '<button type="button" class="dzFileAct dzFileActRm" '+
              'onclick="dzFileDrop(event,\''+sec+'\',\''+key+'\','+i+')" '+
              'aria-label="Remove '+esc(f.name)+'">Remove</button>'+
          '</div>';
        }).join('') +
      '</div>'+
      '<div class="dzFileSum">'+
        '<span>'+list.length+' '+(pics ? 'image' : 'file')+(list.length === 1 ? '' : 's')+
          ' · '+esc(bytes(total) || '—')+(pics ? '' : ' · locked until purchased')+'</span>'+
        '<button type="button" class="dzFileAct" onclick="dzFileReplace(event,\''+sec+'\',\''+key+'\')">Add more</button>'+
        '<button type="button" class="dzFileAct dzFileActRm" onclick="dzFileClear(event,\''+sec+'\',\''+key+'\')">Clear all</button>'+
      '</div>';
  }

  function dzFileTooBig(f){
    if(!f || /^image\//.test(f.type || '')) return false;
    if(f.size <= dzAssetMax()) return false;
    showToast('That file is over ' + dzAssetMaxMb() + 'MB — ' +
              (dzTier() === 'max' ? 'pick a smaller one' : 'Max lifts this to 400MB'));
    return true;
  }

  function dzSetFile(sec, key, f){
    var s = st(sec);
    if(dzFileTooBig(f)) return;
    if(s.urls[key]){ dzRevoke(s.urls[key]); s.urls[key] = null; }
    s.files[key] = f || null;
    if(f && /^image\//.test(f.type||'')){
      try{ s.urls[key] = URL.createObjectURL(f); }catch(e){ s.urls[key] = null; }
    }
    dzRenderFile(sec, key);
  }

  function dzAddFiles(sec, key, files){
    var s = st(sec);
    var fd = dzField(sec, key), pics = !!fd && fd.t === 'images';
    var cap = pics ? DZ_GALLERY_MAX : DZ_SELL_MAX;
    var have = Array.isArray(s.files[key]) ? s.files[key] : [];
    if(!Array.isArray(s.urls[key])) s.urls[key] = [];
    var urls = s.urls[key];
    var seen = {}, full = false;
    have.forEach(function(f){ seen[f.name + '|' + f.size] = 1; });
    Array.prototype.forEach.call(files || [], function(f){
      if(!f) return;
      if(dzFileTooBig(f)) return;
      var k = f.name + '|' + f.size;
      if(seen[k]) return;
      if(have.length >= cap){ full = true; return; }
      seen[k] = 1;
      have.push(f);
      urls.push(pics && /^image\//.test(f.type||'')
        ? (function(){ try{ return URL.createObjectURL(f); }catch(e){ return null; } })()
        : null);
    });
    s.files[key] = have;
    if(full) showToast('That is the limit — ' + cap + (pics ? ' preview images' : ' files'));
    dzRenderFile(sec, key);
  }

  function dzFileDrop(e, sec, key, i){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    var s = st(sec);
    if(!Array.isArray(s.files[key])) return;
    s.files[key].splice(i, 1);
    if(Array.isArray(s.urls[key])){
      var gone = s.urls[key].splice(i, 1)[0];
      if(gone){ try{ URL.revokeObjectURL(gone); }catch(err){} }
    }
    var el = document.getElementById('dz_'+sec+'_'+key);
    if(el) el.value = '';
    dzRenderFile(sec, key);
  }

  function isMulti(sec, key){
    var fd = dzField(sec, key);
    return !!fd && (fd.t === 'files' || fd.t === 'images');
  }

  function dzPick(sec, key, input){
    if(typeof pfGuestGate === 'function' && pfGuestGate({preventDefault:function(){},stopPropagation:function(){}})) return;
    if(isMulti(sec, key)) dzAddFiles(sec, key, input.files);
    else dzSetFile(sec, key, input.files && input.files[0]);
  }

  function dzFileReplace(e, sec, key){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    var el = document.getElementById('dz_'+sec+'_'+key);
    if(el) el.click();
  }

  function dzFileClear(e, sec, key){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    var el = document.getElementById('dz_'+sec+'_'+key);
    if(el) el.value = '';
    if(isMulti(sec, key)){
      var s = st(sec);
      dzRevoke(s.urls[key]);
      s.files[key] = [];
      s.urls[key]  = [];
      dzRenderFile(sec, key);
      return;
    }
    dzSetFile(sec, key, null);
  }

  function dzRevoke(u){
    if(!u) return;
    if(Array.isArray(u)){
      u.forEach(function(x){ if(x){ try{ URL.revokeObjectURL(x); }catch(e){} } });
      return;
    }
    try{ URL.revokeObjectURL(u); }catch(e){}
  }

  function dzDragOver(e, id, on){
    if(e) e.preventDefault();
    var z = document.getElementById(id+'_z');
    if(z) z.classList.toggle('over', on);
  }
  function dzDragOn(e, id){ dzDragOver(e, id, true); }
  function dzDragOff(e, id){ dzDragOver(e, id, false); }
  function dzDropFile(e, sec, key){
    if(e) e.preventDefault();
    dzDragOff(e, 'dz_'+sec+'_'+key);
    if(typeof pfGuestGate === 'function' && pfGuestGate({preventDefault:function(){},stopPropagation:function(){}})) return;
    var dropped = (e && e.dataTransfer && e.dataTransfer.files) || null;
    if(isMulti(sec, key)){
      if(dropped && dropped.length) dzAddFiles(sec, key, dropped);
      return;
    }
    var f = dropped && dropped[0];
    if(!f) return;
    var el = document.getElementById('dz_'+sec+'_'+key);
    var acc = el ? String(el.getAttribute('accept')||'') : '';
    if(acc.indexOf('image/') === 0 && !/^image\//.test(f.type||'')){
      showToast('That field takes an image');
      return;
    }
    dzSetFile(sec, key, f);
  }

  function dzCopy(sec, row, names){
    names.split(/\s+/).filter(Boolean).forEach(function(name){
      var bits = name.split(':'), k = bits[0], how = bits[1] || '', v = val(sec, k);
      row[k] = how === ''   ? v
             : how === '[]' ? [v]
             : how === 'y'  ? v === 'yes'
             : how === 'Y'  ? v !== 'no'
             : how === 'b'  ? v === true
             : how === '#'  ? dzInt(v)
             : how === '.'  ? dzNum(v)
             : (v || how.slice(1) || null);
    });
  }

  function val(sec, k){
    var el = document.getElementById('dz_'+sec+'_'+k);
    if(!el) return '';
    if(el.type === 'checkbox') return el.checked;
    return String(el.value||'').trim();
  }
  function dzField(sec, k){
    var fds = FORMS[sec] ? FORMS[sec].fields : [];
    for(var i=0;i<fds.length;i++){ if(fds[i].k === k) return fds[i]; }
    return null;
  }
  function dzInt(v){
    var n = parseInt(v, 10);
    return isFinite(n) ? n : null;
  }
  function dzNum(v){
    if(String(v == null ? '' : v).trim() === '') return null;
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  var DZ_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function dzUuids(v){
    return String(v || '').split(',')
      .map(function(x){ return x.trim(); })
      .filter(function(x){ return DZ_UUID.test(x); })
      .slice(0, 10);
  }
  function dzReadMinutes(body){
    var words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.min(2000, Math.max(1, Math.round(words / 200) || 1));
  }
  function dzSeoTitle(title){
    var t = String(title || '').trim();
    if(t.length < 10) t = (t + ' — DigiArtz').trim();
    t = t.slice(0, 70);
    return t.length >= 10 ? t : null;
  }
  function dzSeoDesc(excerpt, body){
    var d = String(excerpt || '').trim();
    if(d.length < 50) d = String(body || '').replace(/\s+/g, ' ').trim();
    d = d.slice(0, 160);
    return d.length >= 50 ? d : null;
  }
  function dzSeoInto(row, title, summary, body, stamp){
    row.seo_title = dzSeoTitle(title);
    row.seo_description = dzSeoDesc(summary, body);
    row.slug = slugify(title).slice(0,110) + '-' + String(stamp).slice(-6);
  }
  async function dzAuthorBio(){
    if(!sb || !window.currentUser) return null;
    try{
      var res = await sb.from('profiles').select('bio').eq('id', currentUser.id).single();
      var bio = String((res && res.data && res.data.bio) || '').trim().slice(0, 500);
      return bio.length >= 20 ? bio : null;
    }catch(e){ return null; }
  }

  async function dzZipCount(file){
    try{
      if(!file || !/\.zip$/i.test(file.name||'') || !file.slice) return null;
      var tailLen = Math.min(file.size, 66000);
      var tail = await file.slice(file.size - tailLen).arrayBuffer();
      var dv = new DataView(tail), eocd = -1;
      for(var i = dv.byteLength - 22; i >= 0; i--){
        if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
      }
      if(eocd < 0) return null;
      var total  = dv.getUint16(eocd + 10, true);
      var cdSize = dv.getUint32(eocd + 12, true);
      var cdOff  = dv.getUint32(eocd + 16, true);
      if(total === 0xffff || cdOff === 0xffffffff) return null;
      if(!total || !cdSize) return null;
      var cd = await file.slice(cdOff, cdOff + cdSize).arrayBuffer();
      var cv = new DataView(cd), p = 0, files = 0, dec = new TextDecoder();
      for(var e = 0; e < total && p + 46 <= cv.byteLength; e++){
        if(cv.getUint32(p, true) !== 0x02014b50) break;
        var nameLen = cv.getUint16(p + 28, true);
        var extraLen = cv.getUint16(p + 30, true);
        var cmtLen = cv.getUint16(p + 32, true);
        var name = dec.decode(new Uint8Array(cd, p + 46, nameLen));
        if(!/\/$/.test(name)) files++;
        p += 46 + nameLen + extraLen + cmtLen;
      }
      return files || null;
    }catch(e){ return null; }
  }
  function dzImageDims(file){
    return new Promise(function(res){
      if(!file || !/^image\//.test(file.type||'') || typeof Image !== 'function'){ res(null); return; }
      var url = null, img = new Image(), done = false;
      function finish(v){
        if(done) return;
        done = true;
        if(url){ try{ URL.revokeObjectURL(url); }catch(e){} }
        res(v);
      }
      img.onload = function(){
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        finish(w && h ? (w + '×' + h + ' px') : null);
      };
      img.onerror = function(){ finish(null); };
      setTimeout(function(){ finish(null); }, 4000);
      try{ url = URL.createObjectURL(file); img.src = url; }catch(e){ finish(null); }
    });
  }

  function dzWebUrl(v){
    v = String(v || '').trim();
    if(!v) return '';
    if(/^https?:\/\//i.test(v)) return v;
    if(/^[a-z][a-z0-9+.-]*:/i.test(v)) return '';
    return 'https://' + v;
  }

  function dzIsFileType(t){
    return t === 'file' || t === 'image' || t === 'files' || t === 'images';
  }
  function dzPaintFiles(sec){
    (FORMS[sec] ? FORMS[sec].fields : []).forEach(function(fd){
      if(dzIsFileType(fd.t)) dzRenderFile(sec, fd.k);
    });
  }

  function dzResetForm(sec){
    var old = S[sec];
    if(old && old.urls) Object.keys(old.urls).forEach(function(k){ dzRevoke(old.urls[k]); });
    S[sec] = {tags:[], files:{}, urls:{}};
    dzAutoReset(sec);
    if(sec === 'jobs'){ dzJobGateMount(); return; }
    var box = document.getElementById('upSecForms');
    if(box) box.innerHTML = buildForm(sec);
    renderTags(sec);
    dzCountAll(sec);
    dzSchReset();
    dzDraftStrip(sec);
    dzSchedStrip(sec);
  }

  var dzSch = { y:null, m:null, d:null, vy:null, vm:null };
  var DZ_SCHED = {
    dd:'dzSchedDd', h:'dzSchedH', m:'dzSchedM', grid:'dzSchedGrid',
    mon:'dzSchedMon', lbl:'dzSchedLbl', hint:'dzSchedHint', val:'dzSchedVal',
    pick:'dzSchPick', iso:false, fmt:function(v){ return dzFmtWhen(v); },
    tail:'verified now, published at the set time.'
  };
  function dzSchToggle(e){
    if(e) e.stopPropagation();
    var dd = document.getElementById('dzSchedDd'); if(!dd) return;
    var open = dd.classList.toggle('open');
    if(open){
      if(dzSch.vy===null){ var n=new Date(); dzSch.vy=n.getFullYear(); dzSch.vm=n.getMonth(); }
      dzSchBuildTime(); dzSchRender();
    }
  }
  function dzSchClose(){ window.dzSchedUI.close(DZ_SCHED); }
  window.dzSchedUI.watchOutside(DZ_SCHED);
  function dzSchBuildTime(){ window.dzSchedUI.hours(DZ_SCHED); }
  function dzSchNav(delta,e){
    if(e) e.stopPropagation();
    window.dzSchedUI.nav(dzSch, delta);
    dzSchRender();
  }
  function dzSchRender(){ window.dzSchedUI.grid(DZ_SCHED, dzSch); }
  function dzSchPick(y,m,d,e){ if(e) e.stopPropagation(); dzSch.y=y; dzSch.m=m; dzSch.d=d; dzSchRender(); dzSchApply(); }
  function dzSchApply(){ window.dzSchedUI.apply(DZ_SCHED, dzSch); }
  function dzSchClear(e){
    if(e) e.stopPropagation();
    dzSch.y=dzSch.m=dzSch.d=null;
    var el=document.getElementById('dzSchedVal'); if(el) el.value='';
    dzSchRender(); dzSchHint(); dzSchClose();
  }
  function dzSchDone(e){ if(e) e.stopPropagation(); dzSchClose(); }
  function dzSchReset(){
    dzSch.y=dzSch.m=dzSch.d=null;
    var n=new Date(); dzSch.vy=n.getFullYear(); dzSch.vm=n.getMonth();
    var el=document.getElementById('dzSchedVal'); if(el) el.value='';
    dzSchClose(); dzSchHint();
  }
  function dzFmtWhen(iso){ return window.dzSchedUI.fmt(iso, true); }
  function dzSchHint(){ window.dzSchedUI.hint(DZ_SCHED); }
  function dzSchPicked(){ return window.dzSchedUI.picked(DZ_SCHED); }

  var dzdb = window.dzIdb('dzsecdrafts', 'd');

  function dzSaveDraft(sec){
    var s=st(sec), data={};
    FORMS[sec].fields.forEach(function(fd){
      if(fd.t==='tags'){ data.__tags=(s.tags||[]).slice(); return; }
      if(dzIsFileType(fd.t)) return;
      var el=document.getElementById('dz_'+sec+'_'+fd.k);
      if(!el) return;
      data[fd.k]= el.type==='checkbox' ? el.checked : el.value;
    });
    var when=dzSchPicked(); if(when) data.__sched=when;
    var title=String(data.title||'').trim();
    if(!title && !String(data.description||data.body||'').trim()){ showToast('Nothing to save yet'); return; }
    var rec={ id:'d_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
              sec:sec, title:title, data:data, savedAt:Date.now() };
    dzdb.put(rec).then(function(){ showToast('Draft saved'); dzDraftStrip(sec); })
                .catch(function(){ showToast('Could not save draft on this device'); });
  }
  function dzDeleteDraft(id){ dzdb.del(id).then(function(){ dzDraftStrip(upSec); }); }
  function dzFormReady(sec, cb){
    var tries = 0;
    (function poll(){
      if(document.getElementById('dzSubmit-'+sec)){ cb(true); return; }
      if(++tries > 60){ cb(false); return; }
      setTimeout(poll, 66);
    })();
  }

  function dzResumeDraft(id){
    dzdb.get(id).then(function(d){
      if(!d) return;
      upSwitchSection(d.sec);
      dzFormReady(d.sec, function(ok){
        if(!ok){
          showToast(d.sec === 'jobs'
            ? 'Posting a job needs Premium or Max — your draft is still saved'
            : 'Could not open that draft');
          return;
        }
        var s=st(d.sec); s.tags=(d.data.__tags||[]).slice();
        FORMS[d.sec].fields.forEach(function(fd){
          if(fd.t==='tags'||dzIsFileType(fd.t)) return;
          if(!(fd.k in d.data)) return;
          var el=document.getElementById('dz_'+d.sec+'_'+fd.k);
          if(!el) return;
          if(el.type==='checkbox') el.checked=!!d.data[fd.k]; else el.value=d.data[fd.k];
        });
        dzSelSyncAll(d.sec);
        renderTags(d.sec);
        dzCountAll(d.sec);
        upGrowAll();
        showToast('Draft loaded — re-attach any files, then publish');
      });
    });
  }

  function dzExcerpt(data){
    var v=data.description||data.body||data.excerpt||data.company||'';
    return String(v).replace(/\s+/g,' ').trim().slice(0,120);
  }
  function dzWhenAgo(ts){
    var s=Math.floor((Date.now()-ts)/1000);
    if(s<60) return 'just now';
    var m=Math.floor(s/60); if(m<60) return m+'m ago';
    var h=Math.floor(m/60); if(h<24) return h+'h ago';
    return Math.floor(h/24)+'d ago';
  }
  function dzDaysLeft(savedAt){
    return Math.max(1, Math.ceil((savedAt + 7*864e5 - Date.now())/864e5));
  }
  function dzMark(iso){
    var t=new Date(iso).getTime()-Date.now();
    if(t<=0) return 'now';
    var m=Math.round(t/60000); if(m<60) return m+'m';
    var h=Math.round(m/60);    if(h<24) return h+'h';
    return Math.round(h/24)+'d';
  }
  function dzDraftCard(d){
    var ex=dzExcerpt(d.data||{});
    var sched=d.data && d.data.__sched;
    var title=d.title||'Untitled';
    return '<div class="upDraftCard dzPCard" onclick="dzResumeDraft(\''+d.id+'\')" role="button" tabindex="0" '+
        'title="'+esc(title)+'" aria-label="Resume draft: '+esc(title)+'">'+
      '<button type="button" class="upDraftX" onclick="event.stopPropagation();dzDeleteDraft(\''+d.id+'\')" aria-label="Delete draft">✕</button>'+
      '<span class="upDraftExp">'+dzDaysLeft(d.savedAt)+'d</span>'+
      '<div class="dzPIn">'+
        '<div class="dzPTitle">'+esc(title)+'</div>'+
        (ex ? '<div class="dzPExc">'+esc(ex)+'</div>' : '')+
        '<div class="dzPMeta"><span class="dzPKind">'+esc(SEC[d.sec]?SEC[d.sec].noun:d.sec)+'</span>'+
          '<span>'+(sched ? '⏱ '+esc(dzFmtWhen(sched)) : dzWhenAgo(d.savedAt))+'</span></div>'+
      '</div>'+
    '</div>';
  }
  function dzSchedCard(sec, r){
    var t=r.payload||{}, err=r.publish_error;
    var title=t.title||'Untitled';
    var tip=title+' · '+(err ? err : dzFmtWhen(r.publish_at));
    return '<div class="upDraftCard dzPCard dzPSched'+(err?' upSchedBad':'')+'" '+
        'title="'+esc(tip)+'" aria-label="'+(err?'Failed: ':'Scheduled: ')+esc(title)+'">'+
      '<button type="button" class="upDraftX" onclick="dzCancelSched(\''+r.id+'\',\''+sec+'\')" aria-label="'+(err?'Dismiss':'Cancel schedule')+'">✕</button>'+
      '<span class="upDraftExp'+(err?'':' upSchedMark')+'">'+(err?'!':dzMark(r.publish_at))+'</span>'+
      '<div class="dzPIn">'+
        '<div class="dzPTitle">'+esc(title)+'</div>'+
        '<div class="dzPMeta"><span class="dzPKind">'+esc(SEC[sec]?SEC[sec].noun:sec)+'</span>'+
          (err ? '<span class="dzPErr">'+esc(err)+'</span>'
               : '<span>'+esc(dzFmtWhen(r.publish_at))+'</span>')+'</div>'+
      '</div>'+
    '</div>';
  }
  function dzDraftStrip(sec){
    var row=document.getElementById('dzDraftRow-'+sec); if(!row) return;
    dzdb.all().then(function(all){
      all=(all||[]).filter(function(d){ return d.sec===sec; });
      var cutoff=Date.now()-7*864e5, keep=[];
      all.forEach(function(d){ if(d.savedAt<cutoff) dzdb.del(d.id); else keep.push(d); });
      keep.sort(function(a,b){ return b.savedAt-a.savedAt; });
      var html=keep.map(dzDraftCard).join('');
      for(var i=keep.length;i<4;i++) html+=dzGhostCard();
      row.innerHTML=html;
    }).catch(function(){   });
  }
  async function dzSchedStrip(sec){
    var row=document.getElementById('dzSchedRow-'+sec); if(!row) return;
    if(!sb || !window.currentUser){ row.innerHTML=dzSchedGhost4(); return; }
    try{
      var res=await sb.from('scheduled_sections')
        .select('id,payload,publish_at,publish_error')
        .eq('user_id', currentUser.id).eq('section', sec)
        .order('publish_at', {ascending:true});
      var rows=(res && res.data) || [];
      var html=rows.map(function(r){ return dzSchedCard(sec, r); }).join('');
      for(var i=rows.length;i<4;i++) html+=dzSchedGhostCard();
      row.innerHTML=html;
    }catch(e){ row.innerHTML=dzSchedGhost4(); }
  }
  async function dzCancelSched(id, sec){
    if(!sb) return;
    try{
      var got=await sb.from('scheduled_sections').select('storage_paths').eq('id', id).single();
      var paths=(got && got.data && got.data.storage_paths) || [];
        // Row goes first and its failure stops here: sweeping files off a schedule the database kept leaves it queued with nothing
      var del=await sb.from('scheduled_sections').delete().eq('id', id);
      if(del && del.error) throw del.error;
      if(Array.isArray(paths) && paths.length && typeof s3Delete==='function'){
          // s3Delete answers with a promise, so its failure is caught on the promise, not by a try around the call
        paths.forEach(function(p){
          s3Delete(BUCKET, p).catch(function(sweep){
            console.warn('scheduled file not removed:', (sweep && sweep.message) || sweep);
          });
        });
      }
      showToast('Schedule cancelled');
      dzSchedStrip(sec);
    }catch(e){ showToast('Could not cancel'); }
  }

  function dzLimits(sec){
    var fds = FORMS[sec] ? FORMS[sec].fields : [];
    for(var i=0;i<fds.length;i++){
      var fd = fds[i];
      if(fd.t === 'chk' || fd.t === 'tags' || fd.t === 'pick' ||
         fd.t === 'list' || fd.t === 'auto' || dzIsFileType(fd.t)) continue;
      if(!dzCondShow(sec, fd)) continue;
      var el = document.getElementById('dz_'+sec+'_'+fd.k);
      if(!el) continue;
      var raw = String(el.value == null ? '' : el.value).trim();

      if(fd.t === 'int' || fd.t === 'money'){
        if(!raw) continue;
        var n = parseFloat(raw);
        if(!isFinite(n)) return {k:fd.k, msg:fd.label+' takes a number'};
        if(fd.nmin != null && n < fd.nmin) return {k:fd.k, msg:fd.label+' cannot be below '+fd.nmin};
        if(fd.nmax != null && n > fd.nmax) return {k:fd.k, msg:fd.label+' cannot be above '+fd.nmax};
        continue;
      }
      if(!raw) continue;
      if(fd.min && raw.length < fd.min){
        return {k:fd.k, msg:fd.label+' needs at least '+fd.min+' characters — it has '+raw.length};
      }
      if(fd.max && raw.length > fd.max){
        return {k:fd.k, msg:fd.label+' is limited to '+fd.max+' characters'};
      }
    }
    return null;
  }
  function dzFieldFail(sec, k, msg){
    showToast(msg);
    var el = document.getElementById('dz_'+sec+'_'+k);
    if(!el) return;
    var card = el.closest ? el.closest('.upField') : null;
    if(card && card.scrollIntoView){
      try{ card.scrollIntoView({behavior:'smooth', block:'center'}); }
      catch(e){ card.scrollIntoView(); }
    }
    if(el.type !== 'hidden'){ try{ el.focus({preventScroll:true}); }catch(e){ try{ el.focus(); }catch(e2){} } }
    dzCountPaint(el);
  }

  var dzV = {
    title:'', safety:'', safetySub:'', transfer:'', publish:'', failReason:null, held:false,
    recvLabel:'File & preview received',
    noun:'upload',
    reset:function(t){
      this.title=t||'Upload'; this.safety='run'; this.safetySub='';
      this.transfer=''; this.publish=''; this.publishSub=''; this.failReason=null;
      this.held=false;
    },
    open:function(t, recv){
      this.reset(t);
      this.recvLabel = recv || 'File & preview received';
      var bd=document.getElementById('upqBackdrop'); if(bd) bd.classList.add('open');
      this.render();
    },
    close:function(){
      if(typeof upqCloseModal==='function'){ upqCloseModal(); return; }
      var bd=document.getElementById('upqBackdrop'); if(bd) bd.classList.remove('open');
    },
    step:function(k,state,sub){ this[k]=state; if(sub!=null) this[k+'Sub']=sub; this.render(); },
    fail:function(reason){
      this.failReason=reason;
      var bd=document.getElementById('upqBackdrop'); if(bd) bd.classList.add('open');
      this.render();
    },
    render:function(){
      var t=document.getElementById('upqMTitle'), b=document.getElementById('upqMBody');
      if(!t||!b) return;
      var trk=(typeof upqTrackRow==='function') ? upqTrackRow
              : function(st,n,sub){ return '<div>'+esc(n)+'</div>'; };
      var failed=!!this.failReason, held=!!this.held, html='';
      t.textContent = failed ? 'VERIFICATION FAILED' : 'VERIFICATION STATUS';
      if(failed){
        html+='<div class="upqFailBox"><div class="upqFailIco">!</div>'+
          '<div><div class="upqFailTitle">\u201C'+esc(this.title||'Untitled')+'\u201D was not published</div>'+
          '<div class="upqFailReason">'+esc(this.failReason)+'</div></div></div>';
      }
      html+=trk('pass','Upload received','',false);
      html+=trk('pass', this.recvLabel || 'File & preview received', '', false);
      html+=trk(this.safety,'Content safety check', held ? 'Waiting for the review to run' : this.safetySub, false);
      html+=trk(this.transfer,'Secure transfer','',false);
      var pubSub = (this.publish==='pass') ? (this.publishSub || 'It\u2019s live') : '';
      var sched  = /^Scheduled/.test(this.publishSub || '');
      html+=trk(this.publish,'Publish', pubSub, true);
      if(failed){
        html+='<div class="upqFin fail">Verification stopped \u2014 nothing was published</div>';
        html+='<div class="upqFailNote">Any transferred file has been removed. Fix the issue above and publish again whenever you\u2019re ready.</div>';
      } else if(held){
        html+='<div class="upqFin busy">Review is currently unavailable \u2014 your '+esc(this.noun)+' is waiting in the queue</div>';
        html+='<div class="upqFailNote">Moderation is temporarily down. \u201C'+esc(this.title||'Untitled')+'\u201D has been saved and will go through the review automatically as soon as it is back, in the order it was uploaded. You do not need to upload it again \u2014 it will appear once it passes.</div>';
      } else if(this.publish==='pass'){
        html+='<div class="upqFin ok">'+(sched ? 'All checks passed \u2014 '+esc(this.publishSub) : 'All checks passed \u2014 it\u2019s live')+'</div>';
      } else {
        html+='<div class="upqFin busy">Reviewing your upload now\u2026</div>';
      }
      b.innerHTML=html;
    }
  };

  async function dzSubmit(sec){
    if(!sb){ showToast('Backend not configured'); return; }
    if(!window.currentUser){
      if(typeof pfGuestGate === 'function') pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return;
    }

    if(sec === 'jobs'){
      var jq = null;
      try{ jq = await dzJobQuota(true); }catch(e){ jq = null; }
      if(jq && !jq.allowed){
        showToast(jq.reason === 'limit'
          ? 'You have used this month\u2019s job postings'
          : 'Posting a job needs Premium or Max');
        dzJobGateApply(jq);
        return;
      }
    }

    var btn = document.getElementById('dzSubmit-'+sec);
    var s = st(sec), row = {user_id: currentUser.id, tags: s.tags, status:'approved'};
      // Reassigned below once the content check has run: an upload the moderator could not see is written pending.
    function dzHoldRow(){ if(held) row.status = 'pending'; }

    var miss = FORMS[sec].fields.filter(function(fd){
      if(!fd.req || !dzCondShow(sec, fd)) return false;
      if(fd.t === 'files' || fd.t === 'images') return !(s.files[fd.k] || []).length;
      if(fd.t === 'file' || fd.t === 'image') return !s.files[fd.k];
      var v = val(sec, fd.k);
      if((fd.t === 'int' || fd.t === 'money') && v === '0') return false;
      return !v;
    });
    if(miss.length){ dzFieldFail(sec, miss[0].k, 'Missing: ' + miss[0].label); return; }

    var bad = dzLimits(sec);
    if(bad){ dzFieldFail(sec, bad.k, bad.msg); return; }

    if(btn){ btn.disabled = true; btn.textContent = 'Publishing…'; }
    var modImg = null, modMode = null, modRecv = 'File & preview received';
    if(sec === 'resources'){   modImg = st(sec).files.preview; modMode = 'resource'; }
    else if(sec === 'marketplace'){ modImg = st(sec).files.preview; modMode = 'marketplace'; }
    else if(sec === 'blog'){   modImg = st(sec).files.cover;   modMode = 'artwork'; modRecv = 'Cover image received'; }
    var moderated = !!modImg;
    var held = false;
      // Every object this submit puts in storage, so a submit that fails on the way to the database takes them back out —
      // the failure panel says so. Declared out here because the catch reads it however early the throw came.
    var landedFiles = [];
    try{
      if(moderated){
        dzV.open(val(sec,'title') || SEC[sec].noun, modRecv);

        if(window.UploadVerifier && typeof UploadVerifier.scanAIMeta === 'function'){
          var aiHits = [];
          try{ aiHits = (await UploadVerifier.scanAIMeta(modImg)) || []; }catch(e){ aiHits = []; }
          if(aiHits.length){
            dzV.step('safety','fail','AI markers: ' + aiHits.slice(0,2).join(', '));
            throw new Error('The image looks AI-generated (' + aiHits.slice(0,2).join(', ') + ').' +
              (modMode === 'artwork'
                ? ' DigiArtz does not accept AI art — please upload artwork you made yourself.'
                : ' DigiArtz resources need a real preview of the asset — a 3D render is fine, AI-generated art is not.'));
          }
        }

        var mFd = new FormData();
        mFd.append('files', modImg);
        mFd.append('mode', modMode);
        var mSess = (await sb.auth.getSession()).data.session;
        var mRes = await fetch('/api/moderate-upload', {
          method:'POST',
          headers:{ 'authorization':'Bearer ' + (mSess ? mSess.access_token : '') },
          body: mFd
        });
        var mod = await mRes.json().catch(function(){ return null; });
        if(!mRes.ok || !mod){
          dzV.step('safety','fail','Review service unavailable');
          throw new Error((mod && mod.error) || 'Content check failed — please try again.');
        }
        if(mod.deferred){
            // Moderator unreachable. Upload is kept and written pending; the queue picks it up when moderation is back.
          held = true;
          dzV.noun = SEC[sec].noun || 'upload';
          dzV.held = true;
          dzV.step('safety','', '');
        } else if(!mod.allowed){
          var devNote = (typeof isDev !== 'undefined' && isDev && mod.code) ? ('Code: ' + mod.code) : '';
          dzV.step('safety','fail', devNote);
          throw new Error(mod.reason || 'This upload did not pass the content check.');
        } else {
          dzV.step('safety','pass', mod.rating === 'MATURE' ? 'Approved · 18+' : 'Safe for all audiences');
        }
        dzV.step('transfer','run');
      }

      var stamp = Date.now();
      var base  = safeSlug(val(sec,'title') || sec, 60) || sec;

      async function put(key, prefix){
        var f = s.files[key]; if(!f) return null;
        var ext = safeSlug((f.name.split('.').pop()||'bin'), 10);
        var path = prefix+'/'+currentUser.id+'/'+stamp+'_'+base+'.'+ext;
        var url  = await s3Upload(BUCKET, path, f);
        landedFiles.push({bucket: BUCKET, path: path});
        return {url:url, path:path, name:f.name, ext:ext, size:f.size};
      }

      async function putPrivate(f, prefix, i){
        var ext = safeSlug((f.name.split('.').pop()||'bin'), 10);
        var path = prefix+'/'+currentUser.id+'/'+stamp+'_'+i+'_'+safeSlug(f.name.replace(/\.[^.]+$/,''), 40)+'.'+ext;
        var opts = {private:true};
        await s3Upload(BUCKET, path, f, opts);
        var landed = opts.landed || {};
        var out = {
          bucket: landed.bucket || 'koe-originals',
          path: landed.path || path,
          name: f.name, ext: ext, size: f.size, mime: f.type || null
        };
        landedFiles.push({bucket: out.bucket, path: out.path});
        return out;
      }

      var pendingMedia = [];
      var pendingSell = [];

      if(sec === 'resources'){
        var rSched = window.dzVisibilitySchedule(val(sec,'visibility'), dzSchPicked(),
                                                 'resource is not listed');
        if(rSched.error) throw new Error(rSched.error);
        var rVis = rSched.vis;

        var rCount = await dzZipCount(s.files.file);
        var rDims  = await dzImageDims(s.files.preview);

        var rf = await putPrivate(s.files.file, 'resources', 0);
        var rp = await put('preview','resources');
        dzCopy(sec, row,
          'title summary description whats_included resource_type:? category:[] ' +
          'subcategory:? license:?personal commercial_use:y attribution_required:y ' +
          'modification_allowed:Y software:? compatible_versions:? instructions:? ' +
          'version:? safety_notes:? featured:b');
        row.compatible_software = dzRefList('dz_resources_compatible_software').slice(0, 10);
        row.external_links = dzRefList('dz_resources_external_links').slice(0, 5);
        row.visibility = rVis;
        row.file_url = null;
        row.file_storage_bucket = rf.bucket; row.file_storage_path = rf.path;
        row.file_name = rf.name; row.file_ext = rf.ext; row.file_size = rf.size;
        row.file_count = rCount;
        row.dimensions = rDims;
        dzSeoInto(row, val(sec,'title'), val(sec,'summary'), val(sec,'description'), stamp);
        if(rp){ row.preview_url = rp.url; row.preview_storage_path = rp.path; }
        pendingMedia.push({ fileKind:'resourceFile', url:rf.url, path:rf.path, file:s.files.file });
        if(rp) pendingMedia.push({ imageKind:'resourceImage', url:rp.url, path:rp.path, file:s.files.preview });
      }
      else if(sec === 'blog'){
        var bTitle = val(sec,'title');
        var body = val(sec,'body');
        var bExcerpt = val(sec,'excerpt');
        var bSched = window.dzVisibilitySchedule(val(sec,'visibility'), dzSchPicked(),
                                                 'post is not listed');
        if(bSched.error) throw new Error(bSched.error);
        var bVis = bSched.vis, bWhen = bSched.when;

        var bc = await put('cover','blog');

        dzCopy(sec, row, 'category:[] content_type:?Article featured:b');
        row.title = bTitle; row.body = body;
        row.excerpt = bExcerpt;
        row.tags = s.tags;
        row.related_artworks = dzUuids(val(sec,'related_artworks'));
        row.related_items = dzUuids(val(sec,'related_items'));
        row.external_refs = dzRefList('dz_blog_external_refs').slice(0, 20);
        row.visibility = bVis;
        dzSeoInto(row, bTitle, bExcerpt, body, stamp);
        row.read_minutes = dzReadMinutes(body);
        row.author_bio = await dzAuthorBio();
        row.published_at = bWhen ? new Date(bWhen).toISOString() : new Date().toISOString();

        if(bc){ row.cover_url = bc.url; row.cover_storage_path = bc.path; }
        if(bc) pendingMedia.push({ imageKind:'blogImage', url:bc.url, path:bc.path, file:s.files.cover });
      }
      else if(sec === 'marketplace'){
        var type = val(sec,'item_type') || 'digital';
        var isSvc = !!ITEM_SERVICE[type];
        var sell = (type === 'digital') ? (s.files.files || []) : [];
        if(type === 'digital' && !sell.length){ throw new Error('A digital download needs at least one file'); }
        if(sell.length > DZ_SELL_MAX){ throw new Error('A listing can carry at most '+DZ_SELL_MAX+' files'); }

        var gal = s.files.gallery || [];
        if(gal.length > DZ_GALLERY_MAX){
          throw new Error('A listing can carry at most '+DZ_GALLERY_MAX+' extra preview images');
        }

        var mkPrice = parseFloat(val(sec,'price'));
        if(!isFinite(mkPrice)) throw new Error('Add a price — enter 0 to list it free');
        var mkCents = Math.round(mkPrice * 100);

        var saleRaw = val(sec,'sale_price');
        var saleCents = null;
        if(saleRaw !== ''){
          var saleNum = parseFloat(saleRaw);
          if(!isFinite(saleNum)) throw new Error('That sale price is not a number');
          saleCents = Math.round(saleNum * 100);
          if(saleCents >= mkCents) throw new Error('The sale price has to be below the price');
        }

        var mkUrl  = dzWebUrl(val(sec,'apply_url'));
        var mkMail = val(sec,'apply_email');
        if(isSvc){
          if(!mkUrl && !mkMail) throw new Error('A commission or service needs an application link or email');
          if(mkMail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mkMail)) throw new Error('That application email does not look right');
          if(mkUrl && (mkUrl.length < 10 || mkUrl.length > 200)) throw new Error('The application link has to be 10–200 characters');
        }

        var mp = await put('preview','market');

        for(var si = 0; si < sell.length; si++){
          pendingSell.push(await putPrivate(sell[si], 'market', si));
        }

        var galRows = [];
        for(var gi = 0; gi < gal.length; gi++){
          var gext = safeSlug((gal[gi].name.split('.').pop()||'jpg'), 10);
          var gpath = 'market/'+currentUser.id+'/'+stamp+'_g'+gi+'_'+base+'.'+gext;
          var gurl = await s3Upload(BUCKET, gpath, gal[gi]);
          galRows.push({ url:gurl, path:gpath, name:gal[gi].name, size:gal[gi].size });
          pendingMedia.push({ imageKind:'marketImage', url:gurl, path:gpath, file:gal[gi] });
        }

        dzCopy(sec, row,
          'title description summary buyer_gets file_format category:[] subcategory:? ' +
          'product_type:? file_count:# file_size_mb:. dimensions:? software:? ' +
          'source_files_included:b license:?standard commercial_use:Y personal_use:b ' +
          'modification_allowed:b attribution_required:b stock:# delivery_type:?instant ' +
          'delivery_notes:? custom_requests:b revision_count:# support_period:? ' +
          'refund_policy:? preview_watermark:b safety_notes:? seller_note:? ' +
          'visibility:?published featured:b closing_date:? internal_notes:?');
        row.item_type = type;
        row.price_cents = mkCents;
        row.sale_price_cents = saleCents;
        row.currency = val(sec,'currency') || dzPrefCurrency();
        row.delivery_days = isSvc ? dzInt(val(sec,'delivery_days')) : null;
        row.apply_url = isSvc ? (mkUrl || null) : null;
        row.apply_email = isSvc ? (mkMail || null) : null;
        dzSeoInto(row, val(sec,'title'), val(sec,'summary'), val(sec,'description'), stamp);
        if(galRows.length) row.gallery = galRows;
        if(pendingSell.length){
          var totalBytes = 0;
          pendingSell.forEach(function(x){ totalBytes += x.size || 0; });
          row.file_storage_path = pendingSell[0].path;
          row.file_name = pendingSell[0].name;
          row.file_ext  = pendingSell[0].ext;
          row.file_size = totalBytes;
        }
        if(mp){ row.preview_url = mp.url; row.preview_storage_path = mp.path; }
        if(mp) pendingMedia.push({ imageKind:'marketImage', url:mp.url, path:mp.path, file:s.files.preview });
      }
      else if(sec === 'jobs'){
        var mode   = val(sec,'work_mode') || 'remote';
        var remote = mode === 'remote';
        var countries = remote
          ? val(sec,'applicant_countries').split(',')
              .map(function(x){ return x.trim().toUpperCase(); }).filter(Boolean)
          : [];
        var cc   = remote ? '' : val(sec,'location_country').toUpperCase();
        var city = remote ? '' : val(sec,'location_city');
        var url  = dzWebUrl(val(sec,'apply_url'));
        var mail = val(sec,'apply_email');
        var site = dzWebUrl(val(sec,'company_url'));

        if(!url && !mail) throw new Error('Add an apply link or an email');
        if(mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) throw new Error('That apply email does not look right');
        if(url && (url.length < 10 || url.length > 200)) throw new Error('The apply link has to be 10–200 characters');
        if(site && (site.length < 5 || site.length > 200)) throw new Error('The company website has to be 5–200 characters');
        if(remote && !countries.length) throw new Error('A remote role needs at least one eligible country');
        if(!remote && cc.length !== 2) throw new Error('Add a two-letter country code');
        if(countries.length > 60) throw new Error('That is too many eligible countries — list up to 60');

        var payFrom = parseFloat(val(sec,'salary_min'));
        var payTo   = parseFloat(val(sec,'salary_max'));
        if(!isFinite(payFrom) || !isFinite(payTo)) throw new Error('Add a pay range');
        if(payTo < payFrom) throw new Error('Pay to cannot be lower than pay from');

        var closes = val(sec,'valid_through');
        if(!closes) throw new Error('Add a closing date');
        if(new Date(closes+'T23:59:59').getTime() < Date.now()){
          throw new Error('The closing date has already passed');
        }

        dzCopy(sec, row,
          'title company about_company description responsibilities requirements ' +
          'required_skills timezone working_hours application_instructions ' +
          'application_materials category:[] employment_type:?CONTRACTOR ' +
          'experience_level:? years_experience:# openings:# nice_to_have_skills:? ' +
          'benefits:? schedule:? start_date:? salary_currency:?USD salary_unit:?MONTH ' +
          'application_questions:? portfolio_required:b resume_required:b ' +
          'cover_letter_required:b visibility:?public featured:b');
        row.company_url = site || null;
        row.work_mode = mode;
        row.is_remote = remote;
        row.location_city = city || null;
        row.location_country = cc || null;
        row.applicant_countries = countries;
        row.contract_duration = dzCondShow(sec, dzField(sec,'contract_duration'))
          ? (val(sec,'contract_duration') || null) : null;
        row.salary_min = payFrom;
        row.salary_max = payTo;
        row.apply_url = url || null; row.apply_email = mail || null;
        row.valid_through = closes;
      }

      var when = dzSchPicked();
        // Same as the artwork queue: publish_due_scheduled_sections writes the row in as approved, so unreviewed must not take that path
      if(when && held) throw new Error('Moderation is temporarily unavailable, so this cannot be scheduled right now. Publish it now and it will be reviewed automatically as soon as moderation is back, or try scheduling again shortly.');
      if(when){
        if(moderated){ dzV.step('transfer','pass'); dzV.step('publish','run'); }
        var payload = {}; for(var pk in row){ if(pk!=='status') payload[pk]=row[pk]; }
        var paths = [];
        ['file_storage_path','preview_storage_path','cover_storage_path'].forEach(function(k){ if(row[k]) paths.push(row[k]); });
        pendingSell.forEach(function(x){ paths.push(x.path); });
        if(Array.isArray(row.gallery)) row.gallery.forEach(function(g){ if(g && g.path) paths.push(g.path); });
        var sres = await sb.from('scheduled_sections').insert({
          user_id: currentUser.id, section: sec, payload: payload,
          storage_paths: paths, publish_at: new Date(when).toISOString(),
          sell_files: pendingSell.length ? pendingSell.map(function(x){
            return { bucket:x.bucket || 'koe-originals', path:x.path, name:x.name, mime:x.mime, bytes:x.size };
          }) : null
        }).select('id').single();
        if(sres.error) throw sres.error;
        if(moderated){ dzV.step('publish','pass','Scheduled for '+dzFmtWhen(when)); setTimeout(function(){ dzV.close(); }, 1400); }
        showToast('Scheduled for '+dzFmtWhen(when));
        if(sec === 'jobs') dzJobQuotaForget();
        dzResetForm(sec);
        return;
      }

      if(moderated){ dzV.step('transfer','pass'); dzV.step('publish','run'); }
      dzHoldRow();
      var res = await sb.from(SEC[sec].table).insert(row).select('id').single();
      if(res.error) throw res.error;
      if(held && typeof window.dzModQueueKick === 'function') window.dzModQueueKick();

      if(pendingSell.length && res.data && res.data.id){
        var sellRows = pendingSell.map(function(x, i){
          return {
            user_id: currentUser.id, item_id: res.data.id,
            storage_bucket: x.bucket || 'koe-originals', storage_path: x.path,
            original_filename: String(x.name || 'file').slice(0, 260),
            mime: x.mime || null, bytes: x.size || null, position: i
          };
        });
        var fres = await sb.from('marketplace_file').insert(sellRows);
        if(fres.error){
          await sb.from('marketplace_items').delete().eq('id', res.data.id);
          throw new Error('Could not attach your files — nothing was published. ' +
                          (fres.error.message || ''));
        }
      }

        // Row is in and the marketplace files landed with it. Past this line the uploads belong to a published record
      landedFiles.length = 0;

      if(res.data && res.data.id){
        for(var pmi=0; pmi<pendingMedia.length; pmi++){
          pendingMedia[pmi].parentId = res.data.id;
          await dzRecordUpload(pendingMedia[pmi]);
        }
      }

      if(moderated && !held){ dzV.step('publish','pass'); setTimeout(function(){ dzV.close(); }, 1400); }
      else if(held){ dzV.step('publish',''); dzV.render(); }
      showToast('Published');
      if(sec === 'jobs') dzJobQuotaForget();
      dzResetForm(sec);
      dzLoaded[sec] = false;
      var cPub = dzc();
      if(cPub){ try{ await cPub.invalidateSection(sec, res.data && res.data.id); }catch(e3){} }
    }catch(err){
      for(var ci=0; ci<landedFiles.length; ci++){
        try{ await s3Delete(landedFiles[ci].bucket, landedFiles[ci].path); }
        catch(sweep){ console.error('publish cleanup:', (sweep && sweep.message) || sweep); }
      }
      if(sec === 'jobs') dzJobQuotaForget();
      if(moderated){ dzV.fail((err && err.message) ? err.message : 'Could not publish'); }
      else { showToast((err && err.message) ? err.message : 'Could not publish'); }
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '📤 Publish'; }
    }
  }

  var UP_GROW_MAX = 460;
  function upGrow(el){
    if(!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    var h = el.scrollHeight;
    el.style.height = Math.min(h, UP_GROW_MAX) + 'px';
    el.style.overflowY = h > UP_GROW_MAX ? 'auto' : 'hidden';
  }
  function upGrowAll(){
    var els = document.querySelectorAll('#pfUpMod textarea');
    for(var i=0;i<els.length;i++) upGrow(els[i]);
  }
  document.addEventListener('input', function(e){
    var t = e.target;
    if(t && t.tagName === 'TEXTAREA' && t.closest && t.closest('#pfUpMod')) upGrow(t);
  }, true);

  (function(){
    var orig = window.openPfUpload;
    if(typeof orig !== 'function') return;
    window.openPfUpload = function(sec){
      dzEditClose();
      var r = orig.apply(this, arguments);
      if(!SEC_COLOR[sec]) sec = 'artwork';
      try{ upSwitchSection(sec, sec === 'artwork'); }catch(e){}
        // After the switch: on artwork the automatic panel is only in the DOM once
        // dzArtExtras has filled its slot
      dzUpEditChrome(false);
      return r;
    };
  })();

    // closePfUpload reads pfUpEditId to decide whether it was an edit, so the
    // edit state is torn down after the original has had its look at it
  (function(){
    var orig = window.closePfUpload;
    if(typeof orig !== 'function') return;
    window.closePfUpload = function(){
      var r = orig.apply(this, arguments);
      dzEditClose();
      return r;
    };
  })();

  window.dzSecEnter      = dzSecEnter;
  window.dzSecRender     = dzSecRender;
  window.upSwitchSection = upSwitchSection;
  window.dzJobQuota        = dzJobQuota;
  window.dzJobQuotaForget  = dzJobQuotaForget;
  window.dzJobGateSubscribe= dzJobGateSubscribe;
  window.dzJobGateSignIn   = dzJobGateSignIn;
  window.upGuideOpen     = upGuideOpen;
  window.upGuideClose    = upGuideClose;
  window.upGuideBackdrop = upGuideBackdrop;
  window.upGrow          = upGrow;
  window.upGrowAll       = upGrowAll;
  window.dzSelToggle     = dzSelToggle;
  window.dzSelPick       = dzSelPick;
  window.dzCondApply     = dzCondApply;
  window.dzCloseMenus    = dzCloseMenus;
  window.dzPickToggle    = dzPickToggle;
  window.dzPickSet       = dzPickSet;
  window.dzRefKey        = dzRefKey;
  window.dzRefDel        = dzRefDel;
  window.dzRefMenu       = dzRefMenu;
  window.dzRefOpt        = dzRefOpt;
  window.dzZipCount      = dzZipCount;
  window.dzImageDims     = dzImageDims;
  window.dzArtExtras     = dzArtExtras;
  window.dzArtReset      = dzArtReset;
  window.dzArtValidate   = dzArtValidate;
  window.dzArtValues     = dzArtValues;
  window.dzArtSnapshot   = dzArtSnapshot;
  window.dzArtRestore    = dzArtRestore;
  window.dzArtFromRow    = dzArtFromRow;
  window.dzAutoScan      = dzAutoScan;
  window.dzAutoPaint     = dzAutoPaint;
  window.dzAutoReset     = dzAutoReset;
  window.dzFieldFail     = dzFieldFail;
  window.dzSeoTitle      = dzSeoTitle;
  window.dzSeoDesc       = dzSeoDesc;
  window.dzSlugify       = slugify;
  window.dzSubmit        = dzSubmit;
  window.dzOpenEdit      = dzOpenEdit;
  window.dzSaveEdit      = dzSaveEdit;
  window.dzEditCancel    = dzEditCancel;
  window.dzEditClose     = dzEditClose;
  window.upGuideBtnShow  = upGuideBtnShow;
  window.dzUpEditChrome  = dzUpEditChrome;
  window.dzResetForm     = dzResetForm;
  window.dzTagKey        = dzTagKey;
  window.dzTagBlur       = dzTagBlur;
  window.dzTagPaste      = dzTagPaste;
  window.dzTagDel        = dzTagDel;
  window.dzPick          = dzPick;
  window.dzFileReplace   = dzFileReplace;
  window.dzFileClear     = dzFileClear;
  window.dzFileDrop      = dzFileDrop;
  window.dzDragOn        = dzDragOn;
  window.dzDragOff       = dzDragOff;
  window.dzDropFile      = dzDropFile;
  window.dzSaveDraft     = dzSaveDraft;
  window.dzResumeDraft   = dzResumeDraft;
  window.dzDeleteDraft   = dzDeleteDraft;
  window.dzCancelSched   = dzCancelSched;
  window.dzSchToggle     = dzSchToggle;
  window.dzSchNav        = dzSchNav;
  window.dzSchPick       = dzSchPick;
  window.dzSchApply      = dzSchApply;
  window.dzSchClear      = dzSchClear;
  window.dzSchDone       = dzSchDone;
  window.dzGetRows = function(sec){ return dzSecRows[sec] || []; };
  window.dzSecReset = function(sec){
    if(sec){ delete dzSecRows[sec]; dzLoaded[sec] = false; dzBusy[sec] = false; }
    var host = sec && document.getElementById('fgSecC-'+sec);
    if(host && host.children.length) dzSecLoad(sec);
  };
  window.dzSecCard   = function(sec, row){ return SEC[sec] ? card(sec, row) : ''; };
  window.dzSecLayout = function(sec){
    return (SEC[sec] && SEC[sec].kind === 'grid') ? 'dzGrid' : 'dzList';
  };
  window.dzHelpers = { money:money, bytes:bytes, ago:ago };
})();

(function(){
  'use strict';

  var done = false, inflight = null;

  function bytes(n){
    return (window.dzHelpers && window.dzHelpers.bytes) ? window.dzHelpers.bytes(n) : '';
  }

  function inject(code){
    var url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = url;
      s.onload = function(){ URL.revokeObjectURL(url); res(true); };
      s.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('load failed')); };
      document.head.appendChild(s);
    });
  }

  function load(){
    if(done) return Promise.resolve(true);
    if(inflight) return inflight;
    inflight = (async function(){
      if(!sb) return false;
      var s = await sb.auth.getSession();
      var session = s && s.data && s.data.session;
      if(!session) return false;
      var res = await fetch('/api/store', {
        headers:{ authorization:'Bearer '+session.access_token },
        cache:'no-store'
      });
        // The edge answers with JavaScript. A routing miss falls through to the SPA shell and injecting that only raises a parse error
      if(!res.ok || !/javascript|ecmascript/i.test(res.headers.get('content-type') || '')) return false;
      await inject(await res.text());
      done = true;
      return true;
    })().catch(function(){ return false; })
       .then(function(ok){ if(!ok) inflight = null; return ok; });
    return inflight;
  }

  window.dzExtras = function(){
    return load().then(function(ok){
      if(ok && typeof window.dzFill === 'function') window.dzFill();
      return ok;
    });
  };

  if(sb && sb.auth){
    window.dzExtras();
    if(typeof window.dzCartCount === 'function') window.dzCartCount();
    var dzLastAuthId = (window.currentUser && currentUser.id)
      ? String(currentUser.id) : 'guest';
    sb.auth.onAuthStateChange(function(_ev, session){
      var nowId = (session && session.user && session.user.id)
        ? String(session.user.id) : 'guest';
      if(nowId === dzLastAuthId) return;
      dzLastAuthId = nowId;
      if(typeof window.dzSecReset === 'function') window.dzSecReset('marketplace');
      if(typeof window.dzCartCount === 'function') window.dzCartCount();
      if(session) window.dzExtras();
      else { done = false; inflight = null; }
    });
  }

  var dzMarketSave = window.dzSaveBlob;

  window.dzMarketFetch = async function(item, file, name, btn){
    if(!sb || !window.currentUser){
      if(typeof pfGuestGate === 'function')
        pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return false;
    }
    if(btn){ btn.disabled = true; btn.setAttribute('aria-busy','true'); }
    try{
      var s = await sb.auth.getSession();
      var session = s && s.data && s.data.session;
      if(!session){ showToast('Sign in to download'); return false; }

      var res = await fetch('/api/market-download', {
        method:'POST',
        headers:{ 'Authorization':'Bearer '+session.access_token, 'Content-Type':'application/json' },
        body: JSON.stringify({ item:String(item), file:String(file || item) })
      });
      if(!res.ok){
        var info = {};
        try{ info = await res.json(); }catch(e){}
        if(res.status === 402) showToast('Buy this item to download it');
        else if(res.status === 401){
          showToast('Sign in to download');
          if(typeof openAuthMod === 'function') openAuthMod();
        }
        else showToast(info.error || 'Download failed — try again');
        return false;
      }
      dzMarketSave(await res.blob(), name);
      return true;
    }catch(e){
      showToast('Download failed — check your connection');
      return false;
    }finally{
      if(btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
  };

  window.dzMarketGet = function(id){
    if(!sb || !window.currentUser){
      if(typeof pfGuestGate === 'function')
        pfGuestGate({preventDefault:function(){},stopPropagation:function(){}});
      return;
    }
    sb.rpc('dz_market_files', {p_item:id}).then(function(res){
      if(res.error){
        showToast(/purchase required/i.test(res.error.message || '')
          ? 'Buy this item to unlock its files'
          : (res.error.message || 'Could not open your files'));
        return;
      }
      var files = res.data || [];
      if(!files.length){ showToast('This listing has no files attached'); return; }
      if(files.length === 1){
        window.dzMarketFetch(id, files[0].file_id, files[0].name);
        return;
      }
      dzMarketPick(id, files);
    });
  };

  function dzMarketPick(item, files){
    var old = document.getElementById('dzGetPop');
    if(old) (typeof old.dzShut === 'function') ? old.dzShut() : old.remove();
    var pop = document.createElement('div');
    pop.className = 'upPop open';
    pop.id = 'dzGetPop';
    pop.setAttribute('role','dialog');
    pop.setAttribute('aria-modal','true');
    pop.setAttribute('aria-label','Your files');
    var total = 0;
    files.forEach(function(f){ total += Number(f.bytes) || 0; });
    pop.innerHTML =
      '<div class="upPopBox dzGetBox">'+
        '<button class="upPopX" data-x="1" aria-label="Close">✕</button>'+
        '<h3 class="dzGetTitle">YOUR FILES</h3>'+
        '<p class="dzGetSub">'+files.length+' files · '+esc(bytes(total) || '—')+
          ' · yours to re-download any time</p>'+
        '<div class="dzGetList">'+
          files.map(function(f, i){
            return '<div class="dzGetRow">'+
              '<span class="dzGetExt">'+esc(String(f.ext || 'file').toUpperCase())+'</span>'+
              '<div class="dzGetMeta">'+
                '<div class="dzGetNm">'+esc(f.name)+'</div>'+
                '<div class="dzGetSz">'+esc(bytes(f.bytes) || '—')+'</div>'+
              '</div>'+
              '<button type="button" class="dzGetBtn" data-i="'+i+'">Download</button>'+
            '</div>';
          }).join('')+
        '</div>'+
      '</div>';
    document.body.appendChild(pop);

    var lastFocus = document.activeElement;
    function shut(){
      document.removeEventListener('keydown', onKey, true);
      if(pop.parentNode) pop.remove();
      if(lastFocus && lastFocus.focus && lastFocus.isConnected !== false){
        try{ lastFocus.focus(); }catch(e){}
      }
      lastFocus = null;
    }
    function onKey(e){
      if(e.key !== 'Escape') return;
      e.stopPropagation();
      shut();
    }
    document.addEventListener('keydown', onKey, true);
    pop.dzShut = shut;

    pop.addEventListener('click', function(e){
      if(e.target === pop || e.target.getAttribute('data-x')){ shut(); return; }
      var b = e.target.closest ? e.target.closest('[data-i]') : null;
      if(!b) return;
      var f = files[Number(b.getAttribute('data-i'))];
      if(f) window.dzMarketFetch(item, f.file_id, f.name, b);
    });

    var first = pop.querySelector('.dzGetBtn') || pop.querySelector('.upPopX');
    if(first){ try{ first.focus(); }catch(e){} }
  }
})();
