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
  addInventoryToGrocery,
  consumeInventory,
  deleteInventory,
  resolveBarcode,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { expiryBucket } from "@/lib/expiry";
import { isLowStock } from "@/lib/stock";
import { foodEmoji, tileGradient } from "@/lib/tiles";
import { cn } from "@/lib/utils";
import type { CategoryRow, InventoryEntry, Location } from "@/lib/types";

type Tab = "all" | Location;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

export function InventoryView({
  rows,
  categories,
}: {
  rows: InventoryEntry[];
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [useSoon, setUseSoon] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
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

    result = [...result].sort((a, b) => {
      if (useSoon) {
        const left = a.expiration_date ?? "9999-12-31";
        const right = b.expiration_date ?? "9999-12-31";
        if (left !== right) return left < right ? -1 : 1;
      }
      return a.item.name.localeCompare(b.item.name);
    });
    return result;
  }, [rows, tab, query, useSoon, lowOnly]);

  const lowCount = rows.filter((row) => isLowStock(row, row.item)).length;

  async function handleBarcode(code: string) {
    setScanOpen(false);
    const result = await resolveBarcode(code);
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
              categoryName={
                row.item.category_id
                  ? (categories.find((entry) => entry.id === row.item.category_id)
                      ?.name ?? null)
                  : null
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
  categoryName,
  onConsume,
}: {
  entry: InventoryEntry;
  categoryName: string | null;
  onConsume: (mode: "partial" | "last") => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const low = isLowStock(entry, entry.item);
  const quantity = entry.quantity;

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
    if (result.data.quantity <= 0) {
      toast.success(`Used the last ${name}`, {
        action: {
          label: "Add to list",
          onClick: () => void addInventoryToGrocery(entry.id),
        },
        duration: 8000,
      });
    } else {
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
    }
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
      <div className="flex items-start gap-2.5">
        <Link
          href={`/inventory/${entry.id}`}
          prefetch
          className="flex min-w-0 flex-1 items-start gap-2.5"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xl",
              tileGradient(entry.item.name),
            )}
            aria-hidden
          >
            {entry.item.icon ?? foodEmoji(entry.item.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-sm font-semibold",
                  quantity <= 0 && "text-muted-foreground line-through",
                )}
              >
                {entry.item.name}
              </span>
              {low ? (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              ) : null}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <LocationBadge location={entry.location} />
              {categoryName ? (
                <span className="inline-flex max-w-40 items-center truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {categoryName}
                </span>
              ) : null}
              <ExpiryChip date={entry.expiration_date} />
              {quantity <= 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                  Out
                </span>
              ) : low ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <TriangleAlert className="h-3 w-3" /> Low
                </span>
              ) : null}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <span className="w-10 text-right text-sm font-extrabold tabular-nums">
            {quantity % 1 === 0 ? quantity : quantity.toFixed(1)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Use one ${entry.item.name}`}
            disabled={quantity <= 0}
            onClick={quickUse}
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
              disabled={quantity <= 0}
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
