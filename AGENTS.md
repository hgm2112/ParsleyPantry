<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-10-27)

Goal: pantry/shopping UX — cook from Quick Bites and add to the list from
anywhere, with shopping lines that read like aisle labels.

Shipped and pushed (bd0d7e9 → 2924e6a):
- Quick Bites cards open a **Cook `<recipe>`** dialog: pantry coverage preview,
  required rows pre-checked, meal-plan `stock_holds` protected, FEFO deduction
  with Undo (`bd0d7e9`). Actions live in `app/(app)/recipes/actions.ts`
  (`previewRecipeCook` / `cookRecipe`).
- Grocery lines collapse onto the canonical root: line name/id/category follow
  the root; unit keeps the pack/input unit. Centralized in `addGroceryItem` /
  `ensureGroceryItem` via `resolveCatalogRoot` (`lib/grocery.ts`), so list adds,
  type-ahead, inventory button, consume, low stock, recipes and planner agree
  (`64dd04d`).
- `/search` results grew a cart button
  (`components/search/add-to-list-button.tsx`): one tap adds the canonical root,
  toasts “added” / “already on your list”, swaps to a check while listed, and
  refreshes the page so the shopping-list section picks the line up (`1af4118`).
- Meal-plan days remember shopping: `meal_plan_days.shopped_at` is stamped by
  `shopDays()` and cleared whenever the day's meal changes;
  `buildRecipeCoverage()` now also takes the unchecked grocery lines and reports
  `shoppable` / `onList`, so days predating the column still read correctly.
  Day cards show an “On list” chip; the shop picker labels those days
  (`2924e6a`). Migration `20261026130000_meal_plan_shopped_at.sql` applied to
  prod, backfilled from the remaining stock holds (2 days).
- Home dinners widget fits weekday + date on one line in the 7-column grid
  (13px weekday, 11px nowrap date, tighter gap) (`3d40515`).
- Add-to-list sheet (`components/grocery/add-sheet.tsx`) resets on close and
  clears the pantry filter after each add, so reopening starts blank; manual
  adds reuse the same `reset()`, so the category clears too.
- Migration `20261026120000_grocery_canonical_names.sql` backfilled existing
  linked lines; applied to prod (4 labels changed; all 13 linked lines on root).
- Fixed conditional-hook order in `quick-bites-widget.tsx` (5 lint errors gone).

Verified: `npx tsc --noEmit` green; `npm run build` successful; `eslint` clean on
the files touched this session; `npm run lint` 8 pre-existing errors / 16
warnings (no new); pre-push hook green.

Durable notes:
- On any schema rebuild keep `20261017140000_restore_schema_privileges.sql` last:
  a DROP SCHEMA reset wipes role grants (PostgREST 42501).
- Date Bark Quick Bites visibility was fixed as **data**, not code: Medjool
  Dates inventory 3 → 24, ingredient quantity text “10-12, Naturals Delights”
  → “10”.
- `AddGrocerySheet` only resets through its own `handleOpenChange`; a caller
  that closes it by setting parent state directly would skip the reset.
  `reset()` deliberately leaves `busy` / `recipeBusy` alone so an in-flight add
  still resolves and toasts.

Open:
- Signed-in check: Quick Bites cook + Undo; add a scanned product → canonical
  grocery label and correct aisle; adding a second product with the same root
  should report “already on the list”.
- Signed-in check: add from the sheet, close, reopen → blank search and manual
  fields; plan a meal, shop the day, confirm the “On list” chip; tap the search
  cart button twice to see “added” → “already on your list”.
- Confirm deployed `/recipes` required-only counts and the new redirect flows.
- Optional: align Quick Bites coverage with the presence-based rule `/recipes`
  uses; stray-file / lint-error cleanup.
