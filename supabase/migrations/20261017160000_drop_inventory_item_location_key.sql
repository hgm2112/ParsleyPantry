-- Drop the stale one-batch-per-location constraint on inventory.
--
-- init.sql created the uniqueness inline as `unique (household_id, item_id,
-- location)`, which Postgres auto-named inventory_household_id_item_id_location_key.
-- 20261011120000_batch_tracking.sql tried to drop a different name
-- (inventory_household_item_location_key), so the drop silently no-op'd and the
-- constraint survived — allowing only one batch per item+location and failing
-- every second batch (multi-date adds) with 23505 on this constraint.
--
-- inventory_batch_key (item + location + dates + freezing history) is the real
-- per-batch uniqueness and is left untouched. Dropping a constraint removes its
-- backing index automatically.
alter table public.inventory
  drop constraint if exists inventory_household_id_item_id_location_key;
alter table public.inventory
  drop constraint if exists inventory_household_item_location_key;
