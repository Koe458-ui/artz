# How DigiArtz loads, and where the time goes

Written after measuring, not after reading. Every number here came from
`scripts/perf-measure.mjs` against a real headless Chromium; re-run it before
trusting any of it, because it will drift.

## The shape of the thing

There is no build step. No `package.json`, no bundler, no transpiler. The site
is served exactly as it sits in the repository:

```
index.html          one document, 167 KB
  ├── 14 <link rel=stylesheet>      css/*.css          339 KB
  └── 41 <script defer src=...>     js/*.js            1.01 MB
functions/          Cloudflare Pages Functions (server only, never bundled to the browser)
  └── _middleware.js  rewrites <title>/og tags per URL and server-renders the
                      artwork grid into #awGrid before the HTML reaches the browser
sw.js               service worker, precaches the shell by exact ?v= URL
```

Cache busting is a `?v=N` on every reference, kept in step across `index.html`,
`sw.js` and `js/lazy.js` by the `precache` and `cachebust` CI jobs. It is manual
and it looks primitive. **It works** — see the repeat-visit numbers below — and
replacing it with content hashing would mean introducing a build step, which is
the single largest change anyone could make to this codebase. Not worth it for a
problem that is already solved.

### Nothing is inlined

Worth stating plainly, because it is easy to believe otherwise from DevTools:
`index.html` contains **961 bytes** of inline CSS and **1,163 bytes** of real
inline JavaScript. Another 12.5 KB is JSON-LD, which is data, not code. The
remaining **156 KB is markup** — every panel, dialog and section of the app
lives in the one document, and JavaScript shows and hides them.

If the DOM looks enormous in the Elements panel, that is the app having built
it at runtime (there are ~248 `innerHTML` assignments), not the server having
inlined anything. The Elements panel shows the live DOM; view-source shows what
was actually sent.

## Measured, mobile, 4x CPU throttle and Slow 4G

Three runs each side, taken back to back on the same machine by reverting the
change and re-applying it. Medians below; the raw samples are in the table under
it because three runs is not many and you should be able to see the spread.

| | first visit, before | first visit, after | repeat visit |
|---|---|---|---|
| first contentful paint | 3,044 ms | **2,584 ms** | **280 ms** |
| interactive (DOMContentLoaded) | 7,768 ms | 7,773 ms | **1,246 ms** |
| requests | 57 | 57 | 57, served from cache |
| transferred | 1,544 KB | 1,544 KB | ~0 |

```
before  FCP 3064 3044 3036    DCL 7768 7762 7770
after   FCP 2584 2564 2584    DCL 7778 7768 7773
```

Spread is under 1% on both metrics, so the 460 ms is a real difference and the
5 ms on DOMContentLoaded is not.

DOMContentLoaded did not move, and was not expected to: the change was to CSS,
and interactivity is gated by JavaScript. Bytes did not move either — the same
stylesheets are still downloaded, they just no longer hold up the first paint.

On desktop with no throttling the whole page paints in ~460 ms either way; the
CSS change is inside the noise there. This is a fix for phones.

**The returning visitor is already fast.** The `?v=` scheme plus
`_headers`' `max-age=31536000, immutable` on `/js/*` and `/css/*` means a second
visit re-reads everything from disk and is interactive in 1.25 s. Whatever is
worth optimising, it is not that.

**The first visit is the whole problem**, and it splits in two:

* **paint is gated by CSS**, because a stylesheet blocks rendering
* **interactivity is gated by JavaScript**, because 1.01 MB has to be
  downloaded, parsed and executed before `DOMContentLoaded`

Those want different fixes and carry very different risk.

## What was changed

Seven of the fourteen stylesheets — `viewer`, `community`, `ranking`,
`profile`, `admin`, `auth`, `upload` — style a panel that is closed when the
page opens. They now carry:

```html
<link rel="stylesheet" href="/css/viewer.css?v=52" media="print" onload="this.media='all'">
```

`media="print"` tells the browser it is not needed to paint, so it downloads at
low priority without blocking; `onload` puts it back to `all` the moment it
lands. **The `<link>` does not move.** That matters more than it looks:
`css/overrides.css` is named that because it deliberately wins over the files
above it, so appending a sheet later — the usual "load it dynamically" advice —
would silently change the cascade and the design with it.

Measured effect: **first contentful paint 3,044 ms → 2,584 ms on mobile**, a
460 ms (15%) improvement on the metric a visitor actually experiences as "did it open". The
rendered page is **pixel-identical** at 390px and 1440px (0.0000% of pixels
differ, `scripts/css-critical.mjs`). A `<noscript>` block repeats all seven so a visitor
with JavaScript off still gets them.

## What was not changed, and why

The JavaScript was left alone. That is a deliberate call, not an omission.

`scripts/deferrable.mjs` removes each script tag one at a time, reloads in a
real browser, and reports whether anything broke. It says 29 files (572 KB) can
be removed without changing the first screen. **Most of that is a trap**, and
one example is worth the whole tool:

`js/badwords.js` looks like an ideal candidate — 18 KB, nothing on the home
screen calls it. But its last act on load is:

```js
window.supabase.createClient = function () { return guard(make.apply(this, arguments)); };
```

It wraps the Supabase client factory so that every `insert`, `upsert`, `update`
and `rpc` the app ever makes has profanity scrubbed out of it. Defer it, and the
client is created unguarded and **the content filter silently stops working
site-wide**. The file even says so: `"badwords.js loaded before supabase-js —
filter not installed."`

Checking the rest for the same shape: of the eight largest candidates, only
`js/drafts.js` and `js/avatar.js` are free of load-time side effects. Everything
else patches a global, attaches a listener, or is depended on by something that
does. The three biggest files by far — `supabase-js` (211 KB), `sections.js`
(157 KB), `app-core.js` (64 KB) — are all boot-critical.

So the JavaScript can be split, but it is per-file surgery on a globals-coupled
application that carries payments and moderation, and it needs its own change
with its own testing. `js/lazy.js` is already the right mechanism — it loads a
named chunk and installs stubs that swap themselves for the real function once
it arrives, and six chunks already use it. Extending it is the path; guessing
which files to extend it with is not.

## Doing the next piece safely

```sh
npm i -g playwright && npx playwright install chromium   # once; the repo has no deps

node scripts/perf-measure.mjs --mobile --repeat   # where the time goes
node scripts/deferrable.mjs                       # what the first screen needs
node scripts/deferrable.mjs js/dm.js              # one file, in detail
node scripts/critical-path.mjs --file js/dm.js    # what it defines and who calls it
node scripts/css-critical.mjs widgets.css         # would deferring this change a pixel?
```

Before moving any script behind `js/lazy.js`:

1. `grep` it for `window.X =`, `prototype.`, `addEventListener` at top level. If
   it patches or listens at load, the stub pattern does not cover it — the
   patch has to happen eagerly even if the rest of the file does not.
2. List every global it defines that an `onclick=` in `index.html` names. All of
   them go in the chunk's `api` array or that button silently does nothing.
3. Re-run `deferrable.mjs` for that file and confirm no new console error.
4. Re-run `perf-measure.mjs --mobile` and confirm the number actually moved.

The two CI jobs that keep this honest are `deferredcss` (no first-screen
stylesheet gets deferred, every deferred one restores itself and has a noscript
fallback) and `precache` (the `?v=` list stays in step across all three files
that carry it).
