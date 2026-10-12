"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startOfToday, toDateString } from "@/lib/expiry";
import {
  FREEZER_FOOD_TYPES,
  FREEZER_GROUPS,
  FREEZER_UNKNOWN_KEY,
  computeFreezerQualityDate,
  foodTypeByKey,
} from "@/lib/freezer";
import type { Location } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
];

/** Quantity control shared by the add form and the Just Bought confirm sheet. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  buttonMin,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  /** Lower bound the − button steps down to. */
  min?: number;
  /** Lower bound accepted while typing (defaults to 0 so 0.5 is typeable). */
  buttonMin?: number;
  className?: string;
}) {
  const floor = buttonMin ?? 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <Input
        type="number"
        min={floor}
        step="any"
        value={value}
        onChange={(event) => onChange(Math.max(floor, Number(event.target.value) || 0))}
        className="text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** Pantry / Fridge / Freezer segmented control. */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: Location;
  onChange: (value: Location) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {LOCATIONS.map((entry) => (
        <button
          key={entry.value}
          type="button"
          onClick={() => onChange(entry.value)}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
            value === entry.value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/**
 * What the freezer fields mean for a batch being added:
 * - frozen false        → in the freezer but not tracked (no freeze info)
 * - frozen + "now"      → freezing today: frozen_at = today, quality date from
 *                          the food type's recommended months
 * - frozen + "purchased"→ bought already frozen: frozen_at stays null, no
 *                          countdown is invented
 */
export type FreezeValue = {
  frozen: boolean;
  mode: "now" | "purchased";
  /** FREEZER_UNKNOWN_KEY or a key from lib/freezer.ts. */
  foodType: string;
};

export type FreezeInput = {
  frozenAt?: string | null;
  freezerDurationMonths?: number | null;
  purchasedFrozen?: boolean;
  freezerFoodType?: string | null;
};

export function defaultFreezeValue(): FreezeValue {
  return { frozen: true, mode: "now", foodType: FREEZER_UNKNOWN_KEY };
}

/** Maps the UI state to addToInventory/updateInventory freeze inputs. */
export function freezeInputFor(value: FreezeValue, location: Location): FreezeInput {
  if (location !== "freezer" || !value.frozen) return {};
  if (value.mode === "purchased") {
    return {
      purchasedFrozen: true,
      frozenAt: null,
      freezerDurationMonths: null,
    };
  }
  const type = foodTypeByKey(value.foodType);
  const input: FreezeInput = {
    purchasedFrozen: false,
    frozenAt: toDateString(startOfToday()),
    freezerDurationMonths: type?.months ?? null,
  };
  if (type) input.freezerFoodType = type.key;
  return input;
}

function longDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MODES: { value: FreezeValue["mode"]; label: string }[] = [
  { value: "now", label: "Freezing it now" },
  { value: "purchased", label: "Already frozen when purchased" },
];

/**
 * Frozen toggle + how it was frozen. Renders nothing outside the freezer so
 * pantry/fridge adds keep the plain location-only flow.
 */
export function FreezerFields({
  location,
  name,
  value,
  onChange,
}: {
  location: Location;
  /** Used to warn about food types with no validated duration. */
  name: string;
  value: FreezeValue;
  onChange: (next: FreezeValue) => void;
}) {
  if (location !== "freezer") return null;

  const type = value.mode === "now" ? foodTypeByKey(value.foodType) : null;
  const months = value.mode === "now" && type ? type.months : null;
  const qualityDate =
    value.mode === "now" && type && months != null
      ? computeFreezerQualityDate(toDateString(startOfToday()), months)
      : null;

  const preview =
    value.mode === "purchased"
      ? "No quality date — purchased frozen, original freezing date unknown. Record the date later from the batch's freezer details if you find it."
      : type && months != null && qualityDate
        ? `Best quality by ${longDate(qualityDate)} · ${months} month${months === 1 ? "" : "s"} from today`
        : "No quality date — pick a food type to track one.";

  const foodTypeItems = [
    { value: FREEZER_UNKNOWN_KEY, label: "Not sure — don't track a date" },
    ...Object.values(FREEZER_FOOD_TYPES).map((entry) => ({
      value: entry.key,
      label: entry.label,
    })),
  ];

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.frozen}
          onCheckedChange={(checked) =>
            onChange({ ...value, frozen: checked === true })
          }
        />
        Frozen
      </label>

      {value.frozen ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => onChange({ ...value, mode: entry.value })}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                  value.mode === entry.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {value.mode === "now" ? (
            <div className="space-y-1.5">
              <Label>What is it?</Label>
              <Select
                value={value.foodType}
                items={foodTypeItems}
                onValueChange={(next) =>
                  onChange({ ...value, foodType: next ?? FREEZER_UNKNOWN_KEY })
                }
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
          ) : null}

          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs font-semibold">
            {preview}
          </p>

          <p className="text-xs text-muted-foreground">
            Refrigerated expiration date is kept as-is — the quality date never
            replaces it{name ? ` for ${name}` : ""}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
