-- "Only buy if on sale" tag for grocery items.
alter table public.grocery_items
  add column if not exists sale_only boolean not null default false;
