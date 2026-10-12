-- Named leftovers: cooked food kept for later. Standalone household reminders —
-- not inventory records; nothing else in the app reads or manages them (no
-- age-based cleanup, no stock impact). The realtime publication lets the global
-- postgres_changes listener refresh other members' devices on add/remove.
create table if not exists public.leftovers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists leftovers_household_idx on public.leftovers (household_id, created_at);

alter table public.leftovers enable row level security;

create policy "member leftovers" on public.leftovers
  for all using (public.is_member(household_id))
  with check (public.is_member(household_id));

alter publication supabase_realtime add table public.leftovers;
