"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpiryChip } from "@/components/expiry-chip";
import { LocationBadge, locationLabel } from "@/components/location-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConsumeDialog } from "@/components/inventory/consume-dialog";
import { ScanSheet } from "@/components/scan-sheet";
import {
  addToInventory,
  addInventoryToGrocery,
  consumeInventory,
  deleteInventory,
  resolveBarcode,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { compareByExpiry, expiryBucket } from "@/lib/expiry";
import { displayQtyUnit, isLowStock, stockPoolKey } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { InventoryEntry, Location, SubcategoryRow } from "@/lib/types";

type Tab = "all" | Location;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function InventoryView({
  rows,
  subcategories,
  holdsByItem,
}: {
  rows: InventoryEntry[];
  subcategories: SubcategoryRow[];
  holdsByItem: Record<string, number>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [useSoon, setUseSoon] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [consumeTarget, setConsumeTarget] = useState<{
    entry: InventoryEntry;
    mode: "partial" | "last";
  } | null>(null);

  const counts = useMemo(() => {
    const byLocation: Record<Tab, number> = {
      all: rows.length,
      pantry: 0,
      fridge: 0,
      freezer: 0,
    };
    for (const row of rows) byLocation[row.location] += 1;
    return byLocation;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = rows.filter((row) => {
      if (tab !== "all" && row.location !== tab) return false;
      if (subFilter && row.item.subcategory_id !== subFilter) return false;
      if (useSoon) {
        const bucket = expiryBucket(row.expiration_date);
        if (bucket !== "expired" && bucket !== "urgent" && bucket !== "soon") {
          return false;
        }
      }
      if (lowOnly && !isLowStock(row, row.item)) return false;
      if (needle) {
        const name = row.item.name.toLowerCase();
        const barcode = row.item.barcode ?? "";
        if (!name.includes(needle) && !barcode.includes(needle)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) =>
      compareByExpiry(
        a.expiration_date,
        a.item.name,
        b.expiration_date,
        b.item.name,
      ),
    );
    return result;
  }, [rows, tab, query, useSoon, lowOnly, subFilter]);

  const lowCount = rows.filter((row) => isLowStock(row, row.item)).length;

  const subNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const subcategory of subcategories) {
      map.set(subcategory.id, subcategory.name);
    }
    return map;
  }, [subcategories]);

  async function handleBarcode(code: string) {
    setScanOpen(false);
    let result;
    try {
      result = await resolveBarcode(code);
    } catch {
      toast.error("Lookup failed — check your connection and try again.");
      return;
    }
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.item) {
      router.push(`/inventory/${result.data.item.id}`);
    } else {
      router.push(`/inventory/add?barcode=${encodeURIComponent(code)}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 pt-3 pb-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-extrabold">Pantry</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} tracked
              {lowCount > 0 ? (
                <span className="text-orange-600"> · {lowCount} running low</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/inventory/add" />}>
              <Plus /> Add
            </Button>
            <Button size="sm" render={<Link href="/inventory/shop" />}>
              <ShoppingCart /> Just bought
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or barcode"
              className="h-9 pl-8 pr-3"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setScanOpen(true)}
          >
            Scan
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setTab(entry.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                tab === entry.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {entry.label}
              <span className="ml-1.5 text-xs opacity-80">
                {counts[entry.value]}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setUseSoon((value) => !value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
              useSoon
                ? "border-orange-600 bg-orange-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            Use soon
          </button>
          <button
            type="button"
            onClick={() => setLowOnly((value) => !value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
              lowOnly
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            Low stock
          </button>
          {subcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              type="button"
              onClick={() =>
                setSubFilter((current) =>
                  current === subcategory.id ? null : subcategory.id,
                )
              }
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold uppercase transition-colors",
                subFilter === subcategory.id
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {subcategory.name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          hasRows={rows.length > 0}
          onScan={() => setScanOpen(true)}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <InventoryRow
              key={row.id}
              entry={row}
              subcategoryName={
                row.item.subcategory_id
                  ? (subNameById.get(row.item.subcategory_id) ?? null)
                  : null
              }
              onHold={
                holdsByItem[stockPoolKey(row.item_id, row.unit)] ?? 0
              }
              onConsume={(mode) =>
                setConsumeTarget({ entry: row, mode })
              }
            />
          ))}
        </ul>
      )}

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onBarcode={handleBarcode}
        title="Scan an item"
        description="Look up a barcode in your pantry or add it fresh."
      />

      {consumeTarget ? (
        <ConsumeDialog
          key={`${consumeTarget.entry.id}-${consumeTarget.mode}`}
          inventory={consumeTarget.entry}
          mode={consumeTarget.mode}
          open
          onOpenChange={(open) => {
            if (!open) setConsumeTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  hasRows,
  onScan,
}: {
  hasRows: boolean;
  onScan: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="rounded-full bg-accent p-3 text-primary">
        <Search className="h-6 w-6" />
      </div>
      {hasRows ? (
        <>
          <p className="text-sm font-semibold">Nothing matches those filters</p>
          <p className="text-xs text-muted-foreground">
            Try a different tab or clear the search.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold">Your pantry is empty</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Scan a barcode or add items manually to start tracking what you
            have.
          </p>
          <div className="flex gap-2">
            <Button size="sm" render={<Link href="/inventory/add" />}>
              <Plus /> Add item
            </Button>
            <Button variant="outline" size="sm" onClick={onScan}>
              Scan barcode
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InventoryRow({
  entry,
  subcategoryName,
  onHold,
  onConsume,
}: {
  entry: InventoryEntry;
  subcategoryName: string | null;
  onHold: number;
  onConsume: (mode: "partial" | "last") => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [useLastOpen, setUseLastOpen] = useState(false);
  const low = isLowStock(entry, entry.item);
  const quantity = entry.quantity;
  const { unitText } = displayQtyUnit(entry.quantity, entry.unit);

  async function quickUse() {
    const name = entry.item.name;
    const previousQuantity = entry.quantity;
    const result = await consumeInventory({
      inventoryId: entry.id,
      amount: 1,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Used 1 ${name}`, {
      action: {
        label: "Undo",
        onClick: () =>
          void updateInventory({
            inventoryId: entry.id,
            quantity: previousQuantity,
          }),
      },
    });
    router.refresh();
  }

  async function confirmUseLast() {
    const name = entry.item.name;
    const previousQuantity = entry.quantity;
    const result = await consumeInventory({
      inventoryId: entry.id,
      amount: entry.quantity,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Used the last ${name} · removed from pantry`, {
      action: {
        label: "Undo",
        onClick: () =>
          void addToInventory({
            itemId: entry.item.id,
            name: entry.item.name,
            location: entry.location,
            quantity: previousQuantity,
            unit: entry.unit ?? undefined,
            expirationDate: entry.expiration_date ?? undefined,
          }),
      },
      duration: 8000,
    });
    router.refresh();
  }

  async function quickAdd() {
    const result = await updateInventory({
      inventoryId: entry.id,
      quantity: quantity + 1,
    });
    if (!result.ok) toast.error(result.error);
  }

  async function toggleLow() {
    const result = await updateInventory({
      inventoryId: entry.id,
      isLow: !entry.is_low,
    });
    if (!result.ok) toast.error(result.error);
    else if (!entry.is_low) toast.success(`${entry.item.name} flagged as running low`);
  }

  return (
    <li className="rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/inventory/${entry.id}`}
            prefetch
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            <span className="truncate text-sm font-semibold">
              {entry.item.name}
            </span>
            {low ? (
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            ) : null}
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Add one ${entry.item.name}`}
              onClick={quickAdd}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-8 text-center text-sm font-extrabold tabular-nums">
              {quantity % 1 === 0 ? quantity : quantity.toFixed(1)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Use one ${entry.item.name}`}
              onClick={() => {
                if (quantity <= 1) setUseLastOpen(true);
                else void quickUse();
              }}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="More actions" />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onConsume("partial");
              }}
            >
              Use some…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onConsume("last");
              }}
            >
              Used the last one
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void addInventoryToGrocery(entry.id).then((result) => {
                  toast.success(
                    result.ok && result.data.created
                      ? `${entry.item.name} added to grocery list`
                      : result.ok
                        ? "Already on the grocery list"
                        : result.error,
                  );
                });
              }}
            >
              <ShoppingCart /> Add to grocery list
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void toggleLow();
              }}
            >
              <CircleAlert /> {entry.is_low ? "Clear low flag" : "Mark running low"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 /> Remove from inventory
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>

        <Link
          href={`/inventory/${entry.id}`}
          prefetch
          className="flex flex-wrap items-center gap-1.5"
        >
          {unitText ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-800">
              {unitText}
            </span>
          ) : null}
          <ExpiryChip date={entry.expiration_date} className="uppercase" />
          <LocationBadge location={entry.location} className="uppercase" />
          {subcategoryName ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase text-emerald-800">
              {subcategoryName}
            </span>
          ) : null}
          {onHold > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              {onHold % 1 === 0 ? onHold : onHold.toFixed(1)} on hold
            </span>
          ) : null}
        </Link>
      </div>

      <ConfirmDialog
        open={useLastOpen}
        onOpenChange={setUseLastOpen}
        title={`Use the last ${entry.item.name}?`}
        description={`${locationLabel(entry.location)} stock will be removed from your pantry. The catalog item stays for next time.`}
        confirmLabel="Used the last one"
        onConfirm={confirmUseLast}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Remove ${entry.item.name}?`}
        description={`${locationLabel(entry.location)} stock of ${quantity} will be deleted. The catalog item stays.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const result = await deleteInventory(entry.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${entry.item.name} removed`);
          router.refresh();
        }}
      />
    </li>
  );
}
