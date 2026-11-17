-- Neur.AI Etiquetas: read-only history of actual Trier price changes.
-- Apply only after review in staging. No data migration, no changes to ERP, no cron.
-- The function runs with caller privileges and is only callable by service_role.
create or replace function public.label_price_changes(
  p_store_id text,
  p_limit integer default 100
)
returns table (
  "changedAt" timestamptz,
  "productId" bigint,
  "variantId" bigint,
  "shortCode" text,
  "name" text,
  "beforeCents" bigint,
  "afterCents" bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    audit.created_at,
    audit.product_id,
    audit.variant_id,
    coalesce(audit.new_value->>'trier_reduced_code',audit.previous_value->>'trier_reduced_code'),
    coalesce(nullif(audit.new_value->>'external_name',''),nullif(audit.previous_value->>'external_name',''),'Produto sem nome'),
    (audit.previous_value->>'external_price_cents')::bigint,
    (audit.new_value->>'external_price_cents')::bigint
  from public.trier_inventory_audit as audit
  where coalesce(audit.new_value->>'store_id',audit.previous_value->>'store_id') = p_store_id
    and audit.previous_value->>'external_price_cents' ~ '^[0-9]{1,12}$'
    and audit.new_value->>'external_price_cents' ~ '^[0-9]{1,12}$'
    and audit.previous_value->>'external_price_cents' is distinct from audit.new_value->>'external_price_cents'
  order by audit.id desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;
revoke all on function public.label_price_changes(text,integer) from public, anon, authenticated;
grant execute on function public.label_price_changes(text,integer) to service_role;
comment on function public.label_price_changes(text,integer) is
  'Read-only, server-only list of actual price changes from Trier audit by store; excludes stock-only events.';
