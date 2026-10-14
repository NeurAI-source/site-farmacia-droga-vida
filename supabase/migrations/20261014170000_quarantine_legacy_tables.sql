-- Preserve legacy data; current website does not use these tables.
-- Service role retains backup access. No rows, policies or tables are deleted.
begin;
do $$
declare table_name text;
begin
  foreach table_name in array array['banners','categories','deliveries','delivery_drivers',
    'delivery_events','delivery_staff','driver_locations','products','promotions','site_settings']
  loop
    if to_regclass(format('public.%I',table_name)) is not null then
      execute format('alter table public.%I enable row level security',table_name);
      execute format('revoke all privileges on table public.%I from public,anon,authenticated',table_name);
    end if;
  end loop;
end $$;
commit;
