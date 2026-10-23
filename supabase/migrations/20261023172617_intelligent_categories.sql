-- Audit classification edits through the existing, versioned save_catalog RPC.
-- No catalog rows or prices are changed by this migration.
create table public.category_history (
  id bigint generated always as identity primary key,
  actor_id uuid,
  created_at timestamptz not null default now(),
  before_version bigint not null,
  after_version bigint not null,
  changes jsonb not null,
  structure_before jsonb not null,
  structure_after jsonb not null
);
alter table public.category_history enable row level security;
revoke all on public.category_history from public, anon, authenticated;
grant select on public.category_history to authenticated;
grant select on public.category_history to service_role;
create policy team_category_history on public.category_history for select to authenticated using (public.is_team());
create function public.audit_catalog_categories() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',(p->>'id')::bigint,'name',p->>'name',
    'before',jsonb_build_object('category',coalesce(o->>'category',''),'subcategory',coalesce(o->>'subcategory',''),'classification',o->'classification'),
    'after',jsonb_build_object('category',p->>'category','subcategory',p->>'subcategory','classification',p->'classification')
  )), '[]'::jsonb) into changed
  from jsonb_array_elements(new.catalog->'products') p
  left join jsonb_array_elements(old.catalog->'products') o on o->'id'=p->'id'
  where o->'category' is distinct from p->'category'
     or o->'subcategory' is distinct from p->'subcategory'
     or o->'classification' is distinct from p->'classification';
  if changed<>'[]'::jsonb or old.catalog->'categories' is distinct from new.catalog->'categories'
     or old.catalog->'categoryIntelligence' is distinct from new.catalog->'categoryIntelligence' then
    insert into public.category_history(actor_id,before_version,after_version,changes,structure_before,structure_after)
    values(auth.uid(),old.version,new.version,changed,
      jsonb_build_object('categories',old.catalog->'categories','settings',old.catalog->'categoryIntelligence'),
      jsonb_build_object('categories',new.catalog->'categories','settings',new.catalog->'categoryIntelligence'));
  end if;
  return new;
end $$;
revoke all on function public.audit_catalog_categories() from public,anon,authenticated;
create trigger audit_catalog_categories after update of catalog on public.catalog_draft
  for each row execute function public.audit_catalog_categories();
