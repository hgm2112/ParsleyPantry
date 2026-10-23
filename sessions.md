# Sessions

Rolling journal of dev sessions — newest at top. Append an entry when wrapping
up and commit it with the session's work; git history is the source of truth
for "what changed", this is for "what's true now / what's next".

## 2026-10-23 — Pack sizes: items bought in boxes/cases but used as individual pieces

**Shipped**
- Migration `20261022120000_item_pack_size.sql`: `items.pack_size` (pieces per purchased pack, e.g. 12) + `items.pack_unit` (what one piece is called, e.g. "packets" or "eggs"). Check constraint requires `pack_size > 1`.
- Stock for pack items is stored in **pieces** (integer). Adding "1 box" multiplies by the pack size on write; consume ("use 1 packet") stays plain integer subtraction — no fractions anywhere.
- Recipes already parse free text like "2 eggs" → `{qty: 2, unit: "eggs"}`. When the ingredient's `pack_unit` matches, coverage compares directly (2 needed vs 12 have). Beef stock concentrate: "1 packet" compares against 12 packets in stock.
- Add/buy flows (`add-form.tsx`, `batch-dialog.tsx`, `shop-session.tsx`) count packs in the UI; stored rows use the piece unit.
- Detail editor gains "Pieces per pack" + "Piece name" fields. Header shows "12 packets (1 pack)" at exact multiples.
- Inventory list & home widget show the same `(1 pack)` hint.
- Low threshold operates on pieces (6 = 6 packets/eggs).
- All existing non-pack items work unchanged.
- Verified: `npx tsc --noEmit` green, `npm run build` successful, `npm run lint` at pre-existing parity (12 errors / 16 warnings).

**Gotchas**
- Migration must be applied in Supabase (SQL editor or `supabase db push`) before the UI works.
- Pack name ("box", "carton") is deliberately not stored — UI always says "pack" for consistency. Only the piece name is per-item.
- A pack item added before the migration exists with `pack_size = null`; editing it in the detail form and saving sets it.
- Canonical matching (`lib/canonical.ts` `cleanTokens`) already strips "12 ct" / "pk" from names, so pack text never pollutes recipe matching.

**Open — next session**
- Apply migration in production, then create Beef Stock Concentrate (pack 12, packets) and Eggs (pack 12, eggs) to verify end-to-end.
- Confirm deployed `/recipes` counts and redirect flows from previous session (still open from 2026-10-16).
- Optional: Quick Bites coverage alignment / stray-file / lint cleanup.

---

## 2026-10-16 (part 2) — Schema-reset recovery, multi-date expiry, recipes coverage, form polish

**Shipped**
- Restore baseline role grants after a `DROP SCHEMA public CASCADE` reset
  (`b51610e`, migration `20261017140000_restore_schema_privileges.sql`): the
  reset also wipes Supabase's schema-scoped `ALTER DEFAULT PRIVILEGES`, so
  replaying the other migrations leaves `anon`/`authenticated`/`service_role`
  with no public access (PostgREST 42501). Keep this migration LAST on any
  future rebuild; it re-grants then re-applies the init-time
  `is_member`/`is_owner`/`join_household`/`set_current_household` restrictions.
- Recipes editor: drop the duplicate top submit and return to `/recipes` after
  create (`86d4b22`).
- Multi-date expiration with Month/Day/Year pickers (`ebe3951`, 5 files,
  +598/−283): per-date rows with blank defaults and
  `[No expiry] [+7 days] [+14 days] [+21 days]` chips, no top Quantity field,
  read-only `Total Quantity: N`.
- Restore `store_aisles.category_id` (`c3b9e89`, migration
  `20261017150000_store_aisles_category.sql`) — schema drift; the reset lost the
  column and silently broke the per-store "Use my categories as aisles"
  seed/reset.
- Drop stale `inventory_household_id_item_id_location_key` (`3b95e28`, migration
  `20261017160000_drop_inventory_item_location_key.sql`): init's inline
  `unique (household_id, item_id, location)` blocked every second batch with
  23505, so multi-date adds failed. `inventory_batch_key` remains the real
  per-batch uniqueness.
- Stop pre-filling expiration dates on batch entry (`251ab4c`): removed the
  shelf-life suggestion/auto-fill from `add-form.tsx`, `batch-dialog.tsx`,
  `shop-session.tsx`; dates start blank.
- Recipes: required-only pantry counts, optional column, presence-based checks
  (`12ef77e`): `/recipes` Have? counts required ingredients only and treats any
  stock at the canonical root as on hand; optional ingredients get their own
  list column (`4` for Beef & Broccoli, blank when 0) and are excluded from the
  detail header count, per-row ✓, and "Add only the missing ones". Detail header
  now reads `· ✓ 4/6`.
- Inventory detail form (`523c448`): quantity is read-only (no `−`/`+`); stock
  changes go through Add More / Edit batch / Use some; Save details returns to
  `/inventory` on success; "Add batch" → "+ Add More"; removed dead
  `quickUse`/`quickAdd`/`useLastOpen` confirm.
- Recipe editor: "Save changes" returns to `/recipes` on success (`86783fc`).
- Each slice verified: `npx tsc --noEmit` green, `npm run build` successful,
  `npm run lint` at parity (12 errors / 16 warnings, all pre-existing),
  pre-push hook green.

**Gotchas**
- Coverage is presence-based, not quantity-based: a scanned product with a
  mismatched amount/unit ("Skirt Steak" needed `12oz`, stocked `qty 1, unit
  null`) now reads as on hand. Canonical matching was already correct
  (`Beef Flank Steak` → canonical "Skirt Steak"); the old miss was the
  `toOunces(...) ?? raw` comparison.
- Canonical pools stay keyed by `coalesce(canonical_item_id, id)`. The recipes
  list/detail and "add missing" now share one presence rule; the meal plan
  (`app/(app)/plan/actions.ts`) still rationalises amounts, and the home
  Quick Bites widget (`components/home/quick-bites-widget.tsx`) is still
  quantity-based.
- `cacheComponents`/`partialPrefetching`: use `await connection()`, never
  `export const dynamic = "force-dynamic"`.
- DB review access: Supabase ref `okjiautsuzdqtisjzzzv`, live SQL via
  `POST /v1/projects/…/database/query` with `~/.supabase/access-token`;
  test household `cb4ba684-61ac-4c96-9cab-1ab102212a76`.

**Open — next session**
- Confirm the new `/recipes` counts and the inventory/recipe redirect flows in
  a fresh deployed browser.
- Optional: align the home Quick Bites coverage with required-only + presence if
  one consistent rule is wanted.
- Optional: stray-file and the 12 pre-existing lint-error cleanup.

## 2026-10-16 — /stats Other Meals section + /home staleness and widget fixes