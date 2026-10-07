-- Seed switch: each category decides whether it populates store aisle lists.
-- Stores own their lists; categories only ever pre-fill them.

alter table public.stores drop column if exists follow_categories;

alter table public.categories
  add column if not exists seed_stores boolean not null default true;

-- One-time data fix: 14 pre-existing leftovers (KitchenOwl defaults plus
-- strays) carried sort_order 1001-1030 from the desired-order apply. They
-- stay as inventory tags but stop seeding stores.
update public.categories
set seed_stores = false
where sort_order between 1000 and 1030;

-- Strip them from every store's aisle list (item assignments cascade).
delete from public.store_aisles
where category_id in (
  select id from public.categories where seed_stores = false
);
