import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopSession } from "@/components/inventory/shop-session";
import type { Location } from "@/lib/types";

export const metadata = { title: "I just bought these" };

function ShopSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

async function ShopContent() {
  const { supabase, householdId } = await requireDal();

  const { data } = await supabase
    .from("household_settings")
    .select("default_location")
    .eq("household_id", householdId)
    .maybeSingle();

  const defaultLocation =
    (data as { default_location: Location } | null)?.default_location ??
    "pantry";

  return <ShopSession defaultLocation={defaultLocation} />;
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopSkeleton />}>
      <ShopContent />
    </Suspense>
  );
}
