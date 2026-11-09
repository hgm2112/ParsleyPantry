import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { HouseholdDetailForm } from "@/components/household/household-detail-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { HouseholdItemRow } from "@/lib/types";

export const metadata = { title: "Household Item" };

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function DetailContent({ itemId }: { itemId: string }) {
  const { supabase, householdId } = await requireDal();
  const { data } = await supabase
    .from("household_items")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", itemId)
    .maybeSingle();
  const item = data as HouseholdItemRow | null;
  if (!item) notFound();
  return <HouseholdDetailForm item={item} />;
}

export default function HouseholdDetailPage({
  params,
}: PageProps<"/household/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailWrapper params={params} />
    </Suspense>
  );
}

async function DetailWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailContent itemId={id} />;
}
