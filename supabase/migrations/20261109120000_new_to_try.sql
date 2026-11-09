-- Manually managed "New to Try" collection (Home widget).
-- Membership is stored separately from recipes.tags "New to try" so the widget
-- is never auto-populated by tag queries. The tag remains a candidate filter
-- for the Add picker only. Deleting a recipe cascades its membership away;
-- deleting a household cascades the whole collection.
create table if not exists public.new_to_try (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

create index if not exists new_to_try_household_idx
  on public.new_to_try (household_id, created_at);
create index if not exists new_to_try_recipe_idx
  on public.new_to_try (recipe_id);

alter table public.new_to_try enable row level security;

create policy "member new to try" on public.new_to_try
  for all using (public.is_member(household_id))
  with check (public.is_member(household_id));

alter publication supabase_realtime add table public.new_to_try;
