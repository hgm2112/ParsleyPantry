"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AllFilterPill, ToggleFilterPill } from "@/components/filter-pill";
import { cn } from "@/lib/utils";
import type {
  PlanAmount,
  PlanIngredientGroup,
  PlanIngredientVerdict,
} from "@/lib/plan-ingredients";

type Filter = "all" | "need" | "unknown";

function amountsText(amounts: PlanAmount[]): string {
  return amounts.length > 0 ? amounts.map((amount) => amount.text).join(" + ") : "—";
}

function statusView(verdict: PlanIngredientVerdict): {
  label: string;
  className: string;
  title?: string;
} {
  switch (verdict.kind) {
    case "enough":
      return {
        label: "Enough",
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        title: verdict.presenceOnly
          ? "The recipe doesn't specify an amount — having this in the pantry counts as enough."
          : "The pantry covers every meal still to cook.",
      };
    case "short": {
      const shortage = amountsText(verdict.shortages);
      return {
        label: `${verdict.hasStock ? "Need" : "Buy"} ${shortage}`,
        className: verdict.hasStock
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-destructive/10 text-destructive",
        title: verdict.hasStock
          ? `Still short ${shortage}.`
          : `Nothing in the pantry — buy ${shortage}.`,
      };
    }
    case "unknown":
      return {
        label: "Can't compare",
        className: "bg-muted text-muted-foreground",
        title:
          verdict.reason === "unmatched"
            ? "Not linked to a pantry item."
            : "The recipe and pantry use units that can't be compared.",
      };
    case "unquantified":
      return {
        label: "—",
        className: "bg-muted text-muted-foreground",
        title: "No amounts were set on these recipe lines.",
      };
    case "cooked":
      return {
        label: "All cooked",
        className: "bg-muted text-muted-foreground",
        title: "Every planned meal using this ingredient is cooked.",
      };
  }
}

function reasonFor(group: PlanIngredientGroup): string | null {
  const { verdict } = group;
  switch (verdict.kind) {
    case "unknown":
      return verdict.reason === "unmatched"
        ? "This ingredient isn't linked to a pantry item, so stock can't be compared."
        : `Still needed: ${amountsText(group.remaining)}. In pantry: ${amountsText(group.stock)} — these units can't be compared.`;
    case "short":
      return verdict.hasStock
        ? `Still short ${amountsText(verdict.shortages)}. In pantry: ${amountsText(group.stock)}.`
        : "There's no stock for the meals that are still to cook.";
    case "unquantified":
      return "These recipe lines have no amounts set, so only the meal count is shown.";
    case "cooked":
      return "Every planned meal using this ingredient is cooked; totals stay for reference.";
    case "enough":
      return verdict.presenceOnly
        ? "The recipe doesn't specify an amount — having this in the pantry counts as enough."
        : null;
  }
}

