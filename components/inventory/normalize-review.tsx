"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Sparkles, Pencil } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  keepCanonicalAsIs,
  setItemCanonical,
  listCanonicalCandidates,
  type CanonicalCandidateView,
} from "@/app/(app)/inventory/actions";
import {
  runCanonicalBackfill,
  type CanonicalReviewData,
  type CanonicalReviewRow,
} from "@/app/(app)/inventory/normalize/actions";

/**
 * Review queue for items without a confident canonical match, plus the
 * idempotent backfill that applies everything high-confidence. Confirming a
 * row stores the mapping (never touching name/barcode/stock); "Keep as its
 * own name" settles the row on its identity for good (undo available).
 */
export function NormalizeReview({ initial }: { initial: CanonicalReviewData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [otherFor, setOtherFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<CanonicalCandidateView[]>([]);

  const { summary, rows } = data;
  const done = rows.length === 0 && summary.readyToMatch === 0;

  async function openOther(row: CanonicalReviewRow) {
    setOtherFor(row.itemId);
    setDraft(row.suggestions[0] ?? "");
    if (options.length > 0) return;
    const result = await listCanonicalCandidates();
    if (result.ok) {
      setOptions([
        ...result.data.items,
        ...result.data.recipeNames.map((name) => ({
          id: `recipe:${name}`,
          name,
          categoryId: null,
          canonicalItemId: null,
        })),
      ]);
    }
  }

  async function applyMatch(itemId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Pick or type a generic ingredient first");
      return;
    }
    setApplyingId(itemId);
    const result = await setItemCanonical(itemId, trimmed);
    setApplyingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.canonicalName
        ? `Matches recipes as ${result.data.canonicalName}`
        : "Match cleared",
    );
    setData((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.itemId !== itemId),
      summary: {
        ...current.summary,
        alreadyGeneric: current.summary.alreadyGeneric + 1,
        needsReview: Math.max(0, current.summary.needsReview - 1),
      },
    }));
    if (otherFor === itemId) setOtherFor(null);
    router.refresh();
  }

  async function runBackfill() {
    setBusy(true);
    const result = await runCanonicalBackfill();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const s = result.data.summary;
    toast.success(
      `Auto-matched ${s.autoMatched} · already generic ${s.alreadyGeneric} · needs review ${s.needsReview}`,
    );
    setData(result.data);
    router.refresh();
  }

  function shiftCounts(current: CanonicalReviewData, delta: number): CanonicalReviewData {
    return {
      ...current,
      summary: {
        ...current.summary,
        alreadyGeneric: current.summary.alreadyGeneric + delta,
        needsReview: Math.max(0, current.summary.needsReview - delta),
      },
    };
  }

  async function keepAsIs(row: CanonicalReviewRow) {
    setApplyingId(row.itemId);
    const result = await keepCanonicalAsIs(row.itemId, true);
    setApplyingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setData((current) => ({
      ...shiftCounts(current, 1),
      rows: current.rows.filter((entry) => entry.itemId !== row.itemId),
    }));
    if (otherFor === row.itemId) setOtherFor(null);
    toast.success(`${row.name} kept as its own name`, {
      action: {
        label: "Undo",
        onClick: () => void undoKeep(row),
      },
      duration: 8000,
    });
    router.refresh();
  }

  async function undoKeep(row: CanonicalReviewRow) {
    const result = await keepCanonicalAsIs(row.itemId, false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setData((current) => {
      if (current.rows.some((entry) => entry.itemId === row.itemId)) return current;
      return {
        ...shiftCounts(current, -1),
        rows: [...current.rows, row],
      };
    });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/inventory" />}
          aria-label="Back to inventory"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold">Ingredient matches</h1>
          <p className="text-xs text-muted-foreground">
            Products keep their scanned names; recipes match them as one
            generic ingredient.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runBackfill()}
          disabled={busy || summary.readyToMatch === 0}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Run backfill{summary.readyToMatch > 0 ? ` (${summary.readyToMatch})` : ""}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Ready to auto-match", value: summary.readyToMatch },
          { label: "Already generic", value: summary.alreadyGeneric },
          { label: "Needs review", value: summary.needsReview },
          { label: "In your pantry", value: summary.inScope },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-background p-3"
          >
            <p className="text-lg font-extrabold tabular-nums">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {done ? (
        <div className="rounded-xl border bg-background p-6 text-center">
          <p className="text-sm font-semibold">Everything is matched</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every pantry item has a settled identity. Newly scanned products
            go through the same check when you add them.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.itemId}
              className="space-y-2 rounded-xl border bg-background p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-semibold">{row.name}</span>
                <span className="text-xs text-muted-foreground">
                  {row.brand ? `${row.brand} · ` : ""}
                  {row.barcode ?? "no barcode"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {row.status === "ambiguous"
                  ? "Several possible matches — confirm the right one."
                  : row.status === "suggested"
                    ? "Possible match — confirm or correct it."
                    : "No confident match — type the generic ingredient it should match as."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {row.suggestions.slice(0, 3).map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={applyingId === row.itemId}
                    onClick={() => void applyMatch(row.itemId, suggestion)}
                  >
                    <Check />
                    {suggestion}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={applyingId === row.itemId}
                  onClick={() =>
                    otherFor === row.itemId
                      ? setOtherFor(null)
                      : void openOther(row)
                  }
                >
                  <Pencil />
                  {otherFor === row.itemId ? "Close" : "Other…"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={applyingId === row.itemId}
                  onClick={() => void keepAsIs(row)}
                >
                  Keep as its own name
                </Button>
              </div>
              {otherFor === row.itemId ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void applyMatch(row.itemId, draft);
                  }}
                >
                  <Input
                    autoFocus
                    list="canonical-review-options"
                    value={draft}
                    placeholder="Generic ingredient (e.g. Ground Beef)"
                    aria-label="Generic ingredient"
                    className="max-w-64"
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <datalist id="canonical-review-options">
                    {options.map((option) => (
                      <option key={option.id} value={option.name} />
                    ))}
                  </datalist>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={applyingId === row.itemId || !draft.trim()}
                  >
                    Match as this
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          &quot;Keep as its own name&quot; settles a row forever (undo in the
          toast); untouched rows stay on their own identity — nothing is forced.
        </p>
      ) : null}
    </div>
  );
}
