#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const store = new Map();
const localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const win = {
  localStorage,
  currentUser: null,
  addEventListener: () => {},

  setTimeout, clearTimeout, console,
};
win.window = win;
global.window = win;
global.localStorage = localStorage;
global.document = { addEventListener: () => {}, visibilityState: 'visible' };
global.self = win;
const nav = {};

const src = readFileSync(join(root, 'js', 'cache.js'), 'utf8');
new Function('window', 'localStorage', 'document', 'navigator', 'indexedDB', 'BroadcastChannel', src)
  (win, localStorage, global.document, nav, undefined, undefined);

const c = win.dzCache;
let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name, extra ?? ''); fails++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ok('key joins and drops empties', c.key('gallery', 'latest', '', null, 'page', 1) === 'gallery:latest:page:1');
ok('norm folds case and space', c.norm('  Dragon   Art ') === 'dragon-art');
ok('params sort is order free', c.params({ b: 2, a: 1 }) === c.params({ a: 1, b: 2 }));
ok('params drops all/empty', c.params({ cat: 'all', q: '', sort: 'latest' }) === 'sort=latest');

let calls = 0;
const slow = () => new Promise((r) => setTimeout(() => { calls++; r(['row']); }, 30));
const many = await Promise.all([1,2,3,4,5,6,7,8,9,10].map(() =>
  c.getOrSet('gallery:latest:page:1', slow, 'gallery:latest')));
ok('ten callers, one origin call', calls === 1, 'calls=' + calls);
ok('all ten got the value', many.every((r) => r[0] === 'row'));

calls = 0;
await c.getOrSet('gallery:latest:page:1', slow, 'gallery:latest');
ok('fresh read makes no request', calls === 0);
ok('peek is synchronous', c.peek('gallery:latest:page:1', 'gallery:latest')[0] === 'row');

await c.set('sw:test', ['old'], { policy: 'gallery:latest', ttl: 20, swr: 5000 });
await sleep(40);
calls = 0;
const served = await c.getOrSet('sw:test', () => { calls++; return ['new']; },
  { policy: 'gallery:latest', ttl: 20, swr: 5000 });
ok('stale value served at once', served[0] === 'old');
await sleep(20);
ok('refresh ran behind it', calls === 1);
ok('cache now holds the fresh value',
  (c.peek('sw:test', { policy: 'gallery:latest', ttl: 20, swr: 5000 }) || [])[0] === 'new');

await c.set('err:test', ['good'], 'gallery:latest');
const back = await c.getOrSet('err:test', () => Promise.reject(new Error('offline')), 'gallery:latest');
ok('fresh value survives a failing loader', back[0] === 'good');
await c.set('err:old', ['saved'], { policy: 'section:blog', ttl: 1, swr: 1 });
await sleep(20);
const lastResort = await c.getOrSet('err:old', () => Promise.reject(new Error('offline')),
  { policy: 'section:blog', ttl: 1, swr: 1 });
ok('offline:true serves the saved copy when the origin is gone', lastResort[0] === 'saved');

await c.set('err:quiet', ['saved'], { policy: 'gallery:latest', ttl: 1, swr: 1 });
await sleep(20);
let quietThrew = false;
try {
  await c.getOrSet('err:quiet', () => Promise.reject(new Error('offline')),
    { policy: 'gallery:latest', ttl: 1, swr: 1 });
} catch (e) { quietThrew = true; }
ok('without offline:true the error reaches the caller', quietThrew);
ok('and the saved copy is still there for recall',
  ((await c.recall('err:quiet', 'gallery:latest')) || [])[0] === 'saved');

let threw = false;
try {
  await c.getOrSet('miss:test', () => Promise.reject(new Error('nope')), 'gallery:latest');
} catch (e) { threw = true; }
ok('a miss with no saved copy rethrows', threw);

win.currentUser = { id: 'user-A' };
await c.set(c.ukey('bookmarks'), ['a1', 'a2'], 'user:list');
ok('A reads A', (c.peek(c.ukey('bookmarks'), 'user:list') || []).length === 2);
win.currentUser = { id: 'user-B' };
ok('B cannot read A (different key)', c.peek(c.ukey('bookmarks'), 'user:list') === null);
ok('B cannot read A by key either', c.peek('user:user-A:bookmarks', 'user:list') === null);
await c.set(c.ukey('bookmarks'), ['b1'], 'user:list');
ok('B reads B', (c.peek(c.ukey('bookmarks'), 'user:list') || []).length === 1);
win.currentUser = { id: 'user-A' };
ok('A still reads A after B wrote', (c.peek(c.ukey('bookmarks'), 'user:list') || []).length === 2);

win.currentUser = null;
ok('guest sees no member record', c.peek('user:user-A:bookmarks', 'user:list') === null);

win.currentUser = { id: 'user-A' };
await c.set(c.ukey('community', 'private-room'), [{ text: 'members only' }], 'community:posts');
await c.set(c.ukey('analytics', 'artworks', '7d'), [{ views: 4210 }], 'user:analytics');
win.currentUser = { id: 'user-B' };
ok('B cannot read A\'s community room',
  c.peek(c.ukey('community', 'private-room'), 'community:posts') === null);
ok('B cannot read A\'s room by A\'s own key',
  c.peek('user:user-A:community:private-room', 'community:posts') === null);
