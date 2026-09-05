import { underEdgeLimit, tooManyRequests } from './lib/ratelimit.js';
import { sbUrl, sbAnon, SB_SIZE_RE } from './lib/sb.js';
import { SITE, UUID_RE, esc } from './lib/http.js';

const CACHE_SECONDS = 300;
const ROW_CACHE_SECONDS = 60;

function resize(url, width) {
  if (!url || typeof url !== 'string') return url;
  if (!SB_SIZE_RE.test(url)) return url;
  const suffix = width <= 300 ? '__t300.webp' : width <= 1000 ? '__v1000.webp' : '__f1600.webp';
  return url.replace(SB_SIZE_RE, suffix);
}
const thumb = (url) => resize(url, 300);
const t600 = (url) => (SB_SIZE_RE.test(url || '') ? url.replace(SB_SIZE_RE, '__t600.webp') : url);

const flagOn = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

function thumbAttrs(url, env) {
  const src = `src="${esc(thumb(url))}"`;
  if (!env || !flagOn(env.T600_READY) || !SB_SIZE_RE.test(url || '')) return src;
  const set = `${esc(thumb(url))} 300w, ${esc(t600(url))} 600w, ${esc(resize(url, 1000))} 1000w`;
  return `${src} srcset="${set}" ` +
         `sizes="(min-width:1280px) 25vw, (min-width:700px) 33.33vw, 50vw"`;
}
const ogImage = (url) => resize(url, 1200);
const fullImage = (url) => resize(url, 1600);

function clamp(s, n = 160) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s\S*$/, '') + '…';
}

const sbReady = (env) => !!(env && sbUrl(env) && sbAnon(env));

