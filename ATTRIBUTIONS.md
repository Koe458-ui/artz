# Attributions

Third-party material used by Ored, kept here so the source files stay free
of other people's names and URLs.

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

It is served from this repository rather than from a CDN. Loading it from a
third party put one uncached request on the critical path of every visit and
handed a third party the ability to change the code that handles sign-in.

To upgrade: take `dist/umd/supabase.js` from the new version's npm tarball,
save it under the new version number, and update the `<script>` in
`index.html` and this file. The version lives in the filename so that no
cache can answer with the old build.

The MIT License requires that the copyright notice and permission notice
travel with the software. The minified build does not carry them — it has no
comment header at all — so `js/vendor/supabase-js-LICENSE.txt` is the LICENSE
file from the same npm tarball, kept beside the bundle. Removing it without
also removing the bundle would put the project outside the licence.

## Fonts

`fonts/` holds two typefaces, both from Google Fonts, both licensed under the

**SIL Open Font License 1.1**
<https://openfontlicense.org>

**Open Sans** — Steve Matteson
<https://fonts.google.com/specimen/Open+Sans>

**Kaushan Script** — Pablo Impallari, Rodrigo Fuenzalida
<https://fonts.google.com/specimen/Kaushan+Script>

Unmodified. The files are the woff2 subsets the Google Fonts CSS API serves to a
current browser, latin and latin-ext, taken from `fonts.gstatic.com`. Open Sans
is the variable build carrying weights 400 to 800 in one file, which is every
weight this page asks for.

| File | sha256 |
|---|---|
| `fonts/kaushan-script-latin-ext.woff2` | 342d7c72ac64631f8df9687721b63473a77b8bc66481844fb95b67c7153f3613 |
| `fonts/kaushan-script-latin.woff2` | addcc80ddcc170ff8c97140ab37ac380ac4e6d0b8fd14e5d107b4cb87ffd778f |
| `fonts/open-sans-latin-ext.woff2` | d5bab8e28732fe3d10dcef4f77b9c248605bbb2a87d289a2539251ceafab536a |
| `fonts/open-sans-latin.woff2` | d8e4fe0452aa2076429a9bb5d8757d00a994dd95986cf950e9a1a371b9a072a0 |

They are served from this repository rather than from Google, for the reason the
Supabase bundle is: it keeps the page to one origin, off a third party's uptime,
and inside a policy that grants `'self'` only. `_headers` needs no exception for
a font host, and `app.css` carries the `@font-face` rules that name these files.

The licence asks that the copyright and licence notice travel with the fonts.
Each family carries its own copyright line, so both notices are kept beside
them: `fonts/OFL-open-sans.txt` and `fonts/OFL-kaushan-script.txt`. Removing
either without also removing its font would put the project outside the licence.
