# Sessions

Rolling journal of dev sessions — newest at top. Append an entry when wrapping
up and commit it with the session's work; git history is the source of truth
for "what changed", this is for "what's true now / what's next".

## 2026-10-10 (part 29) — /stats page: cooking history, habits, planning + pantry insights

**Shipped**
- **New `/stats` page** (zero migrations — existing `made_at` + `kind` columns carry everything):
  - `lib/stats.ts`: all pure calculations — period ranges (`all`/`year`/`90`/`30` via `?period=`), cooked occurrences (made_at set AND kind null, filtered by LOCAL date of made_at via `localDateOfTimestamp`), cooking streak (≥1 cooked per date; no-cook neither extends nor breaks), distinct No Cooking Days (scheduled dates of kind='no_cook' in range), favorites ranked count-then-recency, weekly (30/90) / monthly (year/all) CSS bar buckets, most active weekday (Mon-first), new-recipes-tried (earliest-ever cooked date in range — reliable, full history), milestones (25/50/100/250/500 all-time), planning stats (planned/cooked/no-cook/eating-out/meal-kit + past-due completion rate excluding non-cook kinds + most-planned recipes), pantry snapshot (expired/expiring-soon ≤3 days + canonical-pool coverage of upcoming planned ingredient lines with holds on other days subtracted).
  - `app/(app)/stats/page.tsx`: server component fetches all meal_plan_days, recipes (id, name), inventory, items catalog, stock_holds, plus on_shopping_list ingredient lines for planned un-made recipe ids; Suspense-wrapped for `useSearchParams`.
  - `components/stats/stats-view.tsx`: period segmented control (ThemePicker radiogroup pattern), 5 overview cards (No Cooking card dashed), favorites top-5 + show-all, cooking habits (CSS bar chart — no chart library, avg/week, active day, new recipes, milestone chips + progress), meal planning (+ completion-rate sentence naming eating-out/meal-kit exclusions), pantry insights (expiry lists, coverage bar, honest "consumption isn't tracked" note — most-used-ingredients deliberately omitted). `useToday()` supplies today; server never reads wall clock.
  - **Undo made**: new `unmarkMealMade` server action (clears made_at, revalidates /plan /home /stats); DayDialog's "Made" pill is now a clickable undo button — toast warns pantry stock used at confirm time is NOT restored (consumption isn't logged).
  - **Home card**: `components/stats/stats-summary.tsx` — compact "Your Stats" (cooked / this month / streak / no-cook) mounted in home-view right stack after MiniCalendar, before PromoCard; reuses the already-fetched `meals` (zero extra queries).
  - **Nav**: sidebar item Stats (ChartColumn) between Recipes and Settings; mobile header icon beside Search; bottom bar stays 5 items. NavFallback already renders 7 skeleton rows.
- `lib/meal-summary.ts`: exported `buildPantryPools`/`resolveLine`/`PantryPools` (were private) for coverage math.

**Gotchas**
- Cooked = made_at AND kind is null, by LOCAL date of made_at. No Cooking entries are never counted as cooked, never in streak/favorites/milestones; completion-rate denominator only kind-less past-due plans.
- Coverage subtracts holds on days OUTSIDE the upcoming-demand set (reservations respected); no consumption tracking yet — stats page says so explicitly rather than faking usage numbers.
- `mondayOf` takes a Date — stats.ts wraps it in `mondayIso(iso)`. Undo does NOT restore consumed pantry stock (documented in toast + sessions).
- lucide exports `ChartColumn` (not `BarChart3`).

**Verify**
- Manual review only (no tsc/lint/build per request). Check: /stats period switch updates all sections; streak excludes no-cook days; DayDialog undo flips Made→planned and refreshes /stats; Home card totals match /stats all-time.

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped (covers parts 24–29).
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).



## 2026-10-10 (part 28) — /search: page search bar desktop-hidden (mobile keeps it)

**Shipped**
- `app/(app)/search/page.tsx`: on-page GET form (the duplicate that sat under the persistent nav `SearchForm` on desktop) gained `md:hidden`, plus a comment explaining the split. **Mobile keeps the input** — the mobile nav header only has a Search *icon* linking to `/search`, so the page form is the only place phone users can type; desktop now shows only the sidebar/header search. `SearchSkeleton`'s input-sized bar also `md:hidden` so desktop never flashes a phantom bar.

**Gotchas**
- Desktop: two search bars at once was the bug; mobile deliberately unchanged. `autoFocus` kept (mobile landing → keyboard up is the intended flow).
- If mobile search ever needs a sheet/dialog instead, revisit the nav icon's destination.

**Verify**
- Manual review only (no tsc/lint/build per request). Check: desktop /search?q=x shows no page bar; mobile (<768px) still has it.

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped (covers parts 24–28).
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 27) — Recipes: brighter dark-mode row names

**Shipped**
- `components/recipes/recipes-view.tsx` name span: added `relative` + `dark:text-zinc-50`. Two causes of the "dull" names: (1) the absolute-positioned gradient wash (`inset-0`, opacity-50) painted **over** the in-flow name span, tinting it with the deep dark stop; (2) base color was only `--foreground` `#f2f4ef`. `relative` lifts the name above the wash; `dark:text-zinc-50` (soft white, per request) brightens dark mode. Light mode unchanged.

**Verify**
- Manual review only (no tsc/lint/build per request).

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped (covers parts 24–27).
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 26) — Recipes: dark-mode row gradients fixed at source

**Shipped**
- **Root cause**: `recipes-view.tsx` painted the row wash with `grad.split(" ")[0]` — kept only the light `from-*` class and discarded every `dark:` variant from `tileGradient()`, so dark mode rendered light pastels (`*-100`) at 50% opacity over charcoal (the washed gray/blue-purple-green look). The part-23 dark stops also used near-black `*-950/60` opacity — the "light color with reduced opacity" pattern.
- **`lib/tiles.ts`**: `GRADIENTS` rewritten as from-stop-only pairs — light stops **unchanged** (`from-emerald-100` etc., same 8 assignments per recipe name); dark stops now solid deep/subdued colors: emerald-900, violet-950, stone-800 (warm charcoal), blue-950, rose-950, green-900, indigo-950, cyan-900. Dropped the dead `to-*` stops (only consumer fades with `to-transparent`); `tileGradient` JSDoc updated. `tileFor` left as-is (unused export).
- **`components/recipes/recipes-view.tsx`**: `grad.split(" ")[0]` → `grad`, so the `dark:` from-stop reaches the DOM. Row keeps `bg-gradient-to-r … to-transparent opacity-50` — right edge still fades to the page surface in both themes; layout/heights/tags/columns untouched.

