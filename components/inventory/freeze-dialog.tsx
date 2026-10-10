"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { locationLabel } from "@/components/location-badge";
import { updateInventory } from "@/app/(app)/inventory/actions";
import {
  FREEZER_FOOD_TYPES,
  FREEZER_GROUPS,
  FREEZER_UNKNOWN_KEY,
  computeFreezerQualityDate,
  foodTypeByKey,
  guessFreezerFoodType,
} from "@/lib/freezer";
import {
  daysUntil,
  formatExpiry,
  parseDate,
  startOfToday,
  toDateString,
} from "@/lib/expiry";
import type { InventoryEntry, InventoryWithItem } from "@/lib/types";

type FreezeDialogProps = {
  inventory: InventoryEntry;
  subcategoryName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (inventory: InventoryWithItem) => void;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function longDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Freezing flow: date frozen + food type → computed best-quality-by date.
 * The original expiration_date is never modified; already-past dates require
 * an explicit review before freezing.
 */
export function FreezeDialog({
  inventory,
  subcategoryName,
  open,
  onOpenChange,
  onSaved,
}: FreezeDialogProps) {
  const name = inventory.item.name;
  const alreadyFrozen = inventory.location === "freezer";
  const today = toDateString(startOfToday());

  const [frozenOn, setFrozenOn] = useState(inventory.frozen_at ?? today);
  const [purchasedFrozen, setPurchasedFrozen] = useState(false);
  const [foodType, setFoodType] = useState<string>(() => {
    const saved = foodTypeByKey(inventory.item.freezer_food_type);
    if (saved) return saved.key;
    const guess = guessFreezerFoodType(
      inventory.item.name,
      null,
      subcategoryName ?? null,
    );
    return guess ?? FREEZER_UNKNOWN_KEY;
  });
  const [remindMonths, setRemindMonths] = useState("");
  const [ackReviewed, setAckReviewed] = useState(false);
  const [busy, setBusy] = useState(false);

  const type =
    foodType === FREEZER_UNKNOWN_KEY ? null : foodTypeByKey(foodType);

  const reminderNum = Number(remindMonths);
  const reminder =
    Number.isFinite(reminderNum) && reminderNum > 0
      ? Math.round(reminderNum)
      : null;

  const months =
    purchasedFrozen || !type
      ? null
      : (type.months ?? reminder);

  const qualityDate =
    !purchasedFrozen && type && DATE_RE.test(frozenOn) && months != null
      ? computeFreezerQualityDate(frozenOn, months)
      : null;

  const originalDays = daysUntil(inventory.expiration_date);
  const originalPast = originalDays !== null && originalDays < 0;

  const canConfirm =
    (purchasedFrozen || DATE_RE.test(frozenOn)) &&
    (!originalPast || ackReviewed);

  let preview: string;
  if (purchasedFrozen) {
    preview = "No quality date — purchased frozen with an unknown date.";
  } else if (!type) {
    preview = "No quality date — pick a food type to track one.";
  } else if (months == null) {
    preview = "No quality date — set an optional reminder to track one.";
  } else {
    preview = `Best quality by ${longDate(qualityDate ?? "")} · ${months} month${months === 1 ? "" : "s"} from ${frozenOn}`;
  }

  async function confirm() {
    setBusy(true);
    const result = await updateInventory({
      inventoryId: inventory.id,
      location: "freezer",
      frozenAt: purchasedFrozen ? null : frozenOn,
      freezerDurationMonths: months,
      freezerFoodType: type ? type.key : null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onOpenChange(false);
    toast.success(
      alreadyFrozen
        ? `${name} freezer details saved`
        : `${name} moved to the freezer`,
    );
    onSaved?.(result.data.inventory);
  }

  const foodTypeItems = [
    { value: FREEZER_UNKNOWN_KEY, label: "Not sure — don't track a date" },
    ...Object.values(FREEZER_FOOD_TYPES).map((entry) => ({
      value: entry.key,
      label: entry.label,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {alreadyFrozen ? `${name} · freezer details` : `Freeze ${name}?`}
          </DialogTitle>
          <DialogDescription>
            {alreadyFrozen
              ? "Adjust when it went in and how long it keeps."
              : `Moves ${name} from ${locationLabel(inventory.location)} to the Freezer. The original expiration date is kept as the refrigerated date.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={purchasedFrozen}
              onCheckedChange={(checked) => setPurchasedFrozen(checked === true)}
            />
            Purchased frozen — I don&apos;t know when it went in
          </label>

          {!purchasedFrozen ? (
            <div className="space-y-1.5">
              <Label htmlFor="frozen-on">Date frozen</Label>
              <Input
                id="frozen-on"
                type="date"
                value={frozenOn}
                max={today}
                onChange={(event) => setFrozenOn(event.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>What is it?</Label>
            <Select
              value={foodType}
              items={foodTypeItems}
              onValueChange={(value) => setFoodType(value ?? FREEZER_UNKNOWN_KEY)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a food type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FREEZER_UNKNOWN_KEY}>
                  Not sure — don&apos;t track a date
                </SelectItem>
                {FREEZER_GROUPS.map((group) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {Object.values(FREEZER_FOOD_TYPES)
                      .filter((entry) => entry.group === group)
                      .map((entry) => (
                        <SelectItem key={entry.key} value={entry.key}>
                          {entry.label}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {type?.warning ? (
              <p className="text-xs text-orange-700 dark:text-orange-300">
                {type.warning}
              </p>
            ) : null}
          </div>

          {type && type.months === null && !purchasedFrozen ? (
            <div className="space-y-1.5">
              <Label htmlFor="remind-months">Remind me after (optional)</Label>
              <Input
                id="remind-months"
                type="number"
                min={1}
                max={120}
                value={remindMonths}
                onChange={(event) => setRemindMonths(event.target.value)}
                placeholder="months, e.g. 6"
              />
              {reminder != null ? (
                <p className="text-xs text-muted-foreground">
                  Personal reminder — not a validated food-safety date.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm font-semibold">
            {preview}
          </p>

          <p className="text-xs text-muted-foreground">
            Original refrigerated date:{" "}
            {inventory.expiration_date
              ? formatExpiry(inventory.expiration_date)
              : "none"}{" "}
            — kept while frozen.
          </p>

          {originalPast ? (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p className="text-sm font-semibold">
                This item is already past its refrigerated date (
                {formatExpiry(inventory.expiration_date)}).
              </p>
              <p className="text-xs">
                Freezing does not change that. Only confirm if it was still
                good when it went in.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={ackReviewed}
                  onCheckedChange={(checked) => setAckReviewed(checked === true)}
                />
                I reviewed it — it was fine to freeze
              </label>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || !canConfirm}>
            {busy ? "Saving…" : alreadyFrozen ? "Save" : "Move to freezer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
