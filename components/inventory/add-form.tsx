"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  ScanBarcode,
  Search,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScanSheet } from "@/components/scan-sheet";
import { addDays, suggestExpiration } from "@/lib/expiry";
import type { OffProduct } from "@/lib/off";
import {
  addToInventory,
  resolveBarcode,
  searchCatalog,
} from "@/app/(app)/inventory/actions";
import type { CategoryRow, ItemRow, Location } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

const SOURCES = ["Meijer", "Kroger", "Amazon", "Costco", "Trader Joe's", "Aldi"];

type Props = {
  categories: CategoryRow[];
  defaultLocation: Location;
  initialBarcode: string | null;
};

export function AddForm({
  categories,
  defaultLocation,
  initialBarcode,
}: Props) {
  const router = useRouter();
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<ItemRow[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [expirationDate, setExpirationDate] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [lowThreshold, setLowThreshold] = useState("");
  const [autoRestock, setAutoRestock] = useState(false);
  const [off, setOff] = useState<OffProduct | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);
  const lookupRef = useRef(false);

  const suggestion = useMemo(() => {
    if (selectedItem?.expiration_days != null) {
      return {
        days: selectedItem.expiration_days,
        reason: `${selectedItem.name} default`,
      };
    }
    if (off) return suggestExpiration(off.categories, off.name ?? name);
    return null;
  }, [selectedItem, off, name]);

  useEffect(() => {
    if (!initialBarcode || lookupRef.current) return;
    lookupRef.current = true;
    void lookupBarcode(initialBarcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode]);

  const effectiveExpiry = expiryTouched
    ? expirationDate
    : suggestion
      ? addDays(suggestion.days)
      : "";

  function applyItem(item: ItemRow) {
    setSelectedItem(item);
    setName(item.name);
    setMatches([]);
    setBarcode(item.barcode ?? barcode);
    setUnit(item.unit ?? "");
    setCategoryId(item.category_id ?? "");
    setLowThreshold(item.low_threshold != null ? String(item.low_threshold) : "");
    setAutoRestock(item.auto_restock);
    setLocation(item.default_location);
    setOff(null);
    if (item.expiration_days != null && !expiryTouched) {
      setExpirationDate(addDays(item.expiration_days));
    }
  }

  async function lookupBarcode(code: string) {
    const clean = code.trim();
    if (!/^\d{6,14}$/.test(clean)) return;
    setLookupBusy(true);
    const result = await resolveBarcode(clean);
    setLookupBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { item, off: product } = result.data;
    if (item) {
      applyItem(item);
      toast.success(`Found ${item.name}`);
      return;
    }
    if (product) {
      setOff(product);
      setSelectedItem(null);
      if (!name && product.name) setName(product.name);
      if (product.quantity && !unit) setUnit(product.quantity);
      toast.success(`Product found: ${product.name ?? clean}`);
      return;
    }
    setSelectedItem(null);
    toast.message("Barcode not found in Open Food Facts", {
      description: "Add the name and details yourself.",
    });
  }

  function onNameChange(value: string) {
    setName(value);
    if (selectedItem && value !== selectedItem.name) {
      setSelectedItem(null);
      setOff(null);
    }
    window.clearTimeout(searchTimer.current);
    if (value.trim().length < 2 || selectedItem) {
      setMatches([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      const result = await searchCatalog(value.trim());
      if (result.ok) {
        setMatches(
          result.data.items.filter((item) => item.name !== value.trim()),
        );
      }
    }, 250);
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName && !selectedItem) {
      toast.error("Give the item a name");
      return;
    }
    setBusy(true);
    const result = await addToInventory({
      itemId: selectedItem?.id ?? null,
      name: trimmedName || (selectedItem?.name ?? ""),
      barcode: barcode.trim() || null,
      categoryId: categoryId || null,
      location,
      quantity,
      unit: unit.trim() || null,
      expirationDate: effectiveExpiry || null,
      source: source.trim() || null,
      notes: notes.trim() || null,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      autoRestock,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `${result.data.inventory.item?.name ?? trimmedName} added to ${location}`,
    );

    // Keep location + source for rapid entry of a shopping trip.
    setBarcode("");
    setSelectedItem(null);
    setName("");
    setMatches([]);
    setQuantity(1);
    setUnit("");
    setNotes("");
    setOff(null);
    setExpiryTouched(false);
    setExpirationDate("");
    lookupRef.current = false;
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/inventory" />}
            aria-label="Back to inventory"
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Add to inventory</h1>
            <p className="text-xs text-muted-foreground">
              Full control — quantity, expiry, and location.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/inventory/shop" />}
        >
          Just bought mode
        </Button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Scan or type a barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onBlur={() => void lookupBarcode(barcode)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setScanOpen(true)}
              disabled={lookupBusy}
            >
              {lookupBusy ? <Loader2 className="animate-spin" /> : <ScanBarcode />}
              Scan
            </Button>
          </div>
          {off ? (
            <p className="text-xs text-muted-foreground">
              {off.name}
              {off.brands ? ` · ${off.brands}` : ""}
              {" · "}
              <a
                href={`https://world.openfoodfacts.org/product/${barcode}`}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                via Open Food Facts (ODbL)
              </a>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="name"
              placeholder={selectedItem ? selectedItem.name : "Milk, black beans…"}
              className="pl-8"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              autoComplete="off"
            />
            {matches.length > 0 ? (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                {matches.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => applyItem(item)}
                    >
                      <span>{item.name}</span>
                      {item.barcode ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {item.barcode}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                −
              </Button>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.max(0, Number(event.target.value) || 0))
                }
                className="text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase quantity"
                onClick={() => setQuantity((value) => value + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Unit (optional)</Label>
            <Input
              id="unit"
              placeholder="ea, lb, oz…"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <div className="grid grid-cols-3 gap-2">
            {LOCATIONS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setLocation(entry.value)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  location === entry.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiry">Expiration</Label>
          <Input
            id="expiry"
            type="date"
            value={expirationDate}
            onChange={(event) => {
              setExpiryTouched(true);
              setExpirationDate(event.target.value);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {suggestion ? (
              <button
                type="button"
                className="rounded-full border border-primary px-2 py-0.5 font-medium text-primary"
                onClick={() => {
                  setExpiryTouched(true);
                  setExpirationDate(addDays(suggestion.days));
                }}
              >
                Suggested: {suggestion.days}d ({suggestion.reason})
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-full border px-2 py-0.5 text-muted-foreground"
              onClick={() => {
                setExpiryTouched(true);
                setExpirationDate("");
              }}
            >
              No expiry
            </button>
            <button
              type="button"
              className="rounded-full border px-2 py-0.5 text-muted-foreground"
              onClick={() => {
                setExpiryTouched(true);
                setExpirationDate(addDays(7));
              }}
            >
              +7 days
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryId || "__none"}
              items={[
                { value: "__none", label: "None" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              onValueChange={(value) =>
                setCategoryId(value && value !== "__none" ? value : "")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              list="source-options"
              placeholder="Meijer…"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
            <datalist id="source-options">
              {SOURCES.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
        </div>

        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            Low-stock options
          </summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="threshold">Running low at or below</Label>
              <Input
                id="threshold"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 1"
                value={lowThreshold}
                onChange={(event) => setLowThreshold(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={autoRestock}
                onCheckedChange={(checked) => setAutoRestock(checked === true)}
              />
              Auto-add to grocery list when it gets low
            </label>
          </div>
        </details>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input
            id="notes"
            placeholder="Bottom shelf, baking stash…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add to {location}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/inventory" />}
          >
            Cancel
          </Button>
        </div>
      </form>

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onBarcode={(code) => {
          setScanOpen(false);
          setBarcode(code);
          void lookupBarcode(code);
        }}
        title="Scan product barcode"
        description="We'll fill in what we know about the product."
      />
    </div>
  );
}
