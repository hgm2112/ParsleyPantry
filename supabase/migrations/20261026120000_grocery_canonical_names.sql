-- Grocery lines keep their own copy of the name, but catalog-linked lines are
-- now labeled with the canonical root ("Sunbeam Giant BREAD" → "Bread") so
-- the list reads like the aisle labels. Collapse existing lines onto their
-- root and refresh the copied name/category.
--
-- Unlinked lines (item_id is null) are untouched.
update grocery_items gi
set name = root.name,
    item_id = root.id,
    category_id = coalesce(root.category_id, gi.category_id)
from items child
join items root on root.id = coalesce(child.canonical_item_id, child.id)
where gi.item_id = child.id
  and gi.household_id = child.household_id;
