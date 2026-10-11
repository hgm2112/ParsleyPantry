"use client";

import { useEffect, useState } from "react";
import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ShopDayOption = {
  weekStart: string;
  dayIndex: number;
  /** "Mon Oct 13" */
  dateLabel: string;
  /** Recipe/kind title, or a muted hint when nothing is planned. */
  mealLabel: string;
  /** Unplanned and made days are shown but can't be shopped. */
  enabled: boolean;
};

export type ShopWeekGroup = {
  title: string;
  /** "Oct 13 – Oct 19" */
  rangeLabel: string;
  days: ShopDayOption[];
};

export function ShopDaysDialog({
  open,
  onOpenChange,
  weeks,
  onShop,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weeks: ShopWeekGroup[];
  onShop: (days: { weekStart: string; dayIndex: number }[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setBusy(false);
    }
  }, [open]);

  const allDays = weeks.flatMap((week) => week.days);
  const selectable = allDays.filter((day) => day.enabled);
  const dayKey = (day: ShopDayOption) => `${day.weekStart}:${day.dayIndex}`;

  function toggle(day: ShopDayOption) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = dayKey(day);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function shop() {
    const days = allDays
      .filter((day) => selected.has(dayKey(day)))
      .map((day) => ({ weekStart: day.weekStart, dayIndex: day.dayIndex }));
    if (days.length === 0) return;
    setBusy(true);
    onShop(days);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select days to shop</DialogTitle>
          <DialogDescription>
            Pantry stock is reserved oldest day first across the days you pick.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelected(new Set(selectable.map(dayKey)))}
            disabled={selectable.length === 0 || busy}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0 || busy}
          >
            Clear
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4">
          {weeks.map((week) => (
            <div key={week.title} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                  {week.title}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {week.rangeLabel}
                </span>
              </div>
              <ul className="space-y-1.5">
                {week.days.map((day) => {
                  const key = dayKey(day);
                  const checked = selected.has(key);
                  return (
                    <li key={key}>
                      <label
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2",
                          day.enabled
                            ? "cursor-pointer hover:bg-accent/50"
                            : "opacity-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!day.enabled || busy}
                          onCheckedChange={() => toggle(day)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {day.dateLabel}
                          </span>
                          <span
                            className={cn(
                              "block truncate text-xs",
                              day.enabled
                                ? "text-muted-foreground"
                                : "italic text-muted-foreground/70",
                            )}
                          >
                            {day.mealLabel}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} {selected.size === 1 ? "day" : "days"} selected
            </span>
            <Button
              size="sm"
              onClick={shop}
              disabled={selected.size === 0 || busy}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShoppingCart />
              )}
              Shop selected days
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
