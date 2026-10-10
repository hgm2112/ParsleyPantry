import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeView } from "@/components/home/home-view";
import type { HomeMeal } from "@/lib/types";
import type { ShoppingPreviewItem } from "@/components/home/shopping-widget";
import type {
  CategoryRow,
  HouseholdSettingsRow,
  InventoryEntry,
  RecipeRow,
  StoreAisleRow,
  StoreRow,
  SubcategoryRow,
} from "@/lib/types";

export const metadata = { title: "Home" };

function HomeSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Skeleton className="lg:hidden rounded-2xl h-60" />
      <Skeleton className="hidden rounded-2xl lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:block h-[26rem]" />
      <Skeleton className="rounded-2xl lg:col-start-3 lg:row-start-1 h-96" />
      <div className="space-y-4 lg:col-start-3 lg:row-start-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="rounded-2xl lg:col-start-1 lg:row-start-2 h-96" />
      <Skeleton className="rounded-2xl lg:col-start-2 lg:row-start-2 h-96" />
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
  ] = await Promise.all([
    supabase
      .from("meal_plan_days")
      .select("*, recipe:recipes(id, name, time, tags)")
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
        `id, name, time, tags, recipe_ingredients(id, item_id, name, quantity_text, optional, sort_order)`,
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
  ]);

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
      recipeIngredients={recipeIngredients}
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
