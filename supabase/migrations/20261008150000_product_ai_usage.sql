-- Limit the cost of on-demand AI catalog research; no keys or customer data stored.
create table if not exists public.product_ai_usage (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 product_id integer not null,
 created_at timestamptz not null default now()
);
create index if not exists product_ai_usage_actor_time on public.product_ai_usage(actor_id, created_at desc);
alter table public.product_ai_usage enable row level security;
revoke all on public.product_ai_usage from public, anon, authenticated;
