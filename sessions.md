# Sessions

Rolling journal of dev sessions — newest at top. Append an entry when wrapping
up. Kept local on purpose (not committed); git history is the source of truth
for "what changed", this is for "what's true now / what's next".

## 2026-10-10 (part 14) — Freezer-aware expiration tracking

**Shipped**
- Migration `supabase/migrations/20261010120000_freezer_tracking.sql` — **must be run manually** (SQL Editor / `supabase db push`): `inventory.frozen_at`, `inventory.freezer_duration_months`, `inventory.freezer_quality_date`, `items.freezer_food_type`.
- `lib/types.ts`: the four new fields on `InventoryRow`/`ItemRow`.
- `lib/freezer.ts` (new): `FREEZER_FOOD_TYPES` (22 keys, USDA-style ranges using the **longer** end; cream cheese `months: null` + texture warning), `FREEZER_GROUPS`, `guessFreezerFoodType` (conservative ordered regex prefill, unmatched → `FREEZER_UNKNOWN_KEY` "Not sure", never invents a duration), `computeFreezerQualityDate` (`date-fns addMonths` from `frozen_at` — month-end clamped, **never chained**), `effectiveExpiryDate`, `expiryChipProps`, `formatFreezerQuality` ("Best quality by Feb 10" / "Quality date passed"), `freezerStatus`.
- `actions.ts` `updateInventory`: `frozenAt` / `freezerDurationMonths` / `freezerFoodType` in `patchSchema`; quality date recomputed whenever `frozenAt` provided; move **into** freezer spreads freeze patch, move **out** clears all three freeze fields (thaw; `expiration_date` untouched = preserved refrigerated date); `freezerFoodType` validated against `FREEZER_FOOD_TYPES` (items patch).
- `components/inventory/freeze-dialog.tsx` (new): date frozen (default today, max today) / purchased-frozen checkbox (hides date → `frozen_at: null`), grouped food-type Select + "Not sure", cream-cheese optional personal-months reminder (labeled *not a validated food-safety date*), live preview line, original refrigerated date shown, **already-past refrigerated date → amber warning + required "I reviewed it" checkbox** before confirm. Confirm always sends `location: "freezer"`.
- `detail-form.tsx`: Freezer location button intercepted → dialog (unless already frozen); frozen rows show read-only freezer block (frozen-on, quality line, original date, "Edit/Record freezer details" button) instead of the editable expiration; header chip via `expiryChipProps`.
- `expiry-chip.tsx`: modes `refrigerated` (unchanged red/orange/amber/green) / `freezer` (sky = fine, orange ≤7d, amber = quality passed — **never red**) / `freezer-untracked` ("Frozen (no date)", sky).
- Surfaces storage-aware: `inventory-view` (use-soon filter + sort via `effectiveExpiryDate`, row chip), `smart-actions` (expired/expiring filtered to non-freezer; new ❄️ card "N frozen items near freezer quality date", sky tint, ≤7d incl. passed, 2-item + `+N more →` expand, `formatFreezerList` uses `passed`/`best today`), `pantry-insights` (frozen rows own ❄️ Frozen counter, out of fresh/low/expiring), `stock-row`/`pantry-preview`/`snack-widget` (chip/sort effective dates).

