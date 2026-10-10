import { Suspense } from "react";
import Link from "next/link";
import {
  BookOpen,
  Package,
  Search as SearchIcon,
  ShoppingCart,
} from "lucide-react";
import { requireDal } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { groupByItem } from "@/lib/batches";
import { buildCanonicalNameMap } from "@/lib/canonical";
import { cn } from "@/lib/utils";
import type { CategoryRow, InventoryEntry, ItemRow, RecipeRow } from "@/lib/types";

export const metadata = { title: "Search" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function SearchSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full max-w-lg" />
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof BookOpen;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-extrabold">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
      <SearchIcon className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-semibold">
        {query ? `Nothing matches “${query}”` : "Type to search"}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        Search covers pantry items, grocery list entries, and recipes. You can
        search by name, tag, or barcode.
      </p>
    </div>
  );
}

async function SearchContent({ query }: { query: string }) {
  const { supabase, householdId } = await requireDal();
  // Commas/parens break PostgREST .or() filters; drop them from the needle.
  const clean = query.replace(/[,()]/g, " ").trim();
  const needle = `%${clean.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const isBarcode = /^\d{6,14}$/.test(query);

  const [recipesResult, inventoryResult, itemsResult, groceryResult, namesResult] =
    await Promise.all([
      supabase
        .from("recipes")
        .select("*")
        .eq("household_id", householdId)
        .or(`name.ilike.${needle},description.ilike.${needle}`)
        .limit(24),
      supabase
        .from("inventory")
        .select("*, item:items!inner(*)")
        .eq("household_id", householdId)
        .ilike("items.name", needle)
        .limit(24),
      supabase
        .from("items")
        .select("*")
        .eq("household_id", householdId)
        .or(
          isBarcode
            ? `name.ilike.${needle},barcode.eq.${query}`
            : `name.ilike.${needle}`,
        )
        .limit(24),
      supabase
        .from("grocery_items")
        .select("id, name, quantity, unit, checked, category_id")
        .eq("household_id", householdId)
        .ilike("name", needle)
        .limit(24),
      supabase
        .from("items")
        .select("id, name, canonical_item_id")
        .eq("household_id", householdId),
    ]);

  const recipes = (recipesResult.data ?? []) as RecipeRow[];
  const inventory = (inventoryResult.data ?? []) as InventoryEntry[];
  const items = (itemsResult.data ?? []) as ItemRow[];
  const grocery = (groceryResult.data ?? []) as {
    id: string;
    name: string;
    quantity: number;
    unit: string | null;
    checked: boolean;
  }[];
  const categoriesResult = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  const categories = (categoriesResult.data ?? []) as CategoryRow[];

  // One card per item — batches (locations/dates) are shown as totals.
  const inventoryGroups = groupByItem(inventory);
  const inventoryItemIds = new Set(inventoryGroups.map((group) => group.item.id));
  const catalogOnly = items.filter((item) => !inventoryItemIds.has(item.id));
  const canonicalNames = buildCanonicalNameMap(
    (namesResult.data ?? []) as {
      id: string;
      name: string;
      canonical_item_id: string | null;
    }[],
  );

  const total =
    recipes.length + inventoryGroups.length + catalogOnly.length + grocery.length;

  if (total === 0) {
    return <EmptySearch query={query} />;
  }

  const categoryName = (id: string | null) =>
    id ? (categories.find((category) => category.id === id)?.name ?? null) : null;

  return (
    <div className="space-y-2">
      {inventoryGroups.length > 0 ? (
        <section>
          <SectionHeader
            icon={Package}
            title="In your pantry"
            count={inventoryGroups.length}
          />
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {inventoryGroups.map((group) => (
              <li key={group.item.id}>
                <Link
                  href={`/inventory/${group.item.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xl",
                      tileGradient(group.item.name),
                    )}
                    aria-hidden
                  >
                    {group.item.icon ?? foodEmoji(group.item.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {group.item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {group.totalQuantity}
                      {group.batches[0]?.unit ?? group.item.unit
                        ? ` ${group.batches[0]?.unit ?? group.item.unit}`
                        : ""}{" "}
                      · {group.locations.join(", ")}
                    </span>
                    {canonicalNames[group.item.id] ? (
                      <span className="block text-xs text-muted-foreground">
                        as {canonicalNames[group.item.id]}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {grocery.length > 0 ? (
        <section>
          <SectionHeader
            icon={ShoppingCart}
            title="On your shopping list"
            count={grocery.length}
          />
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {grocery.map((row) => (
              <li key={row.id}>
                <Link
                  href="/grocery"
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
                >
                  <ShoppingCart className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        row.checked && "text-muted-foreground line-through",
                      )}
                    >
                      {row.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {row.quantity}
                      {row.unit ? ` ${row.unit}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recipes.length > 0 ? (
        <section>
          <SectionHeader icon={BookOpen} title="Recipes" count={recipes.length} />
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xl",
                      tileGradient(recipe.name),
                    )}
                    aria-hidden
                  >
                    {foodEmoji(recipe.name, recipe.tags)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {recipe.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {recipe.tags.join(" · ") || "Recipe"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {catalogOnly.length > 0 ? (
        <section>
          <SectionHeader
            icon={Package}
            title="Items (not in pantry)"
            count={catalogOnly.length}
          />
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalogOnly.map((item) => (
              <li key={item.id}>
                <Link
                  href={
                    item.barcode
                      ? `/inventory/add?barcode=${item.barcode}`
                      : "/inventory/add"
                  }
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xl",
                      tileGradient(item.name),
                    )}
                    aria-hidden
                  >
                    {item.icon ?? foodEmoji(item.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.barcode
                        ? `Barcode ${item.barcode} · ${
                            categoryName(item.category_id) ?? "No category"
                          }`
                        : (categoryName(item.category_id) ?? "No category")}
                    </span>
                    {canonicalNames[item.id] ? (
                      <span className="block text-xs text-muted-foreground">
                        as {canonicalNames[item.id]}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

async function SearchWrapper({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = typeof params.q === "string" ? params.q.trim() : "";
  const query = raw.slice(0, 80);

  return (
    <div className="space-y-3">
      <form action="/search" method="GET" className="relative max-w-lg">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Search for recipes, ingredients, or meals…"
          className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </form>

      {query ? (
        <Suspense fallback={<SearchSkeleton />} key={query}>
          <SearchContent query={query} />
        </Suspense>
      ) : (
        <EmptySearch query="" />
      )}
    </div>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchWrapper searchParams={searchParams} />
    </Suspense>
  );
}
