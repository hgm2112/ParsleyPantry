import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeView } from "@/components/home/home-view";
import type { HomeMeal } from "@/components/home/week-meals";
import type {
  CategoryRow,
  GroceryItemRow,
  InventoryEntry,
  RecipeRow,
} from "@/lib/types";

export const metadata = { title: "Home" };

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-44 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

type GroceryPreview = Pick<
  GroceryItemRow,
  "id" | "name" | "quantity" | "unit" | "checked" | "category_id"
>;

async function HomeContent() {
  const { supabase, householdId } = await requireDal();

  const [
    mealsResult,
    inventoryResult,
    categoriesResult,
    groceryResult,
    recipesResult,
  ] = await Promise.all([
    supabase
      .from("meal_plan_days")
      .select("*, recipe:recipes(id, name, time, tags)")
      .eq("household_id", householdId)
      .order("week_start", { ascending: false }),
    supabase
      .from("inventory")
      .select("*, item:items!inner(*)")
      .eq("household_id", householdId),
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grocery_items")
      .select("id, name, quantity, unit, checked, category_id")
      .eq("household_id", householdId),
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const meals = (mealsResult.data ?? []) as unknown as HomeMeal[];
  const pantry = (inventoryResult.data ?? []) as InventoryEntry[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const grocery = (groceryResult.data ?? []) as GroceryPreview[];
  const recipes = (recipesResult.data ?? []) as RecipeRow[];

  return (
    <HomeView
      meals={meals}
      pantry={pantry}
      categories={categories}
      grocery={grocery}
      recipes={recipes}
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
