-- Household supplies (non-food) inventory, separate from food items/inventory.
-- One combined quantity per item, no batches, no expiry/canonical.
create table if not exists public.household_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  quantity double precision not null default 1 check (quantity >= 0),
  unit text,
  category text not null default 'Miscellaneous'
    check (category in ('Paper Products', 'Cleaning Supplies', 'Personal Care', 'Laundry', 'Kitchen Supplies', 'Miscellaneous')),
  storage_location text not null default 'Other'
    check (storage_location in ('Kitchen', 'Bathroom', 'Laundry Room', 'Garage', 'Closet', 'Other')),
  low_threshold double precision,
  notes text,
  barcode text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists household_items_household_name_key
  on public.household_items (household_id, lower(name));
create unique index if not exists household_items_household_barcode_key
  on public.household_items (household_id, barcode) where barcode is not null;
create index if not exists household_items_household_idx
  on public.household_items (household_id, category, storage_location);

alter table public.household_items enable row level security;

create policy "member household items" on public.household_items
  for all using (public.is_member(household_id))
  with check (public.is_member(household_id));

alter publication supabase_realtime add table public.household_items;

create trigger household_items_updated_at before update on public.household_items
  for each row execute function moddatetime(updated_at);

-- Shopping List lines for household supplies link here and MUST NOT merge
-- via items/canonical. item_id stays null for these rows.
alter table public.grocery_items
  add column if not exists household_item_id uuid references public.household_items (id) on delete cascade;

create index if not exists grocery_items_household_item_idx
  on public.grocery_items (household_id, household_item_id) where household_item_id is not null;
