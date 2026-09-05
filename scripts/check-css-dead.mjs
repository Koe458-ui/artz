#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';

const ORDER = ['base.css','hero.css','viewer.css','community.css','connect.css','ranking.css',
  'profile.css','admin.css','auth.css','panels.css','upload.css','widgets.css','overrides.css',
  'select.css','analytics.css'];
const FILES = ORDER.filter((f) => existsSync('css/' + f));
const verbose = process.argv.includes('--verbose');

const NEWER = /dvh\b|dvw\b|\bsafe\s|color-mix\(|clamp\(|env\(|:has\(|\bclip\b/;

function declarations(file) {
  const raw = readFileSync('css/' + file, 'utf8');
  const txt = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const out = [];
  const stack = [];
  const media = [];
  let buf = '', line = 1;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      const head = buf.trim(); buf = '';
      if (head.startsWith('@')) { stack.push('at'); media.push(head); }
      else stack.push(head);
      continue;
    }
    if (ch === '}') { const t = stack.pop(); if (t === 'at') media.pop(); buf = ''; continue; }
    if (ch === ';') {
      const decl = buf.trim(); buf = '';
      const sel = stack[stack.length - 1];
      if (sel && sel !== 'at' && decl.includes(':')) {
        const idx = decl.indexOf(':');
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (prop && !prop.startsWith('/')) {
          const parts = sel.split(',').map((x) => x.trim()).filter(Boolean);
          for (const s of parts) {
            out.push({ file, line, media: media.join(' & '), sel: s, prop, val,
                       grouped: parts.length > 1, rule: sel.trim() });
          }
        }
      }
      continue;
    }
    buf += ch;
  }
  return out;
}

const all = FILES.flatMap(declarations);
const groups = new Map();
for (const d of all) {
  const k = `${d.media}||${d.sel}||${d.prop}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(d);
}

const shadowed = [], crossFile = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  const winner = list[list.length - 1];
  for (const loser of list.slice(0, -1)) {
    if (loser.val === winner.val && loser.file === winner.file) { shadowed.push({ loser, winner }); continue; }
    if (NEWER.test(winner.val) && !NEWER.test(loser.val)) continue;
    if (loser.file === winner.file) shadowed.push({ loser, winner });
    else crossFile.push({ loser, winner });
  }
}

const per = (rows) => {
  const c = new Map();
  for (const r of rows) c.set(r.loser.file, (c.get(r.loser.file) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};

const deletable = shadowed.filter((r) => !r.loser.grouped);
const grouped = shadowed.filter((r) => r.loser.grouped);
console.log(`SHADOWED — same file, later line wins: ${shadowed.length}`);
console.log(`   of those, ${deletable.length} sit in a single-selector rule and can simply go;`);
console.log(`   ${grouped.length} share their rule with other selectors, where the property is still live.`);
for (const [f, n] of per(shadowed)) console.log(`   ${f.padEnd(16)} ${n}`);
if (verbose) for (const { loser, winner } of deletable)
  console.log(`     ${loser.file}:${loser.line}  ${loser.sel} { ${loser.prop}: ${loser.val} }  <- ${winner.file}:${winner.line} wins with ${winner.val}`);

console.log(`\nCROSS-FILE — a later file restates it; report only: ${crossFile.length}`);
for (const [f, n] of per(crossFile)) console.log(`   ${f.padEnd(16)} ${n}`);
if (verbose) for (const { loser, winner } of crossFile)
  console.log(`     ${loser.file}:${loser.line}  ${loser.sel} { ${loser.prop} }  <- ${winner.file}:${winner.line}`);

console.log(`\n${all.length} declarations across ${FILES.length} stylesheets.`);
