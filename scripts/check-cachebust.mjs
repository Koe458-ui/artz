#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const each = args.includes('--each');
const base = args.filter((a) => a !== '--each')[0] || 'origin/main';

function git(args, allowFail = false) {
  try {
    return execFileSync('git', args,
      { cwd: root, encoding: 'utf8', stdio: allowFail ? ['ignore', 'pipe', 'ignore'] : 'pipe' });
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

function fail(msg) {
  console.error('check-cachebust: ' + msg);
  process.exit(1);
}

if (git(['rev-parse', '--verify', '--quiet', base + '^{commit}'], true) === null) {
  fail(`cannot resolve base ref "${base}".\n` +
       '  In CI, check out with fetch-depth: 0 so the base commit is present.');
}

const REF_RE = /\/((?:css|js)\/[A-Za-z0-9._/-]+?)\?v=(\d+)/g;

function versionsIn(html) {
  const out = new Map();
  for (const m of html.matchAll(REF_RE)) {
    if (!out.has(m[1])) out.set(m[1], m[2]);
  }
  return out;
}

const SOURCES = ['index.html', 'js/lazy.js'];

function sourcesAt(rev) {
  const parts = SOURCES.map((f) =>
    rev === null ? readFileSync(join(root, f), 'utf8') : git(['show', `${rev}:${f}`], true));
  if (parts[0] === null) return null;
  return parts.map((p) => p || '').join('\n');
}

function step(from, to) {
  const headHtml = sourcesAt(to);
  const baseHtml = sourcesAt(from);
  if (headHtml === null || baseHtml === null) return [];

  const now = versionsIn(headHtml);
  const was = versionsIn(baseHtml);

  const stale = [];
  for (const [path, version] of now) {
    const before = was.get(path);
    if (before === undefined) continue;
    let changed = false;
    const range = to === null ? [from, '--', path] : [from, to, '--', path];
    try {
      execFileSync('git', ['diff', '--quiet', ...range], { cwd: root });
    } catch {
      changed = true;
    }
    if (changed && before === version) stale.push({ path, version, at: to });
  }
  return stale;
}

let stale = [];
if (each) {
  const commits = (git(['rev-list', '--reverse', `${base}..HEAD`], true) || '')
                    .split('\n').filter(Boolean);
  let prev = base;
  for (const c of commits) {
    stale = stale.concat(step(prev, c));
    prev = c;
  }
  stale = stale.concat(step(prev, null));
} else {
  stale = step(base, null);
}

if (stale.length) {
  console.error(
    'check-cachebust: these files changed but kept the version they already shipped under.\n' +
    '\n' +
    '  /css/* and /js/* are served `immutable, max-age=31536000` (_headers) and\n' +
    '  answered cache-first by the service worker. A visitor who already has one\n' +
    '  of these urls will not fetch it again — the change below reaches new\n' +
    '  visitors only.\n');
  for (const { path, version, at } of stale) {
    const where = at ? `  [${git(['log', '-1', '--format=%h %s', at], true).trim().slice(0, 60)}]` : '';
    console.error(`  /${path}?v=${version}  ->  ?v=${Number(version) + 1}` +
                  '   (in index.html AND in sw.js SHELL_URLS)' + where);
  }
  console.error(
    '\n  Bump both copies, then run scripts/check-precache.mjs to confirm they agree.\n' +
    '  CACHE_VERSION does not need bumping: sw.js prunes the orphaned entry itself\n' +
    '  (see pruneStatic), and renaming the caches would re-download every image.\n' +
    '\n  If a change really is byte-for-byte invisible to a browser — a comment, or\n' +
    '  a rule that was already dead — bump it anyway. A wasted refetch costs one\n' +
    '  request; a pinned stale file costs a year.');
  process.exit(1);
}

console.log('check-cachebust ok — no /css/ or /js/ asset changed without a new ' +
            `version since ${base}${each ? ', commit by commit' : ''}`);
