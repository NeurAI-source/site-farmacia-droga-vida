-- Preserve each previous editorial text revision when a catalog product changes.
-- Does not copy or revert product prices, photos, stock, categories or publication state.
create table if not exists public.product_content_history (
  product_id integer not null,
  catalog_version bigint not null,
  previous_content jsonb not null default '{}'::jsonb,
  previous_ean text not null default '',
  changed_at timestamptz not null default now(),
  primary key(product_id,catalog_version)
);
alter table public.product_content_history enable row level security;
revoke all on public.product_content_history from anon,authenticated;
grant select on public.product_content_history to authenticated;
create policy "team members may view content history" on public.product_content_history
  for select to authenticated using (public.is_team());

create or replace function public.capture_product_content_history()
returns trigger language plpgsql security definer set search_path to ''
as $$
declare prior jsonb; current_product jsonb;
begin
  if new.catalog is not distinct from old.catalog then return new; end if;
  for prior in select value from jsonb_array_elements(old.catalog->'products') loop
    select value into current_product
      from jsonb_array_elements(new.catalog->'products') item(value)
      where item.value->>'id' = prior->>'id'
      limit 1;
    if current_product is not null and (
      coalesce(prior->'content','{}'::jsonb) is distinct from coalesce(current_product->'content','{}'::jsonb)
      or coalesce(prior->>'ean','') is distinct from coalesce(current_product->>'ean','')
    ) then
      insert into public.product_content_history(product_id,catalog_version,previous_content,previous_ean)
      values ((prior->>'id')::integer,old.version,coalesce(prior->'content','{}'::jsonb),coalesce(prior->>'ean',''))
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists catalog_content_history_trigger on public.catalog_draft;
create trigger catalog_content_history_trigger
  after update of catalog on public.catalog_draft
  for each row execute function public.capture_product_content_history();
