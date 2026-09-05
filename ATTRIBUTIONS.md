# Attributions

Third-party material used by DigiArtz, kept here so the source files stay
free of other people's names and URLs.

## Profanity word list

`js/badwords-list-a.js` and `js/badwords-list-b.js` contain 2,536 entries
across 27 languages, adapted from:

**List of Dirty, Naughty, Obscene, and Otherwise Bad Words**
<https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words>
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)
<https://creativecommons.org/licenses/by/4.0/>

Changes made to the original: 67 entries removed (listed in
`js/badwords-review.js`), 2 dropped, entries regrouped by language and
stored pipe-separated.

CC BY 4.0 permits commercial use and modification. It requires credit to
the original author, a link to the licence, and an indication of what was
changed — all of which is the purpose of this file. Attribution may be
given "in any reasonable manner based on the medium", which is why it
lives here rather than inside every JavaScript file.

Removing this file without also removing the word list would put the
project outside the licence.

## Supabase JavaScript client

`js/vendor/supabase-js-2.112.2.min.js` is the browser build of:

**supabase-js**
<https://github.com/supabase/supabase-js>
Licensed under the MIT License
<https://opensource.org/licenses/MIT>

Unmodified. It is `dist/umd/supabase.js` from the `@supabase/supabase-js`
npm package at version 2.112.2 — the file the package itself names in its
`jsdelivr` and `unpkg` fields, which is the same build the site used to load
from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`.

sha256 04b957f2563a40dcb02b1d9d6f7a7a23973bf8ebe4c1435be5feaf24bff91134

It is served from this repository rather than from a CDN so that the service
worker can precache it with the rest of the shell. Loading it from a third
party put one uncached request on the critical path of every visit, including
visits that were otherwise fully offline.

To upgrade: take `dist/umd/supabase.js` from the new version's npm tarball,
save it under the new version number, and update the `<script>` in
`index.html`, the entry in `SHELL_URLS` in `sw.js`, and this file. The
version lives in the filename so that no cache can answer with the old build.

The MIT License requires that the copyright notice and permission notice
travel with the software. The minified build does not carry them — it has no
comment header at all — so `js/vendor/supabase-js-LICENSE.txt` is the LICENSE
file from the same npm tarball, kept beside the bundle. Removing it without
also removing the bundle would put the project outside the licence.
