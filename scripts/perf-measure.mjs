#!/usr/bin/env node
//
// Loads the site in a real headless Chromium and reports what a visitor
// actually pays: requests, bytes on the wire, when the first pixel lands, and
// how long the main thread is busy before the page will answer a tap.
//
//   node scripts/perf-measure.mjs                  # desktop, cold cache
//   node scripts/perf-measure.mjs --mobile         # 4x slower CPU, Slow 4G
//   node scripts/perf-measure.mjs --json out.json  # also write raw numbers
//   node scripts/perf-measure.mjs --repeat         # second load, warm cache
//
// Supabase is unreachable from the audit environment, so config.js is pointed
// at a local stub that answers 404 immediately. Every data fetch therefore
// fails fast instead of hanging. That is the point: what is being measured is
// the cost of the shell -- the HTML, CSS and JavaScript a visitor downloads,
// parses and runs before the page can do anything at all -- and that cost does
// not depend on whether the database answers.
//
// Numbers move between runs. Anything under about 10% is noise; the request
// and byte counts are exact and are the ones worth quoting.

import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
// Playwright is not a project dependency -- this repo deliberately has none.
// Install it once, anywhere on PATH:  npm i -g playwright && npx playwright install chromium
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 8099;
const args = new Set(process.argv.slice(2));
const MOBILE = args.has('--mobile');
const REPEAT = args.has('--repeat');
const jsonAt = process.argv[process.argv.indexOf('--json') + 1];
const WANT_JSON = process.argv.includes('--json');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

// config.js is gitignored and generated at deploy. Serve one that keeps the
// shape the app expects and points nowhere reachable.
const STUB_CONFIG = `window.KOE_CONFIG = {
  SB_URL: 'http://127.0.0.1:${PORT}/__sb',
  SB_KEY: 'stub',
  S3_FN_URL: 'http://127.0.0.1:${PORT}/__sb/functions/v1/smart-function',
  T600_READY: true,
  TURNSTILE_SITE_KEY: ''
};`;

function serve() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      let path = decodeURIComponent(url.pathname);

      if (path === '/config.js') {
        res.writeHead(200, { 'content-type': TYPES['.js'] });
        return res.end(STUB_CONFIG);
      }
      if (path.startsWith('/__sb')) {            // the database, deliberately absent
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end('{"message":"stub"}');
      }
      if (path === '/') path = '/index.html';

      const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      try {
        const info = await stat(file);
        if (!info.isFile()) throw new Error('dir');
        const body = await readFile(file);
        // Mirror the production _headers rules, or a repeat visit measures
        // nothing: /js/ and /css/ are immutable for a year there because every
        // reference carries a ?v=, and the HTML is revalidated every time.
        const immutable = /^\/(js|css)\//.test(path);
        res.writeHead(200, {
          'content-type': TYPES[extname(file)] || 'application/octet-stream',
          'cache-control': immutable
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
        res.end(body);
      } catch {
        // Cloudflare Pages rewrites unknown paths to index.html; mirror that so
        // client routing behaves as it does in production.
        try {
          res.writeHead(200, { 'content-type': TYPES['.html'] });
          res.end(await readFile(join(ROOT, 'index.html')));
        } catch { res.writeHead(404); res.end('nope'); }
      }
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const ms = (n) => (n == null ? '  -  ' : Math.round(n) + ' ms');

async function measure(browser, { warm }) {
  const ctx = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    userAgent: MOBILE
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
    serviceWorkers: 'block',   // measured separately; it must not skew a cold load
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MOBILE) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }

  const byType = {};
  const seen = [];
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)));
  page.on('response', async (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/__sb')) return;      // the absent database
    let bytes = 0;
    // A response served from the HTTP cache has no body to read. That is the
    // point of a warm run: the request still appears, the bytes do not.
    const fromCache = r.request().timing().receiveHeadersEnd < 0 || false;
    try { if (!fromCache) bytes = (await r.body()).length; } catch {   }
    const t = r.request().resourceType();
    byType[t] = byType[t] || { n: 0, bytes: 0 };
    byType[t].n++; byType[t].bytes += bytes;
    seen.push({ url: u.pathname, type: t, bytes, status: r.status() });
  });

  // A repeat visit means the SAME browser profile coming back, so the HTTP
  // cache is warm. A fresh Playwright context has an empty cache, which would
  // just be a second cold load -- so warm runs navigate once to fill the cache,
  // then navigate again and measure that second navigation.
  if (warm) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(MOBILE ? 3000 : 1500);
    byType.__discard = true;
    for (const k of Object.keys(byType)) delete byType[k];
    seen.length = 0; errors.length = 0;
  }

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  // Let the deferred scripts finish and the intro overlay settle.
  await page.waitForTimeout(MOBILE ? 4000 : 2500);

  const vitals = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = Object.fromEntries(
      performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
    const long = performance.getEntriesByType('longtask') || [];
    return {
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      firstPaint: paint['first-paint'],
      firstContentfulPaint: paint['first-contentful-paint'],
      longTasks: long.length,
      longTaskMs: long.reduce((a, t) => a + t.duration, 0),
      scripts: performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script').length,
      // what the app itself put on screen
      gridCards: document.querySelectorAll('#awGrid .awCard').length,
      introGone: !!document.querySelector('#intro.iGone') || !document.getElementById('intro'),
    };
  });

  const lcp = await page.evaluate(() => new Promise((res) => {
    let v = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {   }
    setTimeout(() => res(v), 120);
  }));

  const total = seen.reduce((a, r) => a + r.bytes, 0);
  await ctx.close();
  return { byType, seen, errors, vitals, lcp, total, wall: Date.now() - t0, warm };
}