**Gotchas**
- Unique `(household_id,item_id,location)`: first-time freeze that collides with an existing freezer row **merges** and early-returns — the dialog's freeze data is dropped (target keeps its own freeze data). Rare; documented per plan.
- Merge path also skips the items patch (pre-existing early return), so `freezerFoodType` isn't saved in that case.
- Catalog items can be added straight to Freezer (add-form) → `frozen_at` null = "purchased frozen / untracked" by design.
- Fridge→freezer is the only freeze entry point; server accepts `frozenAt` only with the move or on an already-frozen row.

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` — all pass; only the 4 pre-existing lint problems (settings-view setState-in-effect, smart-actions "Don't add" apostrophe + exhaustive-deps, scanner unused `setDebugOn`).

**Open — next session**
- **Apply the migration** before deploying (Vercel build won't).
- Android PWA scan debug overlay readings (part 9 still open).
- Tests skipped per user decision — spec §9 remains a documented gap.
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

## 2026-10-09 (part 13) — Grocery: mobile header toggle moves into button cluster

**Shipped**
- `grocery-view.tsx`: mobile (<md) header now shows `[+Add] [Stores] [Aisles|Categories] [⤢]` — the segmented toggle moved from under the title into the right button cluster, positioned after Stores, before fullscreen. Desktop (md+) unchanged (toggle beside title).
- Extracted shared `modeToggle(extra)` helper (same state/handlers) so the two breakpoint-specific instances (`hidden md:flex` left, `md:hidden` right) aren't duplicated markup.
- Right cluster got `ml-auto flex-wrap justify-end` so it stays right-aligned when it wraps to its own line (typical on ~375px phones — title line + cluster line).

**Gotchas**
- Edit-tool note: insert-before-`return (` must match the component-level return (2-space), not a `.map()` callback return — one misfire landed the helper inside a group map (fixed).

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` — only pre-existing lint issues.

**Open — next session**
- Android PWA scan debug overlay readings (part 9 still open).
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

## 2026-10-09 (part 12) — Home Smart Actions: split expired vs expiring soon cards

**Shipped**
- `smart-actions.tsx`: single "expiring" card split into two — 🥀 "N foods have/had expired" (red tint, `Nd ago` labels, oldest first) and 🥑 "N foods expire soon" (amber, `today`/`Nd`, soonest first; 0–5 days only). Expired card renders first.
- Filters: `expired` = `daysUntil < 0`, `expiring` = `0…5` (they were lumped by `days <= 5` before).
- Lists show **2 items max** with a `+N more →` action-slot toggle expanding in place (`Show less` collapses); independent `showAllExpired`/`showAllSoon` state; headline count always shows the total. No links (plain text, per user).
- Shared `formatExpiryList()` helper for suffix formatting.

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` — only pre-existing lint issues.

**Open — next session**
- Android PWA scan debug overlay readings (part 9 still open).
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

## 2026-10-09 (part 11) — Home Smart Actions: expiring card lists the foods

**Shipped**
- `smart-actions.tsx`: expiring card action replaced "Plan a meal using them →" (and its `/recipes?items=` link) with a plain-text list sorted soonest-first via `compareByExpiry`: `Milk (today) · Spinach (2d) · Chicken (expired)`. Days from `daysUntil` (0 → "today", <0 → "expired", null → name only). Headline/count line unchanged.

**Gotchas**
- `/recipes?items=` deep-link no longer used from Home; recipes page param handling untouched.
- `recipes` prop/`DayDialog` still used by the dinner card.

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` — only pre-existing lint issues.

**Open — next session**
- Android PWA scan debug overlay readings (part 9 still open).
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

## 2026-10-09 (part 10) — Inventory: quantity hitting 0 removes the stock row

**Shipped**
- `consumeInventory` (`actions.ts`): when the resulting quantity would be ≤ 0 the stock row is **deleted** instead of updated to 0; result gains `deleted: boolean`. Catalog item always stays.
- Pantry list minus (`inventory-view.tsx`): at qty 1 opens a **ConfirmDialog** ("Use the last …?") → `consumeInventory` deletes → toast "Used the last X · removed from pantry" with **Undo** (re-creates row via `addToInventory`; old "Add to list" action would have failed on the deleted row id). Qty > 1 still quick-consumes 1 with Undo.
- Detail page minus (`detail-form.tsx`): at qty 1 same confirm → `deleteInventory` + Undo toast → `router.push("/inventory")`. After "Used the last one" dialog reports 0 → navigates back to `/inventory`.
- `consume-dialog.tsx`: "last" copy now "Removes it from your pantry list."; Undo after delete re-creates via `addToInventory` (partial keeps `updateInventory`).
- Legacy 0-qty ghosts hidden (not deleted): `.gt("quantity", 0)` on inventory page + home pantry fetch.
- Removed dead 0-qty UI: line-through name, red "Out" badge, disabled minus/"Used the last one".

**Gotchas**
- Re-adding a removed item matches the catalog item by barcode/name and revives stock — expected.
- Undo after delete re-creates the row (new row id; old detail URL won't resolve).
- `updateInventory` still accepts quantity 0 (no callers pass it anymore); display filter catches strays.
- Recipes/search still treat 0-qty rows as "in pantry" (pre-existing; not filtered).
- Pre-existing lint: settings-view setState-in-effect (2) + smart-actions `Don't` apostrophe (c52557a) — untouched.

**Open — next session**
- Android PWA scan debug overlay readings (part 9 still open).
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

## 2026-10-09 (part 9) — Android PWA barcode scan fix (diagnostics + native hardening + ZXing fallback + lookup toasts)

**Shipped**
- `components/scanner.tsx`: `?debug=scan` (persists via `localStorage pp-scan-debug`; `?debug=scanoff` clears) on-screen overlay (masked codes only) + console: decoder path, getSupportedFormats, detect/ZXing counts+last errors, video dims, emits. Lowercase spec formats for `BarcodeDetector` (`ean_13` etc.) + `getSupportedFormats()` gate requiring `ean_13`/`upc_a`. Native: 5 consecutive `detect()` rejections → auto ZXing; 8s zero-result watchdog → ZXing. ZXing callback now handles `error` (non-retryable sets error state); `playVideoOnLoadAsync` reject(false) and `track.ended` + play timeout produce actionable messages. `forceZxing` restarts effect for seamless fallback.
- Lookup sites now catch `resolveBarcode` throws (network) and toast "Lookup failed — check your connection and try again.": `inventory-view.tsx:handleBarcode`, `add-form.tsx:lookupBarcode`, `shop-session.tsx:handleBarcode` (close-first kept; errors guaranteed to surface).
- No sensitive data logged (codes masked to last 4 chars).

**Gotchas**
- Overlay only appears after `?debug=scan` (or persisted flag) and during a scan session.
- Fallback is sticky for the session (page reload clears); manual "Try again" restarts current decoder.
- Dev: stop `next dev` before `npm run build` (as before).
- PWA on Android: network-only SW → reopen app or hard refresh after deploy to pick up new build; camera permission already granted is instant on fallback restart.

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` clean.
- Open PWA on phone with `?debug=scan` once; scan grocery item; report overlay lines.

**Open — next session**
- User to reproduce on Android PWA vs tab, share debug overlay output (decoder, native counts/errors, zxing counts/errors, standalone, emits).
- Decide on follow-ups (drop native entirely? keep both with heuristics?).

## 2026-10-09 (part 8) — Grocery stores inline editing + Smart Actions ignore + members polish

**Shipped**
- Grocery `/stores` list (`stores-manager.tsx`): per-store expand/collapse (chevrons) with inline aisle editing (add, reorder via dnd, rename, delete). Basic ops scoped to inline; focused `[id]` route preserved for advanced tools. Create no longer auto-navigates.
- Focused store detail (`aisle-editor.tsx`): replaced "Aisles"/"Flat" button with labeled `<Switch size="sm">` (matches list row). Fixed "In view" text overflowing small button → name badge + "Hide"/"Show" outline button.
- Home Smart Actions: "Don't add" option for low-stock items (ignores listed items, persists in localStorage, cycles next).
- Settings members: switched to separate queries + realtime (`postgres_changes`), no email display in list.
- Related migration for household_members realtime.

**Gotchas**
- Inline state (expanded + local forms) resets on `router.refresh()` after mutations.
- Inline uses `prompt`/`confirm` (kept simple per scope).
- AisleInline defined nested (re-render considerations).

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` clean.
- Pushed (`435a646`).

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`).
- Untracked working files: `parsley2.svg`, `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`, `PPmessedup.jpg`.
- (add any new items here)

## 2026-10-09 (part 7) — Confirmation emails pointed at localhost

**Shipped**
- `app/(auth)/login/page.tsx` — "Create an account" now links to
  `` `/signup?next=${encodeURIComponent(next)}` `` instead of `/signup`; a
  `?next=/inventory` arrival (proxy sets it) survived the login hop only if
  you hand-edited the URL
- `app/(auth)/signup/page.tsx` — symmetric: "Sign in" footer link carries
  `next` back to `/login`
- `README.md` — Setup gets step 1.4 (**Authentication → URL
  Configuration**): Site URL = `https://parsleypantry.vercel.app`,
  Redirect URLs = both `https://parsleypantry.vercel.app/**` and
  `http://localhost:3000/**`, with the fallback warning; Deploy section
  repeats it as a post-deploy reminder

**Root cause (no code could fix it)**
- The pasted email link was
  `…/auth/v1/verify?token=pkce_…&type=signup&redirect_to=http://localhost:3000/auth/callback?next=%2Finventory`
  — GoTrue's default `{{ .ConfirmationURL }}` carrying our
  `signup/page.tsx:33` `emailRedirectTo` string
- GoTrue silently discards an `emailRedirectTo` that isn't in the dashboard's
  Redirect URLs allow-list and falls back to **Site URL**, which was still
  `http://localhost:3000` (confirmed with the user). Prod origin was never
  allow-listed → production sign-ups confirm against localhost
- Dashboard fix is the user's (no service key in the repo, and it's Supabase
  UI): Site URL → Vercel URL, allow-list both origins. Email template needs
  no change (it's the default `{{ .ConfirmationURL }}`); the alternate
  `{{ .SiteURL }}/auth/confirm?token_hash=…` template documented in
  `app/auth/confirm/route.ts:8` is covered by the same Site URL setting

**Verify**
- `npx tsc --noEmit && npm run lint && npm run build` clean
- End-to-end (user): sign up on Vercel from `/inventory` → signup request
  body `email_redirect_to` = `https://parsleypantry.vercel.app/…`, email
  link host = `parsleypantry.vercel.app`, click → logged in on `/inventory`;
  localhost sign-up still yields a localhost link that works with `npm run
  dev`

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`, `MealIcon`'s
  `recipe ?` branch)
- Untracked working files still in the tree: `parsley2.svg`,
  `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`,
  `PPmessedup.jpg`

## 2026-10-09 (part 6) — Signup always gets plain default categories

**Shipped**
- New `supabase/migrations/20261009160000_restore_default_signup_categories.sql`:
  `create or replace function public.handle_new_user()` re-asserting the
  canonical body from `20261006160000_init.sql:279-326` (auto household →
  member → profile → settings → the 12 plain categories, `icon` NULL,
  `sort_order` 1–12). Trigger `on_auth_user_created` already points at it,
  so no re-create
- Why: the repo already guarantees this (only signup seed is the trigger;
  all category reads are household-filtered + RLS `is_member`), but
  migrations are hand-run in the SQL Editor and `20261006230000` documents
  a prior out-of-repo "desired-order apply" — so the live function may have
  drifted and seeded KitchenOwl-style rows (`🥫 12 - Canned food`, icons,
  `sort_order` 1000+) at signup. This closes that gap
- Same file carries, in comments: two **read-only diagnostics**
  (`select prosrc from pg_proc where proname = 'handle_new_user'` and an
  affected-auto-households query) and an **opt-in cleanup** (commented out,
  run manually only if the diagnostic returns rows) — temp table of
  untouched auto households (`is_auto` + no items/recipes/grocery/inventory/
  stores, same guard as `join_household()`), delete only drifted rows, then
  restore missing canonical defaults by `lower(name)`
- `README.md` Deploy section: added the new file to the must-run list

**Gotchas**
- No app/TS change — the guarantee lives entirely in the Postgres trigger;
  `npx tsc --noEmit && npm run lint` clean (`next build` skipped: no code
  changed and the dev server was live on :3000)
- The live function still needs the migration applied in the dashboard
  (repo convention, same as `meal_plan_kind`) — the `prosrc` check is the
  read-only way to confirm which version is live
- No `psql` in this environment, so the SQL is hand-verified only

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`, `MealIcon`'s
  `recipe ?` branch)
- Untracked working files still in the tree: `parsley2.svg`,
  `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`,
  `PPmessedup.jpg`

## 2026-10-09 (part 5) — Login logo stray "ntry" text

**Shipped** (pushed `e5ef246`)
- `public/parsleypantrylogov2.svg` + root `parsleypantrylogov2.svg` (kept
  byte-identical): deleted the two leftover Illustrator `<text>` elements —
  a giant off-canvas `P` (font-size 884 @ x=-1041) and `Parsley Pantry`
  (font-size 240 @ x=-1092), both `font-family='Gabriola'`, default black
  fill, drawn last so on top of the artwork
- Why it only broke on mobile: the strings start at negative x (outside the
  `0 0 936 1008` viewBox → clipped), so visibility depends on the rendered
  font's width. Desktop has Gabriola / a narrower fallback → stays clipped;
  the phone doesn't → tail of "Parsley Pantry" lands at x>0 = black `ntry`
  over the P on the login page (`LogoMark`, `app/(auth)/layout.tsx:12`)
- Visible PP artwork is all `<path>` data — unchanged; PWA icons were
  already safe (`scripts/generate-icons.mjs:11` strips `<text>`)
- Verify: 0 `<text>` left in both copies, copies `diff`-identical,
  `xmllint` OK, sharp rasterizes clean; `npx tsc --noEmit && npm run lint`
  clean (skipped `next build` — SVG-only change and the dev server was live
  on :3000)

**Gotchas**
- Root `parsleypantrylogov2.svg` and `public/parsleypantrylogov2.svg` are
  both tracked and were byte-identical — edit both or they drift

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`, `MealIcon`'s
  `recipe ?` branch)
- Untracked working files still in the tree: `parsley2.svg`,
  `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`,
  `PPmessedup.jpg`

## 2026-10-09 (part 4) — Grocery mobile fullscreen toggle

**Shipped** (pushed `511e42c`)
- New `lib/fullscreen.ts`: in-memory (non-persisted) external store +
  `useFullscreen()` / `useToggleFullscreen()` hooks, mirroring the
  `useSyncExternalStore` pattern already used in `lib/use-local-storage.ts` —
  no new React context provider needed
- `app/(app)/nav.tsx`: `Nav` now hides `MobileHeader` + `MobileNav` (fully
  unmounts, not just CSS-hidden) when `fullscreen && pathname` is under
  `/grocery`; `useEffect` resets the flag on any pathname change so a
  back-button visit can't leave the shell stuck hidden. Desktop
  `SidebarNav`/`DesktopHeader` untouched.
- New `components/app-main.tsx` (swapped into `app/(app)/layout.tsx` in place
  of the inline `<main>`): drops the mobile `pb-28` bottom-padding reservation
  down to `pb-12` (what desktop already uses) while fullscreen, so the removed
  bottom nav's reserved space collapses too
- `components/grocery/grocery-view.tsx`: icon-only toggle button in the
  toolbar (next to Add/Stores), `size="icon-sm"`, `md:hidden`,
  Maximize2/Minimize2, outline↔default variant by state, `aria-pressed`;
  "Finish shopping" sticky bar drops from `bottom-16` to `bottom-0` and picks
  up `env(safe-area-inset-bottom)` padding while fullscreen (matters now that
  this is an installable PWA with `viewportFit: cover` on iOS)
- Known minor tradeoff (accepted, no animation added): unmounting the sticky
  (in-flow) mobile header shifts page content up ~56px on toggle if already
  scrolled deep in the list — matches the codebase's no-motion-utility style;
  easy to revisit with a `transition-transform` approach if it bothers anyone
- Verify: `npx tsc --noEmit && npm run lint && npm run build` clean

**Gotchas**
- Next.js 16 with `cacheComponents`: any client component calling
  `usePathname()` must sit inside a `<Suspense>` boundary or prerendering
  fails with `CLIENT_HOOK_DYNAMIC` (hit this on `/grocery/stores/[id]` when
  `AppMain` first tried to check the pathname — fixed by dropping the check
  entirely, since `fullscreen` can only ever be toggled on from the grocery
  page anyway and Nav resets it on navigation). `Nav` itself was already safe
  (wrapped in Suspense in the layout).

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`, `MealIcon`'s
  `recipe ?` branch)
