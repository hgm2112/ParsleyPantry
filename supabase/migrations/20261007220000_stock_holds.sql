-- Stock holds: pantry quantity reserved for planned meals. Holds are created
-- by "Shop this week" (pantry-first), released when the day is re-planned or
-- cleared, and consumed (inventory decremented) when the meal is marked made.

create table if not exists public.stock_holds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  unit text,
  week_start date not null,
  day_index smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists stock_holds_household_item_idx
  on public.stock_holds (household_id, item_id);

alter table public.stock_holds enable row level security;

create policy "member stock holds" on public.stock_holds
  for all using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- "Meal is cooked" flag; holds for the day are consumed when this is set.
alter table public.meal_plan_days
  add column if not exists made_at timestamptz null;
