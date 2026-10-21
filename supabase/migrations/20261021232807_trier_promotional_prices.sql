-- Additive: editorial catalog and ERP records are never changed.
alter table public.trier_inventory add column external_regular_price_cents bigint check (external_regular_price_cents between 1 and 100000000);
alter table public.trier_inventory add constraint trier_promotion_pair check (external_regular_price_cents is null or (external_price_cents is not null and external_price_cents>0 and external_regular_price_cents>external_price_cents));

create or replace function public.trier_apply_inventory(payload jsonb, run_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare oldrow public.trier_inventory; newrow public.trier_inventory; matched integer; priority integer;
begin
  -- Hold the lease row lock until this inventory write/audit transaction completes.
  perform 1 from public.trier_sync_state s where s.id=1 and s.run_id=trier_apply_inventory.run_id and s.lease_until>now() for update;
  if not found then raise exception 'Expired or superseded sync'; end if;
  if payload->>'storeId' is distinct from (select store_id from public.trier_sync_state where id=1)
    then raise exception 'Store mismatch'; end if;
  if jsonb_typeof(payload->'stockQuantity') is distinct from 'number'
    or jsonb_typeof(payload->'available') is distinct from 'boolean'
    or payload->>'fetchedAt' is null or coalesce(payload->>'name','')=''
    or (payload ? 'priceCents' and (jsonb_typeof(payload->'priceCents') is distinct from 'number'
      or (payload->>'priceCents')::numeric <> trunc((payload->>'priceCents')::numeric))) then raise exception 'Invalid inventory'; end if;
  if payload->>'regularPriceCents' is not null and (jsonb_typeof(payload->'regularPriceCents') is distinct from 'number' or (payload->>'regularPriceCents')::numeric<>trunc((payload->>'regularPriceCents')::numeric)) then raise exception 'Invalid promotion'; end if;
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
  if exists(select 1 from public.trier_inventory i where i.store_id=payload->>'storeId'
    and (i.product_id,i.variant_id)<>(oldrow.product_id,oldrow.variant_id)
    and (i.trier_product_id=payload->>'externalId' or i.trier_reduced_code=payload->>'reducedCode' or i.ean=payload->>'ean')) then raise exception 'Identifier conflict'; end if;
  if (oldrow.trier_product_id is not null and payload->>'externalId' is not null and oldrow.trier_product_id<>payload->>'externalId')
    or (oldrow.trier_reduced_code is not null and payload->>'reducedCode' is not null and oldrow.trier_reduced_code<>payload->>'reducedCode')
    or (oldrow.ean is not null and payload->>'ean' is not null and oldrow.ean<>payload->>'ean') then raise exception 'Identifier conflict'; end if;
  if not exists(select 1 from public.catalog_draft d, jsonb_array_elements(d.catalog->'products') p
    where d.id=1 and p->>'id'=oldrow.product_id::text and
      (oldrow.variant_id=0 or exists(select 1 from jsonb_array_elements(coalesce(p->'variants','[]')) v where v->>'id'=oldrow.variant_id::text))) then return false; end if;
  if oldrow.last_trier_sync_at >= (payload->>'fetchedAt')::timestamptz then return false; end if;
  update public.trier_inventory set external_name=payload->>'name',external_description=coalesce(payload->>'description',external_description),
    external_price_cents=coalesce((payload->>'priceCents')::bigint,external_price_cents),
    external_regular_price_cents=case when payload ? 'regularPriceCents' then (payload->>'regularPriceCents')::bigint when payload ? 'priceCents' then null else external_regular_price_cents end,
    stock_quantity=(payload->>'stockQuantity')::numeric, availability=(payload->>'available')::boolean,
    external_status=payload->>'status',last_trier_sync_at=(payload->>'fetchedAt')::timestamptz
    where product_id=oldrow.product_id and variant_id=oldrow.variant_id returning * into newrow;
  insert into public.trier_inventory_audit(product_id,variant_id,previous_value,new_value)
    values(oldrow.product_id,oldrow.variant_id,to_jsonb(oldrow),to_jsonb(newrow));
  return true;
end $$;

revoke all on function public.trier_apply_inventory(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.trier_apply_inventory(jsonb,uuid) to service_role;
