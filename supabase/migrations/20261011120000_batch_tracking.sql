-- Per-batch expiration tracking: each inventory row is one batch (quantity +
-- one expiration date + one storage history). Existing rows become each
-- item's initial batch — no data is moved, dropped, or reset.

-- Was unique (household_id, item_id, location) — allowed only one batch per
-- item+location. Dropping it lets an item hold several batches (different
-- dates / freezing histories).
alter table public.inventory
  drop constraint if exists inventory_household_item_location_key;

-- Batch identity: same item + location + expiration date + freezing history
-- = the same batch (they merge). Sentinels make NULL dates comparable.
create unique index inventory_batch_key on public.inventory (
  household_id,
  item_id,
  location,
  coalesce(expiration_date, date '0001-01-01'),
  coalesce(frozen_at, date '0001-01-01'),
  coalesce(freezer_duration_months, -1)
);

comment on index public.inventory_batch_key is
  'One row per batch: identical date + storage history merges into a single row.';