**Gotchas**
- Only consumer of `tileGradient` is the recipes list; home hero gradient (`home-view.tsx:30`) has its own dark pair — untouched.
- `opacity-50` now halves the solid deep stops in dark (subtle wash by design; bump to a darker stop if too faint).
- Text/tag contrast unchanged — gradients only got darker behind them.

**Verify**
- Manual review only (no tsc/lint/build per request). Browser check: toggle Light/Dark in nav — washes switch live via `dark:` class on `<html>`, no refresh.

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped (covers parts 24–26).
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 25) — /plan cards: widget MealIcon, MON | OCT 5, per-day 6/9

**Shipped**
- **Extracted `MealIcon`** (`components/plan/meal-icon.tsx`) from the Home dinners widget (`week-meals.tsx`): same `rounded-full tint.dot` circle — ChefHat (today, unmade), white Check (made), `knifefork2.svg` white via `brightness-0 invert` (recipe), KindIcon/StickyNote fallbacks. `onMark` now optional: Home passes it (today circle clickable → MadeConfirm, hover ring); /plan omits it (decorative — whole card opens DayDialog). `week-meals.tsx` imports it; Home visuals unchanged.
- **/plan DayCard redesign** (left-aligned per request): food-emoji "images" removed; date row now **"MON | OCT 5"** (uppercase weekday · dim pipe · uppercase month); "Made ✓" pill removed — replaced by the `MealIcon` circle at `size-12`; card content left-aligned (`items-center gap-2.5` circle + title/meta column, not centered like the widget); title + meta line **`35 min · 6/9`** (time when >0; coverage emerald bold when fully covered, muted otherwise); note line at bottom via `mt-auto`. Unplanned = dashed card, "Plan a meal" only. Today via `useToday()` (hydration-safe hook, same as Home).
- **Per-recipe pantry coverage**: `lib/meal-summary.ts` refactored — shared `buildPantryPools` + `resolveLine` (canonical/oz pooling) used by `buildWeekSummary` and new **`buildRecipeCoverage(ingredients, inventory, items) → Map<recipeId, {total, inPantry}>`**. `plan/page.tsx` computes `coverageById` for all planned un-made recipes in the 14-day window and passes it to `PlanView`.

**Gotchas**
- 6/9 = that recipe's **ingredient lines** covered by raw pantry stock (holds ignored, Quick Bites parity) — same math as the week tile.
- Today-ChefHat on /plan is decorative; mark-made lives one tap deeper in DayDialog (Home keeps the quick MadeConfirm).
- Week Ingredients tile + three shop buttons from part 24 unchanged.

**Verify**
- Manual code review only (no tsc/lint/build per request). Visual pass pending: circle sizes in 2-col grid, MON | OCT 5 spacing, emerald 6/6, today's ChefHat flip.

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped (covers parts 24+25).
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 24) — /plan: 14-day card grid, 3 shop actions, ingredient summaries

**Shipped**
- **/plan layout rewrite** (`components/plan/plan-view.tsx`): 7-row vertical list → **14-day (2-week) card grid**. Each week = section with "Week 1/2 · Oct 13–19" header + `grid-cols-1 sm:grid-cols-2` of 7 day cards + 1 **Ingredients Summary tile** (equal `min-h-24` cards); `border-t` divider between weeks. Day cards follow Home's tinted-card language (`tintFor(recipe.name)` / kind tint / `NOTE_TINT`, unplanned = dashed border) — **image/gradient tiles removed**, replaced with small inline `foodEmoji`/`KindIcon`/`StickyNote`/`Plus`. Open-day state is now `{weekStart, dayIndex}` (DayDialog reused unchanged, mounted per week).
- **Three shop actions** in the header (shared busy flag): **Shop this week** (primary, existing `planWeekToGrocery`), **Shop both weeks** (new `planDaysToGrocery` with all 14 keys), **Select days to shop** (opens picker). All three share one toast format.
- **Action refactor** (`app/(app)/plan/actions.ts`): core of `planWeekToGrocery` extracted into internal `shopDays(targets: {weekStart, dayIndex}[], emptyError)` — wipes/recomputes holds **only for targeted days** (per-week `.in("day_index", …)` deletes so a multi-week selection never stomps untargeted days; untargeted holds stay reserved). `planWeekToGrocery` = wrapper over days 0–6. New exported `planDaysToGrocery(days)` (zod `array(dayKeySchema).min(1).max(14)`, deduped) — single code path for all three buttons. Same pantry-first math: canonical-root pools, oz conversions, made-day skip, oldest-first reserve, `addManyGroceryItems` dedupe.
- **Day picker** (new `components/plan/shop-days-dialog.tsx`): 14 rows in Week 1/2 groups (date + meal title, Made ✓ suffix), checkboxes, **Select all / Clear**, "N days selected", disabled "Shop selected days" at 0. Unplanned + made days shown but disabled. `max-w-md max-h-[85vh]`.
- **Ingredient summaries**: new pure `lib/meal-summary.ts` `buildWeekSummary` — per-week line counts (Have X/Y, "N to buy") using the shop action's canonical/oz pooling (raw pantry sufficiency, holds ignored — Quick Bites semantics). `plan/page.tsx` now fetches both weeks (`weekStart` + `+7`), plus `recipe_ingredients` (on_shopping_list, un-made recipes only) + inventory + items for summaries. Tile "View list" → new `components/plan/week-ingredients-dialog.tsx` (line rows with ✓ pantry / needed chips).

**Gotchas**
- Summary counts **ingredient lines** (incl. cross-recipe duplicates), aggregating coverage only per `(root, unit)` pool — "1 lb" + "500 g" chicken count as 2 lines.
- Summary ignores stock holds (Quick Bites parity); after shopping, a tile may still say "have" for stock reserved by the *other* week.
- Grocery dedupe still only skips *unchecked* existing lines (pre-existing).
- `?week=` window is now weekStart+next week; prev/next nav still shifts 7 days; mini-calendar/Home untouched.
- Per request: no tests/lint/tsc/build run this session — re-verify when the dev server is stopped (`npx tsc --noEmit`, `npm run lint`, `npm run build`).

