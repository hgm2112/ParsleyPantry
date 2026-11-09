-- Manually chosen Snacks shown on Home (household-level IDs).
-- Stores catalog items.id references; no FK on purpose so consumed or deleted
-- inventory never breaks the widget — missing IDs are simply ignored.
alter table public.household_settings
  add column if not exists home_snack_item_ids uuid[] not null default '{}';
