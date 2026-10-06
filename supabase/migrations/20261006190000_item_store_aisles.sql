-- Durable per-store aisle memory on catalog items: bread can sit in
-- Aisle 10 at one store and a different aisle at another, remembered
-- across shopping trips (applied automatically when added to the list).
-- Assignment rows on individual grocery lines still override this.
create table public.item_store_aisles (
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  aisle_id uuid not null references public.store_aisles (id) on delete cascade,
  primary key (item_id, store_id)
);

create index item_store_aisles_store_idx on public.item_store_aisles (store_id);

alter table public.item_store_aisles enable row level security;

create policy "member item store aisles" on public.item_store_aisles
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
