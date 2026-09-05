# Storage quota — runbook

**Status: not applied. Needs an operator, because `postgres` cannot do it.**

## What is open

Every upload limit the site has lives in `supabase/functions/smart-function`:
40 objects per 10 minutes, 400 per day, 200MB per asset (400MB on Max). None of
those is a boundary. That function's job is to hand back a *signed upload URL*,
and storage RLS lets a member write to their own folder without asking it:

```
storage_user_upload_own_folder  (INSERT, authenticated)
  bucket_id = 'koe-media' AND ((storage.foldername(name))[2] = auth.uid()::text OR is_dev())
```

A member who talks to the storage API directly therefore gets **no rate limit at
all**, and the only size bound left is the bucket's own 400MB — which has to
stay at 400MB, because that is exactly what a Max product file is allowed to be.
Nothing in the database has ever counted how much any one account is storing.

At the time of writing this is unexploited: 190 objects, 42MB, every one an
image, across 18 accounts. The risk is not present abuse, it is that one
motivated signup can write 400MB objects in a loop and the bill is the only
thing that notices.

**Severity: MEDIUM.** Requires a confirmed account. No data is exposed and
nothing is corrupted — the cost is storage and egress billing, and the
reputational exposure of arbitrary files sitting on a public bucket under the
project's own domain.

## Why it is not fixed in a migration

`storage.objects` is owned by `supabase_storage_admin`. The project's `postgres`
role is not a member of it:

```
select r.rolname from pg_auth_members m
  join pg_roles r on r.oid = m.roleid
  join pg_roles u on u.oid = m.member
 where u.rolname = current_user;
-- anon, authenticated, authenticator, pg_create_subscription, pg_monitor,
-- pg_read_all_data, pg_signal_backend, service_role, supabase_privileged_role
```

All four routes were tried against the live project and all four were
refused:

| attempt | result |
|---|---|
| `CREATE TRIGGER ... ON storage.objects` | `42501: must be owner of table objects` |
| `CREATE POLICY ... ON storage.objects` | refused, same ownership check |
| `ALTER POLICY storage_user_upload_own_folder ...` | refused, same ownership check |
| `GRANT supabase_storage_admin TO postgres` | refused — `postgres` has CREATEROLE but no ADMIN OPTION on that role |

Afterwards the storage schema was re-read to confirm nothing was left behind:
12 policies and 2 triggers, exactly as before, and the upload policy's
`WITH CHECK` byte-identical.

The existing storage policies were created through the Dashboard, which holds
the right credentials. That is a sound platform boundary and not
something to work around.

## How to apply it

In the Supabase Dashboard, **Storage → Policies → koe-media**, edit the
`storage_user_upload_own_folder` policy and add the quota call to its
`WITH CHECK`:

```sql
bucket_id = 'koe-media'
AND ((storage.foldername(name))[2] = auth.uid()::text OR is_dev())
AND public.dz_storage_quota_ok()
```

Do the same on **koe-originals** for `originals insert own folder`:

```sql
bucket_id = 'koe-originals'
AND ((storage.foldername(name))[2] = auth.uid()::text OR is_dev())
AND public.dz_storage_quota_ok()
```

The function itself is ordinary `public` schema and *can* be created from a
migration — run this part first, from the SQL editor or as a migration:

```sql
CREATE OR REPLACE FUNCTION public.dz_storage_quota_ok()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
declare
  v_uid  uuid := auth.uid();
  v_cap  bigint;
  v_used bigint;
begin
  if v_uid is null then return true; end if;          -- service role, cron
  if public.dz_is_staff(v_uid) then return true; end if;

  -- burst: three times what smart-function allows, so a member going through
  -- the app meets its friendly message first and never this one.
  if not public.dz_rate_take('sto:' || v_uid::text, 120, 600) then
    return false;
  end if;

  v_cap := case coalesce(public.dz_effective_tier(v_uid), 'guest')
             when 'max'     then 32212254720::bigint   -- 30 GB
             when 'premium' then 16106127360::bigint   -- 15 GB
             else                5368709120::bigint    --  5 GB
           end;

  select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_used
    from storage.objects o
   where o.bucket_id in ('koe-media', 'koe-originals')
     and (storage.foldername(o.name))[2] = v_uid::text;

  return v_used < v_cap;
exception when others then
  return true;   -- a fault in the meter must never stop an upload
end $$;

revoke execute on function public.dz_storage_quota_ok() from public, anon;
grant  execute on function public.dz_storage_quota_ok() to authenticated, service_role;
```

`authenticated` needs EXECUTE here, unlike the other guards: a policy expression
is evaluated as the *invoking* role, so the member calling it must be able to.
The function is `SECURITY DEFINER` and takes no parameters, so there is nothing
for a caller to tamper with — it only ever answers about `auth.uid()`.

The caps are deliberately generous against real use: 30GB on Max is 75 of the
largest product file that plan may upload. They bound the loop, they do not
ration artists.

## Also worth doing at the same time

`storage.foldername` is IMMUTABLE, so the sum above can be an index lookup
rather than a scan once the bucket grows. This also needs storage-admin rights:

```sql
create index if not exists dz_objects_member_folder
  on storage.objects (((storage.foldername(name))[2]))
  where bucket_id in ('koe-media', 'koe-originals');
```

At 190 objects it changes nothing. At a million it is the difference between an
upload path that is fine and one that is not.

## How to check it worked

As a member, from the browser console on a signed-in session:

```js
// should refuse once past the burst allowance, and not before
for (let i = 0; i < 200; i++) {
  await sb.storage.from('koe-media')
    .upload(`artworks/${(await sb.auth.getUser()).data.user.id}/probe_${i}.bin`,
            new Blob([new Uint8Array(1024)]));
}
```

Then confirm a normal upload through the site still works, and delete the
probes. If uploads through the app break at any point, drop the
`AND public.dz_storage_quota_ok()` clause back off the two policies — the
function failing open means that should not happen, but the rollback is one
edit.
