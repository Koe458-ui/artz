#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOW_UNCACHED = new Set([
]);

const html = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

const lazy = readFileSync(join(root, 'js', 'lazy.js'), 'utf8');
const refs = html + '\n' + lazy.replace(/'(\/[^']+)'/g, 'src="$1"');

const open = sw.indexOf('const SHELL_URLS');
if (open === -1) fail('could not find `const SHELL_URLS` in sw.js');
const close = sw.indexOf('];', open);
if (close === -1) fail('could not find the end of SHELL_URLS in sw.js');
const shellRaw = [...sw.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);

const GOVERNED = /^\/(?:js|css)\//;

const split = (u) => {
  const i = u.indexOf('?v=');
  return i === -1 ? [u, null] : [u.slice(0, i), u.slice(i + 3)];
};
const show = (v) => (v === null ? 'no ?v=' : `?v=${v}`);
const withVersion = (p, v) => (v === null ? p : `${p}?v=${v}`);

const shell = new Map();
const dupes = [];
for (const url of shellRaw) {
  if (!GOVERNED.test(url)) continue;
  const [path, version] = split(url);
  if (shell.has(path)) dupes.push(path);
  shell.set(path, version);
}

const loaded = new Map();
for (const [, url] of refs.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"]+)"/g)) {
  if (!GOVERNED.test(url)) continue;
  if (ALLOW_UNCACHED.has(url)) continue;
  const [path, version] = split(url);
  loaded.set(path, version);
}

const problems = [];
for (const [path, want] of loaded) {
  const got = shell.get(path);
  if (!shell.has(path)) {
    problems.push({
      kind: 'not precached',
      path,
      detail: `the app loads ${show(want)}, sw.js has no entry`,
      fix: `add '${withVersion(path, want)}' to SHELL_URLS`,
    });
  } else if (got !== want) {
    problems.push({
      kind: 'version drift',
      path,
      detail: `the app loads ${show(want)}, sw.js precaches ${show(got)}`,
      fix: `change SHELL_URLS to '${withVersion(path, want)}'`,
    });
  }
}
for (const [path, version] of shell) {
  if (loaded.has(path)) continue;
  problems.push({
    kind: 'precached but unused',
    path,
    detail: `sw.js precaches ${show(version)}, nothing loads it`,
    fix: `drop '${withVersion(path, version)}' from SHELL_URLS, or load it from index.html or js/lazy.js`,
  });
}
for (const path of dupes) {
  problems.push({
    kind: 'duplicate',
    path,
    detail: 'listed more than once in SHELL_URLS',
    fix: `remove the extra '${path}' entry`,
  });
}

for (const [, url] of refs.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"]+)"/g)) {
  if (/\/js\/vendor\//.test(url)) continue;
  if (ALLOW_UNCACHED.has(url)) continue;
  const [path, version] = split(url);
  if (version !== null) continue;
  problems.push({
    kind: 'unversioned',
    path,
    detail: 'it is loaded with no ?v=, and _headers serves /js/* and ' +
            '/css/* as immutable for a year',
    fix: `load it as '${path}?v=1' and add that url to SHELL_URLS`,
  });
}

if (problems.length === 0) {
  console.log(`precache ok — ${loaded.size} versioned assets, index.html + js/lazy.js and sw.js agree`);
  process.exit(0);
}

console.error(`\nprecache check FAILED — ${problems.length} problem(s)\n`);
for (const p of problems) {
  console.error(`  ${p.kind}: ${p.path}`);
  console.error(`    ${p.detail}`);
  console.error(`    fix: ${p.fix}\n`);
}
console.error('index.html and js/lazy.js are the authority: between them they are');
console.error('the only places these assets are referenced, so sw.js follows both.');
console.error('Bump CACHE_VERSION with the fix so');
console.error('installed clients refill against the corrected list.\n');
process.exit(1);

function fail(msg) {
  console.error(`precache check could not run: ${msg}`);
  process.exit(1);
}
