import { LEGAL } from '../../js/legal-content.js';
import { SITE, esc } from '../lib/http.js';

const SLUGS = {
  'privacy':       { key: 'privacy', title: 'Privacy Policy' },
  'terms':         { key: 'terms',   title: 'Terms of Service' },
};

export const LEGAL_SLUGS = Object.keys(SLUGS);

function describe(html) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= 160 ? text : text.slice(0, 159).replace(/\s\S*$/, '') + '…';
}

function page(slug, doc, navTitle) {
  const url = `${SITE}/legal/${slug}`;
  const others = Object.entries(SLUGS)
    .filter(([s]) => s !== slug)
    .map(([s, v]) => `<a href="/legal/${s}">${esc(v.title)}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(navTitle)} — DigiArtz</title>
<meta name="description" content="${esc(describe(doc.html))}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(navTitle)} — DigiArtz">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="DigiArtz">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" sizes="any">
<link rel="icon" href="/favicon.ico?v=4">
<style>
  :root{
    --bg:#ffffff; --fg:#1a1a1f; --muted:#5b5b6b; --line:#e4e4ec;
    --accent:#7C3AED; --card:#fafafc;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#0f0f14; --fg:#ececf1; --muted:#a0a0b0; --line:#26262f;
      --accent:#a78bfa; --card:#16161d;
    }
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--fg);
    font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-text-size-adjust:100%;
  }
  .wrap{max-width:760px; margin:0 auto; padding:24px 20px 72px}
  header{border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:28px}
  .brand{
    display:inline-block; font-weight:800; letter-spacing:.14em;
    color:var(--accent); text-decoration:none; font-size:15px;
  }
  h1{font-size:clamp(24px,5vw,32px); line-height:1.25; margin:20px 0 0}
  h2{font-size:20px; margin:28px 0 8px}
  h3{font-size:17px; margin:24px 0 6px}
  p,li{color:var(--fg)}
  ul,ol{padding-left:22px}
  li{margin:4px 0}
  a{color:var(--accent)}
  strong{font-weight:650}
  .lmDate{
    display:block; margin-top:28px; padding-top:14px;
    border-top:1px solid var(--line);
    color:var(--muted); font-size:13px; letter-spacing:.06em;
  }
  nav.more{
    margin-top:44px; padding-top:20px; border-top:1px solid var(--line);
  }
  nav.more p{color:var(--muted); font-size:13px; margin:0 0 10px; text-transform:uppercase; letter-spacing:.08em}
  nav.more a{
    display:inline-block; margin:0 14px 8px 0; font-size:14px;
  }
  footer{margin-top:36px; color:var(--muted); font-size:13px}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <a class="brand" href="/">DIGIARTZ</a>
      <h1>${esc(navTitle)}</h1>
    </header>
    <main>${doc.html}</main>
    <nav class="more">
      <p>Other policies</p>
      ${others}
    </nav>
    <footer>© 2026 DigiArtz. Questions: <a href="mailto:DigiArtzsupport@gmail.com">DigiArtzsupport@gmail.com</a></footer>
  </div>
</body>
</html>`;
}

export async function onRequestGet({ params }) {
  const slug = String(params.doc || '').toLowerCase();
  const entry = SLUGS[slug];
  const doc = entry && LEGAL[entry.key];

  if (!doc) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(page(slug, doc, entry.title), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
