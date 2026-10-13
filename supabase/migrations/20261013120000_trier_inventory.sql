-- Catalog is JSON, not a products table. Keep inventory separate from editorial/publication data.
create table public.trier_inventory (
  product_id bigint not null,
  variant_id bigint not null default 0,
  trier_product_id text,
  trier_reduced_code text,
  ean text,
  store_id text not null,
  external_name text,
  external_description text,
  external_price_cents bigint check (external_price_cents between 0 and 100000000),
  stock_quantity numeric check (stock_quantity between -100000000 and 100000000),
  availability boolean,
  external_status text,
  last_trier_sync_at timestamptz,
  primary key(product_id,variant_id),
  check (coalesce(trier_product_id,trier_reduced_code,ean) is not null),
  check (availability is distinct from true or stock_quantity > 0)
);
create unique index trier_id_unique on public.trier_inventory(trier_product_id) where trier_product_id is not null;
create unique index trier_code_unique on public.trier_inventory(trier_reduced_code) where trier_reduced_code is not null;
create unique index trier_ean_unique on public.trier_inventory(ean) where ean is not null;
create table public.trier_sync_state (
  id integer primary key check(id=1), store_id text,
  started_at timestamptz, finished_at timestamptz, lease_until timestamptz,
  summary jsonb not null default '{}'::jsonb
);
insert into public.trier_sync_state(id) values(1);
create table public.trier_inventory_audit (
  id bigint generated always as identity primary key,
  product_id bigint not null, variant_id bigint not null,
  previous_value jsonb, new_value jsonb not null,
  created_at timestamptz not null default now(), source text not null default 'Trier'
);
alter table public.trier_inventory enable row level security;
alter table public.trier_sync_state enable row level security;
alter table public.trier_inventory_audit enable row level security;
revoke all on public.trier_inventory,public.trier_sync_state,public.trier_inventory_audit from public,anon,authenticated;
grant select,insert,update on public.trier_inventory,public.trier_sync_state to service_role;
grant select on public.trier_inventory_audit to service_role;

create function public.trier_claim_sync(minutes integer, integrated_store text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if minutes < 1 or minutes > 1440 or integrated_store is null or integrated_store='' then raise exception 'Invalid configuration'; end if;
  update public.trier_sync_state set started_at=now(), lease_until=now()+interval '30 minutes',store_id=integrated_store
  where id=1 and (store_id is null or store_id=integrated_store)
    and (lease_until is null or lease_until < now())
    and (started_at is null or started_at < now()-make_interval(mins=>minutes));
  return found;
end $$;
create function public.trier_apply_inventory(payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare oldrow public.trier_inventory; newrow public.trier_inventory; matched integer; priority integer;
begin
  if payload->>'storeId' is distinct from (select store_id from public.trier_sync_state where id=1)
    then raise exception 'Store mismatch'; end if;
  -- Match only explicit, reviewed identifiers. Names never participate.
  select min(case when trier_product_id=payload->>'externalId' then 1
    when trier_reduced_code=payload->>'reducedCode' then 2 when ean=payload->>'ean' then 3 end)
    into priority from public.trier_inventory where store_id=payload->>'storeId';
  if priority is null then return false; end if;
  select count(*) into matched from public.trier_inventory where store_id=payload->>'storeId' and
    (case priority when 1 then trier_product_id=payload->>'externalId'
      when 2 then trier_reduced_code=payload->>'reducedCode' when 3 then ean=payload->>'ean' end);
  if matched <> 1 then raise exception 'Ambiguous identifier'; end if;
  select * into oldrow from public.trier_inventory where store_id=payload->>'storeId' and
    (case priority when 1 then trier_product_id=payload->>'externalId'
      when 2 then trier_reduced_code=payload->>'reducedCode' when 3 then ean=payload->>'ean' end) for update;
  if (oldrow.trier_product_id is not null and payload->>'externalId' is not null and oldrow.trier_product_id<>payload->>'externalId')
    or (oldrow.trier_reduced_code is not null and payload->>'reducedCode' is not null and oldrow.trier_reduced_code<>payload->>'reducedCode')
    or (oldrow.ean is not null and payload->>'ean' is not null and oldrow.ean<>payload->>'ean') then raise exception 'Identifier conflict'; end if;
  if not exists(select 1 from public.catalog_draft d, jsonb_array_elements(d.catalog->'products') p
    where d.id=1 and p->>'id'=oldrow.product_id::text and
      (oldrow.variant_id=0 or exists(select 1 from jsonb_array_elements(coalesce(p->'variants','[]')) v where v->>'id'=oldrow.variant_id::text))) then return false; end if;
  if oldrow.last_trier_sync_at >= (payload->>'fetchedAt')::timestamptz then return false; end if;
  update public.trier_inventory set external_name=payload->>'name',external_description=coalesce(payload->>'description',external_description),
    external_price_cents=coalesce((payload->>'priceCents')::bigint,external_price_cents),
    stock_quantity=(payload->>'stockQuantity')::numeric, availability=(payload->>'available')::boolean,
    external_status=payload->>'status',last_trier_sync_at=(payload->>'fetchedAt')::timestamptz
    where product_id=oldrow.product_id and variant_id=oldrow.variant_id returning * into newrow;
  insert into public.trier_inventory_audit(product_id,variant_id,previous_value,new_value)
    values(oldrow.product_id,oldrow.variant_id,to_jsonb(oldrow),to_jsonb(newrow));
  return true;
end $$;
revoke all on function public.trier_claim_sync(integer,text),public.trier_apply_inventory(jsonb) from public,anon,authenticated;
grant execute on function public.trier_claim_sync(integer,text),public.trier_apply_inventory(jsonb) to service_role;
