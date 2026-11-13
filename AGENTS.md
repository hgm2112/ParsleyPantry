<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-12)

Goal: set up automated Supabase database backups for the repo, matching the working `bigolerankings` approach, and verify a real backup run.

Shipped and pushed:
- **Database backup workflow** (`819faca`): added `.github/workflows/db-backup.yml` (daily `03:00 UTC` + `workflow_dispatch`, `contents: write`). Dumps with `postgres:17` `pg_dump -Fc`, encrypts with AES-256-CBC/PBKDF2 to `backups/db-YYYY-MM-DD.dump.enc`, prunes to 14, then commits/pushes `chore: database backup YYYY-MM-DD`. `backups/` is created by the workflow (no `backups/` committed up front).
- **Verified**: first manual run completed and pushed an encrypted dump. Setup used **repository secrets** `SUPABASE_DB_URL` + `BACKUP_PASSPHRASE` (workflow has no `environment:`). The secret must be the Supabase **Session pooler** URI (port 5432, user `postgres.<project-ref>`); the direct `db.<ref>.supabase.co` host failed from the runner because it resolved to IPv6 (`Network is unreachable`). Password is the Postgres database password (percent-encoded in the URI if it has special characters).

Durable notes:
- Backup file lives in git under `backups/db-*.dump.enc` on `main` (workflow runner commits/pushes it). It is **not** fetched to local automatically — run `git pull` to see it in the working tree.
- Node 20 deprecation warning for `actions/checkout@v4` is non-fatal; optionally bump to `actions/checkout@v6` later.

## Completed Session (2026-11-10)

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

## Completed Session (2026-11-11)

Goal: 2-Week Ingredient Summary at bottom of `/plan` — aggregate canonical ingredients across the full 14 days with original vs. remaining needs + current pantry stock. Follow-up unit/aggregation polish.

Shipped and pushed (38e131d → 7a073e4):
- **2-Week Ingredient Summary** (`lib/plan-ingredients.ts`, `components/plan/plan-ingredient-summary.tsx`): new section rendered after week 2 on `/plan`.
  - Groups by `canonical_item_id` (name fallback). Optional ingredients excluded.
  - `original` = all scheduled recipe days (cooked included); `remaining` = `made_at IS NULL` only.
  - Pantry stock read fresh from `inventory` (cooking already deducted via markMealMade).
  - Strict unit bucketing: weights → ounces; known packaging (cup/can/jar/...) keep own buckets; unknown piece nouns ("eggs", "cookies", "fillets") normalize to `each` bucket while preserving the original noun for display (e.g. "19 eggs", "1 cookie").
  - Bare numeric units (e.g. "10.75" with no unit word) treated as `unknown` — never expanded to phantom piece counts, never satisfy quantified or presence-only needs (shows "Can't compare" or "unit unknown").
  - Verdicts: Enough (green, with `presenceOnly` variant), Need/Buy X (amber/red), Can't compare (unmatched or units), All cooked, — (unquantified, no stock).
  - Amount-less + any positive comparable stock → Enough (with tooltip: "The recipe doesn't specify an amount — having this in the pantry counts as enough.").
  - UI: All/Need more/Can't compare filter pills, expandable per-meal list (date · recipe · amount · Cooked/To cook), responsive (desktop grid / mobile cards), stable counts.
- **/plan page** (`app/(app)/plan/page.tsx`): widened the existing `recipe_ingredients` fetch to cover all planned days for the summary while keeping weekly tiles + coverage scoped to prior "on shopping list + uncooked" logic. No new queries.
- **PlanView**: renders `<PlanIngredientSummary groups={...} mealStats={...} />` after the weeks.
- **Inventory actions**: added `revalidatePath("/plan")` to add/consume/restore/update/delete so pantry edits live-update the summary.
- **Unit polish** (also fixed real data issues): "eggs" (recipe "8" vs pantry "19 eggs") now comparable; soup items no longer polluted Chicken totals; bare units no longer invent counts.
- Session: renamed via agent tools to `plan-2week-ingredient-summary-complete (2026-11-11)`.

Verified: `npx tsc --noEmit` clean; pre-push hook green; ad-hoc aggregation cases (mixed units, presenceOnly, bare numbers, piece nouns, incompatible packaging) all pass. No new lint findings on changed files.

Durable notes (added):
- Recipe `quantity_text` starting with digit/`.` treated as quantified; blank/"to taste" count as meals but never produce shortages.
- `stock_holds` ignored in summary (compare total remaining demand to total stock).
- No meal-plan scaling (yields display-only).
- Summary never auto-adds to grocery list.
