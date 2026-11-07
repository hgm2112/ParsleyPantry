"use client";

import Link from "next/link";
import { displayQtyUnit, packCount, packHintText } from "@/lib/stock";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge } from "@/components/location-badge";
import { expiryChipProps } from "@/lib/freezer";
import { pickFefoBatch, type ItemGroup } from "@/lib/batches";

/** Shared home-widget row: one item (all batches) + QTY/expiry/location pills. */
export function StockRow({
  group,
  actions,
}: {
  group: ItemGroup;
  actions?: React.ReactNode;
}) {
  const unit = group.batches[0]?.unit ?? group.item.unit;
  const { qtyText, unitText } = displayQtyUnit(group.totalQuantity, unit);
  const earliest = pickFefoBatch(group.batches);

  const title = (
    <p className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">
      {group.item.name}
    </p>
  );

  const pills = (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold uppercase text-blue-800 dark:bg-blue-950 dark:text-blue-200">
        QTY: {qtyText}
        {packCount(group.totalQuantity, group.item) ? (
          <span className="text-xs text-muted-foreground ml-0.5">
            ({packHintText(group.totalQuantity, group.item)})
          </span>
        ) : null}
      </span>
      {unitText ? (
        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">
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
  );

  return (
    <li>
      <div className="group relative rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 hover:shadow-sm">
        <Link
          href={`/inventory/${group.item.id}`}
          className="block after:absolute after:inset-0 after:content-['']"
        >
          <div className="flex items-center justify-between gap-2 pr-8">
            {title}
          </div>
          {pills}
        </Link>
        {actions && (
          <div
            className="absolute right-2 top-2 z-10 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </li>
  );
}
