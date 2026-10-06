-- ParsleyPantry initial schema
-- Apply in the Supabase SQL editor or with `supabase db push`.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists moddatetime;

-- ---------------------------------------------------------------------------
-- Profiles & households
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  current_household_id uuid,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(encode(gen_random_bytes(9), 'hex'), 1, 10),
  is_auto boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- Categories (basic fallback view + catalog grouping)
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index categories_household_name_key on public.categories (household_id, lower(name));

-- ---------------------------------------------------------------------------
-- Item catalog
-- ---------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  category_id uuid references public.categories (id) on delete set null,
  icon text,
  barcode text,
  default_location text not null default 'pantry'
    check (default_location in ('pantry', 'fridge', 'freezer')),
  expiration_days integer,
  low_threshold double precision,
  auto_restock boolean not null default false,
  unit text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index items_household_name_key on public.items (household_id, lower(name));
create unique index items_household_barcode_key on public.items (household_id, barcode) where barcode is not null;
create index items_barcode_idx on public.items (barcode);
create index items_name_trgm_idx on public.items using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  location text not null default 'pantry'
    check (location in ('pantry', 'fridge', 'freezer')),
  quantity double precision not null default 1,
  unit text,
  expiration_date date,
  is_low boolean not null default false,
  source text,
  notes text,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, item_id, location)
);

create index inventory_expiration_idx on public.inventory (household_id, expiration_date);
create index inventory_item_idx on public.inventory (item_id);

-- ---------------------------------------------------------------------------
-- Stores & aisles
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index stores_household_name_key on public.stores (household_id, lower(name));

create table public.store_aisles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index store_aisles_store_name_key on public.store_aisles (store_id, lower(name));
create index store_aisles_store_idx on public.store_aisles (store_id, sort_order);

create table public.household_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  selected_store_id uuid references public.stores (id) on delete set null,
  grocery_view_mode text not null default 'aisle'
    check (grocery_view_mode in ('aisle', 'category')),
  default_location text not null default 'pantry'
    check (default_location in ('pantry', 'fridge', 'freezer')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grocery list
-- ---------------------------------------------------------------------------

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  name text not null,
  quantity double precision not null default 1,
  unit text,
  category_id uuid references public.categories (id) on delete set null,
  checked boolean not null default false,
  source text not null default 'manual'
    check (source in ('manual', 'low_stock', 'consume', 'recipe', 'planner')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grocery_items_household_idx on public.grocery_items (household_id, checked, created_at);
create index grocery_items_item_idx on public.grocery_items (household_id, item_id) where item_id is not null;

-- Per-store aisle assignment so each store can place the same item differently.
create table public.grocery_item_aisles (
  household_id uuid not null references public.households (id) on delete cascade,
  grocery_item_id uuid not null references public.grocery_items (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  aisle_id uuid not null references public.store_aisles (id) on delete cascade,
  primary key (grocery_item_id, store_id)
);

create index grocery_item_aisles_store_idx on public.grocery_item_aisles (store_id, aisle_id);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  description text not null default '',
  prep_time integer not null default 0,
  cook_time integer not null default 0,
  time integer not null default 0,
  yields integer not null default 1,
  source text,
  tags text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_household_idx on public.recipes (household_id, lower(name));

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  name text not null,
  quantity_text text not null default '',
  optional boolean not null default false,
  sort_order integer not null default 0
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort_order);

-- ---------------------------------------------------------------------------
-- Meal planning
-- ---------------------------------------------------------------------------

create table public.meal_plan_days (
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  day_index smallint not null check (day_index between 0 and 6),
  recipe_id uuid references public.recipes (id) on delete set null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, week_start, day_index)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger items_updated_at before update on public.items
  for each row execute function moddatetime(updated_at);
create trigger inventory_updated_at before update on public.inventory
  for each row execute function moddatetime(updated_at);
create trigger grocery_items_updated_at before update on public.grocery_items
  for each row execute function moddatetime(updated_at);
create trigger recipes_updated_at before update on public.recipes
  for each row execute function moddatetime(updated_at);
create trigger household_settings_updated_at before update on public.household_settings
  for each row execute function moddatetime(updated_at);
create trigger meal_plan_days_updated_at before update on public.meal_plan_days
  for each row execute function moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = target and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = target and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_member(uuid), public.is_owner(uuid) from public;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + auto household + default categories
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_name text;
  v_email text;
begin
  v_email := new.email;
  v_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(coalesce(new.email, 'You'), '@', 1)
  );

  insert into public.households (name, is_auto, created_by)
  values ('Parsley Pantry', true, new.id)
  returning id into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, new.id, 'owner');

  insert into public.profiles (id, email, display_name, current_household_id)
  values (new.id, v_email, v_name, v_household);

  insert into public.household_settings (household_id)
  values (v_household);

  insert into public.categories (household_id, name, sort_order)
  values
    (v_household, 'Produce', 1),
    (v_household, 'Bakery', 2),
    (v_household, 'Meat & Seafood', 3),
    (v_household, 'Dairy & Eggs', 4),
    (v_household, 'Frozen', 5),
    (v_household, 'Pantry', 6),
    (v_household, 'Canned', 7),
    (v_household, 'Snacks', 8),
    (v_household, 'Drinks', 9),
    (v_household, 'Condiments & Sauces', 10),
    (v_household, 'Household', 11),
    (v_household, 'Other', 12);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Join household by invite code
