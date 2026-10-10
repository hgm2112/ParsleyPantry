-- Canonical ingredient identity: a scanned product keeps its exact name
-- (and barcode/brand) but points at a generic catalog entry that recipes and
-- shopping lists match on. No data is moved, dropped, or reset — unmapped
-- items keep canonical_item_id null and behave exactly as before
-- (matching key = coalesce(canonical_item_id, id)).

alter table public.items
  add column if not exists canonical_item_id uuid references public.items (id) on delete set null,
  add column if not exists brand text;

create index if not exists items_canonical_idx on public.items (canonical_item_id);

comment on column public.items.canonical_item_id is
  'Generic catalog entry this product matches recipes as. null = canonical identity itself (generic or unmapped). App always stores the root — never a chain.';
comment on column public.items.brand is
  'Brand from the barcode lookup (Open Food Facts) when available; used to strip brand tokens when normalizing names.';
