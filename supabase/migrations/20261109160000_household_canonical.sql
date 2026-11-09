-- Household canonical mapping: branded variants (e.g. "Reynolds Wrap
-- Heavy Duty Aluminum Foil") can match as a generic ("Aluminum Foil").
-- Self-reference only; never touches food items/canonical.
alter table public.household_items
  add column if not exists canonical_household_item_id uuid
    references public.household_items (id) on delete set null;

create index if not exists household_items_canonical_idx
  on public.household_items (canonical_household_item_id) where canonical_household_item_id is not null;
