<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-09)

Goal: household supplies shipped + polished; earlier in thread, inventory/pantry UX polish (brand editing, barcode lookup, duplicate safety, sidebar reorder, grocery badge removal).

Shipped and pushed (2c2e863 → 503dae8):
- **Household supplies** (`/household`): separate `household_items` table for non-food supplies (paper products, cleaning, personal care, laundry, kitchen, misc), with add/detail pages, barcode scan + OFF lookup, quantity adjust, low-stock thresholds, delete, and "add to shopping list" collapsing to the canonical generic (`specific_name` keeps the variant). Two migrations committed: `20261109150000_household_items.sql`, `20261109160000_household_canonical.sql` (apply via `supabase db push` or the SQL editor).
- **Household fixes**: header is one segmented pill — "+ Add" (links to `/household/add`) + barcode segment (scan sheet). `ScanSheet` now receives `onManualEntry` so "Enter Manually" works. Add form resets every field per visit (see cacheComponents note); detail form syncs the saved row after update.
- **Batch actions sheet**: `components/home/batch-actions-sheet.tsx` is now committed (was deliberately untracked) but not yet wired into any caller.
- **Earlier in thread (c6ffede + prior)**: editable brand + OFF "Lookup" on inventory detail, proactive duplicate-name pre-check, barcode/name conflict blocking on add, sidebar reorder (Home / Meal plan / Shopping list / Pantry / Household / Recipes / Stats / Settings), Household badge removed from grocery rows.

Verified: `npx tsc --noEmit` clean on every push; pre-push hook green through `503dae8`.

Durable notes:
- `next.config.ts` sets `cacheComponents: true`. Next 16 then uses React `<Activity>` to preserve up to ~3 routes (state + DOM) across client navigations. Forms that must start fresh need an explicit reset — see `household-add-form.tsx` (`resetForm` + `useLayoutEffect` cleanup). Read `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.
- Household items are isolated from food `items`/`inventory` (own table, own catalog search/actions). Grocery rows link via `household_item_id` with `item_id` null; the shopping list shows the canonical root only.
- Name uniqueness on lower(name) remains strict; use specific display names + canonicals for variants (food and household).
- Brand and barcode are normal editable catalog fields on the inventory detail page (no auto name mutation).
- Mobile bottom nav stays the original 5 tabs (Household is desktop-sidebar only).

Open:
- Verify Quick Bites cook/undo end-to-end and confirm `/recipes` counts/redirects on a fresh deploy.
- Wire `batch-actions-sheet.tsx` into the Home pantry widget (or remove it).
- Optional: surface brand/barcode on list cards; add a "duplicates" warning.
