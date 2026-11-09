import { Suspense } from "react";
import { requireDal } from "@/lib/auth";
import { HouseholdAddForm } from "@/components/household/household-add-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Add Household Item" };

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
    typeof barcodeParam === "string" && /^[\x21-\x7e]{4,64}$/.test(barcodeParam)
      ? barcodeParam
      : null;
  // Verify household scoping for the DAL (throws if signed out).
  await requireDal();
  return <HouseholdAddForm initialBarcode={initialBarcode} />;
}

export default function AddHouseholdPage({
  searchParams,
}: PageProps<"/household/add">) {
  return (
    <Suspense fallback={<AddSkeleton />}>
      <AddContent searchParams={searchParams} />
    </Suspense>
  );
}
