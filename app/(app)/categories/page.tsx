import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoriesView } from "@/components/categories/categories-view";
import type { CategoryRow, StoreAisleRow, StoreRow } from "@/lib/types";

export const metadata = { title: "Categories" };

function CategoriesSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

async function CategoriesContent() {
  const { supabase, householdId } = await requireDal();

  const [categoriesResult, storesResult, aislesResult] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
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
  ]);

  return (
    <CategoriesView
      categories={(categoriesResult.data ?? []) as CategoryRow[]}
      stores={(storesResult.data ?? []) as StoreRow[]}
      aisles={(aislesResult.data ?? []) as StoreAisleRow[]}
    />
  );
}

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/settings" />}
          aria-label="Back to settings"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-lg font-extrabold">Categories</h1>
          <p className="text-xs text-muted-foreground">
            Drag the ⠿ handle (or use ↑↓) to reorder item categories. Expand
            a store to see its aisles.
          </p>
        </div>
      </div>
      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}
