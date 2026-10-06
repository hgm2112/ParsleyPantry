import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AisleEditor } from "@/components/grocery/aisle-editor";
import type { StoreAisleRow, StoreRow } from "@/lib/types";

export const metadata = { title: "Store aisles" };

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

async function StoreContent({ storeId }: { storeId: string }) {
  const { supabase, householdId } = await requireDal();

  const [storeResult, aislesResult] = await Promise.all([
    supabase
      .from("stores")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", storeId)
      .maybeSingle(),
    supabase
      .from("store_aisles")
      .select("*")
      .eq("household_id", householdId)
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true }),
  ]);

  const store = storeResult.data as StoreRow | null;
  if (!store) notFound();

  return (
    <AisleEditor
      store={store}
      aisles={(aislesResult.data ?? []) as StoreAisleRow[]}
    />
  );
}

export default function StorePage({ params }: PageProps<"/grocery/stores/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <StoreWrapper params={params} />
    </Suspense>
  );
}

async function StoreWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreContent storeId={id} />;
}
