<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-10)

Goal: pantry/household parity — on-list grocery badges, shared filter pills, inventory Add/Scan pill; tighter grocery copy prompts; small polish (brand descenders, stats card).

Shipped and pushed (b850e30 → 38e131d):
- **On-list badge**: cart icon next to item names on `/inventory` and `/household` when an unchecked `grocery_items` line exists for that item's canonical root (variants match via canonical). Unchecked-only; adding from the list menu refreshes, and list pages are revalidated whenever grocery membership changes.
- **Inventory Add/Scan pill** (`515de07`): same segmented `[+ Add | barcode]` control as `/household`. Add links to `/inventory/add`; barcode opens the scan sheet; manual entry navigates to `/inventory/add`. Removed the old dialog overlay and the now-unneeded `household_settings` query.
- **Shared filter pills** (`6af07b8`, `9ca1a2f`): `components/filter-pill.tsx` powers `[All (n)] [Location ▾] [Type ▾] [Low stock (n)]` on both pages. Counts are stable facet counts over the full loaded list; Location/Type pills show no number (dropdown options still do). "Use soon" removed from inventory. Inventory item names now hover green like household.
- **Grocery copy prompts** (`84aecae`, `f6181c3`): Copy All/Sale-Only ask for per-store markdown tables (`Item | Current | Deal | Recommend`), one-line reasons, and final `Buy now / Buy as planned / Keep waiting / Couldn't match` bullet sections. No digital-coupon section unless verified. Match by name + size first; never blame UPC. Copy lines label non-GTIN codes as `Code:`.
- **Brand wordmark** (`4cfc502`): `pb-[0.2em] -mb-[0.2em]` on the wordmark span stops `truncate` + `leading-none` from clipping the font's `y` descenders.
- **Stats** (`38e131d`): "New recipes tried" card shows count + the single latest new recipe by first-cooked date (no 6-name list).

Verified: `npx tsc --noEmit` clean on every push; pre-push hook green through `38e131d`.

Durable notes:
- `next.config.ts` sets `cacheComponents: true`. Next 16 then uses React `<Activity>` to preserve up to ~3 routes (state + DOM) across client navigations. Forms that must start fresh need an explicit reset — see `household-add-form.tsx` (`resetForm` + `useLayoutEffect` cleanup). Read `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.
- Household items are isolated from food `items`/`inventory` (own table, own catalog search/actions). Grocery rows link via `household_item_id` with `item_id` null; the shopping list shows the canonical root only.
- Name uniqueness on lower(name) remains strict; use specific display names + canonicals for variants (food and household).
- Brand and barcode are normal editable catalog fields on the inventory detail page (no auto name mutation).
- Mobile bottom nav stays the original 5 tabs (Household is desktop-sidebar only).
- Both pantry and household filter rows go through `components/filter-pill.tsx`; keep them identical.
- Grocery on-list badge means an **unchecked** line only; checked/removed lines clear it.
- Copy UPC label: valid GTIN (8/12/13/14 digits) → `UPC:`, anything else → `Code:`.

Open:
- Wire `batch-actions-sheet.tsx` into the Home pantry widget (or remove it).
- Verify Quick Bites cook/undo end-to-end and confirm `/recipes` counts/redirects on a fresh deploy.
- Optional: surface brand/barcode on list cards; add a "duplicates" warning.
