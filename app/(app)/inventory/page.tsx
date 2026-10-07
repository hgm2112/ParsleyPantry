import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { InventoryView } from "@/components/inventory/inventory-view";
import { Skeleton } from "@/components/ui/skeleton";
import { stockPoolKey } from "@/lib/stock";
import type { CategoryRow, InventoryEntry, StockHoldRow } from "@/lib/types";

export const metadata = { title: "Pantry" };

function InventorySkeleton() {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function InventoryContent() {
  const { supabase, householdId } = await requireDal();

  const [inventoryResult, categoriesResult, holdsResult] = await Promise.all([
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
      .from("stock_holds")
      .select("item_id, quantity, unit")
      .eq("household_id", householdId),
  ]);

  const rows = (inventoryResult.data ?? []) as unknown as InventoryEntry[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const holdsByItem: Record<string, number> = {};
  for (const hold of (holdsResult.data ?? []) as Pick<
    StockHoldRow,
    "item_id" | "quantity" | "unit"
  >[]) {
    const key = stockPoolKey(hold.item_id, hold.unit);
    holdsByItem[key] = (holdsByItem[key] ?? 0) + hold.quantity;
  }

  return (
    <InventoryView rows={rows} categories={categories} holdsByItem={holdsByItem} />
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventorySkeleton />}>
      <InventoryContent />
    </Suspense>
  );
}
