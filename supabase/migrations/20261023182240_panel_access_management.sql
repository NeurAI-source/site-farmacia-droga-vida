-- Applied as 20261023182240; matches the production migration registry.
-- Additive access controls. Existing memberships and permissions stay intact.
create table public.panel_role_creation (
  role text primary key check(role in ('editor','manager','owner')),
  enabled boolean not null default false,
  allowed_roles text[] not null default array['editor']::text[]
    check(allowed_roles <@ array['editor','manager','owner']::text[]),
  version bigint not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.panel_role_creation(role) values('editor'),('manager'),('owner');
create table public.panel_access_history (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_id uuid,
  event text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.panel_role_creation enable row level security;
alter table public.panel_access_history enable row level security;
revoke all on public.panel_role_creation,public.panel_access_history from public,anon,authenticated;
grant select,update on public.panel_role_creation to service_role;
grant select,insert on public.panel_access_history to service_role;
grant usage,select on sequence public.panel_access_history_id_seq to service_role;
-- Only server-verified requests may invoke the service-only RPCs below.
create function public.panel_access_rank(job text) returns integer language sql immutable set search_path='' as $$
  select case job when 'admin' then 4 when 'owner' then 3 when 'manager' then 2 when 'editor' then 1 else 0 end
$$;
create function public.panel_access_context(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job text; permitted text[]; enabled boolean;
begin
  select role into job from public.team_members where user_id=actor_id and active;
  if job is null then raise exception 'Usuário não autorizado.'; end if;
  if job='admin' then permitted:=array['admin','owner','manager','editor'];
  else
    select p.enabled,p.allowed_roles into enabled,permitted from public.panel_role_creation p where p.role=job;
    if not coalesce(enabled,false) then permitted:='{}'; end if;
    select coalesce(array_agg(r),'{}') into permitted from unnest(permitted) r
      where r<>'admin' and public.panel_access_rank(r)<=public.panel_access_rank(job);
  end if;
  return jsonb_build_object('isAdmin',job='admin','canCreate',cardinality(permitted)>0,'allowedRoles',permitted,
    'policies',case when job='admin' then (select jsonb_agg(to_jsonb(p) order by role) from public.panel_role_creation p) else '[]'::jsonb end);
end $$;
create function public.panel_access_register(actor_id uuid,target_id uuid,target_role text) returns void
language plpgsql security invoker set search_path='' as $$
declare context jsonb;
begin
  perform pg_advisory_xact_lock(9282026);
  context:=public.panel_access_context(actor_id);
  if target_role is null or not (context->'allowedRoles' ? target_role) then raise exception 'Seu cargo não pode criar este acesso.'; end if;
  perform set_config('app.panel_actor',actor_id::text,true);
  insert into public.team_members(user_id,role,active) values(target_id,target_role,true);
end $$;
create function public.panel_access_update(actor_id uuid,target_id uuid,target_role text,target_active boolean,expected_role text,expected_active boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare previous public.team_members;
begin
  perform pg_advisory_xact_lock(9282026);
  if not exists(select 1 from public.team_members where user_id=actor_id and active and role='admin') then raise exception 'Somente administradores podem gerenciar acessos.'; end if;
  if actor_id=target_id then raise exception 'Sua própria conta está protegida.'; end if;
  if target_role is null or target_role not in ('admin','owner','manager','editor') or target_active is null then raise exception 'Cargo ou situação inválida.'; end if;
  select * into previous from public.team_members where user_id=target_id for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if previous.role is distinct from expected_role or previous.active is distinct from expected_active then raise exception 'O acesso mudou. Atualize a lista antes de tentar novamente.'; end if;
  if previous.role='admin' and previous.active and (target_role<>'admin' or not target_active)
    and (select count(*) from public.team_members where role='admin' and active)<=1 then raise exception 'O último administrador está protegido.'; end if;
  perform set_config('app.panel_actor',actor_id::text,true);
  update public.team_members set role=target_role,active=target_active where user_id=target_id;
end $$;
create function public.panel_access_policy(actor_id uuid,job text,enabled boolean,allowed_roles text[],expected_version bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare previous public.panel_role_creation; updated public.panel_role_creation;
begin
  perform pg_advisory_xact_lock(9282026);
  if not exists(select 1 from public.team_members where user_id=actor_id and active and role='admin') then raise exception 'Somente administradores podem delegar a criação de acessos.'; end if;
  if job is null or job not in ('editor','manager','owner') or enabled is null or allowed_roles is null
    or (enabled and cardinality(allowed_roles)=0) or cardinality(allowed_roles)>3 then raise exception 'Confira as permissões do cargo.'; end if;
  if exists(select 1 from unnest(allowed_roles) r where r is null or r not in ('editor','manager','owner') or public.panel_access_rank(r)>public.panel_access_rank(job))
    or cardinality(allowed_roles)<>(select count(distinct r) from unnest(allowed_roles) r) then raise exception 'Não é permitido conceder cargos superiores.'; end if;
  select * into previous from public.panel_role_creation p where p.role=job for update;
  if previous.version is distinct from expected_version then raise exception 'A permissão mudou. Atualize a lista.'; end if;
  update public.panel_role_creation p set enabled=panel_access_policy.enabled,allowed_roles=panel_access_policy.allowed_roles,version=p.version+1,updated_by=actor_id,updated_at=now() where role=job returning * into updated;
  insert into public.panel_access_history(actor_id,event,previous_value,new_value) values(actor_id,'role_creation_policy',to_jsonb(previous),to_jsonb(updated));
end $$;
create function public.panel_access_prepare_delete(actor_id uuid,target_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform set_config('app.panel_actor',actor_id::text,true);
  perform public.prepare_panel_user_deletion(actor_id,target_id);
  insert into public.panel_access_history(actor_id,target_id,event) values(actor_id,target_id,'delete_requested');
end $$;
revoke all on function public.panel_access_rank(text),public.panel_access_context(uuid),public.panel_access_register(uuid,uuid,text),public.panel_access_update(uuid,uuid,text,boolean,text,boolean),public.panel_access_policy(uuid,text,boolean,text[],bigint),public.panel_access_prepare_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.panel_access_rank(text),public.panel_access_context(uuid),public.panel_access_register(uuid,uuid,text),public.panel_access_update(uuid,uuid,text,boolean,text,boolean),public.panel_access_policy(uuid,text,boolean,text[],bigint),public.panel_access_prepare_delete(uuid,uuid) to service_role;
create schema if not exists panel_private;
revoke all on schema panel_private from public,anon,authenticated;
create function panel_private.audit_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.role=new.role and old.active=new.active then return new; end if;
  insert into public.panel_access_history(actor_id,target_id,event,previous_value,new_value)
    values(coalesce(nullif(current_setting('app.panel_actor',true),'')::uuid,auth.uid()),
      case when tg_op='DELETE' then old.user_id else new.user_id end,
      lower(tg_op),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function panel_private.audit_membership() from public,anon,authenticated;
create trigger audit_panel_membership after insert or update or delete on public.team_members for each row execute function panel_private.audit_membership();
