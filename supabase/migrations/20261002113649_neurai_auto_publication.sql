begin;
-- Existing snapshots and catalog data are retained. Only service-side functions write.
alter table public.publications drop constraint publications_status_check;
alter table public.publications add constraint publications_status_check check (status in ('queued','pending','building','published','failed'));
alter table public.publications add column run_id text, add column dispatch_state text,
  add column dispatched_at timestamptz, add column error_message text;
create index publications_queue on public.publications(draft_version,created_at) where status = 'queued';
create table public.price_batches (
  id uuid primary key,
  actor_id uuid not null, -- audit identity intentionally survives account deletion
  actor_label text not null,
  created_at timestamptz not null default now(),
  before_version bigint not null,
  after_version bigint not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  request jsonb not null,
  auto_publish boolean not null,
  publication_id uuid references public.publications(id),
  restores_id uuid unique references public.price_batches(id)
);
create index price_batches_history on public.price_batches(created_at desc);
create index price_batches_publication on public.price_batches(publication_id);
alter table public.price_batches enable row level security;
revoke all on public.price_batches from public,anon,authenticated;
grant all on public.price_batches to service_role;
grant select,update on public.catalog_draft to service_role;
grant select,insert,update on public.publications to service_role;

create function public.catalog_request_publication(actor_id uuid, expected_version bigint) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare draft public.catalog_draft; job public.publications; result_id uuid;
begin
  perform pg_advisory_xact_lock(6100201);
  if not exists(select 1 from public.team_members m where m.user_id=actor_id and m.active and m.role='admin') then
    raise exception 'Somente administradores podem publicar.';
  end if;
  select * into draft from public.catalog_draft where id=1 for update;
  if draft.version is distinct from expected_version then raise exception 'O catálogo mudou. Recarregue e revise antes de publicar.'; end if;
  select * into job from public.publications where draft_version=draft.version and status <> 'failed' order by created_at desc limit 1;
  if found then return job.id; end if;
  insert into public.publications(catalog,draft_version,status,created_by) values(draft.catalog,draft.version,'queued',actor_id) returning id into result_id;
  update public.price_batches b set publication_id=result_id
    where b.publication_id is null and b.after_version<=draft.version
      and not exists(select 1 from jsonb_array_elements(b.changes) c
        where not exists(select 1 from jsonb_array_elements(draft.catalog->'products') p
          where p->'id'=c->'productId' and p->'priceCents'=c->'priceCents' and upper(p->>'shortCode')=c->>'code'));
  return result_id;
end $$;

