"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Refrigerator, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLeftover, deleteLeftover } from "@/app/(app)/home/actions";
import type { LeftoverRow } from "@/lib/types";

/**
 * Compact list of named leftovers — standalone reminders, not inventory rows.
 * `rows === null` means the initial Supabase load failed: shown as an error
 * state with retry, never mistaken for an empty list.
 */
export function LeftoversWidget({ rows }: { rows: LeftoverRow[] | null }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const result = await addLeftover(trimmed);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewName("");
    router.refresh();
  }

  async function remove(row: LeftoverRow) {
    if (deletingId) return;
    setDeletingId(row.id);
    const result = await deleteLeftover(row.id);
    setDeletingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section id="leftovers" className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Refrigerator className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">Leftovers</h2>
      </div>

      {rows === null ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load leftovers.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 text-sm font-semibold text-primary hover:underline"
            onClick={() => router.refresh()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing here yet — add what&apos;s in the fridge.
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {row.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${row.name}`}
                    disabled={deletingId !== null}
                    onClick={() => void remove(row)}
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    {deletingId === row.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="mt-3 flex gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Pizza, Spaghetti"
              maxLength={160}
            />
            <Button type="submit" disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
