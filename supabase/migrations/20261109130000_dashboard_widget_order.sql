-- Household-level Home dashboard widget order (stable widget IDs).
-- NULL/empty means "use the code default order". Sizes/spans are NOT stored
-- here — they stay hardcoded per widget in HomeView. Existing RLS
-- ("member settings" on household_settings) covers this column.
alter table public.household_settings
  add column if not exists dashboard_widget_order text[] not null default '{}';
