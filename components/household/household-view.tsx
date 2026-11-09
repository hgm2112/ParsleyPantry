"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  ScanBarcode,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ScanSheet } from "@/components/scan-sheet";
import {
  adjustHouseholdQuantity,
  addHouseholdItemToGrocery,
  deleteHouseholdItem,
} from "@/app/(app)/household/actions";
import { cn } from "@/lib/utils";
import {
  HOUSEHOLD_CATEGORIES,
  HOUSEHOLD_STORAGE_LOCATIONS,
  isHouseholdItemLow,
} from "@/lib/types";
import type { HouseholdItemRow } from "@/lib/types";

const SORTS = [
  { value: "name-az", label: "Name — A to Z" },
  { value: "low-first", label: "Low stock first" },
  { value: "qty-low", label: "Quantity — lowest first" },
  { value: "qty-high", label: "Quantity — highest first" },
  { value: "recent", label: "Recently added" },
];

export function HouseholdView({ rows }: { rows: HouseholdItemRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [sortKey, setSortKey] = useState("name-az");
  const [scanOpen, setScanOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HouseholdItemRow | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (category && row.category !== category) return false;
        if (storage && row.storage_location !== storage) return false;
        if (lowOnly && !isHouseholdItemLow(row)) return false;
        if (needle) {
          return (
            row.name.toLowerCase().includes(needle) ||
            (row.barcode ?? "").includes(needle)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === "low-first") {
          const al = isHouseholdItemLow(a) ? 0 : 1;
          const bl = isHouseholdItemLow(b) ? 0 : 1;
          return al - bl || a.name.localeCompare(b.name);
        }
        if (sortKey === "qty-low") return a.quantity - b.quantity;
        if (sortKey === "qty-high") return b.quantity - a.quantity;
        if (sortKey === "recent") return b.created_at.localeCompare(a.created_at);
        return a.name.localeCompare(b.name);
      });
  }, [rows, query, category, storage, lowOnly, sortKey]);

  const lowCount = rows.filter(isHouseholdItemLow).length;

  async function handleQty(row: HouseholdItemRow, delta: number) {
    if (busyId) return;
    setBusyId(row.id);
    const result = await adjustHouseholdQuantity(row.id, delta);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.deleted) toast.success(`${row.name} removed (out of stock)`);
    router.refresh();
  }

  async function handleGrocery(row: HouseholdItemRow) {
    const result = await addHouseholdItemToGrocery(row.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.created
        ? `${result.data.name} added to shopping list`
        : "Already on the grocery list",
    );
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteHouseholdItem(deleteTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${deleteTarget.name} removed`);
    setDeleteTarget(null);
    router.refresh();
  }

  function handleBarcode(code: string) {
    setScanOpen(false);
    router.push(`/household/add?barcode=${encodeURIComponent(code)}`);
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-3 border-b bg-background/95 px-3 pt-3 pb-2.5 backdrop-blur md:top-14 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold">Household</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "item" : "items"}
              {lowCount > 0 ? (
                <span className="text-orange-600 dark:text-orange-300">
                  {" "}
                  · {lowCount} running low
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="flex overflow-hidden rounded-md border md:hidden"
              aria-label="Inventory section"
            >
              <Link
                href="/inventory"
                className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
              >
                Pantry
              </Link>
              <span className="px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground">
                Household
              </span>
            </div>
            <Button
              variant="default"
              size="sm"
              type="button"
              className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setScanOpen(true)}
            >
              <Plus /> Add
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search household items"
              className="h-9 pl-8 pr-3"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setLowOnly((v) => !v)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
              lowOnly
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            Low stock
          </button>
          {HOUSEHOLD_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory((c) => (c === cat ? null : cat))}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                category === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {cat}
            </button>
          ))}
          {HOUSEHOLD_STORAGE_LOCATIONS.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setStorage((s) => (s === loc ? null : loc))}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                storage === loc
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {loc}
            </button>
          ))}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1 text-xs" />
                }
              >
                Sort: {SORTS.find((o) => o.value === sortKey)?.label ?? "Sort"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {SORTS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortKey(opt.value)}
                    className={cn(sortKey === opt.value && "font-medium bg-muted")}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-semibold">
            {rows.length === 0 ? "Your household stock is empty" : "Nothing matches those filters"}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {rows.length === 0
              ? "Scan a barcode or add supplies manually to start tracking."
              : "Try a different filter or clear the search."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" render={<Link href="/household/add" />}>
              <Plus /> Add item
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)}>
              <ScanBarcode /> Scan
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => {
            const low = isHouseholdItemLow(row);
            return (
              <li
                key={row.id}
                className="rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Link
                        href={`/household/${row.id}`}
                        className="min-w-0 truncate text-sm font-semibold hover:text-primary"
                      >
                        {row.name}
                      </Link>
                      {low ? (
                        <Popover>
                          <PopoverTrigger
                            type="button"
                            aria-label="Running low"
                            className="inline-flex shrink-0 items-center rounded-sm text-amber-600 transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-amber-300"
                          >
                            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                          </PopoverTrigger>
                          <PopoverContent align="start" sideOffset={4} className="max-w-xs">
                            <p className="text-sm font-medium">Running low</p>
                            <p className="text-xs text-muted-foreground">
                              At or below your low threshold.
                            </p>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Add one ${row.name}`}
                        disabled={busyId !== null}
                        onClick={() => void handleQty(row, 1)}
                      >
                        {busyId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <span className="min-w-8 text-center text-sm font-extrabold tabular-nums">
                        {row.quantity % 1 === 0 ? row.quantity : row.quantity.toFixed(1)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Remove one ${row.name}`}
                        disabled={busyId !== null}
                        onClick={() => void handleQty(row, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label="More actions" />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void handleGrocery(row)}>
                          <ShoppingCart /> Add to shopping list
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 /> Remove item
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      {row.category}
                    </span>
                    <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                      {row.storage_location}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onBarcode={handleBarcode}
        title="Scan a household supply"
        description="Opens the add form with this barcode looked up — you review and save."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Remove ${deleteTarget?.name ?? "item"}?`}
        description="This permanently deletes the household supply."
        confirmLabel="Remove"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
