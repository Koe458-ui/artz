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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const extOf = (p: string) => (p.split(".").pop() || "").toLowerCase();

function serviceClient() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
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

    try {
      const now = Date.now();
      const since10m = new Date(now - 10 * 60 * 1000).toISOString();
      const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const [r10, r24] = await Promise.all([
        supa.from("upload_events").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("created_at", since10m),
        supa.from("upload_events").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("created_at", since24h),
      ]);
      if ((r10.count ?? 0) >= RATE_10MIN || (r24.count ?? 0) >= RATE_24H)
        return json({ error: "Upload limit reached — please try again in a little while." }, 429);
      await supa.from("upload_events").insert({ user_id: user.id });
    } catch (_e) {
    }

    const isImage = IMG_TYPES.test(ct);
    const isPrivate = body.visibility === "private" && !isImage;
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
});