async function sbGet(env, query, ttl) {
  const res = await fetch(`${sbUrl(env)}/rest/v1/${query}`, {
    headers: { apikey: sbAnon(env), authorization: `Bearer ${sbAnon(env)}` },
    cf: { cacheTtl: ttl, cacheEverything: true }
  });
  if (!res.ok) throw new Error('sb ' + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('sb shape');
  return rows;
}

async function fetchArtworks(env) {
  if (!sbReady(env)) return [];
  try {
    return await sbGet(env,
        // published only, like the gallery this stands in for: a draft, a scheduled piece and a link-only one are not a listing
      'artworks?select=id,name,image_url,created_at' +
      '&status=eq.approved&visibility=eq.published&kind=eq.art&order=created_at.desc&limit=60',
      CACHE_SECONDS);
  } catch { return []; }
}

const SECTIONS = {
  '/explore': {
    crumb: 'Explore',
    h1: 'Explore Digital Art',
    title: 'Explore Digital Art — DigiArtz',
    desc: 'Browse digital artwork from the DigiArtz community — character illustration, ' +
          'fan art, concept art, landscapes, vehicles and original work from artists worldwide.',
    ld: 'CollectionPage'
  },
  '/marketplace': {
    crumb: 'Marketplace',
    h1: 'Marketplace — Buy and Sell Digital Art',
    title: 'Marketplace — Buy and Sell Digital Art on DigiArtz',
    desc: 'Buy and sell digital art and creative assets on DigiArtz: artwork, prints, ' +
          'brushes, templates, UI kits, 3D models and commissions from independent artists.',
    ld: 'CollectionPage'
  },
  '/community': {
    crumb: 'Community',
    h1: 'Community',
    title: 'Community — DigiArtz',
    desc: 'Join the DigiArtz community. Talk with other digital artists, share work in ' +
          'progress, swap feedback and find people to collaborate with.',
    ld: 'CollectionPage'
  },
  '/resources': {
    crumb: 'Resources',
    h1: 'Resources for Digital Artists',
    title: 'Resources for Digital Artists — DigiArtz',
    desc: 'Resources for digital artists on DigiArtz: brushes, textures, fonts, references, ' +
          'colour palettes, mockups, templates and tutorials shared by the community.',
    ld: 'CollectionPage'
  },
  '/blog': {
    crumb: 'Blog',
    h1: 'Blog — Tutorials and Artist Stories',
    title: 'Blog — Tutorials and Artist Stories — DigiArtz',
    desc: 'Tutorials, artist spotlights, interviews, reviews and news from the DigiArtz ' +
          'digital art community.',
    ld: 'CollectionPage'
  },
  '/login': {
    crumb: 'Login',
    h1: 'Login',
    title: 'Login — DigiArtz',
    desc: 'Sign in to your DigiArtz account to upload artwork, sell in the marketplace, ' +
          'join communities and follow other artists.',
    ld: 'WebPage'
  }
};

const PROFILE_RE = /^\/profile\/([^/]+)\/?$/;
const ARTWORK_RE = /^\/artwork\/([^/]+)\/?$/;
const ITEM_RE    = /^\/(resource|blog|listing|job)\/([^/]+)\/?$/;

const ITEMS = {
  resource: {
    table: 'resources', parent: '/resources', crumb: 'Resources', vis: 'visibility=eq.published&status=eq.approved',
    select: 'id,title,summary,preview_url,seo_title,seo_description,created_at', ld: 'CreativeWork'
  },
  blog: {
    table: 'blog_posts', parent: '/blog', crumb: 'Blog',
    vis: 'visibility=eq.published&status=eq.approved',
    select: 'id,title,excerpt,cover_url,seo_title,seo_description,published_at,created_at',
    ld: 'BlogPosting'
  },
  listing: {
    table: 'marketplace_items', parent: '/marketplace', crumb: 'Marketplace',
    vis: 'visibility=eq.published&status=eq.approved',
    select: 'id,title,summary,preview_url,seo_title,seo_description,created_at',
    ld: 'CreativeWork'
  },
  job: {
    table: 'jobs', crumb: 'Jobs',
    vis: 'visibility=eq.public&status=eq.approved',
    select: 'id,title,company,description,created_at',
    ld: 'WebPage'
  }
};

const SAFE_NAME = /^[\p{L}\p{N}._-]{1,40}$/u;
const likeEscape = (s) => String(s).replace(/[\\%_]/g, '\\$&');
const sameName = (a, b) =>
  String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

async function resolve(env, pathname) {
  const sec = SECTIONS[pathname.replace(/(.)\/$/, '$1')];
  if (sec) return { type: 'section', status: 'found', sec, path: pathname.replace(/(.)\/$/, '$1') };

  const im = pathname.match(ITEM_RE);
  if (im) {
    const cfg = ITEMS[im[1]];
    if (!cfg) return { type: 'other', status: 'found' };
    if (!sbReady(env)) return { type: 'item', status: 'unknown', cfg };
    let raw;
    try { raw = decodeURIComponent(im[2]); } catch { return { type: 'other', status: 'found' }; }
    if (!UUID_RE.test(raw)) return { type: 'item', status: 'gone', cfg, seg: im[1] };
    try {
      const rows = await sbGet(env,
        `${cfg.table}?select=${cfg.select}&id=eq.${raw}&${cfg.vis}&limit=1`,
        ROW_CACHE_SECONDS);
      if (!rows.length) return { type: 'item', status: 'unlisted', cfg, seg: im[1], id: raw };
      return { type: 'item', status: 'found', cfg, seg: im[1], row: rows[0] };
    } catch { return { type: 'item', status: 'unknown', cfg }; }
  }

  const pm = pathname.match(PROFILE_RE);
  const am = pathname.match(ARTWORK_RE);
  if (!pm && !am) return { type: 'other', status: 'found' };

  const type = pm ? 'profile' : 'artwork';
  if (!sbReady(env)) return { type, status: 'unknown' };

  let raw;
  try { raw = decodeURIComponent(pm ? pm[1] : am[1]); } catch { return { type, status: 'gone' }; }

  if (type === 'profile') {
    if (!SAFE_NAME.test(raw)) return { type, status: 'gone' };
    try {
      const rows = await sbGet(env,
        'profiles?select=id,username,display_name,bio,avatar_url,banner_url' +
        `&username=ilike.${encodeURIComponent(likeEscape(raw))}&limit=1`,
        ROW_CACHE_SECONDS);
      if (!rows.length) return { type, status: 'gone' };
      if (!sameName(rows[0].username, raw)) return { type, status: 'gone' };
      return { type, status: 'found', row: rows[0] };
    } catch { return { type, status: 'unknown' }; }
  }

  if (!UUID_RE.test(raw)) return { type, status: 'gone' };
  try {
    const rows = await sbGet(env,
      'artworks?select=id,name,description,image_url,created_at,category,software,user_id' +
        // a link-only artwork opens from its own address, so it renders here; a draft or scheduled one is not published
      `&id=eq.${raw}&status=eq.approved&visibility=in.(published,hidden)&kind=eq.art&limit=1`,
      ROW_CACHE_SECONDS);
    if (!rows.length) return { type, status: 'gone' };
    const row = rows[0];

    let artist = null;
    if (row.user_id) {
      try {
        const p = await sbGet(env,
          `profiles?select=username,display_name&id=eq.${row.user_id}&limit=1`,
          ROW_CACHE_SECONDS);
        artist = p[0] || null;
      } catch {   }
    }
    return { type, status: 'found', row, artist };
  } catch { return { type, status: 'unknown' }; }
}

function artworkMeta(row, artist) {
  const name = row.name || 'Untitled artwork';
  const by   = artist ? (artist.display_name || artist.username) : null;
  const url  = `${SITE}/artwork/${row.id}`;
  const img  = ogImage(row.image_url) || '';

  const title = by ? `${name} by ${by} — DigiArtz` : `${name} — DigiArtz`;
  const desc  = clamp(
    row.description ||
    [`${name} —`, by ? `digital artwork by ${by}` : 'digital artwork',
     row.category ? `in ${row.category}` : '',
     row.software ? `made in ${row.software}` : '',
     'on DigiArtz.'].filter(Boolean).join(' ')
  );

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name,
    description: desc,
    contentUrl: fullImage(row.image_url),
    thumbnailUrl: thumb(row.image_url),
    url,
    datePublished: (row.created_at || '').slice(0, 10),
    ...(by ? { creator: { '@type': 'Person', name: by,
                          url: `${SITE}/profile/${encodeURIComponent(artist.username)}` } } : {})
  };

  return { title, desc, url, img, imgAlt: name, ogType: 'article', h1: name, ld, ldId: 'ldArtwork' };
}

