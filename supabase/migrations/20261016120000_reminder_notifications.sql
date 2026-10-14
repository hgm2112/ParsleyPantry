-- Daily leftovers reminder: per-user notification preferences, per-device push
-- subscriptions, and per-device/day delivery claims so a retried or duplicated
-- cron run never sends the same reminder twice on one local calendar day.
-- Deliveries are cron-only (service role bypasses RLS; zero client policies).
-- Nothing here relates to inventory, shopping, recipes, or meal plans.
create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  local_time time not null default '18:00',
  timezone text,
  generic_message boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Endpoint identifies a device+browser; re-subscribing replaces keys in place.
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.leftover_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, local_date)
);

alter table public.notification_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_settings'
      and policyname = 'own notification settings'
  ) then
    create policy "own notification settings"
      on public.notification_settings
      for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end;
$$;

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'own push subscriptions'
  ) then
    create policy "own push subscriptions"
      on public.push_subscriptions
      for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end;
$$;

alter table public.leftover_reminder_deliveries enable row level security;