**Verify**
- Manual code review only (per request). Visual pass pending: 14-day grid on mobile (1 col) / desktop (2 col), all three shop paths (week / both / subset), View list counts.

**Open — Next Session**
- Run `npm run build` + `npx tsc --noEmit` when dev is stopped.
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 23) — Dark mode: Light/Dark/System

**Shipped**
- **Infrastructure**: new `components/theme-provider.tsx` (next-themes `0.4.6`, already in package.json but never mounted) — `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. Mounted in `app/layout.tsx` around children + Toaster (sonner's `useTheme()` finally gets a provider → toasts follow theme). `suppressHydrationWarning` added to `<html>`. `viewport.themeColor` → media array (light `#ffffff`, dark `#171A17`). Persists per-device in localStorage (`theme` key); no DB column (theme is device-level).
- **Dark palette** (`globals.css` `.dark` block rewritten): layered charcoal — page `#171A17`, cards/muted `#222722`, popovers/secondary `#2B312B`, sidebar `#141714`, text `#F2F4EF`, muted-foreground `#A8B0A5`, borders/inputs `#394139`, accent `#263027`/`#CBE5D4`, primary = brighter parsley green `oklch(0.75 0.15 155)` with near-black-green on-primary. Matches existing class-based `@custom-variant dark (&:is(.dark *))`.
- **Settings → Appearance** section (after Preferences in `settings-view.tsx`): 3-way segmented control Light/Dark/System (Sun/Moon/Monitor, grocery Aisles|Categories visual language) via new `components/theme-switch.tsx` `ThemePicker`.
- **Nav quick toggle** (`ThemeToggle` in same file): icon button in mobile header (before Search) + desktop header (before avatar) — cycles Light → Dark → System, icon shows current mode (Sun/Moon/Monitor), aria-label announces current+next.
- **Dark: pairs** (following the `expiry-chip.tsx` `*-100 → dark:*-950` pattern): `lib/tints.ts` (all 8 category/aisle tint sets + icons), `lib/tiles.ts` (8 gradients → `dark:from-*-950/60 dark:to-*-950/40`), `lib/meal-kind.ts` (3 kind tints), `smart-actions.tsx` (6 cards), `home-view.tsx` hero gradient, `stock-row.tsx` (2 badges), `shopping-widget.tsx` (sale icon), `grocery-view.tsx` + `item-dialog.tsx` (sale-only chips), `inventory-view.tsx` (violet/emerald chips, orange/amber alerts), `recipe-editor.tsx` (have/✓ emerald).
- **Dividers**: 3× `divide-black/5` → `divide-border` (categories, grocery, shopping-widget).

**Gotchas**
- Scanner overlays (`bg-black`, white rings), dialog scrims, `text-white` on solid `-600` dots intentionally untouched — correct in both themes.
- Manifest `background_color: #ffffff` unchanged (splash-only, cosmetic).
- Nav toggle forces light/dark (leaves System); Settings picker is the place to return to System.
- Body `font-weight: 600` (part 21 gotcha) applies in dark too — unchanged.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = 16 pre-existing problems, none in touched files. `npm run build` skipped (dev server live on :3000 — rerun when stopped).
- Manual: Settings → Appearance cycles all three; nav toggle cycles; hard-refresh PWA picks up dark; walk Home/Pantry/Grocery/Recipes/Plan + dialogs under dark; toasts follow theme; System tracks OS.

**Open — Next Session**
- Run `npm run build` when dev is stopped.
- Visual pass on dark: primary-green contrast on cards, tile gradients, tinted headers.
- Apply pending canonical migrations if still not applied; `/inventory/normalize` backfill.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 22) — Grocery qty/unit divider "·"

**Shipped**
- Home shopping widget (`components/home/shopping-widget.tsx`) + grocery page item rows (`components/grocery/grocery-view.tsx`): quantity and unit now render as `2 · lb` (was `2 lb` — template string gained ` · `). No unit → bare quantity, no dangling bullet. Matches the grocery add-search dropdown's existing ` · {unit}` convention (`grocery-view.tsx:637-638`).

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = 16 pre-existing problems, none in touched files.

**Open — Next Session**
- Apply pending canonical migrations if still not applied (`20261012120000_canonical_ingredients.sql` → `20261012130000_canonical_reviewed.sql`).
- Post-deploy: `/inventory/normalize` → Run backfill → fix "Beef broth" / "Cream Cheese" rows.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 21) — Search results: drop emoji tiles, canonical info icon

**Shipped**
- New `components/canonical-info.tsx` — view-only client component `CanonicalInfo({ name })`: `Info` trigger (same `h-3.5 w-3.5` muted styling as the inventory card) + popover with plain-text "Matches recipes as" label + name. No edit — the inventory card keeps its own view+pencil popover.
- `app/(app)/search/page.tsx` — all four result sections are now text-only rows (the "pictures" were the `size-10` emoji/gradient tiles from `lib/tiles`; the app has no real images):
  - **In your pantry** + **Items (not in pantry)**: tiles removed, `as {canonicalName}` text line replaced by `<CanonicalInfo>` after the name. Whole-card `<Link>` couldn't hold a popover trigger (nested-interactive), so cards use the stretched-link pattern: `li` is the card (`relative rounded-xl border bg-card p-3`), name `Link` gets `after:absolute after:inset-0 after:content-['']`, icon sits in a `relative z-10` span above the overlay. Whole card stays clickable.
  - **Recipes**: tile removed; card stays a plain whole-card `Link` (no canonical concept).
  - **On your shopping list**: card's `ShoppingCart` icon removed (section-header cart icon stays); plain whole-card `Link`.
- Dropped the now-unused `foodEmoji`/`tileGradient` import; `cn` kept (checked line-through), `ShoppingCart` kept (section header).
- **Pantry card meta line** (`In your pantry`): quantity now `font-bold` and separated from the unit by a `gap-x-1.5` baseline-aligned flex row (was a single space in regular-weight text). **Gotcha:** `globals.css` sets `body { font-weight: 600 }` app-wide, so the meta line already renders at 600 — `font-medium` (500) read as thinner and `font-semibold` (600) was a literal no-op; only `font-bold` (700) makes the quantity stand out.

