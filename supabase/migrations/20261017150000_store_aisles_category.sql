-- Restore store_aisles.category_id.
--
-- The column was schema drift: no migration in this repo creates it, yet
-- 20261006230000_category_seed_stores.sql (its DELETE) and the app
-- (lib/aisle-plan.ts, lib/grocery.ts, app/(app)/grocery/actions.ts,
-- lib/grocery-groups.ts) all assume it. When the public schema was rebuilt
-- after DROP SCHEMA, the column was lost, which silently broke the per-store
-- "Use my categories as aisles" seed and reset (they insert/update it).
--
-- It links a store's aisle to the household category it represents, making
-- the pairing rename-proof (an FK beats name matching).
alter table public.store_aisles
  add column if not exists category_id uuid
    references public.categories (id) on delete set null;

create index if not exists store_aisles_category_idx
  on public.store_aisles (category_id);
