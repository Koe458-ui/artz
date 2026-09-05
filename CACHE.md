# Caching in DigiArtz

The site used to be one HTML file. It is thirty-six scripts, fifteen
stylesheets and a Supabase project now, and the caching had not caught up: one
service worker cache called "the shell" held every static file, every script
and stylesheet was revalidated over the network on every load, two image caches
held sixty and fifty objects between them, and data caching was a handful of
localStorage snapshots that were only ever read after a fetch had already
failed.

This is what replaced it. There are two systems, and they are separate on
purpose:

| | what it holds | where | who runs it |
|---|---|---|---|
| **files** | HTML, JS, CSS, images, fonts | Cache Storage | `sw.js` |
| **data** | rows from Supabase | memory, IndexedDB, localStorage | `js/cache.js` |

Everything below rests on one rule.

## The rule

**Supabase and object storage are the source of truth. The cache is never an
authority.**

Nothing in either system decides whether a member may read a row, open a file,
or spend a download. A cached copy is only ever a faster answer to a question
the server has already said yes to. Where the cache and the database disagree,
the database is right and the cached copy is dropped.

Three things are therefore *deliberately* uncached, and adding them later would
be a bug rather than an optimisation:

- **subscription and entitlement state** — held for fifteen seconds in memory
  at most, never written to disk, and re-checked server-side at every
  protected operation.
- **the daily download quota** — checked and consumed server-side, atomically,
  on every download. No number in a browser has any bearing on it.
- **anything under `/api/*`** — Pages Functions answer per caller behind a
  session check. `_headers` sends `no-store, private` and the service worker
  passes them straight to the network. A stored copy of one of those is a
  signed-in answer waiting to be handed to whoever asks next.

## Files: the service worker

`sw.js`, one cache per kind of thing, all named with `CACHE_VERSION` so a
release renames them and the old set is deleted on activate.

| cache | holds | cap | strategy |
|---|---|---|---|
| `dz-static-*` | index.html, JS, CSS, icons | precache list | cache-first if versioned |
| `dz-img-thumb-*` | `__t300` grid images | 300 | cache-first |
| `dz-img-card-*` | `__t600` grid images at 2x | 150 | cache-first |
| `dz-img-view-*` | `__v1000` viewer images | 60 | cache-first |
| `dz-img-full-*` | `__f1600` download size | 6 | cache-first |
| `dz-img-media-*` | avatars, banners, community icons, previews | 150 | cache-first |
| `dz-font-*` | Google Fonts | 20 | cache-first |

The split is the point. Held together, one eviction rule governs a 15KB
thumbnail read on every screen and a 140KB download image read once — and a
scroll through the gallery evicts the app itself.

**Why cache-first is safe for scripts and styles.** Every reference carries
`?v=<n>`; the vendored Supabase build carries its version in its filename. A
release is therefore a *different URL*, and a copy under the old URL cannot be
wrong, only unused. `scripts/check-precache.mjs` fails the build if a reference
is missing its `?v=`, if `index.html` and `sw.js` disagree about a version, or
if the precache list holds something the page does not load.

That is only half of it, and the other half went unenforced for a long time:
the number has to *move* when the file does. A stylesheet edited under a `?v=`
that has already shipped is served to new visitors and to nobody else — the
browser was told a year ago that this URL is `immutable`, so it never asks
again, and the service worker answers it cache-first besides. The deploy
succeeds, the edge holds the right bytes, and the returning visitor keeps last
week's copy. "The update did not apply" is what that looks like from outside.
A walk of the history found it in dozens of commits, and three assets were live
in that state the day it was found. `scripts/check-cachebust.mjs` compares
every versioned asset against the copy `origin/main` serves and fails when one
changed without a new number. Those two checks together are what lets `_headers`
serve `/js/*` and `/css/*` with `max-age=31536000, immutable`.

**Why images can be held for a year.** Every upload path carries a timestamp —
`artworks/<uid>/<ms>_<name>`, `avatars/<uid>/<ms>.jpg`,
`communities/<uid>/<cid>-<ms>.<ext>` — and nothing is ever written over. A
re-crop uploads a new object and deletes the old one. So an image URL is
immutable by construction, which is also why an avatar change is seen
immediately despite a week-long TTL: it is a new URL.

**index.html is never answered from a cache while there is a network.** It is
the file that says which bundles are current. Navigations are network-first,
and a successful one refreshes the offline copy so the shell that comes back
offline is the page as last seen.

**Storage objects are re-requested as `cors`.** An `<img>` fetches `no-cors`
and a `no-cors` response is opaque — status 0, no readable headers — so caching
those meant caching whatever came back, including a 404 for a deleted artwork,
pinned under the image's URL. Only a 200 is stored now.

The page can ask the worker to drop specific images (`DZ_DROP_IMAGES`), which
is what a delete needs. There is no message that empties everything.

## Data: `js/cache.js`

One service, three tiers, one policy table.

- **memory** — a bounded LRU Map (400 entries), this tab, this session.
- **disk** — IndexedDB (1200 entries, swept on start), survives the browser
  being closed.
- **mirror** — a small localStorage tier for the few values that must be read
  *synchronously*, before the first paint.

```js
dzCache.getOrSet(key, loader, policy, onFresh)  // the one most call sites want
dzCache.peek(key, policy, { any: true })        // synchronous, for the paint
dzCache.recall(key, policy)                     // last-resort read, any age
dzCache.set / get / delete / deleteByPrefix
dzCache.invalidateArtwork(id, { userId, ranking })
dzCache.invalidateProfile(id, username)
dzCache.invalidateCommunity(channel)
dzCache.invalidateSection(sec, id)
dzCache.invalidateComments(kind, id) / invalidateStats(id) / invalidateRanking()
dzCache.invalidateFriends() / invalidateThread(pid) / invalidateAnalytics()
dzCache.dropPrivate()                           // sign-out
dzCache.stats() / dzCache.report()              // from the console
```

