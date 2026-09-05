#!/usr/bin/env node
//
// Which scripts does the first screen actually need?
//
// Reading the source cannot answer this. Every file here is a global-scope
// IIFE that may or may not do work the moment it runs, and the graph of who
// calls whom is not written down. So this does not infer -- it experiments.
//
// For each script, load the page in a real browser with that one script tag
// removed and compare against a control run:
//
//   * did any NEW console error or pageerror appear?
//   * did the intro overlay still dismiss (the app finished booting)?
//   * did the top navigation still render?
//   * did the theme still get applied to <html>?
//
// A script that can be removed with none of those changing is not needed for
// the first screen, and belongs behind js/lazy.js. A script that breaks any of
// them stays eager, however large it is.
//
// This is a decision aid, not a rewriter. It tells you what is safe to move;
// moving it, and giving lazy.js the right stubs, is a human edit.
//
//   node scripts/deferrable.mjs              # all eager scripts
//   node scripts/deferrable.mjs js/dm.js     # just one

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
// Playwright is not a project dependency -- this repo deliberately has none.
// Install it once, anywhere on PATH:  npm i -g playwright && npx playwright install chromium
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 8098;
const HTML = readFileSync('index.html', 'utf8');
const pick = process.argv[2] || null;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

const STUB_CONFIG = `window.KOE_CONFIG={SB_URL:'http://127.0.0.1:${PORT}/__sb',SB_KEY:'stub',` +
  `S3_FN_URL:'http://127.0.0.1:${PORT}/__sb/f',T600_READY:true,TURNSTILE_SITE_KEY:''};`;

// Which script tag to drop for the current request; set per run.
let dropping = null;

function htmlWithout(path) {
  if (!path) return HTML;
  const re = new RegExp(`\\s*<script[^>]*src="/${path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^"]*"[^>]*></script>`, 'g');
  return HTML.replace(re, '');
}

const srv = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/config.js') { res.writeHead(200, { 'content-type': TYPES['.js'] }); return res.end(STUB_CONFIG); }
  if (path.startsWith('/__sb')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{}'); }
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
    return res.end(htmlWithout(dropping));
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

async function run(drop) {
  dropping = drop;
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  let state = {};
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1800);
    state = await page.evaluate(() => ({
      introGone: !!document.querySelector('#intro.iGone') || !document.getElementById('intro'),
      nav: document.querySelectorAll('[data-bn]').length,
      theme: document.documentElement.getAttribute('data-theme') || document.documentElement.className || '',
      sections: document.querySelectorAll('[data-section], .dzSection, section').length,
      bodyText: (document.body.innerText || '').trim().length,
    }));
  } catch (e) { errs.push('navigation: ' + e.message); }
  await ctx.close();
  // Errors from the absent database are constant across runs; ignore them.
  const real = errs.filter((e) => !/__sb|ERR_TUNNEL|Failed to load resource|message: stub|\{\}/.test(e));
  return { errs: [...new Set(real)], state };
}

const control = await run(null);
console.log('control run:');
console.log(`  intro dismissed ${control.state.introGone}   nav items ${control.state.nav}   ` +
            `sections ${control.state.sections}   body text ${control.state.bodyText}`);
console.log(`  ${control.errs.length} console error(s)` +
            (control.errs.length ? ':\n    ' + control.errs.slice(0, 4).join('\n    ') : ''));

const LAZY = new Set((readFileSync('js/lazy.js', 'utf8').match(/'\/(?:js\/)?[^']+\.js/g) || [])
  .map((s) => s.slice(1).replace(/^\//, '')));

const scripts = [...HTML.matchAll(/<script[^>]*\bsrc="\/(js\/[^"?]+|[^"?/]+\.js)[^"]*"/g)]
  .map((m) => m[1]).filter((f) => !LAZY.has(f));

const targets = pick ? [pick] : scripts;
const safe = [], unsafe = [];

console.log(`\ntesting ${targets.length} script(s), one removal at a time\n`);
for (const f of targets) {
  const r = await run(f);
  const newErrs = r.errs.filter((e) => !control.errs.includes(e));
  const broke =
    r.state.introGone !== control.state.introGone ||
    r.state.nav !== control.state.nav ||
    r.state.theme !== control.state.theme ||
    r.state.sections !== control.state.sections ||
    Math.abs(r.state.bodyText - control.state.bodyText) > 40;
  let bytes = 0; try { bytes = readFileSync(f).length; } catch {   }
  const verdict = (newErrs.length || broke) ? 'NEEDED' : 'deferrable';
  (verdict === 'NEEDED' ? unsafe : safe).push({ f, bytes, newErrs, broke, state: r.state });
  console.log(`  ${verdict.padEnd(11)} ${String(bytes).padStart(7)}  ${f}` +
    (broke ? `   [render changed: intro=${r.state.introGone} nav=${r.state.nav} sec=${r.state.sections} txt=${r.state.bodyText}]` : '') +
    (newErrs.length ? `\n${' '.repeat(22)}${newErrs[0].slice(0, 110)}` : ''));
}

if (!pick) {
  const kb = (n) => (n / 1024).toFixed(0);
  console.log(`\n${'='.repeat(64)}`);
  console.log(`deferrable: ${safe.length} files, ${kb(safe.reduce((a, r) => a + r.bytes, 0))} KB`);
  console.log(`needed now: ${unsafe.length} files, ${kb(unsafe.reduce((a, r) => a + r.bytes, 0))} KB`);
  console.log('\nRemoving a script cleanly means the first screen does not need it. It does');
  console.log('NOT mean the feature it powers still works -- that is what the stubs in');
  console.log('js/lazy.js are for, and each one has to name the globals the file defines.');
}

await browser.close();
srv.close();
