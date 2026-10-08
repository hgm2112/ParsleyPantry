-- Per-ingredient shopping-list selection: which ingredients "To grocery
-- list" and "Shop this week" push (spices/small items can be deselected on
-- the recipe page; the choice is remembered).
alter table public.recipe_ingredients
  add column if not exists on_shopping_list boolean not null default true;

-- Preserve current behavior: optional ingredients stay off the list.
update public.recipe_ingredients set on_shopping_list = false where optional;
