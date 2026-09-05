# smart-function

Mirror of the deployed Supabase Edge Function of the same slug. It held no
source in this repository until v16 — it existed only in Supabase — so this
copy exists to keep it reviewable and diffable. Keep it in step with what is
live; the deployed version is the one that runs.

Deploy with the Supabase CLI from the repo root:

    supabase functions deploy smart-function

Secrets it needs (set in the Supabase dashboard, not here):

  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET,
  CLOUDFRONT_URL

`verify_jwt` must stay on: every action is scoped to the calling user.

## Actions

- `upload` — presigned S3 PUT. Images capped at 25MB with a content-type
  allowlist; resource/marketplace prefixes capped at 200MB with an extension
  allowlist. Per-user flood limit, fail-open.
  Pass `visibility: "private"` on a non-image to sign it into `koe-originals`
  instead of the public bucket; the response carries `supabasePublicUrl: null`
  and `private: true`, because there is no url for an object nobody may read
  without going through `/api/market-download`. Marketplace product files use
  this. Omitting it keeps the public object every other caller gets, so the
  function and the site can deploy in either order.
- `delete` — ownership checked against every table that stores a storage path,
  then a direct S3 DELETE.
- `download` — presigned S3 GET for an artwork's original, minted only after
  `dz_request_download` grants a unit of the caller's daily quota. Fail-closed.
  Takes an artwork id, never a key.