export function PlanIngredientSummary({
  groups,
  mealStats,
}: {
  groups: PlanIngredientGroup[];
  /** Recipe days in the visible two weeks, cooked or not. */
  mealStats: { total: number; cooked: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  const needCount = groups.filter((group) => group.verdict.kind === "short").length;
  const unknownCount = groups.filter(
    (group) => group.verdict.kind === "unknown",
  ).length;

  // A filter can empty out after cooking/inventory changes; fall back to All
  // instead of mutating state during render.
  const activeFilter: Filter =
    filter === "need" && needCount === 0
      ? "all"
      : filter === "unknown" && unknownCount === 0
        ? "all"
        : filter;

  const visibleGroups = useMemo(() => {
    if (activeFilter === "need") {
      return groups.filter((group) => group.verdict.kind === "short");
    }
    if (activeFilter === "unknown") {
      return groups.filter((group) => group.verdict.kind === "unknown");
    }
    return groups;
  }, [activeFilter, groups]);

  function toggle(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const stats =
    mealStats.total > 0
      ? [`${mealStats.cooked} of ${mealStats.total} recipe meals cooked`]
      : [];
  if (needCount > 0) stats.push(`${needCount} need more`);
  if (unknownCount > 0) stats.push(`${unknownCount} can't compare`);

  return (
    <section className="border-t pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-extrabold">2-Week Ingredient Summary</h2>
        {stats.length > 0 ? (
          <p className="text-xs text-muted-foreground">{stats.join(" · ")}</p>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Plan recipe meals in these two weeks to build the ingredient summary.
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <AllFilterPill
              count={groups.length}
              active={activeFilter === "all"}
              onClick={() => setFilter("all")}
            />
            {needCount > 0 ? (
              <ToggleFilterPill
                label="Need more"
                count={needCount}
                active={activeFilter === "need"}
                tone="amber"
                onClick={() =>
                  setFilter(activeFilter === "need" ? "all" : "need")
                }
              />
            ) : null}
            {unknownCount > 0 ? (
              <ToggleFilterPill
                label="Can't compare"
                count={unknownCount}
                active={activeFilter === "unknown"}
                onClick={() =>
                  setFilter(activeFilter === "unknown" ? "all" : "unknown")
                }
              />
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_7rem_7rem_7rem_8rem] items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Ingredient</span>
              <span className="text-right">Meals</span>
              <span className="text-right">Original</span>
              <span className="text-right">Still needed</span>
              <span className="text-right">In pantry</span>
              <span className="text-right">Status</span>
            </div>

            <ul className="divide-y">
              {visibleGroups.map((group) => {
                const open = openKeys.has(group.key);
                const detailId = `plan-ingredient-${group.key.replace(
                  /[^a-zA-Z0-9_-]/g,
                  "-",
                )}`;
                const status = statusView(group.verdict);
                const reason = open ? reasonFor(group) : null;

                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggle(group.key)}
                      aria-expanded={open}
                      aria-controls={detailId}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem_7rem_7rem_8rem]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-90",
                          )}
                          aria-hidden
                        />
                        <span className="block truncate text-sm font-semibold">
                          {group.name}
                        </span>
                      </span>

                      <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                        {group.meals}
                        <span className="text-[10px]">
                          {" · "}
                          {group.remainingMeals > 0
                            ? `${group.remainingMeals} left`
                            : "done"}
                        </span>
                      </span>
                      <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                        {amountsText(group.original)}
                      </span>
                      <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                        {amountsText(group.remaining)}
                      </span>
                      <span className="hidden text-right text-xs tabular-nums sm:block">
                        {amountsText(group.stock)}
                      </span>

                      <span
                        className={cn(
                          "min-w-0 max-w-[9rem] shrink-0 justify-self-end truncate rounded-full px-2 py-0.5 text-[10px] font-bold sm:max-w-full",
                          status.className,
                        )}
                        title={status.title}
                      >
                        {status.label}
                      </span>

                      <span className="col-span-2 text-[11px] leading-tight text-muted-foreground sm:hidden">
                        {`Original ${amountsText(group.original)} · Still need ${amountsText(group.remaining)} · Have ${amountsText(group.stock)}`}
                      </span>
                    </button>

                    {open ? (
                      <div
                        id={detailId}
                        className="border-t bg-muted/20 px-3 py-2"
                      >
                        {reason ? (
                          <p className="mb-1.5 text-[11px] text-muted-foreground">
                            {reason}
                          </p>
                        ) : null}
                        <ul className="space-y-1">
                          {group.uses.map((use) => (
                            <li
                              key={`${use.recipeId}-${use.date}`}
                              className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs"
                            >
                              <span className="min-w-0 truncate">
                                <span className="font-semibold">
                                  {use.dateLabel}
                                </span>
                                <span className="text-muted-foreground">
                                  {" · "}
                                  {use.recipeName}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span className="tabular-nums text-muted-foreground">
                                  {use.quantityText}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                    use.made
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : "bg-background text-muted-foreground",
                                  )}
                                >
                                  {use.made ? "Cooked" : "To cook"}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Original counts every planned meal; still needed covers meals that
            aren&apos;t cooked yet. Quantities combine only matching units, and
            optional ingredients aren&apos;t included.
          </p>
        </>
      )}
    </section>
  );
}
