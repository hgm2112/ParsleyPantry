-- Durable per-item store memory: which store(s) you buy a catalog item at,
-- remembered across shopping trips (applied automatically when the item is
-- added to the list). Parallel to item_store_aisles, but for store membership
-- rather than aisle. Lines can still be re-filed per trip; this only seeds the
-- default.
create table public.item_stores (
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  primary key (item_id, store_id)
);

create index item_stores_store_idx on public.item_stores (store_id);
create index item_stores_household_idx on public.item_stores (household_id);

alter table public.item_stores enable row level security;

create policy "member item stores" on public.item_stores
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Grocery add frequency + recency on the catalog, used to rank the type-ahead
-- suggestions: how many times an item has been added to the list and when it
-- was added most recently.
alter table public.items
  add column if not exists grocery_add_count integer not null default 0,
  add column if not exists grocery_last_added_at timestamptz;
