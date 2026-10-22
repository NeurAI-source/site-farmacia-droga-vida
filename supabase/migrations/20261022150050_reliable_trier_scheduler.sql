-- Additive scheduler. Reuse the existing Edge Function, cache, lease and audit.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke usage on schema cron,net from public,anon,authenticated;

-- The token is generated inside Postgres, never returned or copied to a client.
do $$ begin
  if not exists(select 1 from vault.secrets where name='trier_schedule_token') then
    perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'trier_schedule_token','Restricted capability: invoke Trier inventory sync only');
  end if;
end $$;

create or replace function public.trier_schedule_authorized(provided_token text) returns boolean
language sql security definer set search_path='' as $$
  select coalesce(provided_token ~ '^[a-f0-9]{64}$' and exists(
    select 1 from vault.decrypted_secrets where name='trier_schedule_token' and decrypted_secret=provided_token
  ),false);
$$;
revoke all on function public.trier_schedule_authorized(text) from public,anon,authenticated;
grant execute on function public.trier_schedule_authorized(text) to service_role;

create or replace function public.trier_run_scheduled_sync() returns bigint
language plpgsql security definer set search_path='' as $$
declare capability text; request_id bigint;
begin
  -- Avoid unnecessary HTTP calls. The existing RPC still acquires the lease
  -- atomically, so a concurrent manual request cannot start a duplicate run.
  if exists(select 1 from public.trier_sync_state where id=1 and
    (lease_until>now() or started_at>now()-interval '15 minutes')) then return null; end if;
  select decrypted_secret into capability from vault.decrypted_secrets where name='trier_schedule_token';
  if capability is null then raise exception 'Trier scheduler capability missing'; end if;
  select net.http_post(
    url:='https://bzhsnoqlbhjaaheugpku.supabase.co/functions/v1/trier-api',
    headers:=jsonb_build_object('Content-Type','application/json','x-trier-schedule',capability),
    body:='{"action":"sync"}'::jsonb,timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.trier_run_scheduled_sync() from public,anon,authenticated,service_role;

-- Install disabled; enable only after the compatible Edge Function is deployed.
select cron.schedule('trier-inventory-sync','*/5 * * * *','select public.trier_run_scheduled_sync();');
select cron.alter_job((select jobid from cron.job where jobname='trier-inventory-sync'),active:=false);
