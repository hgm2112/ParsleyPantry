import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { InventoryView } from "@/components/inventory/inventory-view";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCanonicalNameMap } from "@/lib/canonical";
import { stockPoolKey } from "@/lib/stock";
import { compareByExpiry } from "@/lib/expiry";
import type { InventoryEntry, StockHoldRow, SubcategoryRow } from "@/lib/types";

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

  const [
    inventoryResult,
    holdsResult,
    subsResult,
    itemsResult,
    groceryResult,
  ] = await Promise.all([
      supabase
        .from("inventory")
        .select("*, item:items!inner(*)")
        .eq("household_id", householdId)
        .gt("quantity", 0),
      supabase
        .from("stock_holds")
        .select("item_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("subcategories")
        .select("*")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
      supabase
        .from("grocery_items")
        .select("item_id")
        .eq("household_id", householdId)
        .eq("checked", false)
        .not("item_id", "is", null),
    ]);

  const rows = ((inventoryResult.data ?? []) as unknown as InventoryEntry[])
    .sort((a, b) =>
      compareByExpiry(
        a.expiration_date,
        a.item.name,
        b.expiration_date,
        b.item.name,
      ),
    );
  const holdsByItem: Record<string, number> = {};
  for (const hold of (holdsResult.data ?? []) as Pick<
    StockHoldRow,
    "item_id" | "quantity" | "unit"
  >[]) {
    const key = stockPoolKey(hold.item_id, hold.unit);
    holdsByItem[key] = (holdsByItem[key] ?? 0) + hold.quantity;
  }

  const canonicalNames = buildCanonicalNameMap(
    (itemsResult.data ?? []) as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    }[],
  );

  // Catalog roots with an unchecked shopping-list line: `item_id` already
  // points at the canonical root, so variants share the indicator.
  const onGroceryIds: Record<string, true> = {};
  for (const row of (groceryResult.data ?? []) as { item_id: string | null }[]) {
    if (row.item_id) onGroceryIds[row.item_id] = true;
  }

  return (
    <InventoryView
      rows={rows}
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
      holdsByItem={holdsByItem}
      canonicalNames={canonicalNames}
      onGroceryIds={onGroceryIds}
    />
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventorySkeleton />}>
      <InventoryContent />
    </Suspense>
  );
}