**Gotchas**
- Grocery cards get no info icon — the grocery query selects no `item_id`/canonical data (deferred; would need a join).
- Stretched-link cards (`after:inset-0` overlay) only used on the two item sections where the icon must sit inline; recipe/grocery sections keep the simple Link-card.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = 16 pre-existing problems, none in touched files; `npm run build` passes.

**Open — Next Session**
- Apply pending canonical migrations if still not applied (`20261012120000_canonical_ingredients.sql` → `20261012130000_canonical_reviewed.sql`).
- Post-deploy: `/inventory/normalize` → Run backfill → fix "Beef broth" / "Cream Cheese" rows.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 20) — Inventory card icons: info beside name, view/edit split

**Shipped** (`components/inventory/inventory-view.tsx`, `InventoryItemCard`)
- **Info icon moved next to the item name**: header row restructured — name `<Link>` + Info popover now share a `flex min-w-0 flex-1` group on the left (Link dropped `flex-1`, kept `min-w-0` so the name still truncates); low icon + qty cluster stay on the right. Popover trigger remains a sibling of the Link, never nested inside it.
- **Info popover is view + explicit edit**: replaced the readOnly `Input` (looked editable) with plain text — "Matches recipes as" label (`text-xs text-muted-foreground`) + name (`text-sm font-medium`) — and a ghost pencil `Button` (`icon-sm`, aria "Edit match for X") that swaps in the editor. Popover is now controlled (`open`/`onOpenChange`); closing resets edit mode + draft.
- **Card-level canonical edit**: editor = `Input` (autofocus, prefilled with the current canonical name, per-card datalist id `canonical-options-${item.id}`) + Save/Cancel → `setItemCanonical(item.id, draft.trim() || null)` (busy-guarded; empty = clear). Success toast "Matches recipes as X" / "Match cleared" → close popover → `router.refresh()` (server refreshes the `canonicalNames` map). Candidates via `listCanonicalCandidates()` loaded once per card, lazily on first pencil click (recipe names mapped to `{id: recipe:<name>, categoryId: null, canonicalItemId: null}` like `normalize-review.tsx`).
- **Running-low popover is view-only**: readOnly `Input` replaced with plain text "Running low" + muted hint "Toggle from the item menu or detail page." No buttons.

**Gotchas**
- No Undo on card-level canonical edits (detail page keeps Clear match + Undo); clearing from the card unmounts the Info icon on refresh since `canonicalName` becomes null.
- Unmapped items still show no Info icon (unchanged) — setting a first match stays a detail-page/normalize-review job.
- Lint baseline has grown since the "4 pre-existing problems" note: part 19's `quick-bites-widget.tsx` (conditional `useMemo`s ×4, missing/unnecessary deps) + `home/page.tsx` (`any` ×3, unused `RecipeRow`) + `home-view.tsx` unused import — 16 problems total, none in `inventory-view.tsx`.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = 16 pre-existing problems, none in the touched file; `npm run build` passes.

**Open — Next Session**
- Apply pending canonical migrations if still not applied (`20261012120000_canonical_ingredients.sql` → `20261012130000_canonical_reviewed.sql`).
- Post-deploy: `/inventory/normalize` → Run backfill → fix "Beef broth" / "Cream Cheese" rows.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 19) — Quick Bites widget, batch row redesign, inventory view icons

**Shipped**

- **Quick Bites widget** (`components/home/quick-bites-widget.tsx`): New home dashboard widget filtering recipes tagged "quick bites" (case-insensitive), checks ingredient availability via `rootOf`/`toOunces`/`parseQuantityText` (same pattern as recipes page), renders 2-col cards with time pills. Added to `home-view.tsx` grid (order: Snacks → Quick Bites → Pantry Insights). `app/(app)/home/page.tsx` now fetches `recipe_ingredients` and flattens for widget.
- **Batch row redesign** in `components/inventory/detail-form.tsx` (lines ~668-716): Collapsed to single line `[PANTRY] [EXP 12D AGO] [1] - [1LB] [Edit]`. Shortened "Expired"→"Exp" via new `short` prop on `formatExpiry` (`lib/expiry.ts`) and `ExpiryChip` (`components/expiry-chip.tsx`) — only used in batch rows. Removed redundant freezer quality-date plain-text span + unused `formatFreezerQuality` import.
- **Inventory view icons** in `components/inventory/inventory-view.tsx`:
  - Note icon (`Info` from lucide) after item name — click opens Popover with read-only Input showing `canonicalName` ("Matches recipes as X")
  - Running low icon (`TriangleAlert`) — click opens Popover with read-only "Running low" text
  - Both use `render` prop pattern (matching existing `DropdownMenuTrigger`) since `@base-ui/react` primitives don't support `asChild`
  - Removed redundant "as {canonicalName}" line below chips
  - Icons styled `h-3.5 w-3.5 shrink-0` with `gap-1.5` spacing, matching existing visual language

**Gotchas**
- `@base-ui/react` PopoverTrigger/TooltipTrigger don't support `asChild` — must use `render={<Component />}` instead
- `short` prop on ExpiryChip only used in batch rows (detail-form); main expiry chips elsewhere unchanged
- Quick Bites widget doesn't auto-deduct inventory; SnackWidget unchanged
- `recipe_ingredients` added to home page select; flattened `recipeIngredients` passed to widget

**Verify**
- `npx tsc --noEmit` clean
- `npm run build` passes

**Open — Next Session**
- Apply any pending migrations if needed
- [Any follow-ups from user feedback on icons/widget]

## 2026-10-10 (part 18) — Canonical: rename promotes instead of erroring, own-name clear, longer-candidate skip, Clear match + Undo

