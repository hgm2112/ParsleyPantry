-- One-time imperial normalization: metric weight units become oz/lb
-- everywhere they are stored. Bare units convert the quantity too
-- (3 g -> 0.1 oz); pack-size text ("206 g") converts the unit text only.

-- inventory --------------------------------------------------------------
update public.inventory
set quantity = round((quantity * 0.03527396)::numeric, 1), unit = 'oz'
where lower(btrim(unit)) in ('g', 'gr', 'gram', 'grams');

update public.inventory
set quantity = round((quantity * 2.20462)::numeric, 1), unit = 'lb'
where lower(btrim(unit)) = 'kg';

update public.inventory
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 0.03527396, 1))::text,
  ' oz'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*(g|gr|grams?)\s*\.?$';

update public.inventory
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 2.20462, 1))::text,
  ' lb'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*kg\s*\.?$';

-- items (low_threshold travels with its unit) ------------------------------
update public.items
set unit = 'oz',
    low_threshold = round((low_threshold * 0.03527396)::numeric, 1)
where lower(btrim(unit)) in ('g', 'gr', 'gram', 'grams');

update public.items
set unit = 'lb',
    low_threshold = round((low_threshold * 2.20462)::numeric, 1)
where lower(btrim(unit)) = 'kg';

update public.items
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 0.03527396, 1))::text,
  ' oz'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*(g|gr|grams?)\s*\.?$';

update public.items
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 2.20462, 1))::text,
  ' lb'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*kg\s*\.?$';

-- recipe ingredients (quantity_text is always "num unit") ------------------
update public.recipe_ingredients
set quantity_text = concat(
  trim_scale(round((substring(quantity_text from '([0-9]+(\.[0-9]+)?)'))::numeric * 0.03527396, 1))::text,
  ' oz'
)
where lower(quantity_text) ~ '^\s*[0-9]+(\.[0-9]+)?\s*(g|gr|grams?)\s*\.?$';

update public.recipe_ingredients
set quantity_text = concat(
  trim_scale(round((substring(quantity_text from '([0-9]+(\.[0-9]+)?)'))::numeric * 2.20462, 1))::text,
  ' lb'
)
where lower(quantity_text) ~ '^\s*[0-9]+(\.[0-9]+)?\s*kg\s*\.?$';

-- stock holds ---------------------------------------------------------------
update public.stock_holds
set quantity = round((quantity * 0.03527396)::numeric, 1), unit = 'oz'
where lower(btrim(unit)) in ('g', 'gr', 'gram', 'grams');

update public.stock_holds
set quantity = round((quantity * 2.20462)::numeric, 1), unit = 'lb'
where lower(btrim(unit)) = 'kg';

update public.stock_holds
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 0.03527396, 1))::text,
  ' oz'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*(g|gr|grams?)\s*\.?$';

update public.stock_holds
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 2.20462, 1))::text,
  ' lb'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*kg\s*\.?$';

-- grocery items -------------------------------------------------------------
update public.grocery_items
set quantity = round((quantity * 0.03527396)::numeric, 1), unit = 'oz'
where lower(btrim(unit)) in ('g', 'gr', 'gram', 'grams');

update public.grocery_items
set quantity = round((quantity * 2.20462)::numeric, 1), unit = 'lb'
where lower(btrim(unit)) = 'kg';

update public.grocery_items
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 0.03527396, 1))::text,
  ' oz'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*(g|gr|grams?)\s*\.?$';

update public.grocery_items
set unit = concat(
  trim_scale(round((substring(unit from '([0-9]+(\.[0-9]+)?)'))::numeric * 2.20462, 1))::text,
  ' lb'
)
where lower(unit) ~ '^\s*[0-9]+(\.[0-9]+)?\s*kg\s*\.?$';
