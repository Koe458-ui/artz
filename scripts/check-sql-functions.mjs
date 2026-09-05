#!/usr/bin/env node
//
// Every function the migrations leave behind pins its search_path, and none of
// them leaves a trigger function reachable by a member role.
//
// security/rls-regression.sql asserts both against the live catalogue, but that
// suite is run by hand and CI never sees it. Two invariants had quietly stopped
// holding by 2026-09-05 and nothing said so, because nothing looked. This looks
// at the migrations, which is where the mistake is made and where a failing job
// can still be read as a diff.
//
// CREATE OR REPLACE is the trap: it replaces the whole definition, so a rewrite
// that omits SET search_path drops the setting the original had. That is
// exactly how xp_level_thresholds lost its.
//
// Migrations are replayed in filename order and only the state they add up to
// is judged, so a later migration that re-pins or revokes settles an earlier
// one rather than being shouted at for history that has already been fixed.

import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

// Strip line comments and dollar-quoted bodies. Function bodies are full of
// text that reads like SQL and would otherwise be taken for declarations.
const skeleton = (sql) => sql
  .replace(/--[^\n]*/g, '')
  .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' $BODY$ ');

const CREATE = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
const GRANT  = /\bgrant\s+execute\s+on\s+function\s+([\s\S]*?)\s+to\s+([^;]+);/gi;
const REVOKE = /\brevoke\s+execute\s+on\s+function\s+([\s\S]*?)\s+from\s+([^;]+);/gi;
const REVOKE_ALL = /\brevoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+([^;]+);/gi;

const MEMBER = /\b(public|anon|authenticated)\b/;

// The header of a CREATE FUNCTION runs from its name to the body or statement end.
function header(text, from) {
  const body = text.indexOf('$BODY$', from);
  const stop = text.indexOf(';', from);
  const end = body === -1 ? stop : stop === -1 ? body : Math.min(body, stop);
  return text.slice(from, end === -1 ? text.length : end);
}

// "public.f(a int), g(b text)" -> ['f', 'g']
const names = (list) =>
  [...list.matchAll(/(?:public\.)?([a-z0-9_]+)\s*\(/gi)].map((m) => m[1]);

const fns = new Map();  // name -> { file, pinned, trigger, memberExec }
const touch = (n) => {
  if (!fns.has(n)) fns.set(n, { file: '?', pinned: true, trigger: false, memberExec: false });
  return fns.get(n);
};

for (const f of files) {
  const text = skeleton(readFileSync(`${DIR}/${f}`, 'utf8'));

  for (const m of text.matchAll(CREATE)) {
    const head = header(text, m.index);
    const fn = touch(m[1]);
    fn.file = f;
    fn.pinned = /\bset\s+search_path\s+(?:to|=)/i.test(head);
    fn.trigger = /\breturns\s+trigger\b/i.test(head);
  }

  for (const m of text.matchAll(REVOKE_ALL)) {
    if (!MEMBER.test(m[1].toLowerCase())) continue;
    for (const fn of fns.values()) fn.memberExec = false;
  }
  for (const m of text.matchAll(REVOKE)) {
    if (!MEMBER.test(m[2].toLowerCase())) continue;
    for (const n of names(m[1])) touch(n).memberExec = false;
  }
  for (const m of text.matchAll(GRANT)) {
    if (!MEMBER.test(m[2].toLowerCase())) continue;
    for (const n of names(m[1])) touch(n).memberExec = true;
  }
}

const problems = [];
for (const [name, fn] of fns) {
  if (!fn.pinned) {
    problems.push(`${fn.file}: ${name}() is defined without SET search_path`);
  }
  if (fn.trigger && fn.memberExec) {
    problems.push(
      `${name}() returns trigger and still holds EXECUTE for a member role — ` +
      'firing a trigger does not check EXECUTE, so the grant only widens reach');
  }
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\n${problems.length} problem(s) across ${files.length} migrations`);
  process.exit(1);
}

const triggers = [...fns.values()].filter((f) => f.trigger).length;
console.log(`sql ok — ${fns.size} functions across ${files.length} migrations, ` +
            `every one pins search_path; ${triggers} trigger functions, ` +
            'none reachable by anon or authenticated');
