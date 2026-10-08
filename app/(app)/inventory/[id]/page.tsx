import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryDetail } from "@/components/inventory/detail-form";
import type { InventoryEntry, SubcategoryRow } from "@/lib/types";

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

async function DetailContent({ inventoryId }: { inventoryId: string }) {
  const { supabase, householdId } = await requireDal();

  const [data, subsResult] = await Promise.all([
    supabase
      .from("inventory")
      .select("*, item:items!inner(*)")
      .eq("household_id", householdId)
      .eq("id", inventoryId)
      .maybeSingle(),
    supabase
      .from("subcategories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
  ]);

  const entry = data as unknown as InventoryEntry | null;
  if (!entry) notFound();

  return (
    <InventoryDetail
      entry={entry}
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
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
  return <DetailContent inventoryId={id} />;
}
