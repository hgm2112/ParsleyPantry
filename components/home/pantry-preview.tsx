"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayQuantity } from "@/lib/stock";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { Input } from "@/components/ui/input";
import type { InventoryEntry, Location } from "@/lib/types";

const LOCATION_FILTERS: { value: Location | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function PantryPreview({ rows }: { rows: InventoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [activeLocation, setActiveLocation] = useState<Location | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeLocation && row.location !== activeLocation) return false;
      if (!needle) return true;
      return row.item.name.toLowerCase().includes(needle);
    });
  }, [rows, query, activeLocation]);

  const visible = filtered.slice(0, 8);

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Pantry</h2>
        <Link
          href="/inventory"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
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
        {LOCATION_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setActiveLocation(filter.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              activeLocation === filter.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {filter.label}
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
        <ul className="space-y-2">
          {visible.map((row) => {
            const display = displayQuantity(row.quantity, row.unit);
            return (
              <li key={row.id}>
                <Link
                  href={`/inventory/${row.id}`}
                  className="group block rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
                >
                  <p className="truncate text-sm font-semibold group-hover:text-primary">
                    {row.item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {display.quantity % 1 === 0
                      ? display.quantity
                      : display.quantity.toFixed(1)}
                    {display.unit ? ` ${display.unit}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