`getOrSet` gives four behaviours from one call:

1. **fresh** → the cached value, no request.
2. **stale, inside the SWR window** → the cached value *immediately*, refresh
   behind it, `onFresh` repaints when it lands.
3. **past SWR, or nothing** → await the loader, then store.
4. **the loader failed** → the stored value if the policy allows it, and
   **nothing is overwritten**. A failed response never replaces good data.

Identical concurrent requests collapse into one origin call, so ten components
asking for the gallery in the same frame make one query to Supabase.

### Private data

Every private record is stamped with the member id it was fetched for and
**refused** for any other session — not merely ignored. Keys are additionally
spelled `user:<id>:…` by `dzCache.ukey()`, so a record cannot even be looked up
from the wrong session. Signing out drops every private record from all three
tiers immediately, cancels pending writes, and marks in-flight requests so
their answers cannot be written back under the session that replaces them.

The default scope is `private`. A policy added later without saying which it is
gets the safe answer.

Community *messages* are private-scoped even though most rooms are open,
because whether this member may read *this* room is the database's decision and
a shared record would hand a members-only discussion to the next person to sign
in on a shared laptop.

### The policy table

Set in one place, `POLICY` in `js/cache.js`. Roughly:

| policy | fresh | servable | scope | disk |
|---|---|---|---|---|
| `gallery:latest` | 45s | +5m | public | yes |
| `gallery:trending` | 3m | +10m | public | yes |
| `artwork` | 3m | +10m | public | yes |
| `artwork:stats` | 15s | +45s | public | no |
| `profile:public` | 5m | +10m | public | yes |
| `artist:artworks` | 2m | +10m | public | yes |
| `comments` | 20s | +60s | public | no |
| `section:blog` / `resources` | 5m | +10m | public | yes |
| `section:marketplace` | 3m | +10m | public | yes |
| `section:jobs` | 60s | +5m | public | yes |
| `section:item` | 5m | +15m | public | yes |
| `search` | 60s | — | public | no |
| `ranking` | 3m | +10m | public | yes |
| `communities` | 3m | +10m | public | yes |
| `community:posts` | 45s | +3m | **private** | yes |
| `user:profile` | 60s | +10m | **private** | yes |
| `user:friends` | 30s | +5m | **private** | yes |
| `user:convos` | 20s | +5m | **private** | yes |
| `user:thread` | 10s | +2m | **private** | yes |
| `user:list` (bookmarks, likes) | 30s | +5m | **private** | yes |
| `user:analytics` | 2m | +5m | **private** | yes |
| `user:notifications` | 10s | — | **private** | no |
| `cart` | 15s | — | **private** | no |
| `subscription` | 15s | — | **private** | no |
| `none` | — | — | — | never cached |

A `null` answer — a deleted item, a mistyped id — is stored for twenty seconds
regardless of policy, so a bot walking old URLs does not become a query each
time, and an item published a moment later is not missing for minutes.

### What is cached where

- **home page and gallery** — one record of every approved, published artwork,
  shared by both surfaces. The first twenty, trimmed to the columns a card
  needs, also live in the synchronous tier: that is what paints the grid on a
  repeat visit before the network has been asked at all.
- **profiles** — the row, by username, and the first page of the artwork grid
  (a visitor's view only; the owner's includes drafts and hidden pieces).
- **section tabs** — blog, resources, marketplace, jobs: 200 rows each, keyed
  by section and whether there is a session, because the select list differs.
- **item detail** — the row behind a shared `/blog/<id>` style link.
- **comments** — first page only, twenty seconds, memory only.
- **search** — the whole set of section results, keyed by normalised query and
  scope, memory only.
- **ranking** — the boards, and each page of the full leaderboard.
- **communities** — the last fifty messages of the last dozen rooms visited.
- **chat** — friends, the conversation list, and the last fifty messages of the
  last thirty threads. The messages are written down for the *paint*; the
  five-second poll always goes to the database, because a message that has
  arrived and is not shown is the one thing chat may never do.
- **their own things** — profile row, bookmarks, likes, analytics readings.

### Mutations

The order is not negotiable:

```
write  →  database confirms  →  invalidate the affected keys  →  repaint
```

Invalidating first leaves a window in which a refresh reads the state the
mutation was replacing and stores *that* as the current answer. And a key
invalidated while a request for it is already in flight is marked, so the
answer from before the change is handed to its caller but never written.

Invalidation is always by name. An upload drops the artwork listings, the
artist's own pages, the artwork searches and the rankings — and nothing else:
not the section tabs, not communities, not any private record, and not the
three hundred thumbnails the member has already downloaded.

## When it is not there

If `js/cache.js` fails to load, if IndexedDB is unavailable, or if storage
throws, `window.dzCached()` returns a shim that calls the loader and returns
the answer. Every call site is written against that possibility. The site gets
slower. It does not get wrong, and it does not break.

## Checking it

```
node scripts/check-precache.mjs   # sw.js precaches what index.html loads,
                                  # and every asset carries its ?v=
node scripts/cache-test.mjs       # the cache service keeps its promises
```

`scripts/cache-test.mjs` runs `js/cache.js` in plain Node with no browser and
no IndexedDB — which also exercises the degradation path — and asserts the two
classes of mistake that do not show up by clicking around: one member's data
answered from a record written for another, and an answer stored after the
mutation that invalidated it. Both run in CI on every push.

From a browser console:

```js
await dzCache.report()   // hit ratio, what is on disk by policy,
                         // and what the service worker is holding
localStorage.setItem('dz.cache.debug', '1')   // log invalidations and sweeps
```
