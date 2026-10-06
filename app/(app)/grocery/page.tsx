import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { GroceryView } from "@/components/grocery/grocery-view";
import type {
  CategoryRow,
  GroceryItemRow,
  HouseholdSettingsRow,
  InventoryEntry,
  RecipeRow,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

export const metadata = { title: "Grocery list" };

type RecipeWithIngredients = RecipeRow & {
  recipe_ingredients: {
    id: string;
    item_id: string | null;
    name: string;
    quantity_text: string;
    optional: boolean;
  }[];
};

function GrocerySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function GroceryContent() {
  const { supabase, householdId } = await requireDal();

  const [
    groceryResult,
    storesResult,
    aislesResult,
    assignmentsResult,
    categoriesResult,
    settingsResult,
    inventoryResult,
    recipesResult,
  ] = await Promise.all([
    supabase
      .from("grocery_items")
      .select(
        "*, item:items(id, name, category_id, unit, barcode, default_location)",
      )
      .eq("household_id", householdId),
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
      .from("categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("household_settings")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("inventory")
      .select("*, item:items!inner(*)")
      .eq("household_id", householdId),
    supabase
      .from("recipes")
      .select(
        "id, household_id, name, description, prep_time, cook_time, time, yields, source, tags, recipe_ingredients(id, item_id, name, quantity_text, optional)",
      )
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
  ]);

  const items = (groceryResult.data ?? []) as unknown as (GroceryItemRow & {
    item: {
      id: string;
      name: string;
      category_id: string | null;
      unit: string | null;
      barcode: string | null;
      default_location: string;
    } | null;
  })[];
  const stores = (storesResult.data ?? []) as StoreRow[];
  const aisles = (aislesResult.data ?? []) as StoreAisleRow[];
  const assignments = (assignmentsResult.data ?? []) as {
    grocery_item_id: string;
    store_id: string;
    aisle_id: string;
  }[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const settings = (settingsResult.data ?? null) as HouseholdSettingsRow | null;
  const inventory = (inventoryResult.data ?? []) as unknown as InventoryEntry[];
  const recipes = (recipesResult.data ?? []) as unknown as RecipeWithIngredients[];

  return (
    <GroceryView
      initialItems={items}
      stores={stores}
      aisles={aisles}
      assignments={assignments}
      categories={categories}
      settings={
        settings ?? {
          household_id: householdId,
          selected_store_id: null,
          grocery_view_mode: "aisle",
          default_location: "pantry",
        }
      }
      inventory={inventory}
      recipes={recipes}
    />
  );
}

export default function GroceryPage() {
  return (
    <Suspense fallback={<GrocerySkeleton />}>
      <GroceryContent />
    </Suspense>
  );
}
