import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryDetail } from "@/components/inventory/detail-form";
import type { InventoryEntry, ItemRow, SubcategoryRow } from "@/lib/types";

export const metadata = { title: "Item" };

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

async function DetailContent({ id }: { id: string }) {
  const { supabase, householdId } = await requireDal();

  const [itemResult, subsResult] = await Promise.all([
    supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("subcategories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
  ]);

  const item = itemResult.data as ItemRow | null;

  if (!item) {
    // Older links point at a single inventory row — follow them to the item.
    const { data: row } = await supabase
      .from("inventory")
      .select("item_id")
      .eq("household_id", householdId)
      .eq("id", id)
      .maybeSingle();
    if (row) redirect(`/inventory/${row.item_id}`);
    notFound();
  }

  const { data: batches } = await supabase
    .from("inventory")
    .select("*, item:items!inner(*)")
    .eq("household_id", householdId)
    .eq("item_id", item.id);
  if (!batches || batches.length === 0) redirect("/inventory");

  const canonicalResult = item.canonical_item_id
    ? await supabase
        .from("items")
        .select("id, name")
        .eq("household_id", householdId)
        .eq("id", item.canonical_item_id)
        .maybeSingle()
    : { data: null };

  return (
    <InventoryDetail
      item={item}
      entries={batches as InventoryEntry[]}
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
      canonicalItem={
        (canonicalResult.data ?? null) as { id: string; name: string } | null
      }
    />
  );
}

export default function InventoryDetailPage({
  params,
}: PageProps<"/inventory/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailWrapper params={params} />
    </Suspense>
  );
}

async function DetailWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DetailContent id={id} />;
}
