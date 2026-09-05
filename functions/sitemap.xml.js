import { SITE as SITE_URL } from './lib/http.js';
import { SB_URL_FALLBACK } from './lib/sb.js';

export async function onRequestGet(context) {
  const { env } = context;

  const SUPABASE_URL = env.SB_URL || env.SUPABASE_URL || SB_URL_FALLBACK;
  const SUPABASE_ANON_KEY = env.SB_KEY || env.SUPABASE_ANON_KEY || '';

  const BLOCKED = ['madarchod', 'bhenchod', 'chutiya', 'lund', 'randi'];
  const LEET = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't' };
  const isBlocked = (u) => {
    const flat = String(u || '')
      .toLowerCase()
      .replace(/[4@31!05$7]/g, (c) => LEET[c])
      .replace(/[^a-z]/g, '');
    return BLOCKED.some((bad) => flat.includes(bad));
  };

  const isPlaceholder = (u) => /^user_[0-9a-f]{8}$/i.test(String(u || ''));

  const xesc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
    );

  const crawlImage = (url) => {
    if (!url || typeof url !== 'string') return '';
    let u;
    try { u = new URL(url); } catch { return ''; }
    return u.hostname.endsWith('.supabase.co') ? url : '';
  };

  const sbGet = async (path) => {
    if (!SUPABASE_ANON_KEY) return [];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    return res.ok ? res.json() : [];
  };

  const ITEM_FEEDS = [
    { seg: 'resource', q: 'resources?select=id,created_at&visibility=eq.published&status=eq.approved' },
    { seg: 'blog',     q: 'blog_posts?select=id,created_at&visibility=eq.published&status=eq.approved' },
    { seg: 'listing',  q: 'marketplace_items?select=id,created_at&visibility=eq.published&status=eq.approved' },
  ];

  let artworks = [];
  let profiles = [];
  let itemSets = ITEM_FEEDS.map(() => []);
  try {
    const all = await Promise.all([
        // published only, like the three item feeds below and the gallery: a draft or link-only artwork is not a sitemap entry
      sbGet('artworks?select=id,name,image_url,created_at&status=eq.approved&visibility=eq.published&kind=eq.art&order=created_at.desc&limit=5000'),
      sbGet('profiles?select=username&limit=5000'),
      ...ITEM_FEEDS.map((f) => sbGet(`${f.q}&order=created_at.desc&limit=5000`)),
    ]);
    artworks = all[0];
    profiles = all[1];
    itemSets = all.slice(2);
  } catch (e) {
  }

  const usernames = profiles
    .map((p) => p && p.username)
    .filter((u) => u && !isBlocked(u) && !isPlaceholder(u))
    .sort();

  const artworkEntries = artworks
    .map((a) => {
      const lastmod = a.created_at ? new Date(a.created_at).toISOString().slice(0, 10) : '';
      const title = xesc(a.name);
      const imageUrl = xesc(crawlImage(a.image_url));

      return `  <url>
    <loc>${SITE_URL}/artwork/${xesc(a.id)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>${imageUrl ? `\n    <image:image>\n      <image:loc>${imageUrl}</image:loc>${title ? `\n      <image:title>${title}</image:title>` : ''}\n    </image:image>` : ''}
  </url>`;
    })
    .join('\n');

  const profileEntries = usernames
    .map(
      (username) => `  <url>
    <loc>${SITE_URL}/profile/${encodeURIComponent(username)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`
    )
    .join('\n');

  const sectionEntries = [
    ['/explore', '0.9', 'daily'],
    ['/marketplace', '0.9', 'daily'],
    ['/community', '0.9', 'daily'],
    ['/resources', '0.8', 'weekly'],
    ['/blog', '0.8', 'weekly'],
    ['/login', '0.3', 'yearly'],
  ]
    .map(
      ([path, priority, freq]) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    )
    .join('\n');

  const itemEntries = itemSets
    .map((rows, i) =>
      (Array.isArray(rows) ? rows : [])
        .map((r) => {
          const lastmod = r && r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '';
          return `  <url>
    <loc>${SITE_URL}/${ITEM_FEEDS[i].seg}/${xesc(r.id)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
        })
        .join('\n')
    )
    .filter(Boolean)
    .join('\n');

  const legalEntries = [
    'privacy', 'terms',
  ]
    .map(
      (slug) => `  <url>
    <loc>${SITE_URL}/legal/${slug}</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${sectionEntries}
${legalEntries}
${itemEntries}
${artworkEntries}
${profileEntries}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
    }