- Untracked working files still in the tree: `parsley2.svg`,
  `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`

## 2026-10-09 (part 3) — PWA support

**Shipped** (pushed `1a75b2b`)
- `app/manifest.ts` (Next file convention → `/manifest.webmanifest`, auto-
  linked): name/short_name "Parsley Pantry", `start_url: "/"`,
  `display: standalone`, theme `#009444` / bg `#ffffff`, icons 192 + 512 +
  512-maskable
- Icons generated with `sharp` (already in node_modules, no ImageMagick
  needed) from `public/parsleypantrylogov2.svg`, white-recolored onto a green
  rounded-square tile → `public/icon-192x192.png`, `icon-512x512.png`,
  `icon-maskable-512.png`, plus `app/apple-icon.png` (file convention, 180×180
  full-bleed). Script kept at `scripts/generate-icons.mjs` for later tweaks
  (strip `<text>` elements first — Gabriola isn't installed and would render
  stray black fallback text)
- `public/sw.js`: minimal service worker (skipWaiting/clientsClaim, fetch
  handler registered but network-only no-op) — just enough for Chromium's
  installability criteria; barcode scanning, Supabase realtime, Server Actions
  untouched; every page load hits the network so a Vercel redeploy is picked
  up on next open/refresh
- `components/service-worker-register.tsx` mounted in the root layout: registers
  `/sw.js` with `updateViaCache: "none"`, **production builds only** so
  `npm run dev` never leaves a stale SW on localhost
