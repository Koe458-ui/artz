#!/usr/bin/env node

import { readFileSync } from 'node:fs';

let failed = 0;
for (const file of ['functions/api/ops.js', 'functions/api/store.js']) {
  const src = readFileSync(file, 'utf8');
  let body = '', n = 0;
  for (const m of src.matchAll(/const (\w+) = `([\s\S]*?)\n`;/g)) {
    if (/^STYLE/.test(m[1])) continue;
    body += m[2] + '\n';
    n++;
  }
  try {
    new Function(body);
    console.log(`ok    ${file} emits ${n} pieces, ${body.split('\n').length} lines that parse`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${file} emits something that does not parse: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
