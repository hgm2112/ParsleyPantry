import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AddForm } from "@/components/inventory/add-form";
import type { CategoryRow, Location, SubcategoryRow } from "@/lib/types";

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
  const initialBarcode =
    typeof barcodeParam === "string" && /^\d{6,14}$/.test(barcodeParam)
      ? barcodeParam
      : null;

  const { supabase, householdId } = await requireDal();

  const [categoriesResult, settingsResult, subsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, household_id, name, icon, sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
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

  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const defaultLocation =
    (settingsResult.data as { default_location: Location } | null)
      ?.default_location ?? "pantry";

  return (
    <AddForm
      categories={categories}
      subcategories={(subsResult.data ?? []) as SubcategoryRow[]}
      defaultLocation={defaultLocation}
      initialBarcode={initialBarcode}
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
