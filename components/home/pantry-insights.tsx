"use client";

import Link from "next/link";
import { daysUntil } from "@/lib/expiry";
import { isLowStock } from "@/lib/stock";
import type { InventoryEntry } from "@/lib/types";

const EXPIRING_DAYS = 5;

export function PantryInsights({ rows }: { rows: InventoryEntry[] }) {
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
    { emoji: "🫙", label: "items", count: rows.length },
    { emoji: "🟢", label: "fresh", count: fresh },
    { emoji: "🟡", label: "running low", count: low },
    { emoji: "🔴", label: "expiring", count: expiring },
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
      <ul className="space-y-2">
        {stats.map((stat) => (
          <li
            key={stat.label}
            className="flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2"
          >
            <span className="text-lg" aria-hidden>
              {stat.emoji}
            </span>
            <span className="text-sm font-semibold">{stat.label}</span>
            <span className="ml-auto text-sm font-extrabold tabular-nums">
              {stat.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