ok('B cannot read A\'s analytics',
  c.peek('user:user-A:analytics:artworks:7d', 'user:analytics') === null);

const planted = {
  k: c.build + '|u|user-B|user:user-B:friends',
  key: 'user:user-B:friends',
  v: { 'someone-else': { status: 'accepted' } },
  t: Date.now(), f: Date.now() + 60000, s: Date.now() + 60000,
  u: 'user-A',
  a: Date.now(), p: 'user:friends',
};
store.set('dzc2:' + planted.k, JSON.stringify(planted));
const before = c.stats().reject;
ok('a record with the wrong owner is refused even at the right key',
  c.peek('user:user-B:friends', 'user:friends') === null);
ok('and the refusal is counted', c.stats().reject > before, c.stats().reject);

win.currentUser = { id: 'user-A' };
ok('A still reads A\'s room',
  (c.peek(c.ukey('community', 'private-room'), 'community:posts') || [])[0].text === 'members only');

win.currentUser = { id: 'user-A' };
await c.set(c.ukey('thread', 'p1'), ['hi'], 'user:thread');
await c.set('gallery:latest:page:9', ['public'], 'gallery:latest');
await c.dropPrivate();
ok('sign out drops private', c.peek(c.ukey('thread', 'p1'), 'user:thread') === null);
ok('sign out keeps public', (c.peek('gallery:latest:page:9', 'gallery:latest') || [])[0] === 'public');

await c.set('gallery:latest:page:1', ['g'], 'gallery:latest');
await c.set('section:blog:page:1', ['b'], 'section:blog');
await c.set('community:posts:showcase', ['m'], 'community:posts');
await c.invalidateArtwork('art-1', { userId: 'user-A' });
ok('artwork edit drops gallery', c.peek('gallery:latest:page:1', 'gallery:latest') === null);
ok('artwork edit spares the blog tab', (c.peek('section:blog:page:1', 'section:blog') || [])[0] === 'b');
ok('artwork edit spares community', (c.peek('community:posts:showcase', 'community:posts') || [])[0] === 'm');

let resolveLate;
const late = new Promise((r) => { resolveLate = r; });
const p = c.getOrSet('gallery:trending:page:1', () => late, 'gallery:trending');
await c.invalidateRanking();
await c.deleteByPrefix('gallery:');
resolveLate(['from-before']);
await p;
ok('answer from before an invalidation is not stored',
  c.peek('gallery:trending:page:1', 'gallery:trending') === null);

let resolveShared;
const shared = new Promise((r) => { resolveShared = r; });
const both = Promise.all([
  c.getOrSet('gallery:trending:page:2', () => shared, 'gallery:trending'),
  c.getOrSet('gallery:trending:page:2', () => shared, 'gallery:trending'),
]);
await c.deleteByPrefix('gallery:trending');
resolveShared(['from-before']);
const got = await both;
ok('both deduped callers still get the answer', got[0][0] === 'from-before' && got[1] === got[0]);
ok('and neither of them stores it',
  c.peek('gallery:trending:page:2', 'gallery:trending') === null,
  c.peek('gallery:trending:page:2', 'gallery:trending'));

let loaderRan = false;
const early = c.getOrSet('gallery:category:anime:page:1',
  () => { loaderRan = true; return ['pre-mutation']; }, 'gallery:category');
await c.invalidateArtwork('art-2', { userId: 'user-A' });
const earlyGot = await early;
ok('the in-window caller still gets its answer', earlyGot[0] === 'pre-mutation' && loaderRan);
ok('but an answer from before the mutation is not stored',
  c.peek('gallery:category:anime:page:1', 'gallery:category') === null,
  c.peek('gallery:category:anime:page:1', 'gallery:category'));

win.currentUser = { id: 'user-A' };
let resolveMine;
const mine = new Promise((r) => { resolveMine = r; });
const pending = c.getOrSet(c.ukey('analytics', 'artworks', '30d'), () => mine, 'user:analytics')
  .catch(() => null);
await c.dropPrivate();
win.currentUser = { id: 'user-B' };
resolveMine([{ views: 999 }]);
await pending;
win.currentUser = { id: 'user-A' };
ok('a reply for the member who signed out is not stored',
  c.peek(c.ukey('analytics', 'artworks', '30d'), 'user:analytics') === null,
  c.peek(c.ukey('analytics', 'artworks', '30d'), 'user:analytics'));
win.currentUser = null;

calls = 0;
await c.getOrSet('quota:today', () => { calls++; return { left: 3 }; }, 'none');
await c.getOrSet('quota:today', () => { calls++; return { left: 3 }; }, 'none');
ok('an uncacheable policy asks every time', calls === 2, 'calls=' + calls);
ok('and stores nothing', c.peek('quota:today', 'none') === null);

await c.set('categories:all', ['anime', 'cars'], 'categories');
const mirrored = [...store.keys()].filter((k) => k.includes('categories:all'));
ok('sync policy reaches localStorage', mirrored.length === 1, mirrored);
const nonSync = [...store.keys()].filter((k) => k.includes('section:blog'));
ok('non-sync policy stays out of localStorage', nonSync.length === 0, nonSync);

console.log('\n' + (fails ? fails + ' FAILED' : 'all passed') +
  '\nstats: ' + JSON.stringify(c.stats()));
process.exit(fails ? 1 : 0);
