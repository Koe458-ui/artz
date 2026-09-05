create or replace function pg_temp.dz_sec_suite()
returns table(check_name text, observed text, verdict text)
language plpgsql as $fn$
declare
  uid_a uuid; uid_b uuid; item uuid;
  n int; okb boolean;
  before_like int; before_sales int; after_like int; after_sales int;
  RB constant text := 'dz-suite-rollback';
begin
  select id into uid_a from public.profiles where role = 'guest' order by created_at limit 1;
  select id into uid_b from public.profiles where role = 'guest' and id <> uid_a order by created_at limit 1;
  select id into item  from public.marketplace_items limit 1;
  if uid_a is null or uid_b is null then
    return query select 'fixtures', 'need two member rows', 'SKIP'; return;
  end if;

  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  begin execute 'select count(*) from public.payments' into n;
    return query select 'anon reads payments', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads payments','denied','PASS'; end;

  begin execute 'select count(*) from public.payout_requests' into n;
    return query select 'anon reads payout_requests', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads payout_requests','denied','PASS'; end;

  begin execute 'select count(*) from public.marketplace_earnings' into n;
    return query select 'anon reads marketplace_earnings', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads marketplace_earnings','denied','PASS'; end;

  begin execute 'select count(*) from public.profiles where email is not null' into n;
    return query select 'anon reads profiles.email', n||' rows','FAIL';
  exception when insufficient_privilege then return query select 'anon reads profiles.email','permission denied','PASS'; end;

  begin execute 'select count(*) from public.promo_codes' into n;
    return query select 'anon reads promo_codes', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads promo_codes','denied','PASS'; end;

  begin execute 'select count(*) from public.dz_secrets' into n;
    return query select 'anon reads dz_secrets', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads dz_secrets','denied','PASS'; end;

  begin execute 'select count(*) from public.user_bans' into n;
    return query select 'anon reads user_bans', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads user_bans','denied','PASS'; end;

  begin execute 'select count(*) from public.platform_tax_config' into n;
    return query select 'anon reads platform_tax_config', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'anon reads platform_tax_config','denied','PASS'; end;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_a, 'role','authenticated')::text, true);
  set local role authenticated;

  begin execute format('select count(*) from public.payments where user_id=%L', uid_b) into n;
    return query select 'member reads another member''s payments', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'member reads another member''s payments','denied','PASS'; end;

  begin execute format('select count(*) from public.payout_methods where user_id=%L', uid_b) into n;
    return query select 'member reads another member''s payout_methods', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'member reads another member''s payout_methods','denied','PASS'; end;

  begin execute format('select count(*) from public.seller_tax where user_id=%L', uid_b) into n;
    return query select 'member reads another member''s seller_tax', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'member reads another member''s seller_tax','denied','PASS'; end;

  begin execute format('select count(*) from public.ledger_entries where user_id=%L', uid_b) into n;
    return query select 'member reads another member''s ledger', n||' rows', case when n=0 then 'PASS' else 'FAIL' end;
  exception when insufficient_privilege then return query select 'member reads another member''s ledger','denied','PASS'; end;

  begin
    execute format('insert into public.payments (user_id,kind,amount,currency,provider,rzp_order_id,status)
                    values (%L,''subscription'',1,''USD'',''razorpay'',''dz_suite_probe'',''paid'')', uid_a);
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member forges a paid payment','permission denied','PASS';
    when others then return query select 'member forges a paid payment',
      case when sqlerrm = RB then 'ACCEPTED' else 'refused: '||sqlstate end,
      case when sqlerrm = RB then 'FAIL' else 'PASS' end;
  end;

  begin
    execute format('insert into public.payout_requests (user_id,amount,currency,method,destination,status)
                    values (%L,999999,''USD'',''paypal'',''x@y.z'',''approved'')', uid_a);
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member forges an approved payout','permission denied','PASS';
    when others then return query select 'member forges an approved payout',
      case when sqlerrm = RB then 'ACCEPTED' else 'refused: '||sqlstate end,
      case when sqlerrm = RB then 'FAIL' else 'PASS' end;
  end;

  begin
    execute format('insert into public.marketplace_earnings (payment_id,item_id,seller_id,buyer_id,gross_amount,currency,status)
                    select id,%L,%L,%L,100000,''USD'',''available'' from public.payments limit 1', item, uid_a, uid_b);
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member invents an earning','permission denied','PASS';
    when others then return query select 'member invents an earning',
      case when sqlerrm = RB then 'ACCEPTED' else 'refused: '||sqlstate end,
      case when sqlerrm = RB then 'FAIL' else 'PASS' end;
  end;

  begin
    execute 'update public.profiles set role=''admin'' where id = auth.uid()';
    execute 'select role=''admin'' from public.profiles where id = auth.uid()' into okb;
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member promotes self to admin','permission denied','PASS';
    when others then return query select 'member promotes self to admin',
      case when sqlerrm = RB then (case when okb then 'ACCEPTED' else 'silently pinned' end) else 'refused: '||sqlstate end,
      case when sqlerrm = RB and okb then 'FAIL' else 'PASS' end;
  end;

  begin
    execute 'update public.profiles set subscription_tier=''max'',
             subscription_expires_at = now() + interval ''10 years'' where id = auth.uid()';
    execute 'select subscription_tier=''max'' from public.profiles where id = auth.uid()' into okb;
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member grants self Max','permission denied','PASS';
    when others then return query select 'member grants self Max',
      case when sqlerrm = RB then (case when okb then 'ACCEPTED' else 'silently pinned' end) else 'refused: '||sqlstate end,
      case when sqlerrm = RB and okb then 'FAIL' else 'PASS' end;
  end;

  begin
    execute 'insert into public.profiles (id,username,role,subscription_tier,merit)
             values (gen_random_uuid(),''dz_suite_probe'',''admin'',''max'',100)';
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'member inserts a privileged profile','permission denied','PASS';
    when others then return query select 'member inserts a privileged profile',
      case when sqlerrm = RB then 'ACCEPTED' else 'refused: '||sqlstate end,
      case when sqlerrm = RB then 'FAIL' else 'PASS' end;
  end;
  reset role;

  if item is null then
    return query select 'marketplace cases','no listing rows','SKIP'; return;
  end if;

  select like_count, sales_count into before_like, before_sales
    from public.marketplace_items where id = item;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from public.marketplace_items where id = item),
                      'role','authenticated')::text, true);
  set local role authenticated;
  begin
    execute format('update public.marketplace_items set like_count=99999, sales_count=4242 where id=%L', item);
    execute format('select like_count, sales_count from public.marketplace_items where id=%L', item)
      into after_like, after_sales;
    raise exception '%', RB;
  exception
    when insufficient_privilege then return query select 'seller inflates like/sales count','permission denied','PASS';
    when others then return query select 'seller inflates like/sales count',
      case when sqlerrm = RB then format('like %s->%s, sales %s->%s', before_like, after_like, before_sales, after_sales)
           else 'refused: '||sqlstate end,
      case when sqlerrm <> RB or (after_like = before_like and after_sales = before_sales) then 'PASS' else 'FAIL' end;
  end;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_b, 'role','authenticated')::text, true);
  set local role authenticated;
  execute format('select public.dz_market_owns(%L)', item) into okb;
  reset role;
  return query select 'non-buyer owns a paid listing?', okb::text, case when okb then 'FAIL' else 'PASS' end;

  update public.marketplace_items set price_cents=0, status='pending', visibility='draft' where id = item;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_b, 'role','authenticated')::text, true);
  set local role authenticated;
  execute format('select public.dz_market_owns(%L)', item) into okb;
  reset role;
  return query select 'stranger owns a free UNAPPROVED listing?', okb::text, case when okb then 'FAIL' else 'PASS' end;

  update public.marketplace_items set status='approved', visibility='published' where id = item;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_b, 'role','authenticated')::text, true);
  set local role authenticated;
  execute format('select public.dz_market_owns(%L)', item) into okb;
  reset role;
  return query select 'stranger owns a free APPROVED listing?', okb::text,
                      case when okb then 'PASS' else 'FAIL (regression)' end;

  raise exception '%', RB;