function profileMeta(row) {
  const name = row.display_name || row.username;
  const url  = `${SITE}/profile/${encodeURIComponent(row.username)}`;
  const img  = ogImage(row.banner_url || row.avatar_url) || '';

  return {
    title: `${name} — DigiArtz`,
    desc: clamp(row.bio || `Digital artwork by ${name} on DigiArtz.`),
    url,
    img,
    imgAlt: `${name} on DigiArtz`,
    ogType: 'profile',
    h1: name,
    ld: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        name,
        alternateName: row.username,
        url,
        ...(row.bio ? { description: clamp(row.bio, 300) } : {}),
        ...(row.avatar_url ? { image: ogImage(row.avatar_url) } : {})
      }
    },
    ldId: 'ldProfile'
  };
}

function crumbs(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', url: `${SITE}/` }, ...trail].map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: c.url
    }))
  };
}

function sectionMeta(path, sec) {
  const url = `${SITE}${path}`;
  return {
    title: sec.title,
    desc: sec.desc,
    url,
    img: '',
    imgAlt: `${sec.crumb} on DigiArtz`,
    ogType: 'website',
    h1: sec.h1,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': sec.ld,
        name: sec.title,
        description: sec.desc,
        url,
        isPartOf: { '@type': 'WebSite', name: 'DigiArtz', url: `${SITE}/` }
      },
      crumbs([{ name: sec.crumb, url }])
    ],
    ldId: 'ldSection'
  };
}

function itemMeta(seg, cfg, row) {
  const url = `${SITE}/${seg}/${row.id}`;
  const name = row.seo_title || row.title || 'Untitled';
  const body = row.seo_description || row.summary || row.excerpt || row.description || '';
  const img = ogImage(row.preview_url || row.cover_url || '') || '';
  const date = (row.published_at || row.created_at || '').slice(0, 10);
  const desc = clamp(body || `${name} — ${cfg.crumb.toLowerCase()} on DigiArtz.`);
  const title = seg === 'job' && row.company
    ? `${name} at ${row.company} — DigiArtz`
    : `${name} — DigiArtz`;

  return {
    title,
    desc,
    url,
    img,
    imgAlt: name,
    ogType: seg === 'blog' ? 'article' : 'website',
    h1: name,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': cfg.ld,
        ...(cfg.ld === 'BlogPosting' ? { headline: name } : { name }),
        description: desc,
        url,
        ...(date ? { datePublished: date } : {}),
        ...(img ? { image: img } : {}),
        isPartOf: { '@type': 'WebSite', name: 'DigiArtz', url: `${SITE}/` }
      },
      crumbs(cfg.parent
        ? [{ name: cfg.crumb, url: `${SITE}${cfg.parent}` }, { name, url }]
        : [{ name, url }])
    ],
    ldId: 'ldItem'
  };
}

function unlistedMeta(seg, cfg, id) {
  const url = `${SITE}/${seg}/${id}`;
  return {
    title: `${cfg.crumb} — DigiArtz`,
    desc: `${cfg.crumb} on DigiArtz.`,
    url,
    img: '',
    imgAlt: 'DigiArtz',
    ogType: 'website',
    h1: cfg.crumb,
    robots: 'noindex, follow',
    ld: cfg.parent
      ? crumbs([{ name: cfg.crumb, url: `${SITE}${cfg.parent}` }])
      : crumbs([]),
    ldId: 'ldItem'
  };
}

