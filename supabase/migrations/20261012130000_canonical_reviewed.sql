-- Ingredient review "keep as its own name": the user saw an item in the
-- review queue and chose to leave it on its own identity. Backfill and the
-- queue skip these rows forever; no name/barcode/stock/mapping is touched.

alter table public.items
  add column if not exists canonical_reviewed boolean not null default false;

comment on column public.items.canonical_reviewed is
  'true = user explicitly kept this item as its own generic identity (hidden from the ingredient review queue, never auto-matched by backfill).';
