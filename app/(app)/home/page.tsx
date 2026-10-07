import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeView } from "@/components/home/home-view";
import type { HomeMeal } from "@/components/home/week-meals";
import type {
  CategoryRow,
  GroceryItemRow,
  InventoryEntry,
} from "@/lib/types";

export const metadata = { title: "Home" };

function HomeSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Skeleton className="rounded-2xl lg:col-span-2 lg:col-start-1 lg:row-start-1 h-[26rem]" />
      <Skeleton className="rounded-2xl lg:col-start-3 lg:row-start-1 h-40" />
      <Skeleton className="rounded-2xl lg:col-start-1 lg:row-start-2 h-96" />
      <Skeleton className="rounded-2xl lg:col-start-2 lg:row-start-2 h-96" />
      <div className="space-y-4 lg:col-start-3 lg:row-start-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
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
  ]);

  const meals = (mealsResult.data ?? []) as unknown as HomeMeal[];
  const pantry = (inventoryResult.data ?? []) as InventoryEntry[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const grocery = (groceryResult.data ?? []) as GroceryPreview[];

  return (
    <HomeView
      meals={meals}
      pantry={pantry}
      categories={categories}
      grocery={grocery}
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
