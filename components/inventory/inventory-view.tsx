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
  consumeFromItem,
  deleteInventory,
  restoreBatches,
  resolveBarcode,
  updateInventory,
} from "@/app/(app)/inventory/actions";
import { compareByExpiry, expiryBucket } from "@/lib/expiry";
import { effectiveExpiryDate, expiryChipProps } from "@/lib/freezer";
import {
  earliestEffective,
  groupByItem,
  multiDate,
  pickFefoBatch,
  scopedBatches,
  toBatchSnapshot,
  type ItemGroup,
} from "@/lib/batches";
import { displayQtyUnit, stockPoolKey } from "@/lib/stock";
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
  canonicalNames,
}: {
  rows: InventoryEntry[];
  subcategories: SubcategoryRow[];
  holdsByItem: Record<string, number>;
  /** Item id → display name of its generic ingredient ("as Ground Beef"). */
  canonicalNames: Record<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [useSoon, setUseSoon] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [consumeTarget, setConsumeTarget] = useState<{
    item: ItemGroup["item"];
    mode: "partial" | "last";
  } | null>(null);

  const groups = useMemo(() => groupByItem(rows), [rows]);

  const counts = useMemo(() => {
    const byLocation: Record<Tab, number> = {
      all: groups.length,
      pantry: 0,
      fridge: 0,
      freezer: 0,
    };
    for (const group of groups) {
      for (const location of group.locations) byLocation[location] += 1;
    }
    return byLocation;
  }, [groups]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = groups.filter((group) => {
      const scoped = scopedBatches(group.batches, tab);
      if (scoped.length === 0) return false;
      if (subFilter && group.item.subcategory_id !== subFilter) return false;
      if (useSoon) {
        // Storage-aware: frozen batches count down by best-quality date.
        const soon = scoped.some((row) => {
          const bucket = expiryBucket(effectiveExpiryDate(row));
          return bucket === "expired" || bucket === "urgent" || bucket === "soon";
        });
        if (!soon) return false;
      }
      if (lowOnly && !group.low) return false;
      if (needle) {
        const name = group.item.name.toLowerCase();
        const barcode = group.item.barcode ?? "";
        if (!name.includes(needle) && !barcode.includes(needle)) return false;
      }
      return true;
    });

    return [...result].sort((a, b) =>
      compareByExpiry(
        earliestEffective(scopedBatches(a.batches, tab)),
        a.item.name,
        earliestEffective(scopedBatches(b.batches, tab)),
        b.item.name,
      ),
    );
  }, [groups, tab, query, useSoon, lowOnly, subFilter]);

  const lowCount = groups.filter((group) => group.low).length;

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
              {groups.length} {groups.length === 1 ? "item" : "items"} ·{" "}
              {rows.length} {rows.length === 1 ? "batch" : "batches"}
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
          {visible.map((group) => (
            <InventoryItemCard
              key={group.item.id}
              group={group}
              tab={tab}
              canonicalName={canonicalNames[group.item.id] ?? null}
              subcategoryName={
                group.item.subcategory_id
                  ? (subNameById.get(group.item.subcategory_id) ?? null)
                  : null
              }
              onHold={
                holdsByItem[
                  stockPoolKey(group.item.id, group.batches[0]?.unit ?? null)
                ] ?? 0
              }
              onConsume={(mode) =>
                setConsumeTarget({ item: group.item, mode })
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
          key={`${consumeTarget.item.id}-${tab}-${consumeTarget.mode}`}
          item={consumeTarget.item}
          totalQuantity={
            scopedQuantity(
              groups.find((group) => group.item.id === consumeTarget.item.id),
              tab,
            )
          }
          scope={tab}
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

function scopedQuantity(group: ItemGroup | undefined, tab: Tab): number {
  if (!group) return 0;
  if (tab === "all") return group.totalQuantity;
  return group.locationTotals[tab] ?? 0;
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

function InventoryItemCard({
  group,
  tab,
  canonicalName,
  subcategoryName,
  onHold,
  onConsume,
}: {
  group: ItemGroup;
  tab: Tab;
  /** Generic ingredient this product matches recipes as, when mapped. */
  canonicalName: string | null;
  subcategoryName: string | null;
  onHold: number;
  onConsume: (mode: "partial" | "last") => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [useLastOpen, setUseLastOpen] = useState(false);

  const { item, batches } = group;
  const scoped = scopedBatches(batches, tab);
  const quantity =
    tab === "all" ? group.totalQuantity : (group.locationTotals[tab] ?? 0);
  const chipEntry = pickFefoBatch(scoped) ?? batches[0];
  const unit = scoped[0]?.unit ?? batches[0]?.unit ?? item.unit;
  const { unitText } = displayQtyUnit(quantity, unit);
  const scopedLocations = tab === "all" ? group.locations : [tab];
  const multi = multiDate(scoped);
  const low = group.low;

  async function quickUse() {
    const result = await consumeFromItem({
      itemId: item.id,
      amount: 1,
      location: tab === "all" ? undefined : tab,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Used 1 ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () => void restoreBatches({ snapshots: result.data.snapshots }),
      },
    });
    router.refresh();
  }

  async function confirmUseLast() {
    const result = await consumeFromItem({
      itemId: item.id,
      amount: quantity,
      location: tab === "all" ? undefined : tab,
      addToGrocery: false,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Used the last ${item.name} · removed from pantry`,
      {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreBatches({ snapshots: result.data.snapshots }),
        },
        duration: 8000,
      },
    );
    router.refresh();
  }

  async function quickAdd() {
    const target = pickFefoBatch(scoped);
    if (!target) return;
    const result = await updateInventory({
      inventoryId: target.id,
      quantity: target.quantity + 1,
    });
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  async function toggleLow() {
    const target = !batches.some((row) => row.is_low);
    for (const row of batches) {
      if (row.is_low === target) continue;
      const result = await updateInventory({
        inventoryId: row.id,
        isLow: target,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    if (target) toast.success(`${item.name} flagged as running low`);
    router.refresh();
  }

  async function removeItem() {
    const snapshots = batches.map(toBatchSnapshot);
    for (const row of batches) {
      const result = await deleteInventory(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    toast.success(`${item.name} removed`, {
      action: {
        label: "Undo",
        onClick: () => void restoreBatches({ snapshots }),
      },
      duration: 8000,
    });
    router.refresh();
  }

  return (
    <li className="rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/inventory/${item.id}`}
            prefetch
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            <span className="truncate text-sm font-semibold">
              {item.name}
            </span>
            {low ? (
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            ) : null}
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Add one ${item.name}`}
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
              aria-label={`Use one ${item.name}`}
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
                void addInventoryToGrocery(batches[0].id).then((result) => {
                  toast.success(
                    result.ok && result.data.created
                      ? `${item.name} added to grocery list`
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
              <CircleAlert /> {low ? "Clear low flag" : "Mark running low"}
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

        {canonicalName ? (
          <p className="text-xs text-muted-foreground">as {canonicalName}</p>
        ) : null}

        <Link
          href={`/inventory/${item.id}`}
          prefetch
          className="flex flex-wrap items-center gap-1.5"
        >
          {unitText ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-800">
              {unitText}
            </span>
          ) : null}
          {chipEntry ? (
            <ExpiryChip {...expiryChipProps(chipEntry)} className="uppercase" />
          ) : null}
          {multi ? (
            <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold uppercase text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              Multiple dates
            </span>
          ) : null}
          {scopedLocations.map((location) => (
            <LocationBadge
              key={location}
              location={location}
              className="uppercase"
            />
          ))}
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
        title={`Use the last ${item.name}?`}
        description={`${scopedLocations.map(locationLabel).join(", ")} stock will be removed from your pantry. The catalog item stays for next time.`}
        confirmLabel="Used the last one"
        onConfirm={confirmUseLast}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Remove ${item.name}?`}
        description={`All ${batches.length} ${
          batches.length === 1 ? "batch" : "batches"
        } (${quantity} total) will be deleted. The catalog item stays.`}
        confirmLabel="Remove"
        destructive
        onConfirm={removeItem}
      />
    </li>
  );
}
