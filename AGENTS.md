<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-10-27)

Goal: pantry/shopping UX — cook from Quick Bites and add to the list from
anywhere, with shopping lines that read like aisle labels.

Shipped and pushed (bd0d7e9 → current):
- Quick Bites cards open a **Cook `<recipe>`** dialog...
- Grocery lines collapse onto the canonical root...
- `/search` cart button, meal-plan `shopped_at` + "On list", home date fit, add-sheet reset (as of 7dd187b).
- **Pantry math**: container sizes in unit ("6 oz") are expanded; pools track
  ounces + packages separately. Fixes "3 6oz cans = partial for 6 oz need"
  (Tomato Paste) and mixed-size roots. Used by plan shop/mark-made, recipe
  cook, Quick Bites, coverage dialogs.
- **/plan** "On list" chip and picker now mean *pending* only (live unchecked
  grocery coverage). Durable stamp shows muted "· shopped".
- Recipe ingredient dialogs (single + week) gained "On list" badge priority +
  count in headers ("Have 7/9 · 2 on list").
- From plan coverage dialog: **Take me to recipe** with `?returnTo=...`;
  editor back-chevron + save/delete navigate back; actions revalidate /plan + /home.

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
- Signed-in check: the new "On list" chip clears after finishing a trip; "Take
  me to recipe" from a day card's ingredient list returns to the exact plan
  view after save or browser back.
- Signed-in check: Tomato Paste (or any "N oz" pack) now shows full coverage
  when you have enough total ounces; Chicken / Sauce / Bread mixed packs sum
  correctly.
- Still pending (from earlier): Quick Bites cook + Undo, canonical label/aisle
  on scanned add, deployed `/recipes` counts/redirects.
- Optional: port the pack-aware pools into the recipe editor list and /recipes
  page (currently still use raw container presence).
