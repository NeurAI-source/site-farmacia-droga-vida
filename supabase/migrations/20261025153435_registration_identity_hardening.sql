begin;
-- Every catalog writer (including the manual RPC) passes through this guard.
create function panel_private.registration_identity_extended_guard()
returns trigger language plpgsql set search_path='' as $$
declare collision record; prior_owners text[]; p jsonb; v jsonb;
begin
  for p in select value from jsonb_array_elements(new.catalog->'products') loop
    for v in select value from jsonb_array_elements(coalesce(p->'variants','[]')) loop
      if v->>'ean' is not null and v->>'ean'<>'' and
        (jsonb_typeof(v->'ean')<>'string' or v->>'ean' !~ '^[0-9]{8,14}$') then
        raise exception 'EAN de apresentação inválido.';
      end if;
      if v->'oldPriceCents' is not null and v->'oldPriceCents'<>'null'::jsonb
        and not public.catalog_count(v->'oldPriceCents') then raise exception 'Preço anterior inválido.'; end if;
    end loop;
  end loop;
  for collision in
    select kind,value,array_agg(owner order by owner) owners
    from (select field.kind,field.value,concat(prod->>'id','/',case when x.ordinality=1 then 'root' else x.item->>'id' end) owner
      from jsonb_array_elements(new.catalog->'products') prod
      cross join lateral jsonb_array_elements(jsonb_build_array(prod)||coalesce(prod->'variants','[]')) with ordinality x(item,ordinality)
      cross join lateral (values ('ean',nullif(x.item->>'ean','')),('trier',nullif(x.item->'trier'->>'id',''))) field(kind,value)
      where field.value is not null) entries
    group by kind,value having count(*)>1
  loop
    select array_agg(owner order by owner) into prior_owners
      from (select field.kind,field.value,concat(prod->>'id','/',case when x.ordinality=1 then 'root' else x.item->>'id' end) owner
      from jsonb_array_elements(old.catalog->'products') prod
      cross join lateral jsonb_array_elements(jsonb_build_array(prod)||coalesce(prod->'variants','[]')) with ordinality x(item,ordinality)
      cross join lateral (values ('ean',nullif(x.item->>'ean','')),('trier',nullif(x.item->'trier'->>'id',''))) field(kind,value)
      where field.value is not null) e
      where e.kind=collision.kind and e.value=collision.value;
    -- Existing legacy associations are not rewritten, removed or silently merged.
    if prior_owners is null or not collision.owners <@ prior_owners then
      raise exception 'Identificador repetido (%): %. Confira produtos e apresentações.',collision.kind,collision.value;
    end if;
  end loop;
  return new;
end $$;
revoke all on function panel_private.registration_identity_extended_guard() from public,anon,authenticated;
create trigger registration_identity_extended_guard before update of catalog on public.catalog_draft
for each row execute function panel_private.registration_identity_extended_guard();
commit;
