import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AddForm } from "@/components/inventory/add-form";
import type { Location, SubcategoryRow } from "@/lib/types";

export const metadata = { title: "Add to inventory" };

function AddSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function AddContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const barcodeParam = params.barcode;
  // The camera emits EAN/UPC *and* CODE_128/CODE_39 store codes, so accept
  // any printable code rather than silently dropping (and never looking up)
  // anything that isn't 6–14 digits.
  const initialBarcode =
    typeof barcodeParam === "string" && /^[\x21-\x7e]{4,64}$/.test(barcodeParam)
      ? barcodeParam
      : null;
  // Bumped by the scanner so a fresh scan re-runs the lookup even when this
  // route instance was kept alive by <Activity>.
  const lookupKey =
    typeof params.scan === "string" ? params.scan.slice(0, 40) : null;

  const { supabase, householdId } = await requireDal();

  const [settingsResult, subsResult] = await Promise.all([
    supabase
      .from("household_settings")
      .select("default_location")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("subcategories")
      .select("*")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
  ]);

  const defaultLocation =
    (settingsResult.data as { default_location: Location } | null)
      ?.default_location ?? "pantry";

  return (
    <AddForm
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
      defaultLocation={defaultLocation}
      initialBarcode={initialBarcode}
      lookupKey={lookupKey}
    />
  );
}

export default function AddPage({
  searchParams,
}: PageProps<"/inventory/add">) {
  return (
    <Suspense fallback={<AddSkeleton />}>
      <AddContent searchParams={searchParams} />
    </Suspense>
  );
}
