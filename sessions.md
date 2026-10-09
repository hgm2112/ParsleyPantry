# Sessions

Rolling journal of dev sessions — newest at top. Append an entry when wrapping
up. Kept local on purpose (not committed); git history is the source of truth
for "what changed", this is for "what's true now / what's next".

## 2026-10-09 (part 5) — Login logo stray "ntry" text

**Shipped**
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
