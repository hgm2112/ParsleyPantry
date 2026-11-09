import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeView } from "@/components/home/home-view";
import type { HomeMeal } from "@/lib/types";
import { resolveDashboardOrder } from "@/lib/dashboard-order";
import type { ShoppingPreviewItem } from "@/components/home/shopping-widget";
import type {
  CategoryRow,
  HouseholdSettingsRow,
  InventoryEntry,
  LeftoverRow,
  CustomMealRow,
  NewToTryEntry,
  RecipeRow,
  StoreAisleRow,
  StoreRow,
  SubcategoryRow,
} from "@/lib/types";

export const metadata = { title: "Home" };

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="rounded-2xl h-60 lg:h-[26rem]" />
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <div className="mb-4 break-inside-avoid">
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

async function HomeContent() {
  const { supabase, householdId } = await requireDal();

  const [
    mealsResult,
    inventoryResult,
    categoriesResult,
    groceryResult,
    storesResult,
    aislesResult,
    assignmentsResult,
    rememberedResult,
    settingsResult,
    recipesResult,
    subsResult,
    itemStoresResult,
    leftoversResult,
    newToTryResult,
  ] = await Promise.all([
    supabase
      .from("meal_plan_days")
      .select("*, recipe:recipes(id, name, time, tags, recipe_type)")
      .eq("household_id", householdId)
      .order("week_start", { ascending: false }),
    supabase
      .from("inventory")
      .select("*, item:items!inner(*)")
      .eq("household_id", householdId)
      .gt("quantity", 0),
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grocery_items")
      .select("id, item_id, name, quantity, unit, checked, sale_only, category_id, source, item:items(id, category_id)")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("stores")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_aisles")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grocery_item_aisles")
      .select("grocery_item_id, store_id, aisle_id")
      .eq("household_id", householdId),
    supabase
      .from("item_store_aisles")
      .select("item_id, store_id, aisle_id")
      .eq("household_id", householdId),
    supabase
      .from("household_settings")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("recipes")
      .select(
        `id, name, time, tags, recipe_type, recipe_ingredients(id, item_id, name, quantity_text, optional, sort_order)`,
      )
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("subcategories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grocery_item_stores")
      .select("grocery_item_id, store_id")
      .eq("household_id", householdId),
    supabase
      .from("leftovers")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
    supabase
      .from("new_to_try")
      .select(
        "recipe_id, created_at, recipe:recipes(id, name, time)",
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
  ]);

  // Unlike the other queries, a failed leftovers fetch must not read as an
  // empty list — null tells the widget to render its error state instead.
  const leftovers = leftoversResult.error
    ? null
    : ((leftoversResult.data ?? []) as LeftoverRow[]);

  const { data: customMealsData, error: customMealsError } = await supabase
    .from("custom_meals")
    .select("id, name, icon, classification")
    .eq("household_id", householdId)
    .order("name", { ascending: true });
  if (customMealsError) {
    throw new Error(customMealsError.message);
  }
  const customMeals = (customMealsData ?? []) as CustomMealRow[];

  const meals = (mealsResult.data ?? []) as unknown as HomeMeal[];
  const pantry = (inventoryResult.data ?? []) as InventoryEntry[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const grocery = (groceryResult.data ?? []) as unknown as ShoppingPreviewItem[];
  const stores = (storesResult.data ?? []) as StoreRow[];
  const aisles = (aislesResult.data ?? []) as StoreAisleRow[];
  const assignments = (assignmentsResult.data ?? []) as {
    grocery_item_id: string;
    store_id: string;
    aisle_id: string;
  }[];
  const rememberedAisles = (rememberedResult.data ?? []) as {
    item_id: string;
    store_id: string;
    aisle_id: string;
  }[];
  const settings = (settingsResult.data ?? null) as HouseholdSettingsRow | null;
  const itemStores = (itemStoresResult.data ?? []) as {
    grocery_item_id: string;
    store_id: string;
  }[];
const recipes = (recipesResult.data ?? []).map(
    (recipe: any) => ({
      id: recipe.id,
      name: recipe.name,
      time: recipe.time,
      tags: recipe.tags,
      hasIngredients: !!(recipe.recipe_ingredients?.length ?? 0),
    })
  );

  const recipeTypeById = new Map(
    (recipesResult.data ?? [])
      .map((recipe) => {
        const typed = recipe as { id: string | null; recipe_type: string | null };
        return typed.id ? [typed.id, typed.recipe_type ?? ""] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );

const recipeIngredients = (recipesResult.data ?? [])
  .flatMap((recipe: any) =>
    (recipe.recipe_ingredients ?? []).map((ig: any) => ({
      recipe_id: recipe.id,
      item_id: ig.item_id,
      name: ig.name,
      quantity_text: ig.quantity_text,
      optional: ig.optional ?? false,
    })),
  );

  const newToTry: NewToTryEntry[] = newToTryResult.error
    ? []
    : ((newToTryResult.data ?? []) as unknown as Array<{
        recipe_id: string;
        created_at: string;
        recipe: { id: string; name: string; time: number } | null;
      }>).flatMap((row) =>
        row.recipe
          ? [
              {
                id: row.recipe.id,
                name: row.recipe.name,
                time: row.recipe.time,
                created_at: row.created_at,
              },
            ]
          : [],
      );

  return (
    <HomeView
      meals={meals}
      pantry={pantry}
      categories={categories}
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
      grocery={grocery}
      stores={stores}
      aisles={aisles}
      assignments={assignments}
      rememberedAisles={rememberedAisles}
      itemStores={itemStores}
      settings={settings}
      recipes={recipes}
      customMeals={customMeals}
      recipeTypeById={recipeTypeById}
      recipeIngredients={recipeIngredients}
      leftovers={leftovers}
      newToTry={newToTry}
      initialOrder={resolveDashboardOrder(
        settings?.dashboard_widget_order,
      )}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
