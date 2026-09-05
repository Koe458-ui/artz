#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT   = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

const WIDTH   = 600;
const QUALITY = 52;

const PRIVATE_BUCKET = 'koe-originals';
const PUBLIC_BUCKET  = 'koe-media';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const stripExt = (p) => p.replace(/\.[a-z0-9]+$/i, '');

async function walk(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || !data.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...await walk(bucket, full));
      else out.push(full);
    }
    if (data.length < 100) break;
    offset += data.length;
  }
  return out;
}

async function main() {
  console.log(`Scanning ${PRIVATE_BUCKET} …`);
  const originals = await walk(PRIVATE_BUCKET);
  console.log(`  ${originals.length} originals`);

  console.log(`Scanning ${PUBLIC_BUCKET} …`);
  const existing = new Set(await walk(PUBLIC_BUCKET));
  console.log(`  ${existing.size} objects`);

  const todo = originals
    .filter((p) => !existing.has(`${stripExt(p)}__t600.webp`))
    .slice(0, LIMIT);

  console.log(`\n${todo.length} missing __t600.webp${DRY_RUN ? ' (dry run, nothing will be written)' : ''}\n`);
  if (!todo.length) return;

  let done = 0, failed = 0, bytes = 0;

  for (const path of todo) {
    const target = `${stripExt(path)}__t600.webp`;
    try {
      if (DRY_RUN) { console.log(`would create  ${target}`); done++; continue; }

      const { data: blob, error: dlErr } = await sb.storage.from(PRIVATE_BUCKET).download(path);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);

      const input = Buffer.from(await blob.arrayBuffer());
      const output = await sharp(input)
        .resize({ width: WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();

      const { error: upErr } = await sb.storage.from(PUBLIC_BUCKET).upload(target, output, {
        contentType: 'image/webp',
        upsert: false
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      bytes += output.length;
      done++;
      console.log(`ok  ${target}  ${(output.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${target}: ${e.message}`);
    }
  }

  console.log(`\ndone ${done}, failed ${failed}`);
  if (done && !DRY_RUN) {
    console.log(`average ${(bytes / done / 1024).toFixed(0)} KB per t600`);
    console.log('\nIf failed is 0, set T600_READY: true in config.js and on the Pages project.');
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
