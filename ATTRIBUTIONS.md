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
`ored/index.html` and this file. The version lives in the filename so that no
cache can answer with the old build.

The MIT License requires that the copyright notice and permission notice
travel with the software. The minified build does not carry them — it has no
comment header at all — so `js/vendor/supabase-js-LICENSE.txt` is the LICENSE
file from the same npm tarball, kept beside the bundle. Removing it without
also removing the bundle would put the project outside the licence.