exception when others then
  if sqlerrm <> RB then raise; end if;
  return;
end $fn$;

select * from pg_temp.dz_sec_suite();

with tbl as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
),
cmds(priv,code) as (values ('SELECT','r'),('INSERT','a'),('UPDATE','w'),('DELETE','d')),
roles(rr) as (values ('anon'),('authenticated')),
inert as (
  select t.relname, ro.rr, c.priv
    from tbl t cross join cmds c cross join roles ro
   where has_table_privilege(ro.rr, t.oid, c.priv)
     and not exists (
       select 1 from pg_policy p
        where p.polrelid = t.oid and (p.polcmd = c.code or p.polcmd = '*')
          and (p.polroles = '{0}'::oid[]
               or (select oid from pg_roles where rolname = ro.rr) = any(p.polroles)))
)
select
  (select coalesce(string_agg(relname||'/'||rr||'/'||priv, ', ' order by relname), 'none')
     from inert) as inert_grants_expect_notification_reads_only,

  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     cross join (values ('anon'),('authenticated')) r(x)
    where n.nspname='public' and c.relkind in ('r','p')
      and (has_table_privilege(r.x, c.oid, 'TRUNCATE')
        or has_table_privilege(r.x, c.oid, 'REFERENCES')
        or has_table_privilege(r.x, c.oid, 'TRIGGER')))
    as truncate_references_trigger_expect_0,

  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype='trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')))
    as trigger_fns_executable_expect_0,

  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')))
    as functions_without_pinned_search_path_expect_0,

  (select count(*) from storage.buckets
    where file_size_limit is null or allowed_mime_types is null)
    as buckets_unbounded_expect_0,

  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity)
    as tables_without_rls_expect_0,

  (select bool_or('text/html' = any(allowed_mime_types)) from storage.buckets)      as any_bucket_allows_html,
  (select bool_or('image/svg+xml' = any(allowed_mime_types)) from storage.buckets)  as any_bucket_allows_svg,
  (select bool_or('application/pdf' = any(allowed_mime_types)) from storage.buckets) as any_bucket_allows_pdf,

  (select coalesce(string_agg(r.x||'.'||c.col, ', '), 'none')
     from unnest(array['role','max_claimed','partner_since','subscription_tier',
                       'subscription_expires_at','merit','merit_updated_at',
                       'follower_count','following_count']) as c(col)
     cross join (values ('anon'),('authenticated')) r(x)
    where has_column_privilege(r.x, 'public.profiles', c.col, 'INSERT'))
    as privileged_profile_cols_insertable_expect_none,

  (select coalesce(string_agg(r.x||'.'||c.col, ', '), 'none')
     from unnest(array['role','max_claimed','partner_since','subscription_tier',
                       'subscription_expires_at','merit',
                       'follower_count','following_count']) as c(col)
     cross join (values ('anon'),('authenticated')) r(x)
    where has_column_privilege(r.x, 'public.profiles', c.col, 'UPDATE'))
    as privileged_profile_cols_updatable_expect_none;
