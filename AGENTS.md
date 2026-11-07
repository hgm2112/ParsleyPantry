<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-07)

Goal: pantry/shopping UX — copy grocery lists for AI sale checks without
showing specifics on the site; home widgets + leftover + mobile polish as
roundup.

Shipped and pushed (6a68e6f → current):
- **Grocery copy**: `specific_name` captured at add (`addGroceryItem` / `ensureGroceryItem` + restore) before canonical collapse; list display stays canonical-only. Copy buttons are direct, no dialog. Format: `Specific Name (Generic) | 3 lb | UPC: #` (parts omitted when missing). **Copy All Items (N)** first (per-store headers with ZIP, `Any store` for unfiled, regular → `[sale only]`), **Copy Sale-Only (X)** single-store. ZIP editable only on `/grocery/stores/[id]` ("Used in Copy Sale-Only prompts"). UPC resolved client-side from existing `catalog` name map (pantry items) + fallback to `item.barcode`; manual adds without UPC just omit it. No new `specific_barcode` column.
- **Home widgets**: Pantry & Shopping `self-start` / height-to-content on `/home`.
- **Leftover reminder**: Clock-only display + hidden native time input with `showPicker()` (no native affordance on Firefox).
- **Home pantry quick actions**: `...` menu (`− Remove 1` FEFO when qty>1 + Remove all), destructive red hover, no row nav, 5s Undo, confirm on last unit, "Finish shopping here" button.
- **Mobile**: `overflow-x: clip` guard + bottom-nav fix.
- (Prior 2026-10-27 items kept in `sessions.md`: Quick Bites, canonical aisle labels, pantry math, plan "On list" pending-only, recipe dialogs.)

Verified: `npx tsc --noEmit` clean; pre-push hook green on each push (`6a68e6f` specific_name+ZIP, `b81ff16` Copy All+UPC, `569af84` write-up).

Durable notes:
- Apply migrations `20261107120000_add_grocery_item_specific_name.sql` + `20261107120000_add_store_zipcode.sql`, then `NOTIFY pgrst, 'reload schema';` (PostgREST 42501 if skipped).
- Keep `20261017140000_restore_schema_privileges.sql` last on any schema rebuild.
- Existing grocery rows with `specific_name = null` show just canonical in copy until re-added; re-adding re-captures. Canonical collapse is why old rows missed UPCs for mapped items — catalog lookup bridges it with no migration.
- `AddGrocerySheet` only resets through its own `handleOpenChange`.

Open:
- Signed-in check: new copy buttons show per-store headers, `[sale only]` ordering, weight/UPC in AI output; ZIP appears only in copy, not on list.
- Still pending: Quick Bites cook + Undo, canonical label/aisle on scanned add, deployed `/recipes` counts/redirects.
- Optional: capture durable `specific_barcode` at add time (would need migration) if catalog name changes break lookup; port pack-aware pools to recipe editor / `/recipes`.
- Untracked `components/home/batch-actions-sheet.tsx` intentionally not committed.
