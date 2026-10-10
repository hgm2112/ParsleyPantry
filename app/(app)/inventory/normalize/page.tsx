import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NormalizeReview } from "@/components/inventory/normalize-review";
import { getCanonicalReview } from "./actions";

export const metadata = { title: "Ingredient matches" };

function ReviewSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

async function ReviewContent() {
  const result = await getCanonicalReview();
  if (!result.ok) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {result.error}
      </p>
    );
  }
  return <NormalizeReview initial={result.data} />;
}

export default function NormalizePage() {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewContent />
    </Suspense>
  );
}
