-- Additive migration. No changes to catalog, team membership, product images or publications.
begin;
create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check (path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size integer not null check (size > 0 and size <= 5242880),
  width integer not null check (width between 16 and 12000),
  height integer not null check (height between 16 and 12000),
  uploaded_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (width::bigint * height <= 40000000)
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('post','flyer')),
  cover_id uuid not null references public.campaign_assets,
  link_url text not null default '' check (link_url = '' or (link_url ~ '^https://' and length(link_url)<=2048)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  active boolean not null default false,
  publication_state text not null default 'draft' check (publication_state in ('draft','published','archived')),
  version integer not null default 1,
  created_by uuid references auth.users on delete set null,
  approved_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.campaign_pages (
  campaign_id uuid not null references public.campaigns on delete cascade,
  asset_id uuid not null references public.campaign_assets,
  position integer not null check (position between 0 and 29),
  primary key (campaign_id, position),
  unique (campaign_id,asset_id)
);
create index campaigns_public_period on public.campaigns (starts_at,ends_at,sort_order,id) where active and publication_state='published';
create index campaigns_updated on public.campaigns(updated_at desc,id);
create index campaigns_cover on public.campaigns(cover_id);
create index campaigns_creator on public.campaigns(created_by);
create index campaigns_approver on public.campaigns(approved_by);
create index campaign_pages_asset on public.campaign_pages(asset_id);
create index campaign_assets_uploader on public.campaign_assets(uploaded_by);
alter table public.campaigns enable row level security;
alter table public.campaign_pages enable row level security;
alter table public.campaign_assets enable row level security;
-- Management runs only through an authenticated Edge Function. No client write/read grants.
revoke all on public.campaigns,public.campaign_pages,public.campaign_assets from public,anon,authenticated;
grant select,insert,update,delete on public.campaigns,public.campaign_pages,public.campaign_assets to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('campaign-images','campaign-images',false,5242880,array['image/jpeg','image/png','image/webp']);
-- Intentionally no storage.objects policies for this private bucket. Uploads and signing
-- use service_role inside campaign-api after Auth + active team membership verification.

create function public.campaign_write(action text, actor uuid, payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  member_role text; current_row public.campaigns; cid uuid := (payload->>'id')::uuid;
  target_state text; new_id uuid; page_ids uuid[];
begin
  select role into member_role from public.team_members where user_id=actor and active for share;
  if member_role is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if action not in ('save','duplicate','archive','deactivate','delete') then raise exception 'Ação inválida.'; end if;
  if action <> 'save' or (payload->>'version')::integer <> 0 then
    select * into current_row from public.campaigns where id=cid for update;
    if not found then raise exception 'Campanha não encontrada.'; end if;
    if current_row.version <> (payload->>'version')::integer then raise exception 'Campanha alterada por outra pessoa. Recarregue antes de salvar.' using errcode='40001'; end if;
  end if;
  if action='delete' then
    if member_role<>'admin' or current_row.publication_state<>'archived' then raise exception 'Somente administradores podem excluir campanhas arquivadas.' using errcode='42501'; end if;
    delete from public.campaigns where id=cid;
    return cid;
  elsif action='duplicate' then
    insert into public.campaigns(title,kind,cover_id,link_url,starts_at,ends_at,sort_order,active,publication_state,created_by)
    values(left(current_row.title,110)||' (cópia)',current_row.kind,current_row.cover_id,current_row.link_url,current_row.starts_at,current_row.ends_at,current_row.sort_order,false,'draft',actor) returning id into new_id;
    insert into public.campaign_pages select new_id,asset_id,position from public.campaign_pages where campaign_id=cid;
    return new_id;
  elsif action in ('archive','deactivate') then
    update public.campaigns set active=false, publication_state=case when action='archive' then 'archived' else publication_state end, version=version+1,updated_at=now() where id=cid;
    return cid;
  end if;
  target_state := payload->>'publication_state';
  if target_state not in ('draft','published') then raise exception 'Publicação inválida.'; end if;
  if target_state='published' and member_role<>'admin' then raise exception 'Somente administradores podem publicar.' using errcode='42501'; end if;
  if target_state='published' and (payload->>'ends_at')::timestamptz<=now() then raise exception 'Não é possível publicar campanha vencida.'; end if;
  select coalesce(array_agg(value::uuid),'{}') into page_ids from jsonb_array_elements_text(payload->'pages');
  if cardinality(page_ids)>30 or ((payload->>'kind')='flyer' and cardinality(page_ids)=0) or ((payload->>'kind')='post' and cardinality(page_ids)<>0) then raise exception 'Páginas inválidas.'; end if;
  if (payload->>'version')::integer=0 then
    insert into public.campaigns(id,title,kind,cover_id,link_url,starts_at,ends_at,sort_order,active,publication_state,created_by,approved_by)
    values(cid,payload->>'title',payload->>'kind',(payload->>'cover_id')::uuid,payload->>'link_url',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,(payload->>'sort_order')::integer,(payload->>'active')::boolean,target_state,actor,case when target_state='published' then actor else null end);
  else
    update public.campaigns set title=payload->>'title',kind=payload->>'kind',cover_id=(payload->>'cover_id')::uuid,link_url=payload->>'link_url',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz,sort_order=(payload->>'sort_order')::integer,active=(payload->>'active')::boolean,publication_state=target_state,approved_by=case when target_state='published' then actor else null end,version=version+1,updated_at=now() where id=cid;
  end if;
  delete from public.campaign_pages where campaign_id=cid;
  insert into public.campaign_pages(campaign_id,asset_id,position) select cid,id,ordinality-1 from unnest(page_ids) with ordinality p(id,ordinality);
  return cid;
end $$;
revoke all on function public.campaign_write(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_write(text,uuid,jsonb) to service_role;

-- One database snapshot supplies both its clock and eligible rows. Future/draft metadata
-- never reaches anonymous visitors. The next boundary allows precise browser refreshes.
create function public.campaign_public_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'server_now', now(),
  'next_start', (select min(starts_at) from public.campaigns where publication_state='published' and active and starts_at>now()),
  'campaigns', coalesce((select jsonb_agg(item order by sort_order,id) from (
    select c.sort_order,c.id,jsonb_build_object('id',c.id,'version',c.version,'title',c.title,'kind',c.kind,'link_url',c.link_url,'starts_at',c.starts_at,'ends_at',c.ends_at,'sort_order',c.sort_order,'active',true,'publication_state','published','cover_path',a.path,
      'page_paths',coalesce((select jsonb_agg(pa.path order by p.position) from public.campaign_pages p join public.campaign_assets pa on pa.id=p.asset_id where p.campaign_id=c.id),'[]'::jsonb)) item
    from public.campaigns c join public.campaign_assets a on a.id=c.cover_id
    where c.publication_state='published' and c.active and c.starts_at<=now() and now()<c.ends_at
  ) eligible),'[]'::jsonb))
$$;
revoke all on function public.campaign_public_snapshot() from public,anon,authenticated;
grant execute on function public.campaign_public_snapshot() to service_role;
commit;
