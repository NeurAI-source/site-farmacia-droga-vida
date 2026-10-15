-- Owner-requested email/password login. Preserve identity, roles, RLS and quotas.
begin;
create or replace function public.is_team_member(member_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select (auth.role()='service_role' or (member_id=auth.uid() and auth.role()='authenticated'))
    and exists(select 1 from public.team_members where user_id=member_id and active)
$$;
create or replace function public.save_catalog(payload jsonb, expected_version bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare next_version bigint;
begin
  if not public.is_team() then raise exception 'Unauthorized'; end if;
  if not public.catalog_schema_valid(payload) then raise exception 'Invalid catalog'; end if;
  update public.catalog_draft set catalog=payload,version=version+1,updated_at=now()
    where id=1 and version=expected_version returning version into next_version;
  if next_version is null then raise exception 'Conflict: reload catalog'; end if;
  return next_version;
end $$;
commit;
