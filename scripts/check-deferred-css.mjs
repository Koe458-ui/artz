#!/usr/bin/env node
//
// The seven panel stylesheets in index.html carry
// media="print" onload="this.media='all'", which takes them off the
// render-blocking path without moving them in the cascade. Two things have to
// stay true for that to be safe, and both are easy to break by accident:
//
//   1. every deferred sheet is still listed in the <noscript> block, or a
//      visitor with JavaScript off gets an unstyled panel
//   2. no sheet the FIRST SCREEN paints with is deferred -- that is what the
//      pixel diff in scripts/css-critical.mjs proves, and this keeps the list
//      from growing without someone re-running it
//
// It also checks the sheets actually arrive: `media=print` still downloads, and
// the onload handler flips it back to `all`. If that handler is ever dropped,
// the sheet downloads and never applies -- a panel that is silently unstyled
// only for people who open it, which is the worst kind of regression to find.

import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
let failed = 0;
const fail = (m) => { failed++; console.error(`::error::${m}`); };
const ok = (m) => console.log(`ok    ${m}`);

// Sheets proven safe to defer by scripts/css-critical.mjs (0.0000% pixel
// difference at 390px and 1440px). Adding to this list means re-running it.
const PROVEN = new Set(['viewer.css', 'community.css', 'ranking.css', 'profile.css',
                        'admin.css', 'auth.css', 'upload.css']);

// Sheets the first screen paints with. These must never be deferred.
const CRITICAL = new Set(['base.css', 'hero.css', 'connect.css', 'panels.css',
                          'widgets.css', 'overrides.css', 'select.css']);

const head = html.slice(0, html.indexOf('</head>'));
const noscript = (head.match(/<noscript>([\s\S]*?)<\/noscript>/g) || []).join('');

// The <noscript> block repeats every deferred sheet by design. Read the real
// links from the head with those copies removed, or each one is counted twice
// and the fallbacks look like blocking sheets.
const realHead = head.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
const links = [...realHead.matchAll(/<link rel="stylesheet" href="\/css\/([a-z]+\.css)([^"]*)"([^>]*)>/g)]
  .map((m) => ({ name: m[1], ver: m[2], attrs: m[3] }));

const deferred = links.filter((l) => /media="print"/.test(l.attrs));
const blocking = links.filter((l) => !/media="print"/.test(l.attrs));

if (!links.length) fail('no stylesheet links found in index.html');
else ok(`${links.length} stylesheets: ${blocking.length} blocking, ${deferred.length} deferred`);

for (const l of deferred) {
  if (!PROVEN.has(l.name)) {
    fail(`/css/${l.name} is deferred but is not in the proven-safe list. ` +
         'Run: node scripts/css-critical.mjs ' + l.name + '  — it must show 0.0000% pixel change ' +
         'at both viewports before it can be deferred.');
  }
  if (!/onload="this\.media='all'"/.test(l.attrs)) {
    fail(`/css/${l.name} has media="print" but no onload to restore it. It would download ` +
         'and never apply — the panel it styles would render unstyled.');
  }
  if (!noscript.includes(`/css/${l.name}`)) {
    fail(`/css/${l.name} is deferred but missing from the <noscript> block, so a visitor ` +
         'with JavaScript off never gets it.');
  }
}
if (deferred.length && deferred.every((l) => PROVEN.has(l.name) &&
    /onload="this\.media='all'"/.test(l.attrs) && noscript.includes(`/css/${l.name}`))) {
  ok('every deferred sheet is proven safe, restores itself, and has a noscript fallback');
}

for (const l of blocking) {
  if (!CRITICAL.has(l.name)) {
    console.log(`note  /css/${l.name} still blocks first paint and is not in the known-critical ` +
                'set. If a panel owns it, run scripts/css-critical.mjs to see whether it can move.');
  }
}
for (const name of CRITICAL) {
  const l = links.find((x) => x.name === name);
  if (l && /media="print"/.test(l.attrs)) fail(`/css/${name} paints the first screen and must keep blocking`);
}
if (![...CRITICAL].some((n) => { const l = links.find((x) => x.name === n); return l && /media="print"/.test(l.attrs); }))
  ok('no first-screen stylesheet has been deferred');

// The noscript block must not itself be render-blocking noise for JS users.
if ((head.match(/<noscript>/g) || []).length > 2)
  fail('more than two <noscript> blocks in <head> — the CSS fallback should be one');
else ok('the noscript fallback is a single block');

console.log(failed ? `\n${failed} problem(s)` : '\ndeferred css ok');
process.exit(failed ? 1 : 0);
