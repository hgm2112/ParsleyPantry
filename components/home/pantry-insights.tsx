"use client";

import { use } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { daysUntil } from "@/lib/expiry";
import { groupByItem } from "@/lib/batches";
import type { InventoryEntry, SubcategoryRow } from "@/lib/types";

const EXPIRING_DAYS = 5;

export function PantryInsights({
  rows,
  subcategories,
}: {
  rows: InventoryEntry[];
  subcategories: SubcategoryRow[];
}) {
  use(io());
  const subNames = new Map(
    subcategories.map((entry) => [entry.id, entry.name.toLowerCase()]),
  );
  const groups = groupByItem(rows);
  let fresh = 0;
  let low = 0;
  let expiring = 0;
  let frozen = 0;
  let snacks = 0;
  let candy = 0;

  // One bucket per item, in priority order: expiring > low > all-frozen > fresh.
  for (const group of groups) {
    const subName = subNames.get(group.item.subcategory_id ?? "");
    if (subName?.includes("snack")) snacks += 1;
    if (subName?.includes("candy")) candy += 1;

    // Earliest refrigerated batch (FEFO order); frozen quality dates are
    // never "expiring".
    const refBatch = group.batches.find((row) => row.location !== "freezer");
    const days = refBatch ? daysUntil(refBatch.expiration_date) : null;
    if (days !== null && days <= EXPIRING_DAYS) {
      expiring += 1;
    } else if (group.low) {
      low += 1;
    } else if (!refBatch) {
      frozen += 1;
    } else {
      fresh += 1;
    }
  }

  const stats: { emoji: string; label: string; count: number }[] = [
    { emoji: "🫙", label: "Items", count: groups.length },
    { emoji: "🟢", label: "Fresh", count: fresh },
    { emoji: "🟡", label: "Running Low", count: low },
    { emoji: "🔴", label: "Expiring", count: expiring },
    { emoji: "❄️", label: "Frozen", count: frozen },
    { emoji: "🍿", label: "Snacks", count: snacks },
    { emoji: "🍬", label: "Candy", count: candy },
  ];

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-extrabold">Pantry Insights</h2>
        <Link
          href="/inventory"
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          View pantry →
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {stats.map((stat) => (
          <span
            key={stat.label}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-semibold"
          >
            <span aria-hidden>{stat.emoji}</span>
            {stat.label}
            <span className="font-extrabold tabular-nums">{stat.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
