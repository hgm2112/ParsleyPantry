"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { Input } from "@/components/ui/input";
import type { CategoryRow, InventoryEntry } from "@/lib/types";

export function PantryPreview({
  rows,
  categories,
}: {
  rows: InventoryEntry[];
  categories: CategoryRow[];
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeCategory && row.item.category_id !== activeCategory) {
        return false;
      }
      if (!needle) return true;
      return row.item.name.toLowerCase().includes(needle);
    });
  }, [rows, query, activeCategory]);

  const visible = filtered.slice(0, 12);

  const usedCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.item.category_id) ids.add(row.item.category_id);
    }
    return ids;
  }, [rows]);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Pantry</h2>
        <Link
          href="/inventory"
          className="ml-auto text-sm font-medium text-primary hover:underline"
        >
          View all →
        </Link>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pantry items…"
          className="pl-8"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            activeCategory === null
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          All
        </button>
        {categories
          .filter((category) => usedCategoryIds.has(category.id))
          .map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() =>
                setActiveCategory((current) =>
                  current === category.id ? null : category.id,
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                activeCategory === category.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {category.icon ? `${category.icon} ` : ""}
              {category.name}
            </button>
          ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Your pantry is empty — add items from the Pantry page."
            : "Nothing matches."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((row) => {
            const emoji = row.item.icon ?? foodEmoji(row.item.name);
            return (
              <li key={row.id}>
                <Link
                  href={`/inventory/${row.id}`}
                  className="group flex h-full flex-col rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-2xl",
                        tileGradient(row.item.name),
                      )}
                      aria-hidden
                    >
                      {emoji}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 truncate text-sm font-medium group-hover:text-primary">
                    {row.item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.quantity}
                    {row.unit ? ` ${row.unit}` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
                    <LocationBadge location={row.location} />
                    <ExpiryChip date={row.expiration_date} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
