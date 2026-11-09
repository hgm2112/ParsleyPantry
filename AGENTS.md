<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-09)

Goal: inventory + pantry UX polish — editable brand on catalog items, "Lookup" from barcode (OFF data), safer barcode/name conflict handling, duplicate name pre-checks, sidebar tab reordering, removal of Household badge from shopping list. Branded variants handled via specific display name + canonical generic (user example: Stauffer's Ginger Snaps).

Shipped and pushed (c6ffede + prior in thread):
- **Inventory detail form**: Brand is now editable (optional field + Clear button). New "Lookup" button next to Barcode calls resolveBarcode, shows OFF name/brands preview card, and "Use brand" to apply it to the form. Brand is written through updateInventory (added to patchSchema + itemPatch logic, null clears safely).
- **Name safety / duplicates**: Name editor (commitName) now runs a proactive searchCatalog pre-check before any update. Blocks early with actionable message instead of raw 23505. "An item named X already exists. Search the list for the other record..."
- **Add form**: +Add overlay dialog is now scrollable (`max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain`). Barcode + mismatched name now blocks save with clear guidance (`Barcode belongs to Glacier Freeze Gatorade — clear it to add a new item.`) — no more silent hijack or rename attempts on the wrong row.
- **Sidebar nav**: Desktop left panel reordered to Home, Meal plan, Shopping list, Pantry, Household, Recipes, Stats, Settings. (Mobile bottom nav stays the original 5 tabs.)
- **Grocery list**: "Household" badge removed from item rows (they continue to dedupe via household_item_id and are handled distinctly on the backend).
- **Branded variant handling** (Ginger Snaps case): User resolved the Gatorade/wrong-barcode mix-up by using a specific display name ("Stauffer's Ginger Snaps") + canonical "Ginger Snaps". The new brand field + lookup make this pattern easy and visible. Duplicate protection prevents cross-renaming.
- (Earlier thread work: household canonical self-referential support + resolve-or-create generics, with shopping list collapsing to the root.)

Verified: `npx tsc --noEmit` clean; pre-push hook green on the push for c6ffede (and prior).

Durable notes:
- Brand and barcode are now normal editable catalog fields on the detail page (no auto name mutation).
- Name uniqueness on lower(name) remains strict; use specific names + canonicals for variants (as with food items and the household canonical work).
- Untracked `components/home/batch-actions-sheet.tsx` and household/ tree remain per prior convention.
- (Prior grocery copy / home / leftover / mobile notes carried forward from 2026-11-07 snapshot.)

Open:
- Household canonical (migrations + full actions/forms) currently showing as untracked in this view.
- Carry-forward prior opens (Quick Bites, recipes counts, etc.).
- Optional future: surface brand/barcode more prominently in list cards or add a "duplicates" warning.
