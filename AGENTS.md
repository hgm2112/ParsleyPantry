<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-10-16, part 2)

Goal: batch/expiry correctness, recovering the schema after a DROP SCHEMA reset,
and one consistent pantry-coverage rule across recipes.

Shipped and pushed (b51610e → 86783fc):
- Restore public schema grants after DROP SCHEMA reset (`b51610e`) — reset wiped
  role grants (PostgREST 42501); keep this migration last on any rebuild.
- Recipe editor: drop duplicate top submit, return to list after create (`86d4b22`).
- Multi-date expiration entry with Month/Day/Year pickers (`ebe3951`).
- Restore `store_aisles.category_id` (`c3b9e89`).
- Drop stale `inventory_household_id_item_id_location_key` (`3b95e28`).
- Stop pre-filling expiration dates on batch entry (`251ab4c`).
- Recipes required-only counts + optional column + presence-based checks (`12ef77e`).
- Inventory detail: read-only quantity, Save returns to list, "+ Add More" (`523c448`).
- Recipe editor: "Save changes" returns to list (`86783fc`).

Verified: `npx tsc --noEmit` green; `npm run build` successful; `npm run lint`
12 pre-existing errors / 16 warnings (no new); pre-push hook green.

Open:
- Confirm deployed `/recipes` counts and the new redirect flows in a fresh browser.
- Optional: align home Quick Bites coverage with required-only + presence; stray-file / lint-error cleanup.
