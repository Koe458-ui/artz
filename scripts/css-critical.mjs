#!/usr/bin/env node
//
// Which stylesheets does the first screen actually paint with?
//
// All 14 are render-blocking today, so the browser will not show anything
// until the last one has arrived and parsed. Most of them style a panel that
// is closed on arrival. Moving those off the blocking path is the cheapest
// first-paint win available -- but only if the page still looks identical,
// which is the part that has to be proven rather than argued.
//
// The technique matters. A stylesheet cannot simply be moved to the end and
// loaded later: css/overrides.css is named that because it deliberately wins
// over the files above it, and re-ordering the cascade would change the design.
// So the <link> stays exactly where it is and only stops blocking, via
//
//   media="print" onload="this.media='all'"
//
// which keeps its position in the cascade and its priority in the document,
// and just tells the browser it is not needed to paint. That is the only
// change; nothing about the order moves.
//
// This script renders the home screen both ways at two viewports and reports
// the pixel difference. Anything above a hair of antialiasing noise means the
// sheet was load-bearing for the first screen and has to keep blocking.
//
//   node scripts/css-critical.mjs                          # test the default set
//   node scripts/css-critical.mjs upload.css community.css # test a specific set

import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
// Playwright is not a project dependency -- this repo deliberately has none.
// Install it once, anywhere on PATH:  npm i -g playwright && npx playwright install chromium
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 8097;
const HTML = readFileSync('index.html', 'utf8');
const OUT = process.env.SCRATCH || '/tmp';

// Panel-scoped by inspection; every one of these styles a surface that is
// closed when the page opens.
const DEFAULT = ['admin.css', 'upload.css', 'community.css', 'viewer.css',
                 'profile.css', 'auth.css', 'ranking.css'];
const candidates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json' };

const STUB = `window.KOE_CONFIG={SB_URL:'http://127.0.0.1:${PORT}/__sb',SB_KEY:'stub',` +
  `S3_FN_URL:'http://127.0.0.1:${PORT}/__sb/f',T600_READY:true,TURNSTILE_SITE_KEY:''};`;

let deferSet = [];

function withDeferred(names) {
  let out = HTML;
  for (const n of names) {
    const re = new RegExp(`(<link rel="stylesheet" href="/css/${n}[^"]*")(\\s*/?>)`, 'i');
    out = out.replace(re, `$1 media="print" onload="this.media='all'"$2`);
  }
  return out;
}

const srv = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/config.js') { res.writeHead(200, { 'content-type': TYPES['.js'] }); return res.end(STUB); }
  if (path.startsWith('/__sb')) { res.writeHead(404); return res.end('{}'); }
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
    return res.end(withDeferred(deferSet));
  }
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    if (!(await stat(file)).isFile()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch();

async function shot(viewport, label) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);          // let the intro finish and deferred CSS land
  const png = await page.screenshot({ fullPage: false });
  const fcp = await page.evaluate(() =>
    (performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint') || {}).startTime);
  const blocking = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel=stylesheet]')].filter((l) => l.media !== 'print').length);
  await ctx.close();
  await writeFile(join(OUT, `css-${label}.png`), png);
  return { png, fcp, blocking };
}

// Compare two PNGs by decoding both in the browser and counting differing pixels.
async function diff(a, b) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const n = await page.evaluate(async ([x, y]) => {
    const load = (d) => new Promise((res) => {
      const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d;
    });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return -1;
    const c = (im) => { const cv = document.createElement('canvas');
      cv.width = im.width; cv.height = im.height;
      cv.getContext('2d').drawImage(im, 0, 0);
      return cv.getContext('2d').getImageData(0, 0, im.width, im.height).data; };
    const da = c(ia), db = c(ib);
    let d = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 ||
          Math.abs(da[i + 2] - db[i + 2]) > 8) d++;
    }
    return { diff: d, total: da.length / 4 };
  }, [a.toString('base64'), b.toString('base64')]);
  await ctx.close();
  return n;
}

const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

console.log(`deferring ${candidates.length} stylesheet(s): ${candidates.join(' ')}\n`);
let worst = 0;
for (const v of VIEWPORTS) {
  deferSet = [];
  const before = await shot(v.viewport, `${v.name}-before`);
  deferSet = candidates;
  const after = await shot(v.viewport, `${v.name}-after`);
  const d = await diff(before.png, after.png);
  const pct = d === -1 ? 100 : (d.diff / d.total) * 100;
  worst = Math.max(worst, pct);
  console.log(`${v.name.padEnd(8)} blocking sheets ${before.blocking} -> ${after.blocking}` +
              `   FCP ${Math.round(before.fcp)} -> ${Math.round(after.fcp)} ms` +
              `   pixels changed ${pct.toFixed(4)}%`);
}

const bytes = candidates.reduce((a, n) => { try { return a + readFileSync('css/' + n).length; } catch { return a; } }, 0);
console.log(`\n${(bytes / 1024).toFixed(0)} KB moved off the render-blocking path`);
console.log(worst < 0.05
  ? `\nVERDICT: identical to ${worst.toFixed(4)}% — safe to defer this set.`
  : `\nVERDICT: ${worst.toFixed(3)}% of pixels changed — one of these IS used by the first screen. ` +
    `Screenshots in ${OUT}/css-*.png; bisect the list before shipping.`);

await browser.close();
srv.close();
process.exit(worst < 0.05 ? 0 : 1);
