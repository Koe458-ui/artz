import { createClient } from "npm:@supabase/supabase-js@2";
import * as webp from "npm:@jsquash/webp@1.4.0";
import * as resizeMod from "npm:@jsquash/resize@2.1.0";

const resize: any = (resizeMod as any).default ?? resizeMod;

// The gate on this endpoint is a shared secret, so it is read from the
// function's environment rather than written here: a literal in the repository
// is known to everyone who can read the repository, which is not a secret.
// With BACKFILL_SECRET unset the endpoint answers nothing at all.
const SECRET = Deno.env.get("BACKFILL_SECRET") ?? "";

const WIDTH = 600;
const QUALITY = 52;

const BUCKET = "koe-media";
const SRC_SUFFIX = "__f1600.webp";
const OUT_SUFFIX = "__t600.webp";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

function secretOk(given: string): boolean {
  if (!SECRET) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(SECRET);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function walk(sb: any, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || !data.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await walk(sb, bucket, full)));
      else out.push(full);
    }
    if (data.length < 100) break;
    offset += data.length;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SECRET) return json({ error: "backfill secret not configured" }, 503);
  if (!secretOk(req.headers.get("x-backfill-secret") ?? "")) {
    return json({ error: "forbidden" }, 403);
  }

  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return json({ error: "service role key not available" }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch {   }
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 2;
  const dryRun = body.dryRun === true;

  let all: string[];
  try {
    all = await walk(sb, BUCKET);
  } catch (e) {
    return json({ stage: "walk", error: String((e as Error).message || e) }, 502);
  }

  const have = new Set(all);
  const sources = all.filter((p) => p.endsWith(SRC_SUFFIX));
  const missing = sources.filter((p) => !have.has(p.slice(0, -SRC_SUFFIX.length) + OUT_SUFFIX));
  const todo = missing.slice(0, limit);

  if (dryRun) {
    return json({
      dryRun: true, mediaObjects: all.length, sources: sources.length,
      missing: missing.length,
      wouldCreate: todo.map((p) => p.slice(0, -SRC_SUFFIX.length) + OUT_SUFFIX),
    });
  }

  const results: Array<Record<string, unknown>> = [];
  let done = 0, failed = 0;

  for (const src of todo) {
    const target = src.slice(0, -SRC_SUFFIX.length) + OUT_SUFFIX;
    try {
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(src);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);
      const input = new Uint8Array(await blob.arrayBuffer());

      const decoded = await webp.decode(input);

      const sw = decoded.width, sh = decoded.height;
      const scale = Math.min(1, WIDTH / sw);
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const sized = scale < 1 ? await resize(decoded, { width: w, height: h }) : decoded;

      const out = new Uint8Array(await webp.encode(sized, { quality: QUALITY }));
      if (!out.length) throw new Error("encode produced nothing");

      const { error: upErr } = await sb.storage.from(BUCKET).upload(target, out, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      done++;
      results.push({ target, kb: Math.round(out.length / 1024), dims: `${sw}x${sh} -> ${w}x${h}` });
    } catch (e) {
      failed++;
      results.push({ target, error: String((e as Error)?.message || e).slice(0, 300) });
    }
  }

  return json({
    sources: sources.length,
    missingBefore: missing.length,
    processed: done,
    failed,
    remaining: missing.length - done,
    results,
  });
});
