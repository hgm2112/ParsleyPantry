-- Dedicated item sub-categories (pantry classifications like snack/candy).

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index subcategories_household_name_key on public.subcategories (household_id, lower(name));

alter table public.items
  add column if not exists subcategory_id uuid references public.subcategories (id) on delete set null;

create index if not exists items_subcategory_idx on public.items (subcategory_id);

alter table public.subcategories enable row level security;

create policy "member subcategories" on public.subcategories
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
