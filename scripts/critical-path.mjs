#!/usr/bin/env node
//
// What does index.html actually need before a visitor can use the page?
//
// Every script here is a plain global-scope file loaded with `defer`. There are
// no modules and no imports, so the dependency graph is not written down
// anywhere -- it exists only as "this file assigns window.foo, that file calls
// foo()". This reads that graph out of the source so a decision about what to
// defer is made from the code rather than from the file names.
//
// For each file it reports:
//   defines   globals it creates (window.x =, top-level function x(), var x =)
//   used by   which other files, and index.html's inline handlers, name them
//   at boot   whether anything it defines is called during startup, meaning
//             before the visitor has touched anything
//
// A file with no boot-time callers is a candidate for js/lazy.js. A file with
// boot-time callers is not, however tempting its size.
//
//   node scripts/critical-path.mjs            # summary
//   node scripts/critical-path.mjs --file js/dm.js   # one file in detail

import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const only = process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file') + 1] : null;

// The order index.html loads them in; order is the whole contract here.
const ORDER = [...html.matchAll(/<script[^>]*\bsrc="\/(js\/[^"?]+|[^"?/]+\.js)[^"]*"/g)].map((m) => m[1]);

const LAZY = new Set(
  (readFileSync('js/lazy.js', 'utf8').match(/'\/(?:js\/)?[^']+\.js/g) || [])
    .map((s) => s.slice(1).replace(/^\//, '')));

const files = ORDER.filter((f) => { try { readFileSync(f); return true; } catch { return false; } });

const src = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));

// Globals a file creates. Top-level `function x(){}` in a non-module script is
// a global too, but only when it is not nested inside an IIFE -- approximate
// that by column zero or two spaces of indent, which is how this codebase
// writes them.
function defines(code) {
  const out = new Set();
  for (const m of code.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  for (const m of code.matchAll(/^ {0,2}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) out.add(m[1]);
  for (const m of code.matchAll(/^ {0,2}(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm)) out.add(m[1]);
  return out;
}

const def = Object.fromEntries(files.map((f) => [f, defines(src[f])]));

// index.html's inline handlers -- onclick="foo()" and friends. These are the
// entry points a visitor reaches by tapping, which is exactly what a lazy stub
// is for.
const handlers = new Set();
for (const m of html.matchAll(/\son[a-z]+="([^"]*)"/g))
  for (const c of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) handlers.add(c[1]);

// Boot-time calls: anything invoked at the top level of a file, or registered
// on DOMContentLoaded / load, runs before the visitor does anything.
function bootCalls(code) {
  const out = new Set();
  for (const m of code.matchAll(/^ {0,2}([A-Za-z_$][\w$]*)\s*\(/gm)) out.add(m[1]);
  for (const m of code.matchAll(/addEventListener\(\s*['"](?:DOMContentLoaded|load)['"]\s*,\s*([A-Za-z_$][\w$]*)/g))
    out.add(m[1]);
  for (const m of code.matchAll(/\b(?:requestIdleCallback|setTimeout)\(\s*([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  return out;
}

const allBoot = new Set();
for (const f of files) for (const n of bootCalls(src[f])) allBoot.add(n);

const rows = files.map((f) => {
  const mine = def[f];
  const usedBy = files.filter((g) => g !== f &&
    [...mine].some((n) => new RegExp(`\\b${n}\\s*\\(|window\\.${n}\\b`).test(src[g])));
  const fromHandlers = [...mine].filter((n) => handlers.has(n));
  const bootNames = [...mine].filter((n) => allBoot.has(n) &&
    files.some((g) => g !== f && bootCalls(src[g]).has(n)));
  return {
    file: f,
    bytes: Buffer.byteLength(src[f]),
    lazy: LAZY.has(f),
    defines: mine.size,
    usedBy,
    handlers: fromHandlers,
    boot: bootNames,
  };
});

if (only) {
  const r = rows.find((x) => x.file === only || x.file.endsWith('/' + only));
  if (!r) { console.error('no such file in index.html:', only); process.exit(1); }
  console.log(`${r.file}  ${r.bytes.toLocaleString()} bytes  ${r.lazy ? '(already lazy)' : ''}`);
  console.log(`\ndefines ${r.defines} globals`);
  console.log(`\ncalled from an inline handler in index.html (${r.handlers.length}):`);
  console.log('  ' + (r.handlers.join(' ') || '(none)'));
  console.log(`\ncalled at boot by another file (${r.boot.length}):`);
  console.log('  ' + (r.boot.join(' ') || '(none)  <- nothing runs this on load'));
  console.log(`\nother files that name something it defines (${r.usedBy.length}):`);
  console.log('  ' + (r.usedBy.join(' ') || '(none)'));
  process.exit(0);
}

const eager = rows.filter((r) => !r.lazy);
const total = eager.reduce((a, r) => a + r.bytes, 0);
console.log(`${rows.length} scripts in index.html, ${eager.length} loaded eagerly, ` +
            `${(total / 1024).toFixed(0)} KB of JavaScript before the page is interactive\n`);

console.log('files nothing calls at boot -- candidates for js/lazy.js, largest first:');
console.log('    bytes  handlers  usedBy  file');
const cand = eager.filter((r) => r.boot.length === 0).sort((a, b) => b.bytes - a.bytes);
for (const r of cand) {
  console.log(`  ${String(r.bytes).padStart(7)}  ${String(r.handlers.length).padStart(8)}  ` +
              `${String(r.usedBy.length).padStart(6)}  ${r.file}`);
}
console.log(`\n  ${(cand.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(0)} KB sits in files with no boot-time caller\n`);

console.log('files something calls at boot -- these stay eager:');
for (const r of eager.filter((r) => r.boot.length).sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${String(r.bytes).padStart(7)}  ${r.file}  <- ${r.boot.slice(0, 4).join(' ')}`);
}