function applyMeta(rw, m) {
  const set = (sel, val) => rw.on(sel, {
    element(el) { el.setAttribute('content', val); }
  });

  rw.on('title', { element(el) { el.setInnerContent(m.title); } });

  if (m.h1) rw.on('h1.srOnly', { element(el) { el.setInnerContent(m.h1); } });

  set('meta[name="description"]', m.desc);
  rw.on('link[rel="canonical"]', {
    element(el) { el.setAttribute('href', m.url); }
  });

  set('meta[property="og:type"]', m.ogType);
  set('meta[property="og:title"]', m.title);
  set('meta[property="og:description"]', m.desc);
  set('meta[property="og:url"]', m.url);
  if (m.img) {
    set('meta[property="og:image"]', m.img);
    set('meta[name="twitter:image"]', m.img);
  }
  set('meta[property="og:image:alt"]', m.imgAlt);

  set('meta[name="twitter:title"]', m.title);
  set('meta[name="twitter:description"]', m.desc);

  if (m.robots) set('meta[name="robots"]', m.robots);

  const json = JSON.stringify(m.ld).replace(/<\//g, '<\\/');
  rw.on('head', {
    element(el) {
      el.append(
        `<script type="application/ld+json" id="${m.ldId}">${json}</script>`,
        { html: true }
      );
    }
  });
  return rw;
}

export async function onRequest(context) {
  const { env, request, next } = context;

  let reqPath = '/';
  try { reqPath = new URL(request.url).pathname; } catch {   }

  if (reqPath.startsWith('/api/')) {
    if (!(await underEdgeLimit(env, request, reqPath))) return tooManyRequests();
  }

  const origin = await next();

  const ct = origin.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return origin;

  let pathname = '/';
  try { pathname = new URL(request.url).pathname; } catch {   }

  if (pathname.startsWith('/legal/')) return origin;

  const hit = await resolve(env, pathname);

  if (hit.status === 'gone') {
    const gone = new HTMLRewriter()
      .on('head', {
        element(el) {
          el.append('<meta name="robots" content="noindex, follow">', { html: true });
        }
      })
      .transform(origin);
    return new Response(gone.body, { status: 404, headers: gone.headers });
  }

  const arts = await fetchArtworks(env);
  const meta = hit.status === 'found' && hit.type === 'artwork' ? artworkMeta(hit.row, hit.artist)
             : hit.status === 'found' && hit.type === 'profile' ? profileMeta(hit.row)
             : hit.type === 'section' ? sectionMeta(hit.path, hit.sec)
             : hit.status === 'found' && hit.type === 'item' ? itemMeta(hit.seg, hit.cfg, hit.row)
             : hit.status === 'unlisted' ? unlistedMeta(hit.seg, hit.cfg, hit.id)
             : null;

  if (!arts.length && !meta) return origin;

  const home = pathname === '/' || pathname === '/index.html';

  let rw = new HTMLRewriter();

  if (!home) rw = rw.on('script#ldGallery', { element(el) { el.remove(); } });

  if (arts.length) {
    const cards = arts.map((a) =>
      `<a class="awCard" href="/artwork/${esc(a.id)}"><div class="awImgWrap">` +
      `<img loading="lazy" decoding="async" ${thumbAttrs(a.image_url, env)} ` +
      `alt="${esc(a.name)} — digital artwork on DigiArtz"></div></a>`
    ).join('');

    const galleryLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ImageGallery',
      name: 'DigiArtz — Digital Art Gallery', url: `${SITE}/`,
      hasPart: arts.map((a, i) => ({
        '@type': 'ImageObject', position: i + 1, name: a.name,
        contentUrl: fullImage(a.image_url), thumbnailUrl: thumb(a.image_url),
        url: `${SITE}/artwork/${a.id}`,
        datePublished: (a.created_at || '').slice(0, 10)
      }))
    }).replace(/<\//g, '<\\/');

    rw = rw.on('div#awGrid', {
      element(el) { el.setInnerContent(cards, { html: true }); }
    });
    if (home) {
      rw = rw.on('script#ldGallery', {
        element(el) { el.setInnerContent(galleryLd, { html: true }); }
      });
    }
  }

  if (meta) rw = applyMeta(rw, meta);

  return rw.transform(origin);
}
