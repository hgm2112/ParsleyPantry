"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importKitchenOwl } from "@/app/(app)/import/actions";
import type { ImportSummary } from "@/app/(app)/import/actions";
import {
  isKitchenOwlExport,
  parseCategoryLabel,
  type KitchenOwlExport,
} from "@/lib/kitchenowl";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function ImportUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<KitchenOwlExport | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleFile(file: File | undefined) {
    setSummary(null);
    setParsed(null);
    setParseError(null);
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);

    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      if (!isKitchenOwlExport(json)) {
        setParseError(
          "Missing items[] / recipes[] arrays — this doesn't look like a KitchenOwl export.",
        );
        return;
      }
      if (json.items.length === 0 && json.recipes.length === 0) {
        setParseError("The export is empty — nothing to import.");
        return;
      }
      setParsed(json);
    } catch {
      setParseError("Could not read that file as JSON.");
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    const result = await importKitchenOwl(parsed);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSummary(result.data);
    const { items, recipes, categories, ingredients } = result.data;
    if (items.created === 0 && recipes.created === 0 && categories.created === 0) {
      toast.info("Everything in that export is already here");
    } else {
      toast.success(
        `Imported ${items.created} items, ${recipes.created} recipes (${ingredients} ingredients)`,
      );
    }
    setParsed(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const categoryPreview = parsed
    ? Array.from(
        new Set(
          parsed.items
            .map((item) => (item.category ?? "").trim())
            .filter(Boolean),
        ),
      ).map(parseCategoryLabel)
    : [];
  const ingredientTotal = parsed
    ? parsed.recipes.reduce(
        (total, recipe) => total + (recipe.items?.length ?? 0),
        0,
      )
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed px-6 py-10 text-center">
        <FileJson className="mx-auto mb-3 h-8 w-8 text-green-700 dark:text-green-400" />
        <p className="text-sm font-medium">KitchenOwl export (.json)</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Brings over your item catalog, categories, and recipes. Existing
          entries are skipped, so it is safe to run twice. Quantities and
          pantry stock stay in KitchenOwl — start fresh here.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload /> Choose file
        </Button>
        {fileName ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {fileName} · {formatBytes(fileSize)}
          </p>
        ) : null}
      </div>

      {parseError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {parseError}
        </div>
      ) : null}

      {parsed ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {parsed.items.length}
              </p>
              <p className="text-xs text-muted-foreground">Items</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {parsed.recipes.length}
              </p>
              <p className="text-xs text-muted-foreground">Recipes</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {categoryPreview.length}
              </p>
              <p className="text-xs text-muted-foreground">Categories</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categoryPreview.slice(0, 12).map((category) => (
              <span
                key={category.name}
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {category.icon ? `${category.icon} ` : ""}
                {category.name}
              </span>
            ))}
            {categoryPreview.length > 12 ? (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                +{categoryPreview.length - 12} more
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            {ingredientTotal} ingredients linked to catalog items where names
            match.
          </p>

          <Button className="w-full" onClick={() => void runImport()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy
              ? "Importing…"
              : `Import ${parsed.items.length} items & ${parsed.recipes.length} recipes`}
          </Button>
        </div>
      ) : null}

      {summary ? (
        <div className="space-y-3 rounded-xl border border-green-700/30 bg-green-50 p-4 dark:bg-green-950/40">
          <div className="flex items-center gap-2 text-sm font-medium text-green-900 dark:text-green-100">
            <CheckCircle2 className="h-4 w-4" />
            Import finished
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm text-green-900/90 dark:text-green-100/90">
            <li>{summary.items.created} items added</li>
            <li>{summary.recipes.created} recipes added</li>
            <li>{summary.categories.created} categories added</li>
            <li>{summary.ingredients} ingredients linked</li>
            <li>{summary.items.skipped} items already present</li>
            <li>{summary.recipes.skipped} recipes already present</li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" render={<Link href="/inventory" />}>
              View inventory
            </Button>
            <Button size="sm" variant="outline" render={<Link href="/recipes" />}>
              View recipes
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
