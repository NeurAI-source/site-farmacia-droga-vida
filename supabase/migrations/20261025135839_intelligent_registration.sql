begin;
create table public.trier_registration_cache (
  key text primary key, actor_id uuid references auth.users on delete set null,
  payload jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
alter table public.trier_registration_cache enable row level security;
revoke all on public.trier_registration_cache from public,anon,authenticated;
grant select,insert,update,delete on public.trier_registration_cache to service_role;
create index trier_registration_cache_expiry on public.trier_registration_cache(expires_at);
create table public.registration_batches (
  id uuid primary key,actor_id uuid references auth.users on delete set null,
  request jsonb not null,version bigint not null,report jsonb not null,created_at timestamptz not null default now()
);
alter table public.registration_batches enable row level security;
revoke all on public.registration_batches from public,anon,authenticated;
grant select,insert on public.registration_batches to service_role;
grant execute on function public.catalog_schema_valid(jsonb),public.catalog_text(jsonb,integer),public.catalog_count(jsonb,numeric) to service_role;
create table public.registration_history (
  id bigint generated always as identity primary key,product_id bigint not null,
  actor_id uuid, catalog_version bigint not null, before_product jsonb, after_product jsonb,
  created_at timestamptz not null default now()
);
alter table public.registration_history enable row level security;
revoke all on public.registration_history from public,anon,authenticated;
grant select on public.registration_history to authenticated,service_role;
create policy "active team reads product registration history" on public.registration_history for select to authenticated using (public.is_team());
create schema if not exists panel_private;
revoke all on schema panel_private from public,anon,authenticated;
create function panel_private.registration_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb; current_product jsonb; actor uuid:=coalesce(auth.uid(),nullif(current_setting('app.registration_actor',true),'')::uuid);
begin
  for current_product in select value from jsonb_array_elements(new.catalog->'products') loop
    select value into prior from jsonb_array_elements(old.catalog->'products') p where p->'id'=current_product->'id';
    if prior is distinct from current_product then insert into public.registration_history(product_id,actor_id,catalog_version,before_product,after_product)
      values((current_product->>'id')::bigint,actor,new.version,prior,current_product); end if;
  end loop;
  for prior in select value from jsonb_array_elements(old.catalog->'products') loop
    if not exists(select 1 from jsonb_array_elements(new.catalog->'products') p where p->'id'=prior->'id') then
      insert into public.registration_history(product_id,actor_id,catalog_version,before_product) values((prior->>'id')::bigint,actor,new.version,prior);
    end if;
  end loop;
  return new;
end $$;
revoke all on function panel_private.registration_audit() from public,anon,authenticated;
create trigger registration_catalog_audit after update of catalog on public.catalog_draft for each row execute function panel_private.registration_audit();
create function public.registration_save(actor_id uuid,batch_id uuid,expected_version bigint,payload jsonb,request_body jsonb,report_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior public.registration_batches; current_version bigint; result_version bigint;
begin
  perform pg_advisory_xact_lock(6100201);
  if not exists(select 1 from public.team_members where user_id=actor_id and active) then raise exception 'Usuário não autorizado.'; end if;
  select * into prior from public.registration_batches where id=batch_id;
  if found then
    if prior.actor_id is distinct from actor_id or prior.request is distinct from request_body then raise exception 'Lote já utilizado.'; end if;
    return jsonb_build_object('version',prior.version,'report',prior.report,'completed',true);
  end if;
  if not public.catalog_schema_valid(payload) or jsonb_typeof(report_rows) is distinct from 'array' or jsonb_array_length(report_rows)>30 then raise exception 'Cadastro inválido.'; end if;
  select version into current_version from public.catalog_draft where id=1 for update;
  if current_version is distinct from expected_version then raise exception 'O catálogo mudou. Recarregue e revise.'; end if;
  perform set_config('app.registration_actor',actor_id::text,true);
  update public.catalog_draft set catalog=payload,version=version+1,updated_at=now() where id=1 returning version into result_version;
  insert into public.registration_batches(id,actor_id,request,version,report) values(batch_id,actor_id,request_body,result_version,report_rows);
  return jsonb_build_object('version',result_version,'report',report_rows,'completed',true);
end $$;
revoke all on function public.registration_save(uuid,uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.registration_save(uuid,uuid,bigint,jsonb,jsonb,jsonb) to service_role;
-- No changes to existing snapshots or publication procedures. Guard new writes.
create function panel_private.registration_publication_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from jsonb_array_elements(new.catalog->'products') p where p->>'active'='true' and (p->>'imagePending'='true' or p->>'imageUrl'='assets/product-pending.svg')) then raise exception 'Revise as fotos pendentes antes de publicar.'; end if;
  return new;
end $$;
revoke all on function panel_private.registration_publication_guard() from public,anon,authenticated;
create trigger registration_publication_guard before insert or update of catalog on public.publications for each row execute function panel_private.registration_publication_guard();
-- Normalize official numeric identities (001 and 1) without rewriting old data.
-- Existing legacy collisions may stay unchanged; no new collision is accepted.
create function panel_private.registration_identity_guard() returns trigger language plpgsql set search_path='' as $$
declare item record; prior_count integer;
begin
  for item in
    select code,count(*) n from (
      select ltrim(x->>'shortCode','0') code from jsonb_array_elements(new.catalog->'products') p
      cross join lateral jsonb_array_elements(jsonb_build_array(p)||coalesce(p->'variants','[]')) x
      where x->>'shortCode' ~ '^[0-9]{1,12}$'
    ) q group by code having count(*)>1
  loop
    select count(*) into prior_count from jsonb_array_elements(old.catalog->'products') p
      cross join lateral jsonb_array_elements(jsonb_build_array(p)||coalesce(p->'variants','[]')) x
      where x->>'shortCode' ~ '^[0-9]{1,12}$' and ltrim(x->>'shortCode','0')=item.code;
    if item.n>prior_count then raise exception 'Código Trier repetido: %',item.code; end if;
  end loop;
  return new;
end $$;
revoke all on function panel_private.registration_identity_guard() from public,anon,authenticated;
create trigger registration_identity_guard before update of catalog on public.catalog_draft for each row execute function panel_private.registration_identity_guard();
commit;
