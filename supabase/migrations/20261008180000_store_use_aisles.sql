-- use_aisles: per-store flag — when false, this store's grocery lines are
-- never grouped by aisle, regardless of the global "aisle / category" mode.
-- Set to true by default so pre‑existing stores keep behaving as before.
alter table public.stores add column if not exists use_aisles boolean not null default true;