begin;
-- Keep own_membership readable at AAL1 so existing users can enroll/verify MFA.
-- All catalog/traffic/storage access requires a verified second factor.
create function public.is_team_member(member_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select (auth.role()='service_role' or (member_id=auth.uid() and auth.jwt()->>'aal'='aal2'))
    and exists(select 1 from public.team_members where user_id=member_id and active)
$$;
create function public.panel_role() returns text
language sql stable security definer set search_path='' as $$
  select role from public.team_members where user_id=auth.uid() and public.is_team_member(user_id)
$$;
create or replace function public.is_team(required_role text default null) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_team_member(auth.uid()) and (required_role is null or public.panel_role()=required_role)
$$;
revoke all on function public.is_team_member(uuid),public.panel_role() from public,anon;
grant execute on function public.is_team_member(uuid),public.panel_role() to authenticated,service_role;
-- Existing read_draft/read_publications/content history and product-image policies
-- already call is_team(), so the new assurance requirement applies atomically.

create function public.catalog_text(value jsonb, maximum integer) returns boolean
language sql immutable set search_path='' as $$
  -- JavaScript string lengths count astral Unicode characters as two UTF-16 units.
  select coalesce(jsonb_typeof(value)='string' and
    length(value #>> '{}')+length(regexp_replace(value #>> '{}',U&'[^\+010000-\+10FFFF]','','g'))<=maximum,false)
$$;
create function public.catalog_count(value jsonb, maximum numeric default 100000000) returns boolean
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if jsonb_typeof(value) is distinct from 'number' then return false; end if;
  n := (value #>> '{}')::numeric;
  return n>=0 and n<=maximum and n=trunc(n);
end $$;
create function public.catalog_schema_valid(payload jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare p jsonb; v jsonb; c jsonb; sub jsonb; item jsonb; field text; code text; source text; host text; authority text; port text;
  ids text[] := '{}'; codes text[] := '{}'; sizes text[]; category_names text[] := '{}';
begin
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>2000000
    or jsonb_typeof(payload->'products') is distinct from 'array'
    or jsonb_typeof(payload->'categories') is distinct from 'array' then return false; end if;
  if jsonb_array_length(payload->'products')>10000 or jsonb_array_length(payload->'categories')=0 then return false; end if;
  if payload->'expandedProductPage' is not null and payload->'expandedProductPage'<>'null'::jsonb
    and jsonb_typeof(payload->'expandedProductPage')<>'boolean' then return false; end if;
  for c in select value from jsonb_array_elements(payload->'categories') loop
    if not public.catalog_text(c->'name',160) or c->>'name'='' or jsonb_typeof(c->'subcategories') is distinct from 'array' then return false; end if;
    category_names := array_append(category_names,c->>'name');
    for sub in select value from jsonb_array_elements(c->'subcategories') loop
      if not public.catalog_text(sub->'name',160) then return false; end if;
    end loop;
  end loop;
  for p in select value from jsonb_array_elements(payload->'products') loop
    if not public.catalog_count(p->'id') or (p->>'id')::bigint::text=any(ids)
      or not public.catalog_text(p->'name',120)
      or regexp_replace(p->>'name',U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]','','g')=''
      or not public.catalog_text(p->'imageUrl',2048)
      or not ((p->>'imageUrl') ~ '^https://[^[:space:]<>"'']+$'
        or ((p->>'imageUrl') ~* '^assets/[a-z0-9_./-]+\.(png|jpe?g|webp|svg)$' and position('..' in p->>'imageUrl')=0))
      or not public.catalog_count(p->'priceCents') or (p->>'priceCents')::numeric<1
      or not public.catalog_count(p->'oldPriceCents') or not public.catalog_count(p->'stockQuantity')
      or not public.catalog_text(p->'category',160) or coalesce(p->>'category','')<>all(category_names)
      or jsonb_typeof(p->'variants') is distinct from 'array' then return false; end if;
    ids := array_append(ids,(p->>'id')::bigint::text);
    foreach field in array array['active','featured','availableStore1','availableStore2'] loop
      if jsonb_typeof(p->field) is distinct from 'boolean' then return false; end if;
    end loop;
    foreach field in array array['brand','detail','badge','subcategory'] loop
      if not public.catalog_text(p->field,200) then return false; end if;
    end loop;
    if p->'updatedAt' is not null and p->'updatedAt'<>'null'::jsonb and not public.catalog_text(p->'updatedAt',80) then return false; end if;
    if p->'ean' is not null and p->'ean'<>'null'::jsonb
      and (not public.catalog_text(p->'ean',20) or (p->>'ean'<>'' and p->>'ean' !~ '^[0-9]{8,14}$')) then return false; end if;
    if p->'content' is not null and p->'content'<>'null'::jsonb then
      if jsonb_typeof(p->'content')<>'object' then return false; end if;
      foreach field in array array['description','purpose','benefits','usage','warnings','specifications'] loop
        if p->'content'->field is not null and p->'content'->field<>'null'::jsonb
          and not public.catalog_text(p->'content'->field,2400) then return false; end if;
      end loop;
    end if;
    if p->'contentSources' is not null and p->'contentSources'<>'null'::jsonb then
      if jsonb_typeof(p->'contentSources')<>'array' then return false; end if;
      if jsonb_array_length(p->'contentSources')>5 then return false; end if;
      for item in select value from jsonb_array_elements(p->'contentSources') loop
        if not public.catalog_text(item,1000) then return false; end if;
        source := item #>> '{}';
        if source !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?([/?#][^[:space:]]*)?$' then return false; end if;
        authority := split_part(split_part(split_part(substring(source from 9),'/',1),'?',1),'#',1);
        host := lower(split_part(authority,':',1));
        -- Conservative DNS form compatible with URL parsing: no empty labels,
        -- literal IPs, credentials or leading/trailing hyphens. IDNs use punycode.
        if length(host)>253 or host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' then return false; end if;
        port := split_part(authority,':',2);
        if position(':' in authority)>0 and (length(port)>5 or port::integer not between 1 and 65535) then return false; end if;
        if host='localhost' or host ~ '\.(localhost|local|internal)$' or host ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' then return false; end if;
      end loop;
    end if;
    code := coalesce(p->>'shortCode','');
    if code<>'' then
      if not public.catalog_text(p->'shortCode',40) or code !~* '^[a-z0-9._/-]{1,40}$' or upper(code)=any(codes) then return false; end if;
      codes := array_append(codes,upper(code));
    end if;
    sizes := '{}';
    for v in select value from jsonb_array_elements(p->'variants') loop
      if not public.catalog_count(v->'id',9007199254740991)
        or not public.catalog_text(v->'size',15)
        or regexp_replace(v->>'size',U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]','','g')='' or upper(v->>'size')=any(sizes)
        or not public.catalog_count(v->'packageQuantity') or (v->>'packageQuantity')::numeric<1
        or not public.catalog_count(v->'stockQuantity') then return false; end if;
      sizes := array_append(sizes,upper(v->>'size'));
      if v->'priceCents' is not null and v->'priceCents'<>'null'::jsonb
        and (not public.catalog_count(v->'priceCents') or (v->>'priceCents')::numeric<1) then return false; end if;
      code := coalesce(v->>'shortCode','');
      if code<>'' then
        if not public.catalog_text(v->'shortCode',40) or code !~* '^[a-z0-9._/-]{1,40}$' or upper(code)=any(codes) then return false; end if;
        codes := array_append(codes,upper(code));
      end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.catalog_text(jsonb,integer),public.catalog_count(jsonb,numeric),public.catalog_schema_valid(jsonb) from public,anon,authenticated;
-- Called inside security-definer save_catalog; not exposed as a client RPC.
create or replace function public.save_catalog(payload jsonb, expected_version bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare next_version bigint;
begin
  if not public.is_team() then raise exception 'Unauthorized: MFA required'; end if;
  if not public.catalog_schema_valid(payload) then raise exception 'Invalid catalog'; end if;
  update public.catalog_draft set catalog=payload,version=version+1,updated_at=now()
    where id=1 and version=expected_version returning version into next_version;
  if next_version is null then raise exception 'Conflict: reload catalog'; end if;
  return next_version;
end $$;

create table public.security_request_quotas (
  scope text not null, bucket text not null, period timestamptz not null, used integer not null,
  primary key(scope,bucket,period)
);
alter table public.security_request_quotas enable row level security;
revoke all on public.security_request_quotas from public,anon,authenticated,service_role;
create function public.consume_request_quota(quota_scope text, quota_bucket text, quota_period timestamptz, quota_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
  delete from public.security_request_quotas where period < now()-interval '2 days';
  insert into public.security_request_quotas(scope,bucket,period,used) values(quota_scope,quota_bucket,quota_period,1)
    on conflict(scope,bucket,period) do update set used=public.security_request_quotas.used+1
      where public.security_request_quotas.used<quota_limit returning used into count_now;
  return count_now is not null;
end $$;
revoke all on function public.consume_request_quota(text,text,timestamptz,integer) from public,anon,authenticated,service_role;
create function public.panel_request_allow(actor_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.team_members where user_id=actor_id and active) then return false; end if;
  return public.consume_request_quota('panel',actor_id::text,date_trunc('minute',now()),120);
end $$;
revoke all on function public.panel_request_allow(uuid) from public,anon,authenticated;
grant execute on function public.panel_request_allow(uuid) to service_role;

create function public.record_view_limited(visitor uuid, source_hash text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare today timestamptz := date_trunc('day',now());
begin
  if visitor is null or (source_hash is not null and source_hash !~ '^[0-9a-f]{64}$') then return false; end if;
  -- Independent of UUID and forwarded headers: bounds new rows and accepted writes.
  if not public.consume_request_quota('analytics','global',today,5000) then return false; end if;
  if source_hash is not null and not public.consume_request_quota('analytics-source',source_hash,today,200) then return false; end if;
  delete from public.site_visits where day < current_date-30;
  insert into public.site_visits(session_id) values(visitor)
    on conflict(day,session_id) do update set views=public.site_visits.views+1,last_view=now()
      where public.site_visits.last_view<now()-interval '30 seconds' and public.site_visits.views<500;
  return true;
end $$;
-- Keep the legacy trusted-server API bounded as well.
create or replace function public.record_view(visitor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.record_view_limited(visitor,null); end $$;
revoke all on function public.record_view_limited(uuid,text) from public,anon,authenticated;
grant execute on function public.record_view_limited(uuid,text) to service_role;
-- Explicit least-privilege reads for the server-only encrypted backup collector.
grant select on public.team_members,public.site_visits to service_role;
do $$ begin
  if to_regclass('public.product_content_history') is not null then
    execute 'grant select on public.product_content_history to service_role';
  end if;
  if to_regclass('public.product_ai_usage') is not null then
    execute 'grant select on public.product_ai_usage to service_role';
  end if;
end $$;
commit;
