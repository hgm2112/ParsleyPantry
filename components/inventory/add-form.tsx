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
import {
  ExpirationEntries,
  FreezerFields,
  LocationPicker,
  defaultFreezeValue,
  entriesToBatches,
  freezeInputFor,
  newExpirationEntry,
  type ExpirationEntryValue,
  type FreezeValue,
} from "@/components/inventory/entry-fields";
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
import {
  FREEZER_UNKNOWN_KEY,
  foodTypeByKey,
  guessFreezerFoodType,
} from "@/lib/freezer";
import type { ItemRow, Location, SubcategoryRow } from "@/lib/types";

type Props = {
  subcategories: SubcategoryRow[];
  defaultLocation: Location;
  initialBarcode: string | null;
  /**
   * Existing catalog item to prefill when opening the form from search. This
   * reuses the existing item record instead of a barcode lookup.
   */
  initialItem?: ItemRow | null;
  /**
   * Changes when a *new* scan should re-run the lookup even if this route
   * instance survived navigation (Next keeps ~3 routes in <Activity>).
   */
  lookupKey?: string | null;
  returnTo?: string | null;
  onSaved?: (() => void) | null;
  onCancel?: (() => void) | null;
  onScanAgain?: (() => void) | null;
};

export function AddForm({
  subcategories,
  defaultLocation,
  initialBarcode,
  initialItem = null,
  lookupKey = null,
  returnTo = "/inventory",
  onSaved = null,
  onCancel = null,
  onScanAgain = null,
}: Props) {
  use(io());
  const router = useRouter();
  const safeReturnTo =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/inventory";
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<ItemRow[]>([]);
  const [entries, setEntries] = useState<ExpirationEntryValue[]>(() => [
    newExpirationEntry(),
  ]);
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [freeze, setFreeze] = useState<FreezeValue>(defaultFreezeValue);
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
  const busyRef = useRef(false);
  const lastLookupRef = useRef<string | null>(null);
  const canonicalTouchedRef = useRef(false);
  const foodTypeTouchedRef = useRef(false);
  // Async lookups resume after a re-render, so "did the user type this?" must
  // live in refs rather than the values captured by the current render.
  const nameDirtyRef = useRef(false);
  const unitDirtyRef = useRef(false);

  const initialItemId = initialItem?.id ?? null;

  // Prefill from an existing household catalog item (e.g. opened from search),
  // so it can be re-added without a barcode scan. applyItem() preserves the
  // saved name/unit/category/brand and merge into the selected batch on save.
  useEffect(() => {
    if (initialItem) applyItem(initialItem);
    // Only prefill once per selected item; cleanup is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemId]);

  const lookupToken = initialBarcode ? `${initialBarcode}|${lookupKey ?? ""}` : null;

  useEffect(() => {
    if (!lookupToken || lastLookupRef.current === lookupToken) return;
    lastLookupRef.current = lookupToken;
    // A fresh scan — clear leftovers from any previous lookup so the form
    // only reflects what this barcode resolves to.
    setName("");
    setMatches([]);
    setSelectedItem(null);
    setOff(null);
    setCanonicalName("");
    canonicalTouchedRef.current = false;
    nameDirtyRef.current = false;
    setEntries([newExpirationEntry()]);
    void lookupBarcode(initialBarcode ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupToken, initialBarcode]);

  // Prefill the freezer food type until the user picks one (or clears it).
  useEffect(() => {
    if (foodTypeTouchedRef.current) return;
    const saved = foodTypeByKey(selectedItem?.freezer_food_type);
    const guess = guessFreezerFoodType(name);
    setFreeze((current) => ({
      ...current,
      foodType: saved?.key ?? guess ?? FREEZER_UNKNOWN_KEY,
    }));
  }, [name, selectedItem]);

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

  function applyItem(item: ItemRow) {
    setSelectedItem(item);
    setName(item.name);
    nameDirtyRef.current = false;
    setMatches([]);
    setCanonicalName("");
    canonicalTouchedRef.current = false;
    foodTypeTouchedRef.current = false;
    setBarcode(item.barcode ?? barcode);
    setUnit(item.unit ?? "");
    unitDirtyRef.current = false;
    setCategoryId(item.category_id ?? "");
    setSubcategoryId(item.subcategory_id ?? "");
    setLowThreshold(item.low_threshold != null ? String(item.low_threshold) : "");
    setAutoRestock(item.auto_restock);
    setLocation(item.default_location);
    setOff(null);
  }

  async function lookupBarcode(code: string) {
    const clean = code.trim();
    // Short codes are almost always accidental input, not barcodes.
    if (clean.length < 4) return;
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
      if (product) {
        setOff(product);
        // Only fill fields the household item does not already preserve.
        if (!item.unit && product.quantity && !unitDirtyRef.current) {
          setUnit(product.quantity);
        }
      }
      toast.success(`Found ${item.name}`);
      return;
    }
    if (product) {
      setOff(product);
      setSelectedItem(null);
      canonicalTouchedRef.current = false;
      if (!nameDirtyRef.current && product.name) setName(product.name);
      if (product.quantity && !unitDirtyRef.current) {
        setUnit(product.quantity);
      }
      toast.success(`Product found: ${product.name ?? clean}`);
      return;
    }
    setSelectedItem(null);
    toast.message(`Barcode ${clean} not found`, {
      description:
        "Not in your pantry or Open Food Facts — enter the name and details yourself.",
    });
  }

  function onNameChange(value: string) {
    setName(value);
    nameDirtyRef.current = true;
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

  async function saveCurrent(mode: "navigate" | "scan-again" | "stay" = "stay") {
    // Ref guard: a double click / double Enter can fire before the disabled
    // button re-renders, and one submit must mean one addition.
    if (busyRef.current) return;
    const trimmedName = name.trim();
    if (!trimmedName && !selectedItem) {
      toast.error("Give the item a name");
      return;
    }
    const batches = entriesToBatches(entries);
    if (batches.length === 0) {
      toast.error("Enter a quantity for at least one date");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    let result: Awaited<ReturnType<typeof addToInventory>>;
    try {
      result = await addToInventory({
        itemId: selectedItem?.id ?? null,
        name: trimmedName || (selectedItem?.name ?? ""),
        barcode: barcode.trim() || null,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        location,
        batches,
        unit: unit.trim() || null,
        lowThreshold: lowThreshold ? Number(lowThreshold) : null,
        autoRestock,
        canonicalName: canonicalName.trim() || null,
        brand: off?.brands?.trim() || null,
        ...freezeInputFor(freeze, location),
      });
    } catch {
      toast.error("Could not add item — check your connection and try again.");
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

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
    setEntries([newExpirationEntry()]);
    setUnit("");
    setSubcategoryId("");
    setCategoryId("");
    setLowThreshold("");
    setAutoRestock(false);
    setOff(null);
    setCanonicalName("");
    setFreeze(defaultFreezeValue());
    canonicalTouchedRef.current = false;
    foodTypeTouchedRef.current = false;
    nameDirtyRef.current = false;
    if (mode === "navigate") {
      if (onSaved) onSaved();
      else router.push(safeReturnTo);
    } else if (mode === "scan-again") {
      if (onScanAgain) onScanAgain();
      else setScanOpen(true);
    } else {
      router.refresh();
    }
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
              Full control — quantity, expiry, location, and freezer state.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/inventory/shop" />}
        >
          Live scan
        </Button>
      </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveCurrent("navigate");
          }}
          className="space-y-4"
        >
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
                placeholder="Scan or type a barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onBlur={() => void lookupBarcode(barcode)}
              />
              <Button
                type="button"
                className="px-4"
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
            <Label>Location</Label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          <FreezerFields
            location={location}
            name={selectedItem?.name ?? name}
            value={freeze}
            onChange={setFreeze}
          />

          <ExpirationEntries entries={entries} onChange={setEntries} />
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
              onChange={(event) => {
                  setUnit(event.target.value);
                  unitDirtyRef.current = true;
                }}
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={() => void saveCurrent("navigate")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            + Add to Inventory
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={() => void saveCurrent("scan-again")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            + Add to Inventory & Scan Again
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              render={<Link href={safeReturnTo} />}
            >
              Cancel
            </Button>
          )}
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
