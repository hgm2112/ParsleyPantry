-- Structured non-recipe days: eating out, meal kit, no cooking. Null = a
-- recipe day or a plain note; recipe_id and kind are mutually exclusive
-- (enforced by the plan actions, not the DB). Backfill-free: legacy
-- note-only rows render fine with kind = null.

alter table public.meal_plan_days
  add column if not exists kind text
  check (kind in ('eating_out', 'meal_kit', 'no_cook'));
