begin;
-- Códigos reduzidos e preços por tamanho vivem dentro do JSON do catálogo.
-- Esta migration apenas ensina as RPCs existentes a tratar variantes com segurança.

create or replace function public.catalog_request_publication(actor_id uuid, expected_version bigint) returns uuid
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
      and not exists(
        select 1 from jsonb_array_elements(b.changes) c
        where not exists(
          select 1 from jsonb_array_elements(draft.catalog->'products') p
          where p->'id'=c->'productId'
            and (
              (coalesce(c->>'variantId','') = '' and jsonb_array_length(coalesce(p->'variants','[]'::jsonb))=0
                and p->'priceCents'=c->'priceCents' and upper(p->>'shortCode')=c->>'code')
              or
              (coalesce(c->>'variantId','') <> '' and exists(
                select 1 from jsonb_array_elements(coalesce(p->'variants','[]'::jsonb)) v
                where v->'id'=c->'variantId' and upper(v->>'shortCode')=c->>'code'
                  and coalesce(v->'priceCents',p->'priceCents')=c->'priceCents'
              ))
            )
        )
      );
  return result_id;
end $$;

create or replace function public.neurai_save_batch(actor_id uuid,batch_id uuid,expected_version bigint,changes jsonb,auto_publish boolean,restores_id uuid default null,actor_email text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare draft public.catalog_draft; previous public.price_batches; original public.price_batches;
  item jsonb; product jsonb; variant jsonb; position integer; variant_position integer;
  next_catalog jsonb; audit_rows jsonb := '[]'; seen text[] := '{}'; code text;
  amount bigint; prior bigint; publication uuid; actor_name text; req jsonb; matches integer;
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

    select count(*) into matches from (
      select 1
      from jsonb_array_elements(draft.catalog->'products') p
      where jsonb_array_length(coalesce(p->'variants','[]'::jsonb))=0 and upper(p->>'shortCode')=code
      union all
      select 1
      from jsonb_array_elements(draft.catalog->'products') p,
           lateral jsonb_array_elements(coalesce(p->'variants','[]'::jsonb)) v
      where upper(v->>'shortCode')=code
    ) q;
    if matches <> 1 then raise exception 'Código inexistente ou duplicado no catálogo: %',code; end if;

    product := null; variant := null; position := null; variant_position := null;
    select p.value,(p.ordinality-1)::integer into product,position
      from jsonb_array_elements(draft.catalog->'products') with ordinality p(value,ordinality)
      where jsonb_array_length(coalesce(p.value->'variants','[]'::jsonb))=0 and upper(p.value->>'shortCode')=code
      limit 1;

    if product is null then
      select p.value,(p.ordinality-1)::integer,v.value,(v.ordinality-1)::integer
        into product,position,variant,variant_position
      from jsonb_array_elements(draft.catalog->'products') with ordinality p(value,ordinality),
           lateral jsonb_array_elements(coalesce(p.value->'variants','[]'::jsonb)) with ordinality v(value,ordinality)
      where upper(v.value->>'shortCode')=code
      limit 1;
    end if;

    if jsonb_typeof(item->'priceCents') is distinct from 'number' or (item->>'priceCents') !~ '^[0-9]{1,9}$' then raise exception 'Preço inválido.'; end if;
    amount := (item->>'priceCents')::bigint;
    if amount not between 1 and 100000000 then raise exception 'Preço inválido.'; end if;
    if item->'productId' is distinct from product->'id' then raise exception 'O produto mudou. Recarregue e analise o lote novamente.'; end if;

    if variant is null then
      prior := (product->>'priceCents')::bigint;
      if coalesce(item->>'variantId','') <> '' or item->'previousCents' is distinct from product->'priceCents' then raise exception 'O produto mudou. Recarregue e analise o lote novamente.'; end if;
      if restores_id is not null and not exists(
        select 1 from jsonb_array_elements(original.changes) c
        where c->'productId'=item->'productId' and coalesce(c->>'variantId','')='' and c->>'code'=code
          and (c->>'priceCents')::bigint=prior and (c->>'previousCents')::bigint=amount
      ) then raise exception 'O preço mudou desde o lote original. Restauração bloqueada.'; end if;
      next_catalog := jsonb_set(next_catalog,array['products',position::text,'priceCents'],to_jsonb(amount));
      audit_rows := audit_rows || jsonb_build_array(jsonb_build_object(
        'productId',product->'id','variantId',null,'variantSize',null,'code',code,'name',product->>'name',
        'detail',product->>'detail','previousCents',prior,'priceCents',amount
      ));
    else
      prior := coalesce((variant->>'priceCents')::bigint,(product->>'priceCents')::bigint);
      if item->'variantId' is distinct from variant->'id' or (item->>'previousCents')::bigint is distinct from prior then raise exception 'O tamanho mudou. Recarregue e analise o lote novamente.'; end if;
      if restores_id is not null and not exists(
        select 1 from jsonb_array_elements(original.changes) c
        where c->'productId'=item->'productId' and c->'variantId'=item->'variantId' and c->>'code'=code
          and (c->>'priceCents')::bigint=prior and (c->>'previousCents')::bigint=amount
      ) then raise exception 'O preço mudou desde o lote original. Restauração bloqueada.'; end if;
      next_catalog := jsonb_set(next_catalog,array['products',position::text,'variants',variant_position::text,'priceCents'],to_jsonb(amount),true);
      audit_rows := audit_rows || jsonb_build_array(jsonb_build_object(
        'productId',product->'id','variantId',variant->'id','variantSize',variant->>'size','code',code,
        'name',(product->>'name') || ' — ' || (variant->>'size'),
        'detail','Tamanho ' || (variant->>'size') || ' · pacote com ' || (variant->>'packageQuantity') || ' unidades',
        'previousCents',prior,'priceCents',amount
      ));
    end if;
    next_catalog := jsonb_set(next_catalog,array['products',position::text,'updatedAt'],to_jsonb(now()));
  end loop;

  update public.catalog_draft set catalog=next_catalog,version=version+1,updated_at=now() where id=1;
  if auto_publish then publication := public.catalog_request_publication(actor_id,draft.version+1); end if;
  actor_name := coalesce(nullif(left(btrim(actor_email),254),''),actor_id::text);
  insert into public.price_batches(id,actor_id,actor_label,before_version,after_version,changes,request,auto_publish,publication_id,restores_id)
    values(batch_id,actor_id,coalesce(actor_name,actor_id::text),draft.version,draft.version+1,audit_rows,req,auto_publish,publication,restores_id) returning * into previous;
  return to_jsonb(previous)-'request';
end $$;

commit;
