"use server";

import { revalidatePath } from "next/cache";
import { requireDal } from "@/lib/auth";
import { resolveCanonicalRoot } from "@/lib/canonical-db";
import { matchCanonical, type CanonicalCandidate, type CanonicalStatus } from "@/lib/canonical";
import { splitNameAndQuantity } from "@/lib/stock";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface CanonicalReviewRow {
  itemId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  status: CanonicalStatus;
  /** Suggested generic ingredients, best first (empty when none found). */
  suggestions: string[];
}

export interface CanonicalSummary {
  inScope: number;
  /** High-confidence mappings written by this run (0 in a dry run). */
  autoMatched: number;
  /** High-confidence items a backfill run would apply right now. */
  readyToMatch: number;
  /** Mapped already, settled canonicals, kept as-is, or plain generic items. */
  alreadyGeneric: number;
  needsReview: number;
  /** Generic catalog rows referenced (or that would be created) as targets. */
  createdRoots: number;
}

export interface CanonicalReviewData {
  summary: CanonicalSummary;
  rows: CanonicalReviewRow[];
}

type ItemSeed = {
  id: string;
  name: string;
  barcode: string | null;
  brand: string | null;
  categoryId: string | null;
  canonicalItemId: string | null;
  canonicalReviewed: boolean;
};

/**
 * Shared planner for the review page (apply=false, read-only) and the
 * backfill (apply=true, writes high-confidence mappings). Idempotent: only
 * items whose canonical_item_id is still null are ever written, and the
 * root-only invariant is maintained by repointing children on every write.
 */
async function planCanonical(
  supabase: Awaited<ReturnType<typeof requireDal>>["supabase"],
  householdId: string,
  userId: string,
  apply: boolean,
): Promise<ActionResult<CanonicalReviewData>> {
  const [itemsResult, inventoryResult, recipeResult] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, barcode, brand, category_id, canonical_item_id, canonical_reviewed")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("inventory")
      .select("item_id")
      .eq("household_id", householdId),
    supabase
      .from("recipe_ingredients")
      .select("name")
      .eq("household_id", householdId),
  ]);

  const items: ItemSeed[] = ((itemsResult.data ?? []) as {
    id: string;
    name: string;
    barcode: string | null;
    brand: string | null;
    category_id: string | null;
    canonical_item_id: string | null;
    canonical_reviewed: boolean;
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    brand: row.brand,
    categoryId: row.category_id,
    canonicalItemId: row.canonical_item_id,
    canonicalReviewed: row.canonical_reviewed,
  }));

  const scopeIds = new Set(
    ((inventoryResult.data ?? []) as { item_id: string }[]).map(
      (row) => row.item_id,
    ),
  );

  const itemNames = new Set(items.map((item) => item.name.trim().toLowerCase()));
  const recipeNames: string[] = [];
  const seenRecipe = new Set<string>();
  for (const row of (recipeResult.data ?? []) as { name: string }[]) {
    const name = splitNameAndQuantity(row.name || "").name.trim();
    const key = name.toLowerCase();
    if (!key || seenRecipe.has(key) || itemNames.has(key)) continue;
    seenRecipe.add(key);
    recipeNames.push(name);
  }

  const canonicalNow = new Map<string, string | null>(
    items.map((item) => [item.id, item.canonicalItemId]),
  );
  const rootNow = (id: string): string => {
    let current = id;
    for (let hop = 0; hop < 8; hop += 1) {
      const next = canonicalNow.get(current) ?? null;
      if (!next || next === current) break;
      current = next;
    }
    return current;
  };
  const isCanonicalTarget = (id: string): boolean =>
    items.some((item) => item.id !== id && canonicalNow.get(item.id) === id);

  const buildPool = (): CanonicalCandidate[] => [
    ...items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      canonicalSafe: rootNow(item.id) === item.id,
    })),
    ...recipeNames.map((name) => ({
      id: `recipe:${name}`,
      name,
      categoryId: null as string | null,
      canonicalSafe: true,
      virtual: true,
    })),
  ];

  let autoMatched = 0;
  let readyToMatch = 0;
  let alreadyGeneric = 0;
  let createdRoots = 0;
  const review: CanonicalReviewRow[] = [];

  const scopeSeeds = items.filter((item) => scopeIds.has(item.id));
  for (const item of scopeSeeds) {
    if (canonicalNow.get(item.id)) {
      alreadyGeneric += 1; // mapped by a scan, an edit, or an earlier run
      continue;
    }
    if (isCanonicalTarget(item.id)) {
      alreadyGeneric += 1; // settled generic identity other products point at
      continue;
    }
    if (item.canonicalReviewed) {
      alreadyGeneric += 1; // user chose to keep it as its own name
      continue;
    }

    const match = matchCanonical(item.name, buildPool(), {
      categoryId: item.categoryId,
    });

    if (match.status === "high") {
      const target = match.candidates[0];
      if (!apply) {
        readyToMatch += 1;
        if (target.virtual) createdRoots += 1;
        continue;
      }
      let rootId: string | null = null;
      if (target.virtual) {
        const root = await resolveCanonicalRoot(
          supabase,
          householdId,
          target.name,
          { location: "pantry", categoryId: null, createdBy: userId },
        );
        if (root?.created) createdRoots += 1;
        rootId = root?.id ?? null;
      } else {
        rootId = rootNow(target.id);
      }
      if (!rootId || rootId === item.id) {
        alreadyGeneric += 1;
        continue;
      }
      const { error } = await supabase
        .from("items")
        .update({ canonical_item_id: rootId })
        .eq("household_id", householdId)
        .eq("id", item.id)
        .is("canonical_item_id", null);
      if (error) return { ok: false, error: error.message };
      canonicalNow.set(item.id, rootId);
      // This item may be someone's canonical — keep children on a root.
      for (const child of items) {
        if (canonicalNow.get(child.id) === item.id) {
          const { error: childError } = await supabase
            .from("items")
            .update({ canonical_item_id: rootId })
            .eq("household_id", householdId)
            .eq("id", child.id);
          if (childError) return { ok: false, error: childError.message };
          canonicalNow.set(child.id, rootId);
        }
      }
      autoMatched += 1;
      continue;
    }

    const needsReview =
      match.status !== "none" || item.barcode != null;
    if (needsReview) {
      review.push({
        itemId: item.id,
        name: item.name,
        brand: item.brand,
        barcode: item.barcode,
        status: match.status,
        suggestions: match.candidates.map((candidate) => candidate.name),
      });
    } else {
      alreadyGeneric += 1;
    }
  }

  return {
    ok: true,
    data: {
      summary: {
        inScope: scopeSeeds.length,
        autoMatched,
        readyToMatch,
        alreadyGeneric,
        needsReview: review.length,
        createdRoots,
      },
      rows: review,
    },
  };
}

/** Read-only snapshot for the review page. */
export async function getCanonicalReview(): Promise<ActionResult<CanonicalReviewData>> {
  try {
    const { supabase, householdId, user } = await requireDal();
    return await planCanonical(supabase, householdId, user.id, false);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load matches",
    };
  }
}

/** Idempotent backfill: writes every high-confidence mapping left to make. */
export async function runCanonicalBackfill(): Promise<ActionResult<CanonicalReviewData>> {
  try {
    const { supabase, householdId, user } = await requireDal();
    const result = await planCanonical(supabase, householdId, user.id, true);
    if (!result.ok) return result;
    revalidatePath("/inventory");
    revalidatePath("/recipes");
    revalidatePath("/grocery");
    revalidatePath("/plan");
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Backfill failed",
    };
  }
}