function report(r, label) {
  console.log(`\n${'='.repeat(64)}\n${label}\n${'='.repeat(64)}`);
  console.log(`requests ${r.seen.length}   transferred ${kb(r.total)}` +
              (r.warm ? '  (warm run: bytes are unreliable, cached responses have no readable body ' +
                        '— read the timings, not this number)' : '') +
              `   wall ${r.wall} ms`);
  console.log('\n  by type');
  for (const [t, v] of Object.entries(r.byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`    ${t.padEnd(12)} ${String(v.n).padStart(3)} req  ${kb(v.bytes).padStart(10)}`);
  }
  console.log('\n  timing');
  console.log(`    first contentful paint   ${ms(r.vitals.firstContentfulPaint)}`);
  console.log(`    largest contentful paint ${ms(r.lcp)}`);
  console.log(`    DOMContentLoaded         ${ms(r.vitals.domContentLoaded)}`);
  console.log(`    load                     ${ms(r.vitals.load)}`);
  console.log(`    long tasks               ${r.vitals.longTasks} totalling ${ms(r.vitals.longTaskMs)}`);
  console.log(`\n  rendered  ${r.vitals.gridCards} grid cards, intro dismissed: ${r.vitals.introGone}`);
  if (r.errors.length) {
    console.log(`\n  console errors (${r.errors.length}), first 8:`);
    [...new Set(r.errors)].slice(0, 8).forEach((e) => console.log('    ' + e));
  } else console.log('\n  no console errors');
}

const srv = await serve();
const browser = await chromium.launch();
try {
  const cold = await measure(browser, { warm: false });
  report(cold, `COLD LOAD — ${MOBILE ? 'mobile (4x CPU throttle, Slow 4G)' : 'desktop, no throttling'}`);

  let warm = null;
  if (REPEAT) {
    warm = await measure(browser, { warm: true });
    report(warm, 'REPEAT LOAD — same browser, HTTP cache warm');
  }

  if (WANT_JSON && jsonAt) {
    await writeFile(jsonAt, JSON.stringify({ cold, warm, mobile: MOBILE }, null, 1));
    console.log(`\nraw numbers written to ${jsonAt}`);
  }
} finally {
  await browser.close();
  srv.close();
}
