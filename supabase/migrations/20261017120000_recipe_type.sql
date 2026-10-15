-- Explicit recipe classification: preparing/cooking recipes versus
-- no-cook calendar placeholders such as Pizza, Eating Out, and No Cooking.
alter table public.recipes
  add column if not exists recipe_type text not null default 'cooking';

alter table public.recipes
  add constraint recipes_recipe_type_check check (recipe_type in ('cooking', 'no_cook'));

-- Conservative backfill for only obviously named legacy placeholders. Recipes
-- that cannot be classified confidently remain 'cooking' and should be
-- reviewed manually.
update public.recipes
  set recipe_type = 'no_cook'
where lower(name) in ('pizza', 'eating out', 'no cooking', 'no cook')
   or lower(name) like 'no cooking%';

create index recipes_recipe_type_idx on public.recipes (household_id, recipe_type);