-- ---------------------------------------------------------------------------

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_auto uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_household
  from households
  where lower(invite_code) = lower(trim(p_code));

  if v_household is null then
    raise exception 'invalid invite code';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_household, auth.uid(), 'member')
  on conflict do nothing;

  -- If the user's current household is an untouched auto-created one, drop it
  -- so people don't end up juggling an empty household forever.
  select current_household_id into v_auto from profiles where id = auth.uid();

  if v_auto is not null and v_auto <> v_household then
    if exists (select 1 from households h where h.id = v_auto and h.is_auto)
       and not exists (select 1 from items i where i.household_id = v_auto)
       and not exists (select 1 from recipes r where r.household_id = v_auto)
       and not exists (select 1 from grocery_items g where g.household_id = v_auto)
       and not exists (select 1 from inventory inv where inv.household_id = v_auto)
       and not exists (select 1 from stores s where s.household_id = v_auto) then
      delete from households where id = v_auto;
    end if;
  end if;

  update profiles set current_household_id = v_household where id = auth.uid();
  return v_household;
end;
$$;

create or replace function public.set_current_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from household_members where household_id = p_household and user_id = auth.uid()) then
    raise exception 'not a member of that household';
  end if;
  update profiles set current_household_id = p_household where id = auth.uid();
end;
$$;

revoke all on function public.join_household(text), public.set_current_household(uuid) from public;
grant execute on function public.join_household(text), public.set_current_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.inventory enable row level security;
alter table public.stores enable row level security;
alter table public.store_aisles enable row level security;
alter table public.household_settings enable row level security;
alter table public.grocery_items enable row level security;
alter table public.grocery_item_aisles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_days enable row level security;

-- profiles
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- households
create policy "members read household" on public.households
  for select using (public.is_member(id));
create policy "members update household" on public.households
  for update using (public.is_member(id)) with check (public.is_member(id));
create policy "owners delete household" on public.households
  for delete using (public.is_owner(id));

-- household_members
create policy "read own memberships" on public.household_members
  for select using (user_id = auth.uid() or public.is_member(household_id));
create policy "member can leave" on public.household_members
  for delete using (user_id = auth.uid() or public.is_owner(household_id));

-- household scoped tables
create policy "member categories" on public.categories
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member items" on public.items
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member inventory" on public.inventory
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member stores" on public.stores
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member store aisles" on public.store_aisles
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member settings" on public.household_settings
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member grocery" on public.grocery_items
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member grocery aisles" on public.grocery_item_aisles
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member recipes" on public.recipes
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member recipe ingredients" on public.recipe_ingredients
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "member meal plan" on public.meal_plan_days
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.inventory;
alter publication supabase_realtime add table public.grocery_items;
alter publication supabase_realtime add table public.meal_plan_days;
alter publication supabase_realtime add table public.items;
