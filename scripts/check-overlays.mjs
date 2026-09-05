import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');

const css = readdirSync('css')
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync('css/' + f, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const positioning = [];
for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!/position\s*:\s*(fixed|absolute|sticky)/.test(body)) continue;
  for (const sel of selectors.split(',')) {
    const last = sel.trim().split(/\s+|>/).pop() || '';
    for (const token of last.split(':')[0].match(/[#.][\w-]+/g) || []) {
      positioning.push(token);
    }
  }
}
const positions = new Set(positioning);

const VOID = new Set(['area','base','br','col','embed','hr','img','input',
                      'link','meta','param','source','track','wbr']);
const stack = [];
const problems = [];

for (const m of html.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
  const [, closing, tag, attrs, selfClose] = m;
  if (closing) {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) { stack.length = i; break; }
    }
    continue;
  }

  const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || '';
  const classes = ((attrs.match(/\bclass="([^"]+)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
  const keys = [id && '#' + id, ...classes.map((c) => '.' + c)].filter(Boolean);
  const frame = { tag, id, classes, keys };

  if (/\brole="dialog"/.test(attrs)) {
    const covered = [frame, ...stack].some((f) => f.keys.some((k) => positions.has(k)));
    if (!covered) {
      problems.push(
        `<${tag}${id ? ' id="' + id + '"' : ''}` +
        `${classes.length ? ' class="' + classes.join(' ') + '"' : ''}>`);
    }
  }

  if (!selfClose && !VOID.has(tag)) stack.push(frame);
}

if (problems.length) {
  console.error('These dialogs have no rule giving them a position, so they render');
  console.error('in the page flow instead of over it:\n');
  for (const p of problems) console.error('  ' + p);
  console.error('\nGive each one a class that is already an overlay (.rptMod, .upPop)');
  console.error('or a rule of its own. See css/viewer.css for why this check exists.');
  process.exit(1);
}

const count = [...html.matchAll(/\brole="dialog"/g)].length;
console.log(`overlays ok — ${count} dialogs, every one positioned over the page`);