**Shipped** (driven by user hitting the part-17 guard: *'An item named "Beef broth" already matches as this ingredient'*)
- Root causes found in code: ① `Beef broth → Beef` came from a review-row misclick (leftover `broth` rates weak → suggestion buttons had no undo); ② `Cream Cheese → Cream Cheese 2 Pack` was **backfill auto-map** — `MEASURE_RE` strips "2 pack", so both names clean to `cream cheese` → rating `exact` → `high` → applied; nothing prevented a longer-named variant from capturing a shorter product. Both errors fired because the viewed item *is* named the desired target and sits **inside** the tree being renamed.
- `renameCanonicalRoot` (inventory/actions.ts): the `targetId === root.id` error guard is gone. In-tree conflict now **promotes**: `existing.canonical := null` (promote first, so the repoint below can't self-reference), then `canonical = root.id → existing.id` (everyone follows the new generic), return `{id: existing, name, merged: true}`. Nothing deleted; old root lingers unmapped (same as the existing unrelated-name merge). Unrelated-name merge path unchanged.
- `detail-form.tsx` `commitRename`: result equal to `item.id` → local `canonical = null` (own identity, suffix "(its own name)"); toast branches: cleared → "Match cleared", target id changed → "Matches recipes as X", same id → "Renamed to X".
- `setItemCanonical`: **own-name pre-check** — `select id … .eq(id, itemId).ilike(name, typed)` before `resolveCanonicalRoot`; found → clear. Fixes "typing its own name re-maps because resolve chain-follows to the differently-named root" (its own name + erase-input both clear now).
- `lib/canonical.ts` `matchCanonical`: skips any candidate whose **raw word count** exceeds the product's (`rawWordCount` helper) — never matched, never suggested. Longer product → shorter generic still works (`Cream Cheese 2 Pack` → `Cream Cheese`), which is the correct direction and what backfill now does.
- `detail-form.tsx` match row: new **"Clear match"** ghost button next to Rename (mapped only) → `setItemCanonical(id, null)`, toast **"Match cleared" + Undo** (8s → restores previous generic by name). `commitCanonical` (mapping change) gained the same Undo; all writes funnel through new `writeCanonical(name|null)` (busy-guarded, adopts result into local state) + `undoCanonicalChange(previous|null)`. Rename toast stays without Undo (rename-back can collide with the old row; Clear covers it).
- Review page unchanged (user chose detail-page undo over a review toast).

**Gotchas**
- Promote path only nulls `existing`'s direct parent and moves direct `root.id` pointers — chains are never created by app writes (invariant), legacy chains still resolve on read.
- After promoting, the old root ("Beef"/"Cream Cheese 2 Pack") remains as an independent item; with the raw-word skip it will not re-capture the shorter product, and once the promoted item has children it's skipped by backfill entirely.
- `merged` is still returned by `renameCanonicalRoot` but the UI now derives messages from target-id changes instead.
- A long-running `next dev` (started before the changes, with `next build` writing the same `.next`) kept serving stale UI until restarted — if new component code doesn't appear, restart the dev server and hard-refresh.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = only the 4 pre-existing problems; `npm run build` passes.
- Manual: ① detail on "Beef broth" (mapped to Beef) → Rename → "Beef broth" → no error, row ends "(its own name)", any other products that matched `Beef` now match as `Beef broth`; ② "Cream Cheese" → Clear match → "(its own name)" + Undo restores; ③ type the item's own name into the match editor → clears; erase + Save → clears; ④ Run backfill → `Cream Cheese` not re-mapped to the 2-pack; 2-pack (if in scope) maps *down* to `Cream Cheese`; ⑤ raw-longer candidates never appear in suggestions/datalist pool matches; ⑥ mapping change toast → Undo restores previous.

**Open — next session**
- Parts 16–18 shipped as **`baca76c`** (pushed; Vercel auto-deploys). Part 18 itself is code-only — no new migration.
- **Apply both canonical migrations manually before the deploy serves traffic**: `20261012120000_canonical_ingredients.sql` (if not yet) then `20261012130000_canonical_reviewed.sql` — the code selects/inserts those columns and breaks without them.
- Post-deploy checklist: `/inventory/normalize` → Run backfill → fix the "Beef broth" / "Cream Cheese" rows via **Clear match** or **Rename** → scan inventory `as …` subtitles for other backfill-era wrong pairs.
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 17) — Canonical: keep-as-is, generic rename, card visibility



**Shipped** (follow-up to part 16, driven by user Q&A: "can I leave rows alone? does capitalization matter?")
- Migration `supabase/migrations/20261012130000_canonical_reviewed.sql` — **run manually alongside the part 16 migration if not yet applied**: `items.canonical_reviewed boolean not null default false` (non-destructive). Means "user saw this in the review queue and chose its own identity".
- **Keep as its own name** (closes the gap where an unmapped barcode item like "Chicken Noodle Soup" could never leave the review list — typing its own name counts as *clearing* a mapping and the row came right back):
  - `keepCanonicalAsIs(itemId, keep: boolean)` in `inventory/actions.ts` — flips only the flag (bool so undo = `false`), returns "Item not found" on miss, revalidates /inventory + /inventory/normalize.
  - `planCanonical` skips `canonicalReviewed` items right after mapped/target checks → counted `alreadyGeneric`, never listed, never auto-mapped by a future backfill run (select gains `canonical_reviewed`, `ItemSeed.canonicalReviewed`).
  - `normalize-review.tsx`: per-row quiet **"Keep as its own name"** button → row leaves locally (counts shift via shared `shiftCounts`), toast with **Undo** (flag off + row re-appended, dedup-guarded); footer copy updated.
  - Detail suffix: `(its own name)` → `(kept as its own name)` when the flag is set (`detail-form.tsx`, reads `item.canonical_reviewed`).