- `next.config.ts`: `headers()` for `/sw.js` (`no-cache, no-store,
  must-revalidate` + `Service-Worker-Allowed: /`) so browsers check for a new
  SW on every navigation
- `proxy.ts` matcher now excludes `/sw.js` and `/manifest.webmanifest` — these
  don't need the session-cookie check
- README: "Install on your phone" section (iOS Share → Add to Home Screen,
  Android/Chrome install prompt, local test via `npm run build && npm start`
  since the SW is prod-only); also noted the pending
  `meal_plan_kind` migration in the Deploy section
- Verify: `npx tsc --noEmit && npm run lint && npm run build` all clean;
  smoke-tested live: `/manifest.webmanifest` valid JSON, `/sw.js` headers
  present, `<link rel="manifest">` + apple-touch-icon + appleWebApp meta tags
  all in the rendered head

**Gotchas**
- Sharp SVG rendering: the logo SVG has off-canvas `<text>` elements that
  silently render as black fallback-font junk when rasterized at larger sizes
  — must strip them (done in the script) before compositing
- `npm start` won't bind :3000 if `npm run dev` is already running — kill the
  dev server first if you actually want a prod-server smoke test (this time
  the dev server's own responses were verified instead, which is fine since
  `headers()` applies in dev too)
- Next.js 16 PWA docs (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`)
  recommend `navigator.serviceWorker.register(new URL(...), {scope})` with a
  bundled SW file — intentionally not used here, a plain static `public/sw.js`
  sidesteps any Turbopack asset-emission/scope quirks
- `20261009120000_meal_plan_kind.sql` migration confirmed run + verified live
  (2026-10-09): REST select of the `kind` column → 200, bogus column → 400

**Open — next session**
- knifefork image removal still pending (`week-meals.tsx`, `MealIcon`'s
  `recipe ?` branch)
- Untracked working files still in the tree: `parsley2.svg`,
  `example-thisweeksdinner.jpg`, `shoppinglistpage.jpg`, `dev.log`

## 2026-10-09 (part 2)

**Shipped** (both pushed):
- `0807ad3` — Recipes list + day picker split into **Cooking / No cooking**
  sections: a recipe is "Cooking" iff it has ≥1 `recipe_ingredients` row.
  Headings render **only when both groups are non-empty**, so searches,
  `?items=` filters, and marker-free households look exactly as before.
  Recipes page derives the id set from the ingredient query it already runs;
  plan/home pages changed to
  `select("id, name, time, tags, recipe_ingredients(id)")` →
  `RecipeOption.hasIngredients`
- `c110dcc` — Plan **day kinds**: new nullable `meal_plan_days.kind`
  (`eating_out | meal_kit | no_cook`), metadata + `dayTitle()` / `isPlanned()`
  in `lib/meal-kind.ts` (UtensilsCrossed / Package / Ban + amber/sky/lime
  tints), "Other plans" chips in DayDialog (saved together with the note in
  one Save), kind rows show tinted icon + semibold title on the plan page and
  both home widgets
- `MealIcon` order is now: today → ChefHat · made → Check · recipe →
  knifefork · kind → its icon · plain note → StickyNote (one place, as the
  old gotcha wanted)
- **Mark as made works for any planned day** (gate = `isPlanned`; no holds ⇒
  nothing deducted); confirm copy takes `mealName` (renamed from
  `recipeName`) so it reads "Eating out…"; toast is now just "Marked as made"
- Bug fixes riding along: desktop `WeekMeals` rendered note-only days as
  empty "Plan a meal" cards; `MiniCalendar` dotted only recipe days;
  `SmartActions` ignored kinds; `saveMealNote` never revalidated `/home`;
  "Add Meal"/"Plan" now skip days that are only kind/note
- Verify = `npx tsc --noEmit && npm run lint && npm run build` clean

**Gotchas**
- **`supabase/migrations/20261009120000_meal_plan_kind.sql` must run before
  deploy.** Until then reads are fine (`select("*")` + optional chaining) but
  `setMealDay`/`saveMealNote` writes of `kind` error — no supabase CLI in the
  repo, so it's a dashboard job like the earlier ones
- `recipe_id` ↔ `kind` mutual exclusion lives in the actions, not the DB:
  kind-over-recipe releases the day's holds + resets `made_at`; recipe-over-
  kind nulls `kind`
- Sets don't cross the RSC boundary here — `recipeIdsWithIngredients` is sent
  as `string[]`, `new Set` built in the client component
- `pkill -f "next dev"` matches its own command line and kills the shell —
  use `pkill -f "[n]ext dev"`

**Open — next session**
- knifefork image removal is still pending, now a single branch inside
  `MealIcon` (`week-meals.tsx`, the `recipe ?` arm after `made_at`)
- Untracked working files: `parsley2.svg`, `example-thisweeksdinner.jpg`,
  `shoppinglistpage.jpg`, `dev.log`

## 2026-10-09 (part 1)

**Shipped**
- Recipes list: removed the Ingredients column — redundant, `Have?` already
  shows `covered/total`. Desktop grid is now 4-col:
  `sm:grid-cols-[minmax(0,1fr)_60px_50px_70px]` (Name / Time / Size / Have?);
  base grid `grid-cols-[minmax(0,1fr)_60px]` untouched (mobile still Name +
  Have?). Dropped the `ingredientCounts` prop from `RecipesView` and the
  `counts` accumulator in `app/(app)/recipes/page.tsx` — the
  `recipe_ingredients` query stays, it still feeds `itemIdsByRecipe` +
  `pantryStatus`
- Verify = `npx tsc --noEmit && npm run lint && npm run build` all clean

**Gotchas**
- `next build` during dev is unsafe → killed dev, built, restarted with
  `nohup npm run dev > dev.log` (port 3000 confirmed listening)

**Open — next session**
- Still pending from part 5: remove the knifefork image from the PC/browser
  meal plan — one-place edit inside `MealIcon` (planned row else-branch);
  swap for `Utensils`/`UtensilsCrossed`
- Untracked working files: `parsley2.svg`, `example-thisweeksdinner.jpg`,
  `shoppinglistpage.jpg`, `dev.log`

## 2026-10-08 (part 5)

**Shipped** (both pushed):
- `9e1e7c1` — Recipes list mobile: header + rows switch to
  `grid-cols-[minmax(0,1fr)_60px]` at base (Name + Have?, text stays
  centered), Time/Size/Ingredients get `hidden sm:block`; full 5-col
  restores at `sm:` (640px)
- `99c58b4` — Home mobile: new `CompactDinners` widget at the very top
  (`lg:hidden` first grid child in `home-view.tsx`) — today + 3 days,
  plan-page style rows (date badge → icon → truncated name/note → Made ✓ →
  Edit/Add), no chevrons, bottom-right **Plan** ghost button (opens first
  unplanned day), today's ChefHat mark-made preserved
- `MealIcon` extracted in `components/home/week-meals.tsx` — the round
  tinted widget icon (ChefHat / Check / knifefork) with `size="lg"`
  (size-12, desktop cards) and `"sm"` (size-9, compact rows); full
  `WeekMeals` refactored onto it with identical output
- `HomeSkeleton` gained a mobile-only `h-60` top block
- Verify = `npx tsc --noEmit && npm run lint && npm run build` each time

**Gotchas**
- Two dinners components render simultaneously (compact mobile, full
  desktop) with separate dialog state — fine, but both live in
  `week-meals.tsx`, so icon changes must go through `MealIcon` or they
  diverge
- Skeleton/mobile order must track real DOM order: compact dinners →
  SmartActions → snack/insights/calendar/promo stack → pantry → shopping
- User decided earlier (recipes list): Have? column 60px, `text-center`
  on mobile — no right-align

**Open — next session**
- User will remove the knifefork image from the PC/browser meal plan —
  now a one-place edit inside `MealIcon` (planned row else-branch); swap
  for an icon (e.g. `Utensils`/`UtensilsCrossed`) when ready
- Untracked working files: `parsley2.svg`, `example-thisweeksdinner.jpg`,
  `shoppinglistpage.jpg`, `dev.log`

## 2026-10-08 (part 2)

**Shipped**
- `lib/auth.ts` — `await io()` at the top of `getDal()`; closes the
  `blocking-prerender-current-time` item below (verified: 0 hits across
  12 routes, build clean)

**Gotchas**
- Root cause was NOT `use-now`/`Greeting`. It was `getDal()` →
  `supabase.auth.getUser()` doing session-expiry math (`Date.now()`, ~32 hits
  in `@supabase/auth-js`) during the static-shell stage. The overlay frame
  collapses to `AppLayout:15` (`<NavWithProfile />`) because supabase frames
  are filtered out, and that read fires first in tree order — so it masked
  every page-level reader. Guarding `getDal()` covers all callers at once.
- Repro without logging in: `proxy.ts` only checks that the cookie
  `sb-<ref>-auth-token[.N]` exists, so forge
  `base64-<base64url JSON {access_token, refresh_token, expires_at}>`.
  Server-side errors land in `.next/dev/logs/next-development.log`, not stdout.
- Only one sync-IO error is recorded per render (`syncDynamicErrorWithStack`
  is set once, then the stage aborts) — first reader wins, rest are hidden.
- Next 16 refuses a second `next dev` on the same project, and `next build`
  during dev is unsafe: stop the dev server first, restart after.

**Open — next session**
- Untracked working files: `parsley2.svg`, `example-thisweeksdinner.jpg`,
  `shoppinglistpage.jpg`, `dev.log` (this session's dev output)

## 2026-10-08

**Shipped** (25ca160 → 0dd3b47, all pushed):
- `25ca160` — Fixed inventory-detail `low_threshold` TypeError (Promise.all
  awaited the response wrapper, not `.data`); `use(io())` guards for render-time
  clock reads; home right column stacked: Snacks → Insights → Calendar → Promo
- `f99eb13` — Pantry Insights: Snacks + Candy stat pills (counts subcategories
  containing "snack"/"candy")
- `b0c581f` — FONTE___.ttf is the brand font (wordmark + slogan in all 3 spots)
- `c2cef5a` — parsley artwork redrawn (parsley2.svg content → public/parsley.svg)
- `ea25c42` — "Mark as made" confirmation shows the day's reserved pantry items
  before deducting (week widget ChefHat + day dialog)
- `0dd3b47` — Recipe page: pick which ingredients go to the shopping list;
  remembered via `recipe_ingredients.on_shopping_list`; planner + grocery
  "Add all" respect it

**Gotchas**
- `supabase/migrations/20261008140000_recipe_ingredients_shopping_list.sql`
  must run before deploy (recipe saves fail without the column) — already applied
- FONTE: file renamed `.TTF`→`.ttf` (Turbopack rejects uppercase extensions);
  `adjustFontFallback: false` (font's name table reads "Font Error")
- `updateRecipe` deletes + reinserts ingredient rows → drafts must carry
  `on_shopping_list` through saves
- Verify = `npx tsc --noEmit && npm run lint && npm run build`, then commit
  + push, never amend

**Open — next session**
- `Date.now` `blocking-prerender-current-time` error STILL fires on every route
  (frame always `AppLayout:15`, 461× in dev.log). `use(io())` did not suppress
  it; A/B showed nav (Greeting) AND content readers were involved. Next steps:
  read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md` +
  `connection.md`, try `await connection()` in `NavWithProfile`, or stop
  reading Date in `getServerSnapshot` (`lib/use-now.ts`)
- Untracked working files: `parsley2.svg` (source), `example-thisweeksdinner.jpg`,
  `shoppinglistpage.jpg`

## 2026-10-08 (part 4)

**Shipped**
- Shopping list "Stores" button: now `<Store /> Stores` (size="sm", icon+text to match "Add" button); removed gear/Settings2 icon and old aria-label.
- Stores page: header simplified to just "Stores" (h1).
- Stores page list: replaced per-store "Aisles"/"Flat" text button with bare `<Switch size="sm">` on/off toggle for `use_aisles`. Refactored handler to `setUseAisles(store, value: boolean)` (fixed inverted toast as side effect).
- Verification: `tsc --noEmit && npm run lint && npm run build` clean.

**Gotchas**
- (none)

**Open — next session**
- (none)

## 2026-10-08 (part 3)

**Shipped**
- Multi-store view feature: new `grocery_item_stores` table, `selected_store_ids` array on `household_settings`, per-store aisle/cards rendering, pill chips in grocery view, store toggle in stores manager, "Buy at" chips + per-store aisles in item dialog, home widget multi-store groups, aisle-editor toggle, stores-manager badges/toggles.
- Migration + types + actions in one session; `primaryStoreId` helper deterministically picks first store in list order that is in view.
- `clearCheckedGrocery(ids)` now accepts ids list; only visible items cleared.
- All type checks and lint pass; build succeeds.

**Gotchas**
- `selected_store_ids` migration must run before deploy (existing `selected_store_id` column kept for backward compatibility).
- Restored items (via `restoreGroceryItems`) re-file under the default store, not in "Any store".
- Aisle-editor persists via `toggleInView` using the same effective-view logic as grocery page and stores manager; requires `storeIds` prop now.
- ItemDialog "Buy at" chips add/remove from membership; per-store aisle selects use `resolveEffectiveAisle`.

**Open — next session**
- (none)
