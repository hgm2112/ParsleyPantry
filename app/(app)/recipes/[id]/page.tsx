import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import type { RecipeIngredientRow, RecipeRow } from "@/lib/types";

export const metadata = { title: "Recipe" };

function RecipeSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

async function RecipeContent({ recipeId }: { recipeId: string }) {
  const { supabase, householdId } = await requireDal();

  const [recipeResult, ingredientsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("household_id", householdId)
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true }),
  ]);

  const recipe = recipeResult.data as RecipeRow | null;
  if (!recipe) notFound();

  const ingredients = (ingredientsResult.data ?? []) as RecipeIngredientRow[];

  return (
    <div className="mx-auto max-w-2xl">
      <RecipeEditor recipe={recipe} ingredients={ingredients} />
    </div>
  );
}

export default function RecipePage({
  params,
}: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      <RecipeWrapper params={params} />
    </Suspense>
  );
}

async function RecipeWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecipeContent recipeId={id} />;
}
