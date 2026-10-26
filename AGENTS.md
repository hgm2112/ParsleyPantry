<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-10-26)

Goal: pantry/shopping UX — cook from Quick Bites without leaving `/home`, and
make shopping lines read like aisle labels instead of scanned product names.

Shipped and pushed (bd0d7e9 → 64dd04d):
- Quick Bites cards open a **Cook `<recipe>`** dialog: pantry coverage preview,
  required rows pre-checked, meal-plan `stock_holds` protected, FEFO deduction
  with Undo (`bd0d7e9`). Actions live in `app/(app)/recipes/actions.ts`
  (`previewRecipeCook` / `cookRecipe`).
- Grocery lines collapse onto the canonical root: line name/id/category follow
  the root; unit keeps the pack/input unit. Centralized in `addGroceryItem` /
  `ensureGroceryItem` via `resolveCatalogRoot` (`lib/grocery.ts`), so list adds,
  type-ahead, inventory button, consume, low stock, recipes and planner agree
  (`64dd04d`).
- Migration `20261026120000_grocery_canonical_names.sql` backfilled existing
  linked lines; applied to prod (4 labels changed; all 13 linked lines on root).
- Fixed conditional-hook order in `quick-bites-widget.tsx` (5 lint errors gone).

Verified: `npx tsc --noEmit` green; `npm run build` successful; `npm run lint`
8 pre-existing errors / 16 warnings (no new); pre-push hook green.

Durable notes:
- On any schema rebuild keep `20261017140000_restore_schema_privileges.sql` last:
  a DROP SCHEMA reset wipes role grants (PostgREST 42501).
- Date Bark Quick Bites visibility was fixed as **data**, not code: Medjool
  Dates inventory 3 → 24, ingredient quantity text “10-12, Naturals Delights”
  → “10”.

Open:
- Signed-in check: Quick Bites cook + Undo; add a scanned product → canonical
  grocery label and correct aisle; adding a second product with the same root
  should report “already on the list”.
- Confirm deployed `/recipes` required-only counts and the new redirect flows.
- Optional: align Quick Bites coverage with the presence-based rule `/recipes`
  uses; stray-file / lint-error cleanup.
