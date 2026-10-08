"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { compareByExpiry } from "@/lib/expiry";
import { StockRow } from "@/components/home/stock-row";
import type { InventoryEntry, SubcategoryRow } from "@/lib/types";

/** Items whose sub-category name contains "snack", soonest-expiring first. */
export function SnackWidget({
  rows,
  subcategories,
}: {
  rows: InventoryEntry[];
  subcategories: SubcategoryRow[];
}) {
  const snacks = useMemo(() => {
    const names = new Map(
      subcategories.map((entry) => [entry.id, entry.name.toLowerCase()]),
    );
    return rows
      .filter((row) => {
        const id = row.item.subcategory_id;
        if (!id) return false;
        return (names.get(id) ?? "").includes("snack");
      })
      .sort((a, b) =>
        compareByExpiry(a.expiration_date, a.item.name, b.expiration_date, b.item.name),
      )
      .slice(0, 5);
  }, [rows, subcategories]);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Cookie className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Snacks</h2>
        <Link
          href="/inventory"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          View all →
        </Link>
      </div>
      {snacks.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing tagged as snacks yet — add a sub-category on the Categories
          page, then assign it to items.
        </p>
      ) : (
        <ul className="space-y-2">
          {snacks.map((row) => (
            <StockRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}
