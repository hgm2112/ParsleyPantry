-- Freezer-aware expiration tracking.
-- inventory.frozen_at records when stock entered the freezer; expiration_date
-- keeps the original refrigerated date and is never overwritten while frozen.
-- freezer_quality_date is the computed "best quality by" date (date-fns month
-- math clamps month ends; never chained through the quality date).

alter table public.inventory
  add column if not exists frozen_at date,
  add column if not exists freezer_duration_months integer
    check (freezer_duration_months is null or freezer_duration_months >= 0),
  add column if not exists freezer_quality_date date;

-- Which freezer food type was last chosen for this item (see lib/freezer.ts).
alter table public.items
  add column if not exists freezer_food_type text;

comment on column public.inventory.frozen_at is
  'Date stock entered the freezer. null while frozen means unknown (purchased frozen or legacy row).';
comment on column public.inventory.freezer_duration_months is
  'Months from frozen_at to the best-quality date; null = not tracked (unknown type / purchased frozen).';
comment on column public.inventory.freezer_quality_date is
  'Computed best-quality-by date while frozen; cleared when the row leaves the freezer.';
comment on column public.items.freezer_food_type is
  'Last freezer food type chosen for this item (key from lib/freezer.ts FREEZER_FOOD_TYPES).';
