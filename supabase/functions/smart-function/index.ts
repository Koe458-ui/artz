import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_IMG_BYTES   = 25 * 1024 * 1024;
const MAX_ASSET_BYTES     = 200 * 1024 * 1024;
const MAX_ASSET_BYTES_MAX = 400 * 1024 * 1024;
const IMG_TYPES = /^image\/(png|jpe?g|webp|gif|avif)$/;

const RATE_10MIN = 40;
const RATE_24H   = 400;

const DOWNLOAD_URL_TTL = 120;

const PUBLIC_BUCKET  = "koe-media";
const PRIVATE_BUCKET = "koe-originals";

const DERIVATIVES = [
  { role: "t300",  suffix: "__t300.webp" },
  { role: "t600",  suffix: "__t600.webp" },
  { role: "v1000", suffix: "__v1000.webp" },
  { role: "f1600", suffix: "__f1600.webp" },
];

const LEGACY_ROLES = ["t300", "v1000", "f1600"];

const stripExt   = (p: string) => p.replace(/\.[a-z0-9]+$/i, "");
const sbPublicUrl = (path: string) =>
  `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ASSET_PREFIX = /^koe-media\/(resources|market)\//;

const ASSET_EXT = new Set([
  "zip","rar","7z","tar","gz","tgz",
  "psd","psb","ai","eps","pdf","svg",
  "abr","atn","tpl","asl","grd","shx","pat","aco","ase",
  "brushset","brush","procreate","swatches",
  "clip","csp","sut","cmc",
  "ttf","otf","woff","woff2",
  "obj","fbx","blend","glb","gltf","stl","mtl","dae","c4d","ztl",
  "png","jpg","jpeg","webp","gif","avif","tif","tiff",
  "mp4","webm","mov",
]);

// Only the site may call this from a browser. Authorization here is a bearer
// token rather than a cookie, so `*` was not exploitable on its own -- but it
// also meant any page anywhere could drive this function with a token it had
// got hold of, and origin is a free extra layer to have.
const ALLOWED_ORIGINS = new Set([
  "https://digiartz.net",
  "https://www.digiartz.net",
]);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://digiartz.net";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
// CORS is attached once, by the wrapper at the bottom, so every exit path --
// including a thrown one -- carries the same headers.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const extOf = (p: string) => (p.split(".").pop() || "").toLowerCase();

function serviceClient() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}

Deno.serve(async (req) => {
  const headers = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  let res: Response;
  try {
    res = await handle(req);
  } catch {
    res = json({ error: "unexpected error" }, 500);
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST")    return json({ error: "POST only" }, 405);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: "auth required" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (body.action === "download") {
    const artwork = String(body.artwork || "");
    if (!UUID_RE.test(artwork)) return json({ error: "bad artwork id" }, 400);

    const ip = typeof body.ip === "string" ? body.ip.slice(0, 64) : null;
    const { data: gate, error: gateErr } = await supa.rpc("dz_request_download", {
      p_artwork: artwork,
      p_ip: ip,
    });
    if (gateErr) return json({ error: "could not check your download quota" }, 502);

    if (!gate || !gate.allowed) {
      const reason = (gate && gate.reason) || "denied";
      if (reason === "rate")
        return json({ reason, retry_after: gate.retry_after ?? 60, error: "too many download requests" }, 429);
      if (reason === "limit")
        return json({ ...gate, reason, error: "daily download quota reached" }, 429);
      if (reason === "auth")      return json({ reason, error: "auth required" }, 401);
      if (reason === "not_found") return json({ reason, error: "artwork not found" }, 404);
      return json({ reason, error: "download not allowed" }, 403);
    }

    const { data: row } = await supa
      .from("artworks").select("name,image_url,storage_path").eq("id", artwork).maybeSingle();
    if (!row || !row.image_url) return json({ reason: "not_found", error: "artwork not found" }, 404);

    let url: string | null = null;

    if (gate.full) {
      const svc = serviceClient();
      if (!svc) return json({ error: "storage signer not configured" }, 500);
      const objPath = String(row.storage_path || "");
      if (!objPath || objPath.startsWith("/") || objPath.includes("..")) {
        return json({ error: "unsupported source" }, 502);
      }
      const { data: sig, error: sigErr } =
        await svc.storage.from(PRIVATE_BUCKET).createSignedUrl(objPath, DOWNLOAD_URL_TTL);
      if (sigErr || !sig?.signedUrl) return json({ error: "could not sign the file" }, 502);
      url = sig.signedUrl.startsWith("http")
        ? sig.signedUrl
        : `${Deno.env.get("SUPABASE_URL")}${sig.signedUrl}`;
    }
    return json({ gate, name: row.name || "", imageUrl: row.image_url, url });
  }

  const path = String(body.path || "");

  if (!/^[a-zA-Z0-9_\-./]{3,300}$/.test(path) || path.includes("..") || path.startsWith("/"))
    return json({ error: "bad path" }, 400);
  if (!/^koe-media\//.test(path))
    return json({ error: "unknown prefix" }, 400);

  const objKey = path.replace(/^koe-media\//, "");

  // Every path the client builds is "<kind>/<uid>/<file>", and storage RLS holds
  // both buckets to a folder named for auth.uid(). This says the same thing here
  // so a request for someone else's prefix is refused before a signed URL is
  // minted for it, rather than relying on the storage layer alone.
  let staff: boolean | null = null;
  const ownsPath = async () => {
    const seg = objKey.split("/");
    if (seg.length >= 3 && seg[1] === user.id) return true;
    if (staff === null) {
      const { data: prof } = await supa.from("profiles").select("role").eq("id", user.id).single();
      staff = !!prof && ["admin", "dev"].includes(prof.role ?? "");
    }
    return staff;
  };

  if (body.action === "upload") {
    if (!(await ownsPath())) return json({ error: "not your folder" }, 403);

    const ct    = String(body.contentType || "");
    const size  = Number(body.size);
    const asset = ASSET_PREFIX.test(path);

    if (asset) {
      if (!ASSET_EXT.has(extOf(path)))
        return json({ error: "file type not allowed" }, 400);
      let assetCap = MAX_ASSET_BYTES;
      try {
        const tierSvc = serviceClient();
        if (tierSvc) {
          const { data: tier } = await tierSvc.rpc("dz_effective_tier", { p_user: user.id });
          if (tier === "max") assetCap = MAX_ASSET_BYTES_MAX;
        }
      } catch {   }
      if (!(size > 0) || size > assetCap)
        return json({ error: `file too large (max ${Math.round(assetCap / 1048576)}MB)` }, 400);
    } else {
      if (!IMG_TYPES.test(ct))
        return json({ error: "images only" }, 400);
      if (!(size > 0) || size > MAX_IMG_BYTES)
        return json({ error: "file too large" }, 400);
    }

    // Counting rows and then inserting one is two statements with a gap in the
    // middle: N requests sent together all read the same count, all find room,
    // and all proceed. dz_rate_take closes the gap -- it is a single
    // INSERT .. ON CONFLICT DO UPDATE .. RETURNING, so the Nth caller in a
    // burst sees N, not 0.
    //
    // It also fails closed. This limiter is the only thing standing between one
    // account and an unbounded run at 400MB-a-file storage, and the old
    // `catch (_e) {}` around it turned every hiccup into free uploads.
    //
    // dz_rate_take rather than dz_rate_ok: the two are the same counter, but
    // dz_rate_ok sweeps rate_hits older than an hour. A 24h window is stamped
    // at UTC midnight, so that sweep would delete the daily bucket every hour
    // and the daily cap would never bind. dz_rate_take sweeps at a day, which
    // outlives the window it is counting.
    {
      const rateSvc = serviceClient();
      if (!rateSvc) return json({ error: "upload limiter is not configured" }, 503);
      try {
        const [burst, daily] = await Promise.all([
          rateSvc.rpc("dz_rate_take", {
            p_bucket: `up:10m:${user.id}`, p_limit: RATE_10MIN, p_seconds: 600,
          }),
          rateSvc.rpc("dz_rate_take", {
            p_bucket: `up:24h:${user.id}`, p_limit: RATE_24H, p_seconds: 86400,
          }),
        ]);
        if (burst.error || daily.error) throw burst.error || daily.error;
        if (burst.data === false || daily.data === false)
          return json({ error: "Upload limit reached — please try again in a little while." }, 429);
        if (burst.data !== true || daily.data !== true)
          return json({ error: "Could not check your upload allowance — try again shortly." }, 503);
      } catch (_e) {
        return json({ error: "Could not check your upload allowance — try again shortly." }, 503);
      }
      // Kept for the audit trail the dashboard reads; the limit above no longer
      // depends on it, so a failure here cannot grant an upload.
      await supa.from("upload_events").insert({ user_id: user.id }).then(
        () => {}, () => {},
      );
    }

    const isImage = IMG_TYPES.test(ct);

    // `visibility` arrives from the client, and it used to be the only thing
    // deciding which bucket a sell file landed in -- so a caller could put the
    // very file people pay for into the public bucket, where the paywall is a
    // URL away from irrelevant. Anything that is not an image and sits under a
    // resources/ or market/ prefix is downloadable goods: it goes private
    // whatever the client asked for. Previews are images and still go public.
    const isPrivate = !isImage && (asset || body.visibility === "private");
    const targets: Array<Record<string, unknown>> = [];

    const sign = async (bucket: string, objPath: string, role: string) => {
      const { data, error } = await supa.storage.from(bucket).createSignedUploadUrl(objPath);
      if (error || !data) throw new Error(`could not sign ${role}: ${error?.message ?? "unknown"}`);
      targets.push({ role, bucket, path: objPath, signedUrl: data.signedUrl, token: data.token });
    };

    try {
      if (isImage) {
        await sign(PRIVATE_BUCKET, objKey, "original");
        const asked = Array.isArray(body.derivatives)
          ? body.derivatives.filter((r: unknown) => typeof r === "string")
          : LEGACY_ROLES;
        const wanted = DERIVATIVES.filter((d) => asked.includes(d.role));
        if (!wanted.some((d) => d.role === "f1600"))
          return json({ error: "f1600 is required" }, 400);
        const base = stripExt(objKey);
        for (const d of wanted) await sign(PUBLIC_BUCKET, base + d.suffix, d.role);
      } else if (isPrivate) {
        await sign(PRIVATE_BUCKET, objKey, "file");
      } else {
        await sign(PUBLIC_BUCKET, objKey, "file");
      }
    } catch (_e) {
      // The storage error can name the policy that refused; the caller gets the
      // outcome, not the reason.
      return json({ error: "could not prepare the upload" }, 500);
    }

    return json({
      storage: "supabase",
      key: path,
      targets,
      supabasePublicUrl: isPrivate ? null
        : isImage ? sbPublicUrl(stripExt(objKey) + "__f1600.webp")
        : sbPublicUrl(objKey),
      bucket: isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET,
      private: isPrivate,
    });
  }

  if (body.action === "delete") {
    if (!(await ownsPath())) return json({ error: "not your object" }, 403);

    const svc = serviceClient();
    if (!svc) return json({ error: "storage remover not configured" }, 500);

    const base = stripExt(objKey);
    const results: Record<string, unknown> = {};
    const { data: d1 } = await svc.storage.from(PRIVATE_BUCKET).remove([objKey]);
    results.original = (d1 ?? []).length;
    const { data: d2 } = await svc.storage.from(PUBLIC_BUCKET)
      .remove([objKey, ...DERIVATIVES.map((d) => base + d.suffix)]);
    results.derivatives = (d2 ?? []).length;

    const removed = Number(results.original) + Number(results.derivatives);
    return json({ ok: removed > 0, results });
  }

  return json({ error: "unknown action" }, 400);
}
