-- Which store(s) a grocery line is bought at. It is still one list, but each
-- line belongs to the stores you actually shop — filing it at Meijer does not
-- put it on the Amazon run. Lines with no row show up in a single shared
-- "Any store" group until they are filed.
create table public.grocery_item_stores (
  household_id uuid not null references public.households (id) on delete cascade,
  grocery_item_id uuid not null references public.grocery_items (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  primary key (grocery_item_id, store_id)
);

create index grocery_item_stores_store_idx on public.grocery_item_stores (store_id);
create index grocery_item_stores_household_idx on public.grocery_item_stores (household_id);

alter table public.grocery_item_stores enable row level security;

create policy "member grocery item stores" on public.grocery_item_stores
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Existing lines keep the stores they are already filed at (explicit
-- assignment or remembered per catalog item); the rest go to wherever the
-- household was already shopping, so nothing lands in "Any store" on upgrade
-- and nothing is listed under a store twice.
with primary_store as (
  select
    h.id as household_id,
    coalesce(
      (select s.selected_store_id
         from public.household_settings s
        where s.household_id = h.id
          and s.selected_store_id is not null),
      (select st.id
         from public.stores st
        where st.household_id = h.id
        order by st.sort_order, st.created_at
        limit 1)
    ) as store_id
  from public.households h
),
filed as (
  select grocery_item_id, store_id
    from public.grocery_item_aisles
  union
  select g.id, a.store_id
    from public.grocery_items g
    join public.item_store_aisles a on a.item_id = g.item_id
)
insert into public.grocery_item_stores (household_id, grocery_item_id, store_id)
select g.household_id, g.id, f.store_id
from public.grocery_items g
join filed f on f.grocery_item_id = g.id
union
select g.household_id, g.id, p.store_id
from public.grocery_items g
join primary_store p on p.household_id = g.household_id
where p.store_id is not null
  and not exists (select 1 from filed f where f.grocery_item_id = g.id);

-- The active store becomes a multi-select: which stores the list shows at
-- once. selected_store_id stays for now (it mirrors the first entry) so a
-- deploy that lands before this migration's app code keeps working; drop it
-- in a later migration.
alter table public.household_settings
  add column if not exists selected_store_ids uuid[] not null default '{}';

update public.household_settings
set selected_store_ids = case
  when selected_store_id is null then '{}'::uuid[]
  else array[selected_store_id]
end;
