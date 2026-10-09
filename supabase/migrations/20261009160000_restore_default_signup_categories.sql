-- Re-assert the canonical new-user bootstrap.
--
-- Migrations are hand-run in the SQL Editor (no CLI in this repo), so the live
-- handle_new_user() may have drifted from 20261006160000_init.sql — the same
-- way the out-of-repo "desired-order apply" once inserted KitchenOwl rows
-- (see 20261006230000_category_seed_stores.sql).
--
-- A brand-new account that is NOT joining an existing household must always
-- get the plain default 12 categories (Produce ... Other, sort_order 1-12,
-- icon NULL, no aisle numbers). KitchenOwl-style labels (emoji + aisle
-- number, e.g. "🥫 12 - Canned food") may only enter a household through
-- Settings -> Import from KitchenOwl, never at signup.
--
-- The trigger on_auth_user_created already points at this function, so
-- replacing the body is enough — no trigger re-create needed.

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

-- ---------------------------------------------------------------------------
-- Diagnostics (read-only) — run these in the SQL Editor any time.
--
-- 1) Is the live function the canonical one?
--
--      select prosrc from pg_proc where proname = 'handle_new_user';
--
--    Must list the 12 plain names above and contain no emoji / aisle numbers.
--
-- 2) Did any standalone (auto) household already get non-default categories?
--
--      select h.id, h.created_at, c.name, c.sort_order, c.icon
--      from public.categories c
--      join public.households h on h.id = c.household_id
--      where h.is_auto
--        and ( c.icon is not null
--              or c.sort_order >= 1000
--              or c.name ~ '[0-9]{1,2}[[:space:]]*-[[:space:]]' )
--      order by h.created_at, c.sort_order;
--
--    Rows here = signup-time drift (the pattern "🥫 12 - ..." or icon/sort
--    1000+ set at account creation). If query 2 returns rows, run the opt-in
--    cleanup below.
--
-- ---------------------------------------------------------------------------
-- OPT-IN CLEANUP — commented out on purpose; run manually only if diagnostic
-- 2 returns rows.
--
-- Resets untouched auto-created households back to the canonical 12. The
-- "untouched" guard mirrors join_household() in 20261006160000_init.sql: a
-- household with any items/recipes/grocery/inventory/stores was left alone by
-- signup, so it either imported KitchenOwl on purpose or has real data —
-- those are never touched. Plain default rows are left in place; only the
-- drifted ones are dropped, then any missing default is restored by id.
--
-- /*
-- drop table if exists _pp_affected;
--
-- -- 1) remember the standalone households that drifted at signup
-- create temporary table _pp_affected as
-- select h.id as household_id
-- from public.households h
-- where h.is_auto
--   and not exists (select 1 from public.items i         where i.household_id = h.id)
--   and not exists (select 1 from public.recipes r       where r.household_id = h.id)
--   and not exists (select 1 from public.grocery_items g where g.household_id = h.id)
--   and not exists (select 1 from public.inventory inv   where inv.household_id = h.id)
--   and not exists (select 1 from public.stores s        where s.household_id = h.id)
--   and exists (
--     select 1 from public.categories c
--     where c.household_id = h.id
--       and ( c.icon is not null
--             or c.sort_order >= 1000
--             or c.name ~ '[0-9]{1,2}[[:space:]]*-[[:space:]]' )
--   );
--
-- -- 2) drop the drifted category rows
-- delete from public.categories c
-- using _pp_affected a
-- where c.household_id = a.household_id
--   and ( c.icon is not null
--         or c.sort_order >= 1000
--         or c.name ~ '[0-9]{1,2}[[:space:]]*-[[:space:]]' );
--
-- -- 3) restore any canonical default that the drifted seed had replaced
-- insert into public.categories (household_id, name, sort_order)
-- select a.household_id, v.name, v.sort_order
-- from _pp_affected a
-- cross join (values
--   ('Produce', 1),
--   ('Bakery', 2),
--   ('Meat & Seafood', 3),
--   ('Dairy & Eggs', 4),
--   ('Frozen', 5),
--   ('Pantry', 6),
--   ('Canned', 7),
--   ('Snacks', 8),
--   ('Drinks', 9),
--   ('Condiments & Sauces', 10),
--   ('Household', 11),
--   ('Other', 12)
-- ) as v(name, sort_order)
-- where not exists (
--   select 1 from public.categories c
--   where c.household_id = a.household_id
--     and lower(c.name) = lower(v.name)
-- );
--
-- drop table _pp_affected;
-- */