create function public.neurai_save_batch(actor_id uuid,batch_id uuid,expected_version bigint,changes jsonb,auto_publish boolean,restores_id uuid default null,actor_email text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare draft public.catalog_draft; previous public.price_batches; original public.price_batches;
  item jsonb; product jsonb; position integer; next_catalog jsonb; audit_rows jsonb := '[]';
  seen text[] := '{}'; code text; amount bigint; prior bigint; publication uuid; actor_name text; req jsonb;
begin
  perform pg_advisory_xact_lock(6100201);
  if not exists(select 1 from public.team_members m where m.user_id=actor_id and m.active) then raise exception 'Usuário não autorizado.'; end if;
  if auto_publish and not exists(select 1 from public.team_members m where m.user_id=actor_id and m.active and m.role='admin') then raise exception 'Somente administradores podem publicar.'; end if;
  req := jsonb_build_object('version',expected_version,'rows',changes,'auto',auto_publish,'restores',restores_id);
  select * into previous from public.price_batches where id=batch_id;
  if found then
    if previous.actor_id<>actor_id or previous.request<>req then raise exception 'Identificador de lote já utilizado.'; end if;
    return to_jsonb(previous)-'request';
  end if;
  if batch_id is null or expected_version is null or auto_publish is null or jsonb_typeof(changes) is distinct from 'array'
    or jsonb_array_length(changes) not between 1 and 100 then raise exception 'Informe de 1 a 100 produtos por lote.'; end if;
  select * into draft from public.catalog_draft where id=1 for update;
  if draft.version is distinct from expected_version then raise exception 'O catálogo mudou. Recarregue e analise o lote novamente.'; end if;
  next_catalog := draft.catalog;
  if restores_id is not null then
    select * into original from public.price_batches where id=neurai_save_batch.restores_id;
    if not found or jsonb_array_length(original.changes)<>jsonb_array_length(changes) then raise exception 'Restauração inválida.'; end if;
  end if;
  for item in select value from jsonb_array_elements(changes) loop
    code := upper(item->>'code');
    if code is null or code !~ '^[A-Z0-9._/-]{1,40}$' or code=any(seen) then raise exception 'Código inválido ou repetido neste lote.'; end if;
    seen := array_append(seen,code);
    if (select count(*) from jsonb_array_elements(draft.catalog->'products') p where upper(p->>'shortCode')=code) <> 1 then raise exception 'Código inexistente ou duplicado no catálogo: %',code; end if;
    select value, (ordinality-1)::integer into product,position from jsonb_array_elements(draft.catalog->'products') with ordinality where upper(value->>'shortCode')=code;
    if jsonb_typeof(item->'priceCents') is distinct from 'number' or (item->>'priceCents') !~ '^[0-9]{1,9}$' then raise exception 'Preço inválido.'; end if;
    amount := (item->>'priceCents')::bigint;
    if amount not between 1 and 100000000 then raise exception 'Preço inválido.'; end if;
    if item->'productId' is distinct from product->'id' or item->'previousCents' is distinct from product->'priceCents' then raise exception 'O produto mudou. Recarregue e analise o lote novamente.'; end if;
    -- Current project has a single price/code per product. Do not guess a size-specific price.
    if jsonb_array_length(coalesce(product->'variants','[]')) > 0 then raise exception 'O código % possui tamanhos com preço compartilhado. Use o cadastro individual para revisar esse produto.',code; end if;
    prior := (product->>'priceCents')::bigint;
    if restores_id is not null and not exists(select 1 from jsonb_array_elements(original.changes) c where c->'productId'=item->'productId' and c->>'code'=code and (c->>'priceCents')::bigint=prior and (c->>'previousCents')::bigint=amount) then raise exception 'O preço mudou desde o lote original. Restauração bloqueada.'; end if;
    next_catalog := jsonb_set(next_catalog,array['products',position::text,'priceCents'],to_jsonb(amount));
    next_catalog := jsonb_set(next_catalog,array['products',position::text,'updatedAt'],to_jsonb(now()));
    audit_rows := audit_rows || jsonb_build_array(jsonb_build_object('productId',product->'id','code',code,'name',product->>'name','detail',product->>'detail','previousCents',prior,'priceCents',amount));
  end loop;
  update public.catalog_draft set catalog=next_catalog,version=version+1,updated_at=now() where id=1;
  if auto_publish then publication := public.catalog_request_publication(actor_id,draft.version+1); end if;
  -- Identity is supplied only by the backend after Auth.getUser verification.
  -- Do not grant service_role access to the private auth.users table for auditing.
  actor_name := coalesce(nullif(left(btrim(actor_email),254),''),actor_id::text);
  insert into public.price_batches(id,actor_id,actor_label,before_version,after_version,changes,request,auto_publish,publication_id,restores_id)
    values(batch_id,actor_id,coalesce(actor_name,actor_id::text),draft.version,draft.version+1,audit_rows,req,auto_publish,publication,restores_id) returning * into previous;
  return to_jsonb(previous)-'request';
end $$;

-- Only one GitHub request at a time; uncertain delivery can reuse the same snapshot.
create function public.catalog_dispatch_claim(retry_pending boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare job public.publications;
begin
  perform pg_advisory_xact_lock(6100201);
  select * into job from public.publications where status in ('pending','building') for update;
  if found then
    if job.status='building' or not retry_pending or job.dispatched_at > now()-interval '60 seconds' then return null; end if;
  else
    select * into job from public.publications where status='queued' order by draft_version,created_at limit 1 for update;
    if not found then return null; end if;
  end if;
  update public.publications set status='pending',dispatch_state='sending',dispatched_at=now(),error_message=null where id=job.id;
  return jsonb_build_object('id',job.id);
end $$;

create function public.catalog_publication_start(publication_id uuid,worker_run text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare snapshot jsonb;
begin
  if worker_run is null or worker_run !~ '^[0-9]+$' then raise exception 'Execução inválida.'; end if;
  update public.publications set status='building',run_id=worker_run,dispatch_state='accepted'
    where id=publication_id and status='pending' returning catalog into snapshot;
  return snapshot; -- a duplicated dispatch cannot deploy or finish the original job
end $$;

create function public.catalog_publication_finish(publication_id uuid,worker_run text,result_status text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if result_status not in ('published','failed') then raise exception 'Estado inválido.'; end if;
  update public.publications set status=result_status,finished_at=now(),error_message=case when result_status='failed' then 'A publicação falhou no GitHub Actions.' else null end
    where id=publication_id and status='building' and run_id=worker_run;
end $$;

create function public.catalog_retry_publication(actor_id uuid,publication_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare job public.publications;
begin
  perform pg_advisory_xact_lock(6100201);
  if not exists(select 1 from public.team_members m where m.user_id=actor_id and m.active and m.role='admin') then raise exception 'Somente administradores podem publicar.'; end if;
  select * into job from public.publications where id=publication_id for update;
  if not found then raise exception 'Publicação não encontrada.'; end if;
  if job.status <> 'failed' then return; end if;
  if exists(select 1 from public.publications p where p.id<>job.id and p.draft_version>=job.draft_version and p.status<>'failed')
    or job.draft_version is distinct from (select version from public.catalog_draft where id=1) then
    raise exception 'Há uma versão mais recente do catálogo. Revise o rascunho atual e use Publicar no site.';
  end if;
  update public.publications set status='queued',finished_at=null,run_id=null,dispatch_state=null,dispatched_at=null,error_message=null where id=publication_id;
end $$;

revoke all on function public.catalog_request_publication(uuid,bigint),public.neurai_save_batch(uuid,uuid,bigint,jsonb,boolean,uuid,text),public.catalog_dispatch_claim(boolean),public.catalog_publication_start(uuid,text),public.catalog_publication_finish(uuid,text,text),public.catalog_retry_publication(uuid,uuid) from public,anon,authenticated;
grant execute on function public.catalog_request_publication(uuid,bigint),public.neurai_save_batch(uuid,uuid,bigint,jsonb,boolean,uuid,text),public.catalog_dispatch_claim(boolean),public.catalog_publication_start(uuid,text),public.catalog_publication_finish(uuid,text,text),public.catalog_retry_publication(uuid,uuid) to service_role;
commit;
