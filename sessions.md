# Sessions

Rolling journal of dev sessions — newest at top. Append an entry when wrapping
up. Kept local on purpose (not committed); git history is the source of truth
for "what changed", this is for "what's true now / what's next".

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
