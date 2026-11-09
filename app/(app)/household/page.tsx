import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { HouseholdView } from "@/components/household/household-view";
import { Skeleton } from "@/components/ui/skeleton";
import type { HouseholdItemRow } from "@/lib/types";

export const metadata = { title: "Household" };

function HouseholdSkeleton() {
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

async function HouseholdContent() {
  const { supabase, householdId } = await requireDal();
  const { data } = await supabase
    .from("household_items")
    .select("*")
    .eq("household_id", householdId)
    .gt("quantity", 0)
    .order("name", { ascending: true });

  const rows = (data ?? []) as HouseholdItemRow[];
  return <HouseholdView rows={rows} />;
}

export default function HouseholdPage() {
  return (
    <Suspense fallback={<HouseholdSkeleton />}>
      <HouseholdContent />
    </Suspense>
  );
}
