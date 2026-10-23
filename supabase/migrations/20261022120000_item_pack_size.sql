-- Pack sizes: an item can declare "1 pack = N pieces" (12 eggs per carton,
-- 12 packets per box of stock concentrate).
--
-- items.pack_size — how many pieces one purchased pack contains (null = the
--   item is not a pack). Stock for a pack item is stored in PIECES (a batch
--   quantity is packets/eggs, not packs), so purchase flows multiply the
--   pack count by this factor and consumption ("use 1 egg") stays a plain
--   integer subtraction with no fractions anywhere.
-- items.pack_unit — what one piece inside the pack is called ("eggs",
--   "packets"); stored plural so recipe texts ("2 eggs") match it.
-- Pack name is deliberately NOT stored (kept to the generic "pack" in UI).
alter table public.items
  add column if not exists pack_size integer,
  add column if not exists pack_unit text;

-- 1 would be a no-op divisor, and < 1 is nonsense — require a real multi-pack.
alter table public.items
  drop constraint if exists items_pack_size_check;
alter table public.items
  add constraint items_pack_size_check check (pack_size is null or pack_size > 1);
