-- No key is stored here. PostgREST verifies the existing caller credential.
create or replace function public.trier_scheduler_authorized() returns boolean
language sql security invoker set search_path='' as $$ select true $$;
revoke all on function public.trier_scheduler_authorized() from public,anon,authenticated;
grant execute on function public.trier_scheduler_authorized() to service_role;
