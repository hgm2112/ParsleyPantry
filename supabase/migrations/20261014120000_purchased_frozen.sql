-- Three storage states the old columns could not tell apart while a row sits
-- in the freezer:
--   1. not tracked as frozen  (frozen_at null, purchased_frozen false)
--   2. frozen with a known date (frozen_at set)
--   3. purchased already frozen, original date unknown
--      (frozen_at null + purchased_frozen true) — was indistinguishable from 1.
alter table public.inventory
  add column if not exists purchased_frozen boolean not null default false;

comment on column public.inventory.purchased_frozen is
  'true = bought already frozen; the original freezing date is unknown, so no freezer-quality countdown exists. Only meaningful while location = freezer; cleared when the row thaws.';

comment on column public.inventory.frozen_at is
  'Date stock entered the freezer; null = unknown or not set. Use purchased_frozen to tell purchased-frozen apart from not-tracked.';

-- Batch identity also separates a purchased-frozen batch from an untracked
-- freezer batch that would otherwise share the same (null) frozen_at.
-- The added column only splits existing keys, so re-creating is safe.
drop index if exists public.inventory_batch_key;

create unique index inventory_batch_key on public.inventory (
  household_id,
  item_id,
  location,
  coalesce(expiration_date, date '0001-01-01'),
  coalesce(frozen_at, date '0001-01-01'),
  coalesce(freezer_duration_months, -1),
  purchased_frozen
);

comment on index public.inventory_batch_key is
  'One row per batch: identical dates + freezing history + purchased-frozen flag merge into a single row.';
