const HOST = 'digiartz.net';
const SITE = `https://${HOST}`;
const KEY  = '8968b78d9c9d0df0553bf47f2e121021';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

const SECTIONS = [
  '/', '/explore', '/marketplace', '/community', '/resources', '/blog', '/login'
];
const LEGAL = [
  'privacy', 'terms'
].map((s) => `/legal/${s}`);

async function fromSitemap() {
  const res = await fetch(`${SITE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry-run');

const urls = args.has('--sitemap')
  ? await fromSitemap()
  : [...SECTIONS, ...LEGAL].map((p) => SITE + p);

const batches = [];
for (let i = 0; i < urls.length; i += 10000) batches.push(urls.slice(i, i + 10000));

console.log(`${urls.length} url${urls.length === 1 ? '' : 's'} in ${batches.length} batch(es)`);
for (const u of urls.slice(0, 20)) console.log('  ' + u);
if (urls.length > 20) console.log(`  … and ${urls.length - 20} more`);

if (dry) { console.log('\n--dry-run: nothing submitted'); process.exit(0); }

let failed = 0;
for (const [i, batch] of batches.entries()) {
  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: batch
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body
  });
  const okish = res.status === 200 || res.status === 202;
  if (!okish) failed++;
  console.log(`batch ${i + 1}/${batches.length}: ${res.status} ${res.statusText}` +
              (okish ? '' : ` — ${(await res.text()).slice(0, 200)}`));
}

if (failed) { console.error(`\n${failed} batch(es) rejected`); process.exit(1); }
console.log('\nsubmitted');