- **Rename the generic itself** (`renameCanonicalRoot(canonicalId, newName)` in `inventory/actions.ts`, + `createRootLookup` import): follows chain to the true root; **exact-string** no-op check (so case-only fixes "chicken noodle soup" → "Chicken Noodle Soup" work — unique index is on `lower(name)`, same lower = no conflict); `update name` → on `23505`/duplicate-key **merge instead**: find existing by lower-equality in JS, resolve it to its root, repoint `canonical_item_id = root.id` holders to that root, old row goes empty; guard `targetId === root.id` (name held by an item already inside this tree → clear error, no destructive delete); returns `{id, name, merged}`, revalidates /inventory + /inventory/normalize. UI: pencil **Rename** button on the detail "Matches recipes as" row (only when mapped) → inline input prefilled with the target's name → local state adopts returned `{id,name}` (id changes on merge) + `item.canonical_item_id` updated; toast "Renamed to …" / "Merged into …".
- **Generic visible on cards**: `buildCanonicalNameMap(rows)` in `lib/canonical.ts` (wraps `createRootLookup`) → `Record<itemId, rootName>` with entries only for mapped non-root items. Inventory page (`items select id,name,canonical_item_id` added to its Promise.all) and search page (5th query, full map — root may not match the needle) pass it down. `InventoryView` new `canonicalNames` prop → `InventoryItemCard` renders `as Ground Beef` (`text-xs text-muted-foreground`) between the name row and chips; search pantry cards + "Items (not in pantry)" cards render the same line after qty/barcode line. Unmapped cards and roots show nothing.
- Detail row also gained the Rename control next to the identity-edit name button (two separate concerns: *which* generic = click the name; *what it's called* = Rename).

**Gotchas**
- Capitalization never affects matching or dedupe — matcher lowercases both sides, lookups use `toLowerCase()`/`ilike`, uniqueness is `unique (household_id, lower(name))` → **first spelling stored wins visually**; two case-variants of the same name can never coexist (later scan reuses the existing row, keeping its stored spelling).
- Reviewed flag is left untouched by `setItemCanonical`: mapping a reviewed item is fine (suffix hidden while mapped); clearing its mapping later keeps it out of the queue (clearing = "settled on its own name").
- Merge path repoints only **direct** `canonical_item_id = root.id` pointers (app invariant stores roots; legacy chains resolve on read).
- Empty old root rows linger after a merge — harmless catalog entries; same as the "Other…" re-map behavior from part 16.
- Review rows re-append at list end after Undo (plan order otherwise name-sorted) — cosmetic only.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = only the 4 pre-existing problems; `npm run build` passes.
- Manual: ① review row → Keep → gone after reload, counted under Already generic, survives backfill re-run; Undo restores row + counts; ② detail shows "(kept as its own name)" for that item; ③ rename case-only on a stockless canonical → persists, still matches; ④ rename to an existing name → merges (siblings follow, toast "Merged into …", no chains); ⑤ rename to a name held by an item inside the same tree → clear error; ⑥ mapped inventory card shows `as Ground Beef`, unmapped/root cards show nothing; search shows the same.

**Open — next session**
- **Apply both migrations** (`20261012120000_canonical_ingredients.sql` if not yet, + `20261012130000_canonical_reviewed.sql`) before deploying this code.
- Nothing committed yet this session (sessions.md is kept local per its header).
- Android PWA scan debug overlay readings (part 9 still open).

## 2026-10-10 (part 16) — Canonical ingredient normalization

**Shipped**
- Migration `supabase/migrations/20261012120000_canonical_ingredients.sql` — **must be run manually BEFORE deploying this code**: `items.canonical_item_id uuid references items(id) on delete set null`, `items.brand text`, index `items_canonical_idx`. Zero data migration — matching key = `coalesce(canonical_item_id, id)`, so unmapped items behave exactly as before (idempotent by construction).
- Identity model (decided with user): the generic catalog item **is** the canonical record (self-FK on `items`, no separate table, no duplicated name to drift). App always stores the **root** (never chains): every write follows chains to the root, and changing a canonical repoints existing children to the new root (`setItemCanonical`, backfill). Deleting a canonical reverts products to self via `set null`.
- `lib/canonical.ts` (new, pure): `brandTokenList` (splits "Great Value, Kraft"), `cleanTokens` (lowercase → strip parens/hyphens → pack/measure regex `12 oz`/`2 ct`/`x4` → punct → curated STOPWORDS marketing set `100/organic/grass/fed/pasture/raised/free/range/non/gmo/premium/reserve/family/size/value/bulk/artisan/everyday` → brand tokens), `matchCanonical(name, candidates, {brandTokens, categoryId})` → `high | suggested | ambiguous | none` + best-first candidates. Auto (`high`) only on exact-equality-after-cleanup or strict token containment where **every** leftover ∈ stopwords/brand, unique candidate, categories compatible, target is a root (`canonicalSafe`). DISTINCTIVE set (breast/thigh/salted/unsalted/sweetened/vanilla/dairy/oat/soy/ground/smoked…) in leftover always demotes to review; `salted/unsalted` strippable only when ≤1 token remains ("salted butter"→"butter"); products never match a longer candidate. Candidates skip same-name (self). `createRootLookup` (cycle-safe memoized).
- `lib/canonical-db.ts` (new, server-only): `resolveCanonicalRoot` — find-or-create generic item by name (wildcards stripped, chain-following, unique-race re-lookup), returns `{id, name, created}`.
- Scan/add (`addToInventory` + `add-form.tsx`): schema gains `canonicalName` + `brand` (both slice-capped at 160). Form loads candidate pool once (`listCanonicalCandidates` = items + recipe-ingredient names not colliding), computes `matchCanonical` live (brand tokens from OFF), shows **"Matches recipes as"** input with datalist: `high`/`suggested` prefill (auto until user edits — `canonicalTouchedRef` resets on name change), `ambiguous` no prefill + lists candidates in hint, `none` optional. Server resolve-or-creates root; stored **only when currently null** (never overwrites a confirmed mapping); brand stored on insert/first patch only. Repeat scans reuse the saved mapping (no recompute).
- Detail (`detail-form.tsx` + `[id]/page.tsx`): page fetches `canonicalItem {id,name}`; header row **"Matches recipes as: X"** (own name + "(its own name)" when unmapped), click → inline input + datalist (lazy `listCanonicalCandidates`) + Save/Cancel → `setItemCanonical(itemId, name|null)` (self-name/empty = clear; repoints children; toast). Brand shown next to barcode in the Quantity subtitle.
- Matching surfaces → root keys (qty logic `toOunces`/`stockPoolKey` untouched — only keys change): `recipes/page.tsx` + `recipes/[id]/page.tsx` (stock, `nameToItemId` values, `itemIdsByRecipe`, ingredient `item_id→rootOf`); `recipe-editor.tsx` new `itemRoots` prop + `matchingKey(raw, name)` used by coverage, per-row have/✓ and `handleAddMissing` — **also fixes the pre-existing bug where null-`item_id` ingredients were silently skipped** by "Add only the missing ones"; `recipes/actions.ts` `linkIngredientItems` now stores roots (select + `createRootLookup`), `addRecipeToGrocery` resolves root from `item_id` or cleaned name → grocery dedupe merges product+generic lines.
- `plan/actions.ts` `planWeekToGrocery`: stock + held pools keyed `stockPoolKey(root, u)`; ingredient resolves `item_id→root` or name→root (unresolved → grocery line with null item); holds stored under root. `markMealMade`: FEFO consumption expands root hold → `.in("item_id", groupIds)` across every item in the canonical group (legacy product-keyed holds resolve the same way); hold release stays row-deletes.
- Grocery: page catalog select adds `canonical_item_id`; `grocery-view.tsx` `rootOf` memo (inventory items + catalog), stockByItem + onListSet root-keyed, search dropdown "×N in pantry"/"on list" + `quickAdd` push root; `add-sheet.tsx` pantry pick links `canonical ?? id`. Aisle memory (`item_store_aisles`) keys grocery-row ids on both sides — self-consistent per generation, no change.
- Home `smart-actions.tsx` low card: "already on list" now compares roots both sides (was raw id vs grocery root → would re-suggest listed items).
- Backfill + review: `app/(app)/inventory/normalize/actions.ts` shared `planCanonical(supabase, householdId, userId, apply)` — scope = items referenced by inventory; skips settled (already mapped / canonical target); per item runs `matchCanonical` against live pool (canonicalSafe recomputed via `canonicalNow` map); `high` → apply writes CAS `.is("canonical_item_id", null)` + child repoint (chains impossible), virtual recipe-name targets create the generic row; dry run counts `readyToMatch`. Buckets: `inScope/autoMatched/readyToMatch/alreadyGeneric/needsReview/createdRoots`. Review rows = `suggested`/`ambiguous`/`none`-with-barcode. `getCanonicalReview` (read-only page load) + `runCanonicalBackfill` (idempotent, revalidates /inventory /recipes /grocery /plan).
- `/inventory/normalize` page + `components/inventory/normalize-review.tsx`: stat cards (Ready to auto-match / Already generic / Needs review / In your pantry), **Run backfill (N)** button → toast summary, per-row suggestion buttons (✓ accept → `setItemCanonical`) + "Other…" datalist free-text (creates or picks), empty state, back link. Settings → new "Ingredient matching" section links it.

**Gotchas**
- Migration must land before deploy (columns missing otherwise).
- Backfill is user-triggered from `/inventory/normalize` ("Run backfill") — not automatic, not SQL (spec decision: shared TS matcher, explicit press, re-run = no-op).
- No OFF enrichment during backfill (spec decision) — unknown-brand products land in review; `brand` fills in on future scans; matcher without brand tokens only auto-matches cleanup-exact/stoplist leftovers.
- Products with barcodes can be canonical targets only as roots; mapping is name-containment-based so brand-included candidates never steal matches. `ambiguous` never auto-applies.
- Order dependence in backfill: pool canonicalSafe is recomputed per item, so a generic item that itself maps first is excluded as a target for later items (safe, may push a would-be auto into review — re-run after resolving).
- Grocery/planner rows created by legacy code may hold raw product ids until touched; reads tolerate mixed generations (`rootOf` falls back to id).
- `item_store_aisles` memory: old rows keyed raw ids, new rows root ids — per-row self-consistent, may forget a remembered aisle once per item generation.
- `recipe_ingredients.item_id` now points at roots for newly saved recipes; existing product-id rows are resolved at read time (no data migration needed).
- Stoplist/DISTINCTIVE live in `lib/canonical.ts` — tuning happens there; invariant: no distinctive token may ever enter STOPWORDS.

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = only the 4 pre-existing problems; `npm run build` passes (`/inventory/normalize` routed).
- Manual checklist (spec §8 mapped): ① scan "100% Grass Fed Ground Beef" with generic "Ground Beef" present → Matches-as prefilled, saves mapping, name/barcode kept; detail shows "Matches recipes as: Ground Beef"; ② ambiguous product (two candidates) → no prefill, hint lists candidates, stays unmapped until confirmed; unknown-brand yogurt → suggestion only, not auto; ③ recipe availability + ✓/missing counts + "Add only the missing ones" treat two products under one canonical as one pool; quantity partial shortfall unchanged (oz math); ④ scan same barcode again → mapping reused, no recompute; ⑤ `/inventory/normalize` → Run backfill → summary counts, second run = 0 auto-matched; re-run after manual confirm doesn't overwrite; ⑥ accept suggestion on review row updates detail + recipes; ⑦ plan "Shop this week" pools by canonical, `markMealMade` FEFO-decrements across the group, holds release as before; ⑧ grocery "×N in pantry" aggregates group; recipe push + pantry pick dedupe to one line; ⑨ delete generic item (if reachable) → products revert to own identity; ⑩ already-generic items (no barcode, no candidates) count as already generic, not review.

**Open — next session**
- **Apply migration `20261012120000_canonical_ingredients.sql`** before deploying, then open `/inventory/normalize` → Run backfill (counts land in the toast + stat cards).
- Android PWA scan debug overlay readings (part 9 still open).
- Tests skipped per user decision — spec §8 covered by the manual checklist above instead.
- Optional: OFF brand enrichment pass for barcode items (deferred by decision); add-form min qty → 1.

## 2026-10-10 (part 15) — Per-batch expiration tracking (one card per item)

**Shipped**
- Migration `supabase/migrations/20261011120000_batch_tracking.sql` — **must be run manually BEFORE deploying this code** (SQL Editor / `supabase db push`): drops `inventory_household_item_location_key`, creates unique index `inventory_batch_key (household_id, item_id, location, coalesce(expiration_date, '0001-01-01'), coalesce(frozen_at, '0001-01-01'), coalesce(freezer_duration_months, -1))`. Zero data migration — existing rows become each item's initial batch. Batch identity = item + location + expiration date + freezing history; identical batches always merge.
- `lib/types.ts`: `InventoryRow.created_at` (FEFO tiebreak).
- `lib/batches.ts` (new): `compareFefo`/`fefoSort` (effective date asc → undated last → created_at), `scopedBatches`, `earliestEffective`, `distinctEffectiveDates`/`multiDate` (effective dates only, undated excluded), `isItemLow` (total ≤ threshold **OR** any `is_low` flag), `groupByItem` → `ItemGroup { item, batches(FEFO), totalQuantity, locationTotals, locations, low }`, `anyBatchUrgent`, `pickFefoBatch`, `BatchSnapshot`/`toBatchSnapshot` (undo payloads).
- `actions.ts`: `addToInventory` matches a batch only on `expiration_date` equal **and** `frozen_at === null && freezer_duration_months === null` (add sends no freeze fields) else inserts a new row; insert `23505` → re-select + merge (same pattern as name race). `updateInventory` gained `resultingFreezeColumns(current, input, targetLocation)` (thaw nulls on leaving freezer; recomputed from input when `frozenAt`/months touched, never chained); move branch loads **all** target-location rows and matches the resulting key, `23505` → merge fallback; non-move date/months/`23505` → merge into sibling (early-return sibling row); final reload fallback got `.limit(1)` before `maybeSingle`. `consumeInventory` result gains `inventoryId`. New `consumeFromItem({itemId, amount, addToGrocery, location?})` — FEFO decrement/delete loop over scoped batches, returns `affected[] + snapshots + remaining + item-level low`, handles consume/auto-restock grocery adds. New `restoreBatches({snapshots})` — undo: insert by original id (else top up surviving row; `23505` → merge quantity).
- `plan/actions.ts` FEFO hold release: batch hitting 0 is **deleted** (was left as a 0-qty ghost).
- `consume-dialog.tsx`: item-level — props `{item, totalQuantity, scope: Location|"all", mode}`; calls `consumeFromItem`, undo via `restoreBatches`, `onConsumed(remaining, data)` carries `affected` for the detail mirror.
- `batch-dialog.tsx` (new): add/edit one batch (qty stepper, date + `+7d`, 3 location buttons, remove-with-undo). Selecting Freezer (or "Edit freezer details" on a frozen batch) hands off to the existing `FreezeDialog`; add-with-freezer inserts the row first (untracked-freezer state) then opens FreezeDialog — cancelling leaves it untracked by design. Merges surface as "Merged into an existing X batch".
- `detail-form.tsx`: now `{item, entries, subcategories}` (item-level). Header = location badges + earliest ExpiryChip + "Multiple dates" chip + low; total section (barcode, batch count, FEFO −/+ with undo); **Batches section always visible** (list w/ LocationBadge, qty, chip, freezer quality line, Edit → BatchDialog, "+ Add batch") — single batch stays compact; location/expiry/freezer editing moved out of the main form entirely; details/subcat/threshold/auto-restock patch via the first batch as anchor; item-level low toggle loops all batches; header trash + "Use the last" remove/restore **all** batches (undo = `restoreBatches`). Local entries mirror updated from action results (no prop-sync effect — lint).
- `[id]/page.tsx`: resolves **item id first** (fetches all batches), falls back to inventory-row id → `redirect(/inventory/{item_id})` — also fixes the latent barcode deep-link bug (`inventory-view` pushes `/inventory/{item.id}`). 0 batches → redirect `/inventory`.
- `inventory-view.tsx`: `groupByItem` — one card per item; header/tab counts = items; qty = grand total (All) / location subtotal (tab); chips + "Multiple dates" scoped to tab; card href → item id; −1/+1 scoped FEFO (`consumeFromItem` / +1 to soonest-expiring dated batch in scope); menu: consume dialogs (scope=tab), grocery (any batch), item-level low toggle (all batches), Remove = all batches w/ undo; filters (query/sub/use-soon/low) applied at group level, sorted by scoped earliest effective.
- Grouped surfaces: `smart-actions` (🥀/🥑/❄️ pick one representative batch per item — refrigerated ref batch for 🥀/🥑, earliest-quality frozen batch for ❄️, never labels freezer "expired"; low card uses `group.low` + total), `pantry-insights` (one bucket per item, priority expiring > low > all-frozen > fresh), `stock-row` (props now `{group}`, href → item id, locations badges), `pantry-preview` (groups; location filter + sort scoped), `snack-widget` (groups), `search/page.tsx` (one pantry card per item w/ total + locations — fixes duplicate cards per batch), `grocery/add-sheet.tsx` picker dedupes by item (`groupByItem`).

**Gotchas**
- Two migrations pending — **batch migration must land before this code deploys** (with the old per-location unique constraint, adding a second batch would error).
- Same-key batches always merge on add (no way to keep two identical-date batches); to "split", edit one row's date first. No batch history/archive — removes are gone after the 8s undo toast.
- "Multiple dates" = distinct **effective** dates (frozen = quality date; undated batches don't count).
- `is_low` is still stored per row but every UI toggle flips all batches together; item low = threshold breached **or** any flag.
- Detail/local mirrors: batch-dialog/FreezeDialog upsert the row returned by the action (`replacedId` handles merges changing the id); after a merge the old row id disappears from local state.
- Item-level patches (name/unit/threshold/auto-restock/subcat) anchor on the first batch row; they never touch batch fields.
- `restoreBatches` caps 60 snapshots/call — plenty (items hold a handful of batches).
- Plan hold release now deletes empty batches (FEFO order still by `expiration_date` only — frozen quality dates not considered there; pre-existing).

**Verify**
- `npx tsc --noEmit` clean; `npm run lint` = only the 4 pre-existing problems (settings-view setState-in-effect, smart-actions "Don't add" + exhaustive-deps, scanner `setDebugOn`); `npm run build` passes.
- Manual checklist: ① list shows one card per item, totals across locations, location badges, "Multiple dates" chip, tab counts = items; ② location tab scopes qty/chips and −1/+1; ③ −1 undo restores a deleted batch (same id); at qty 1 → confirm; "Used the last one" via dialog; ④ detail opens by item id, old row-id links redirect; batches add/edit/move/merge/remove w/ undo; ⑤ add batch → Freezer → FreezeDialog; cancel leaves untracked freezer; thaw by moving out (quality fields cleared); ⑥ consume dialog FEFO across batches + grocery checkbox + auto-restock; ⑦ home smart-actions/insights/preview/snacks/search/add-sheet grouped, no duplicate cards; ⑧ plan hold release deletes emptied batches; ⑨ low flag toggles all batches.

**Open — next session**
- **Apply both migrations** (`20261010120000_freezer_tracking.sql`, `20261011120000_batch_tracking.sql`) before deploying.
- Android PWA scan debug overlay readings (part 9 still open).
- Tests skipped per user decision — spec §9 remains a documented gap.
- Optional: filter 0-qty from recipes/search pantry checks; tighten add-form min qty to 1.

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
