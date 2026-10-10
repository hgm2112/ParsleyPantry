"use client";

import Link from "next/link";
import { displayQtyUnit } from "@/lib/stock";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { expiryChipProps } from "@/lib/freezer";
import { pickFefoBatch, type ItemGroup } from "@/lib/batches";

/** Shared home-widget row: one item (all batches) + QTY/expiry/location pills. */
export function StockRow({ group }: { group: ItemGroup }) {
  const unit = group.batches[0]?.unit ?? group.item.unit;
  const { qtyText, unitText } = displayQtyUnit(group.totalQuantity, unit);
  const earliest = pickFefoBatch(group.batches);
  return (
    <li>
      <Link
        href={`/inventory/${group.item.id}`}
        className="group block rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
      >
        <p className="truncate text-sm font-semibold group-hover:text-primary">
          {group.item.name}
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
          {earliest ? (
            <ExpiryChip {...expiryChipProps(earliest)} className="uppercase" />
          ) : null}
          {group.locations.map((location) => (
            <LocationBadge
              key={location}
              location={location}
              className="uppercase"
            />
          ))}
        </div>
      </Link>
    </li>
  );
}
