create table if not exists public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(trim(name)) <= 80),
  icon text not null,
  classification text not null check (classification in ('cooking', 'no_cook')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_meals_household_name_idx
  on public.custom_meals (household_id, name);

alter table public.custom_meals enable row level security;

create policy "household custom meals"
  on public.custom_meals
  for all
  to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

alter table public.meal_plan_days
  add column if not exists custom_meal_id uuid references public.custom_meals (id) on delete set null,
  add column if not exists custom_meal_name text,
  add column if not exists custom_meal_classification text check (custom_meal_classification in ('cooking', 'no_cook'));

create index if not exists meal_plan_days_custom_meal_idx
  on public.meal_plan_days (custom_meal_id);

create trigger custom_meals_updated_at before update on public.custom_meals
  for each row execute function moddatetime (updated_at);
