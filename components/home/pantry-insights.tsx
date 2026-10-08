"use client";

import { use } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { daysUntil } from "@/lib/expiry";
import { isLowStock } from "@/lib/stock";
import type { InventoryEntry } from "@/lib/types";

const EXPIRING_DAYS = 5;

export function PantryInsights({ rows }: { rows: InventoryEntry[] }) {
  use(io());
  let fresh = 0;
  let low = 0;
  let expiring = 0;

  for (const row of rows) {
    const days = daysUntil(row.expiration_date);
    if (days !== null && days <= EXPIRING_DAYS) {
      expiring += 1;
    } else if (isLowStock(row, row.item)) {
      low += 1;
    } else {
      fresh += 1;
    }
  }

  const stats: { emoji: string; label: string; count: number }[] = [
    { emoji: "🫙", label: "Items", count: rows.length },
    { emoji: "🟢", label: "Fresh", count: fresh },
    { emoji: "🟡", label: "Running Low", count: low },
    { emoji: "🔴", label: "Expiring", count: expiring },
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
