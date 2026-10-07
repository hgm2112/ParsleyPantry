-- Per-store opt-in for category-driven aisles. Stores default to OFF: each
-- store keeps its own aisle numbers and contents. Turning it ON (the "Use my
-- categories as aisles" button, the toggle in the aisle editor, or the apply
-- SQL) links that store's aisle list to the household categories.
alter table public.stores
  add column follow_categories boolean not null default false;
