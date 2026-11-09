"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScanSheet } from "@/components/scan-sheet";
import {
  createHouseholdItem,
  resolveHouseholdBarcode,
  searchHouseholdCatalog,
} from "@/app/(app)/household/actions";
import {
  HOUSEHOLD_CATEGORIES,
  HOUSEHOLD_STORAGE_LOCATIONS,
} from "@/lib/types";
import type { HouseholdItemRow } from "@/lib/types";

export function HouseholdAddForm({
  initialBarcode,
  initialItem,
}: {
  initialBarcode: string | null;
  initialItem?: HouseholdItemRow | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialItem?.name ?? "");
  const [quantity, setQuantity] = useState(String(initialItem?.quantity ?? 1));
  const [unit, setUnit] = useState(initialItem?.unit ?? "");
  const [category, setCategory] = useState(initialItem?.category ?? "Miscellaneous");
  const [storage, setStorage] = useState(
    initialItem?.storage_location ?? "Other",
  );
  const [lowThreshold, setLowThreshold] = useState(
    initialItem?.low_threshold != null ? String(initialItem.low_threshold) : "",
  );
  const [notes, setNotes] = useState(initialItem?.notes ?? "");
  const [barcode, setBarcode] = useState(initialItem?.barcode ?? initialBarcode ?? "");
  const [canonicalName, setCanonicalName] = useState("");
  const [canonicalOptions, setCanonicalOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [matches, setMatches] = useState<HouseholdItemRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // With Cache Components, Next keeps this route mounted (hidden) instead of
  // unmounting it, so returning here would restore the last item's values.
  // An "add new item" form must start blank on every visit.
  const resetForm = useCallback(() => {
    setName("");
    setQuantity("1");
    setUnit("");
    setCategory("Miscellaneous");
    setStorage("Other");
    setLowThreshold("");
    setNotes("");
    setBarcode("");
    setCanonicalName("");
    setMatches([]);
    setScanOpen(false);
    setBusy(false);
    setLookupBusy(false);
  }, []);

  // Reset when the route is hidden (navigating away or after saving).
  useLayoutEffect(() => {
    return () => resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!initialBarcode) return;
    void lookupBarcode(initialBarcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarcode]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { listHouseholdCanonicalCandidates } =
        await import("@/app/(app)/household/actions");
      const result = await listHouseholdCanonicalCandidates();
      if (alive && result.ok) setCanonicalOptions(result.data.items);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function lookupBarcode(code: string) {
    const clean = code.trim();
    if (clean.length < 4) return;
    setLookupBusy(true);
    try {
      const result = await resolveHouseholdBarcode(clean);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { item, off } = result.data;
      if (item) {
        setName(item.name);
        setQuantity(String(item.quantity));
        if (item.unit) setUnit(item.unit);
        setBarcode(item.barcode ?? clean);
        toast.success(`Found ${item.name}`);
        return;
      }
      if (off) {
        if (off.name) setName(off.name);
        if (off.quantity && !unit) setUnit(off.quantity);
        toast.success(`Product found: ${off.name ?? clean}`);
        return;
      }
      toast.message(`Barcode ${clean} not found`, {
        description: "Enter the details yourself.",
      });
    } catch {
      toast.error("Lookup failed — check your connection.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function onNameChange(value: string) {
    setName(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    const result = await searchHouseholdCatalog(value.trim());
    if (result.ok) {
      setMatches(result.data.items.filter((item) => item.name !== value.trim()));
    }
  }

  async function save() {
    if (busy) return;
    if (!name.trim()) {
      toast.error("Give the item a name");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setBusy(true);
    const result = await createHouseholdItem({
      name: name.trim(),
      quantity: qty,
      unit: unit.trim() || null,
      category,
      storageLocation: storage,
      lowThreshold: lowThreshold ? Number(lowThreshold) : null,
      notes: notes.trim() || null,
      barcode: barcode.trim() || null,
      canonicalName: canonicalName.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${result.data.item.name} saved`);
    resetForm();
    router.push("/household");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/household" />}
          aria-label="Back to Household"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-lg font-extrabold">Add Household Item</h1>
          <p className="text-xs text-muted-foreground">
            Household supplies only — not food inventory.
          </p>
        </div>
      </div>

      <div
        className="flex overflow-hidden rounded-md border self-start md:hidden"
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

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <div className="relative">
            <Input
              id="name"
              value={name}
              onChange={(e) => void onNameChange(e.target.value)}
              placeholder="Toilet Paper, Dish Soap…"
              autoComplete="off"
            />
            {matches.length > 0 ? (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                {matches.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setName(item.name);
                        setMatches([]);
                      }}
                    >
                      <span>{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={() => void lookupBarcode(barcode)}
              placeholder="Scan or type a barcode"
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
        </div>

        <div className="space-y-2 rounded-xl border bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="rolls, boxes, bottles…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as typeof category)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSEHOLD_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Storage location</Label>
              <Select value={storage} onValueChange={(v) => setStorage(v as typeof storage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSEHOLD_STORAGE_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold">Running low at or below (optional)</Label>
            <Input
              id="threshold"
              type="number"
              min={0}
              step="any"
              value={lowThreshold}
              onChange={(e) => setLowThreshold(e.target.value)}
              placeholder="e.g. 4"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to never flag this item as low stock.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="canonical">Matches as (generic, optional)</Label>
            <Input
              id="canonical"
              list="household-canonical-options"
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              placeholder="e.g. Aluminum Foil"
              autoComplete="off"
            />
            <datalist id="household-canonical-options">
              {canonicalOptions.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Optional — the generic this supply buys as (e.g. Reynolds Wrap →
              Aluminum Foil, Charmin → Toilet Paper).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember…"
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save Item
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          render={<Link href="/household" />}
        >
          Cancel
        </Button>
      </form>

      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onBarcode={(code) => {
          setScanOpen(false);
          setBarcode(code);
          void lookupBarcode(code);
        }}
        onManualEntry={() => barcodeRef.current?.focus()}
        title="Scan a household supply"
        description="We'll fill in what we know about the product."
      />
    </div>
  );
}
