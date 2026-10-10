"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { io } from "next/cache";
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
  listCanonicalCandidates,
  resolveBarcode,
  searchCatalog,
  type CanonicalCandidateView,
} from "@/app/(app)/inventory/actions";
import {
  brandTokenList,
  matchCanonical,
  type CanonicalCandidate,
} from "@/lib/canonical";
import type { ItemRow, Location, SubcategoryRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

type Props = {
  subcategories: SubcategoryRow[];
  defaultLocation: Location;
  initialBarcode: string | null;
};

export function AddForm({
  subcategories,
  defaultLocation,
  initialBarcode,
}: Props) {
  use(io());
  const router = useRouter();
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<ItemRow[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("oz");
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [expirationDate, setExpirationDate] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [lowThreshold, setLowThreshold] = useState("");
  const [autoRestock, setAutoRestock] = useState(false);
  const [off, setOff] = useState<OffProduct | null>(null);
  const [canonicalName, setCanonicalName] = useState("");
  const [candidatePool, setCandidatePool] = useState<{
    items: CanonicalCandidateView[];
    recipeNames: string[];
  } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);
  const lookupRef = useRef(false);
  const canonicalTouchedRef = useRef(false);

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

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await listCanonicalCandidates();
      if (alive && result.ok) setCandidatePool(result.data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const canonicalCandidates: CanonicalCandidate[] = useMemo(() => {
    if (!candidatePool) return [];
    return [
      ...candidatePool.items.map((item) => ({
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        canonicalSafe: item.canonicalItemId == null,
      })),
      ...candidatePool.recipeNames.map((recipeName) => ({
        id: `recipe:${recipeName}`,
        name: recipeName,
        categoryId: null,
        canonicalSafe: true,
        virtual: true,
      })),
    ];
  }, [candidatePool]);

  const canonicalMatch = useMemo(() => {
    if (selectedItem || !candidatePool || name.trim().length < 2) return null;
    return matchCanonical(name, canonicalCandidates, {
      brandTokens: brandTokenList(off?.brands ?? null),
      categoryId: categoryId || null,
    });
  }, [selectedItem, candidatePool, canonicalCandidates, name, off, categoryId]);

  // Keep the suggested generic identity in sync until the user edits it.
  useEffect(() => {
    if (canonicalTouchedRef.current) return;
    const first =
      canonicalMatch?.status === "high" || canonicalMatch?.status === "suggested"
        ? canonicalMatch.candidates[0]
        : undefined;
    setCanonicalName(first?.name ?? "");
  }, [canonicalMatch]);

  const canonicalOptions = useMemo(() => {
    const matched = canonicalMatch?.candidates ?? [];
    const matchedIds = new Set(matched.map((entry) => entry.id));
    return [
      ...matched,
      ...canonicalCandidates
        .filter((entry) => !matchedIds.has(entry.id) && entry.canonicalSafe)
        .slice(0, 60),
    ].slice(0, 80);
  }, [canonicalMatch, canonicalCandidates]);

  const canonicalHint = (() => {
    if (selectedItem) return null;
    if (canonicalMatch?.status === "high") {
      return "Suggested match — confirm or change it.";
    }
    if (canonicalMatch?.status === "suggested") {
      return "Possible match — confirm or change it.";
    }
    if (canonicalMatch?.status === "ambiguous") {
      const names = canonicalMatch.candidates
        .slice(0, 3)
        .map((entry) => entry.name)
        .join(", ");
      return `Several possible matches (${names}) — pick one, or leave blank to keep it separate.`;
    }
    return "Optional — the generic ingredient recipes should match on.";
  })();

  const effectiveExpiry = expiryTouched
    ? expirationDate
    : suggestion
      ? addDays(suggestion.days)
      : "";

  function applyItem(item: ItemRow) {
    setSelectedItem(item);
    setName(item.name);
    setMatches([]);
    setCanonicalName("");
    canonicalTouchedRef.current = false;
    setBarcode(item.barcode ?? barcode);
    setUnit(item.unit ?? "oz");
    setCategoryId(item.category_id ?? "");
    setSubcategoryId(item.subcategory_id ?? "");
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
    let result;
    try {
      result = await resolveBarcode(clean);
    } catch {
      setLookupBusy(false);
      toast.error("Lookup failed — check your connection and try again.");
      return;
    }
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
      canonicalTouchedRef.current = false;
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
    canonicalTouchedRef.current = false;
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
      subcategoryId: subcategoryId || null,
      location,
      quantity,
      unit: unit.trim() || null,
      expirationDate: effectiveExpiry || null,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      autoRestock,
      canonicalName: canonicalName.trim() || null,
      brand: off?.brands?.trim() || null,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `${result.data.inventory.item?.name ?? trimmedName} added to ${location}`,
    );

    // Keep location for rapid entry of a shopping trip.
    setBarcode("");
    setSelectedItem(null);
    setName("");
    setMatches([]);
    setQuantity(1);
    setUnit("oz");
    setSubcategoryId("");
    setCategoryId("");
    setLowThreshold("");
    setAutoRestock(false);
    setOff(null);
    setExpiryTouched(false);
    setExpirationDate("");
    setCanonicalName("");
    canonicalTouchedRef.current = false;
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
            <h1 className="text-lg font-extrabold">Add to inventory</h1>
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

        {!selectedItem ? (
          <div className="space-y-2">
            <Label htmlFor="canonical">Matches recipes as</Label>
            <Input
              id="canonical"
              list="canonical-options"
              placeholder={
                canonicalMatch?.status === "ambiguous"
                  ? "Pick the generic ingredient"
                  : "Generic ingredient (e.g. Ground Beef)"
              }
              value={canonicalName}
              onChange={(event) => {
                canonicalTouchedRef.current = true;
                setCanonicalName(event.target.value);
              }}
              autoComplete="off"
            />
            <datalist id="canonical-options">
              {canonicalOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.name} />
              ))}
            </datalist>
            {canonicalHint ? (
              <p className="text-xs text-muted-foreground">{canonicalHint}</p>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-3 rounded-xl border bg-background p-4">
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
            <Label>Location</Label>
            <div className="grid grid-cols-3 gap-2">
              {LOCATIONS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setLocation(entry.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
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
                  className="rounded-full border border-primary px-2 py-0.5 font-semibold text-primary"
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
                className="rounded-full border-2 px-2 py-0.5 text-muted-foreground"
                onClick={() => {
                  setExpiryTouched(true);
                  setExpirationDate("");
                }}
              >
                No expiry
              </button>
              <button
                type="button"
                className="rounded-full border-2 px-2 py-0.5 text-muted-foreground"
                onClick={() => {
                  setExpiryTouched(true);
                  setExpirationDate(addDays(7));
                }}
              >
                +7 days
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-background p-4">
          <div className="space-y-2">
            <Label>Sub-category</Label>
            <Select
              value={subcategoryId || "__none"}
              items={[
                { value: "__none", label: "None" },
                ...subcategories.map((subcategory) => ({
                  value: subcategory.id,
                  label: subcategory.name,
                })),
              ]}
              onValueChange={(value) =>
                setSubcategoryId(value && value !== "__none" ? value : "")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {subcategories.map((subcategory) => (
                  <SelectItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unit</Label>
            <Input
              id="unit"
              placeholder="ea, lb, oz…"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </div>

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
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoRestock}
                onCheckedChange={(checked) => setAutoRestock(checked === true)}
              />
              Auto-add to grocery list when it gets low
            </label>
          </div>
        </section>

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
