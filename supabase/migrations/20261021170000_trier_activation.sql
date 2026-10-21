-- Existing reviewed catalog codes are the source of identity; never match by name.
create or replace function public.trier_refresh_bindings(integrated_store text) returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if integrated_store is distinct from '2' then raise exception 'Wrong store'; end if;
  insert into public.trier_inventory(product_id,variant_id,trier_reduced_code,store_id)
  select (p->>'id')::bigint, coalesce((v->>'id')::bigint,0),coalesce(v->>'shortCode',p->>'shortCode'), integrated_store
  from public.catalog_draft d cross join lateral jsonb_array_elements(d.catalog->'products') p
  left join lateral jsonb_array_elements(case when jsonb_array_length(coalesce(p->'variants','[]'))>0 then p->'variants' else '[null]'::jsonb end) v on true
  where d.id=1 and coalesce(v->>'shortCode',p->>'shortCode') ~ '^[0-9]{1,12}$'
    and coalesce(v->>'shortCode',p->>'shortCode') <> '46295'
  on conflict(product_id,variant_id) do update set
    trier_reduced_code=excluded.trier_reduced_code,trier_product_id=null,ean=null,
    external_price_cents=null,stock_quantity=null,availability=null,last_trier_sync_at=null
  where trier_inventory.store_id=excluded.store_id and trier_inventory.trier_reduced_code is distinct from excluded.trier_reduced_code;
  get diagnostics affected=row_count;
  return affected;
end $$;
revoke all on function public.trier_refresh_bindings(text) from public,anon,authenticated;
grant execute on function public.trier_refresh_bindings(text) to service_role;
select public.trier_refresh_bindings('2');

