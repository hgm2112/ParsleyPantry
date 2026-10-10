"use client";

import Link from "next/link";
import { displayQtyUnit } from "@/lib/stock";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { expiryChipProps } from "@/lib/freezer";
import type { InventoryEntry } from "@/lib/types";

/** Shared home-widget row: name + QTY/weight/expiry/location pills. */
export function StockRow({ row }: { row: InventoryEntry }) {
  const { qtyText, unitText } = displayQtyUnit(row.quantity, row.unit);
  return (
    <li>
      <Link
        href={`/inventory/${row.id}`}
        className="group block rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
      >
        <p className="truncate text-sm font-semibold group-hover:text-primary">
          {row.item.name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold uppercase text-blue-800">
            QTY: {qtyText}
          </span>
          {unitText ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-800">
              {unitText}
            </span>
          ) : null}
          <ExpiryChip {...expiryChipProps(row)} className="uppercase" />
          <LocationBadge location={row.location} className="uppercase" />
        </div>
      </Link>
    </li>
  );
}
