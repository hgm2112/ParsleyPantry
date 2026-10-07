import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoresManager } from "@/components/grocery/stores-manager";
import type {
  HouseholdSettingsRow,
  StoreAisleRow,
  StoreRow,
} from "@/lib/types";

export const metadata = { title: "Stores" };

function StoresSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

async function StoresContent() {
  const { supabase, householdId } = await requireDal();

  const [storesResult, aislesResult, settingsResult] = await Promise.all([
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
    supabase
      .from("household_settings")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle(),
  ]);

  return (
    <StoresManager
      stores={(storesResult.data ?? []) as StoreRow[]}
      aisles={(aislesResult.data ?? []) as StoreAisleRow[]}
      settings={(settingsResult.data ?? null) as HouseholdSettingsRow | null}
    />
  );
}

export default function StoresPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/grocery" />}
          aria-label="Back to grocery list"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Stores &amp; aisles</h1>
          <p className="text-xs text-muted-foreground">
            Each store gets its own aisle layout — use categories anywhere else.
          </p>
        </div>
      </div>
      <Suspense fallback={<StoresSkeleton />}>
        <StoresContent />
      </Suspense>
    </div>
  );
}
