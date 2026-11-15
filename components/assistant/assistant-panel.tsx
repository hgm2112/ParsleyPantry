"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Loader2, Mic, MicOff, ScanBarcode, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/components/assistant/use-speech-recognition";
import { executeAssistantActions } from "@/app/(app)/assistant/actions";

type Candidate = {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
  unit?: string | null;
  packageSize?: string | null;
  canonicalItemId?: string | null;
  isPreferred?: boolean;
};

type ProposedAction = {
  id: string;
  intent: string;
  domain: "food" | "grocery" | "household";
  itemText: string;
  resolvedItemId?: string | null;
  barcode?: string | null;
  brand?: string | null;
  packageSize?: string | null;
  quantity?: number | null;
  unit?: string | null;
  location?: "pantry" | "fridge" | "freezer" | null;
  secondaryLocation?: "pantry" | "fridge" | "freezer" | null;
  secondaryQuantity?: number | null;
  expirationDate?: string | null;
  notes?: string | null;
  confidence?: number | null;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
  summary?: string | null;
  savePreference?: boolean;
  allowCreateNew?: boolean;
  match?: {
    kind: "item" | "household_item" | "none" | "ambiguous";
    id?: string | null;
    name?: string | null;
    barcode?: string | null;
    brand?: string | null;
    unit?: string | null;
    packageSize?: string | null;
    candidates?: Candidate[];
    reason?: string;
    wouldCreateNew?: boolean;
    requiresExplicitChoice?: boolean;
  };
};

type InterpretResponse = {
  ok: boolean;
  mode: "ai" | "no_ai";
  transcript: string;
  actions: ProposedAction[];
  questions: string[];
  error?: { code: string; message: string; retryable?: boolean } | null;
};

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | {
      id: string;
      role: "proposals";
      text: string;
      mode: "ai" | "no_ai";
      actions: ProposedAction[];
      questions: string[];
      notice?: string | null;
      results?: Record<string, { ok: boolean; message: string }>;
    };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function detailsLine(c: { brand?: string | null; packageSize?: string | null; unit?: string | null; barcode?: string | null } | null | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.brand) parts.push(c.brand);
  if (c.packageSize) parts.push(c.packageSize);
  else if (c.unit) parts.push(c.unit);
  if (c.barcode) parts.push(`UPC ${c.barcode}`);
  return parts.length ? parts.join(" · ") : null;
}

function ActionEditor({
  action,
  onChange,
  onConfirm,
  confirming,
  result,
}: {
  action: ProposedAction;
  onChange: (next: ProposedAction) => void;
  onConfirm: (action: ProposedAction) => void;
  confirming: boolean;
  result?: { ok: boolean; message: string } | null;
}) {
  const set = (patch: Partial<ProposedAction>) => {
    const clearsClarification =
      action.intent !== "clarify" &&
      action.needsClarification &&
      ("itemText" in patch ||
        "quantity" in patch ||
        "unit" in patch ||
        "location" in patch ||
        "brand" in patch ||
        "packageSize" in patch ||
        "notes" in patch ||
        "expirationDate" in patch ||
        "resolvedItemId" in patch ||
        "allowCreateNew" in patch);
    onChange({
      ...action,
      ...patch,
      ...(clearsClarification ? { needsClarification: false, clarificationQuestion: null } : null),
    });
  };

  const markResolved = () => onChange({ ...action, needsClarification: false, clarificationQuestion: null });

  const selectCandidate = (c: Candidate) => {
    onChange({
      ...action,
      itemText: c.name,
      resolvedItemId: c.id,
      barcode: c.barcode ?? action.barcode ?? null,
      brand: c.brand ?? action.brand ?? null,
      packageSize: c.packageSize ?? action.packageSize ?? null,
      unit: c.unit ?? action.unit ?? null,
      allowCreateNew: false,
      needsClarification: false,
      clarificationQuestion: null,
      match: {
        ...(action.match || { kind: "item" as const, candidates: [] }),
        kind: action.domain === "household" ? "household_item" : "item",
        id: c.id,
        name: c.name,
        barcode: c.barcode ?? null,
        brand: c.brand ?? null,
        unit: c.unit ?? null,
        packageSize: c.packageSize ?? null,
        candidates: action.match?.candidates || [],
        wouldCreateNew: false,
        requiresExplicitChoice: false,
        reason: undefined,
      },
    });
  };

  const chooseCreateNew = () => {
    onChange({
      ...action,
      resolvedItemId: null,
      allowCreateNew: true,
      needsClarification: false,
      clarificationQuestion: null,
      match: {
        ...(action.match || { kind: "none" as const, candidates: [] }),
        kind: "none",
        wouldCreateNew: true,
        requiresExplicitChoice: false,
        reason: "You chose to create a new item",
      },
    });
  };

  const disabled = confirming || !!result?.ok || action.needsClarification || action.intent === "clarify";
  const matched = action.match?.kind === "item" || action.match?.kind === "household_item";
  const ambiguous = action.match?.kind === "ambiguous";
  const none = action.match?.kind === "none";
  const needsExplicitCreate = Boolean(action.match?.wouldCreateNew && action.match?.requiresExplicitChoice && !action.allowCreateNew);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={action.needsClarification ? "destructive" : "secondary"}>
          {action.intent.replace(/_/g, " ")}
        </Badge>
        <Badge variant="outline">{action.domain}</Badge>
        {ambiguous ? <Badge variant="destructive">pick a match</Badge> : null}
        {matched ? <Badge variant="secondary">matched existing</Badge> : null}
        {none && action.allowCreateNew ? <Badge variant="outline">create new (chosen)</Badge> : null}
        {none && !action.allowCreateNew ? <Badge variant="destructive">no match</Badge> : null}
        {result ? <Badge variant={result.ok ? "secondary" : "destructive"}>{result.ok ? "saved" : "not saved"}</Badge> : null}
      </div>

      {action.summary ? <p className="mt-2 text-sm font-semibold text-foreground">{action.summary}</p> : null}
      {action.needsClarification && action.clarificationQuestion ? (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{action.clarificationQuestion}</p>
      ) : null}

      {matched ? (
        <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
          <p className="font-semibold text-foreground">Will use this existing item</p>
          <p className="mt-0.5 text-foreground">{action.match?.name || action.itemText}</p>
          {detailsLine(action.match) ? <p className="text-muted-foreground">{detailsLine(action.match)}</p> : null}
        </div>
      ) : null}

      {ambiguous && action.match?.candidates?.length ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-semibold text-foreground">Pick the correct existing item (to avoid duplicates):</p>
          <div className="grid gap-1">
            {action.match.candidates.slice(0, 8).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCandidate(c)}
                disabled={!!result?.ok || confirming}
                className={cn(
                  "w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50",
                  action.resolvedItemId === c.id && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{c.name}</span>
                  {c.isPreferred ? <Badge variant="secondary">usual</Badge> : null}
                </div>
                {detailsLine(c) ? <div className="text-muted-foreground">{detailsLine(c)}</div> : <div className="text-muted-foreground">No UPC/size on file</div>}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Not listed? Edit the item name above to match an existing item. If it’s a brand-new packaged item and you want to avoid guessing, you can add it from the regular screen (scanning is optional but most precise).</p>
        </div>
      ) : null}

      {none ? (
        <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs space-y-2">
          <p className="font-semibold text-foreground">
            {action.allowCreateNew ? "You chose to create a new item" : "No existing match found"}
          </p>
          {!action.allowCreateNew ? (
            <>
              <p className="text-muted-foreground">To keep things organized, this won’t create a new item unless you explicitly choose to. Try editing the name to match an existing item, or pick a match if shown. Adding brand/size/UPC details helps keep it organized.</p>
              {(action.intent === "add_inventory_item" || action.intent === "add_household_item") ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant="outline" onClick={chooseCreateNew} disabled={!!result?.ok || confirming}>
                    Create new item (explicit)
                  </Button>
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">If you want the exact packaged product (UPC/brand/size) recorded, adding/scanning it in the regular screen is the most precise option (optional).</p>
            </>
          ) : (
            <p className="text-muted-foreground">A new item will be created only because you explicitly chose it. Add brand/size/UPC if you know them to keep it organized.</p>
          )}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Item
          <Input value={action.itemText} onChange={(e) => set({ itemText: e.target.value, resolvedItemId: null, allowCreateNew: false })} disabled={!!result?.ok} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Quantity
          <Input
            inputMode="decimal"
            value={action.quantity ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set({ quantity: v === "" ? null : Number(v) });
            }}
            placeholder="e.g. 2"
            disabled={!!result?.ok}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Unit
          <Input value={action.unit ?? ""} onChange={(e) => set({ unit: e.target.value || null })} placeholder="lb, oz, can…" disabled={!!result?.ok} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Location
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            value={action.location ?? ""}
            onChange={(e) => set({ location: (e.target.value || null) as ProposedAction["location"] })}
            disabled={!!result?.ok}
          >
            <option value="">(none)</option>
            <option value="pantry">pantry</option>
            <option value="fridge">fridge</option>
            <option value="freezer">freezer</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Brand
          <Input value={action.brand ?? ""} onChange={(e) => set({ brand: e.target.value || null })} disabled={!!result?.ok} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Package size / UPC
          <Input value={action.packageSize ?? action.barcode ?? ""} onChange={(e) => set({ packageSize: e.target.value || null })} placeholder="e.g. 28 oz can or UPC" disabled={!!result?.ok} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
          Expiration / notes
          <Input
            value={action.expirationDate ?? action.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
            placeholder="Expiration date or note"
            disabled={!!result?.ok}
          />
        </label>
      </div>

      {result ? (
        <p className={cn("mt-3 text-sm", result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
          {result.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={() => onConfirm(action)}>
          {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : result?.ok ? <Check className="h-4 w-4" /> : null}
          {result?.ok ? "Saved" : "Confirm & save"}
        </Button>
        {action.needsClarification && action.intent !== "clarify" && !result?.ok ? (
          <Button type="button" size="sm" variant="outline" onClick={markResolved} disabled={confirming || needsExplicitCreate}>
            Mark resolved
          </Button>
        ) : null}
        {needsExplicitCreate ? (
          <span className="text-xs text-muted-foreground">Choose an existing match or explicitly choose to create a new item before confirming.</span>
        ) : action.needsClarification || action.intent === "clarify" ? (
          <span className="text-xs text-muted-foreground">
            {action.intent === "clarify"
              ? "Send a clearer command below (this is a clarification prompt, not a saveable change)."
              : "Pick the correct item or resolve, then confirm."}
          </span>
        ) : !result?.ok ? (
          <span className="text-xs text-muted-foreground">Review carefully — this will save the change to the matched item shown above.</span>
        ) : null}
      </div>
      {action.intent === "move_inventory" ? (
        <p className="mt-2 text-xs text-muted-foreground">Moving/splitting between locations isn’t supported from the assistant yet — please do it from Inventory.</p>
      ) : null}
    </div>
  );
}

function ProposalMessage({
  msg,
  onUpdateActions,
  onConfirmAction,
  confirmingId,
}: {
  msg: Extract<ChatMessage, { role: "proposals" }>;
  onUpdateActions: (actions: ProposedAction[]) => void;
  onConfirmAction: (action: ProposedAction) => void;
  confirmingId: string | null;
}) {
  const actions = msg.actions;
  const results = msg.results || {};
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{msg.mode === "ai" ? "AI interpreted" : "No-AI mode"}</Badge>
        {msg.notice ? <span className="text-xs text-amber-700 dark:text-amber-400">{msg.notice}</span> : null}
      </div>
      <p className="text-sm text-foreground">{msg.text}</p>
      {msg.questions.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
          <p className="font-semibold">Follow-up needed</p>
          <ul className="mt-1 list-disc pl-5">
            {msg.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-2">
        {actions.map((action, idx) => (
          <ActionEditor
            key={action.id || idx}
            action={action}
            result={results[action.id] || null}
            confirming={confirmingId === action.id}
            onChange={(next) => {
              const copy = actions.slice();
              copy[idx] = next;
              onUpdateActions(copy);
            }}
            onConfirm={onConfirmAction}
          />
        ))}
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions proposed. Try rephrasing or add the item manually. Scanning in the regular screen is an optional way to identify exact packaged products.</p>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90",
          "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6",
        )}
        aria-label="Open assistant"
        title="Assistant"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Tell me what you bought, used, or need. I’ll suggest changes and show which existing item they’ll use (with brand/UPC/size when known). Nothing is saved until you confirm. If I can’t confidently match the right item, I’ll ask you to pick one or explicitly choose to create a new item to keep things organized.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const speech = useSpeechRecognition();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/assistant/interpret")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.aiAvailable === "boolean") setAiAvailable(data.aiAvailable);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (speech.transcript) {
      setInput((prev) => (prev ? `${prev} ${speech.transcript}` : speech.transcript).trim());
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const historyForApi = useMemo(() => {
    const turns: Array<{ role: "user" | "assistant"; text: string }> = [];
    for (const m of messages) {
      if (m.role === "user") turns.push({ role: "user", text: m.text });
      else if (m.role === "assistant") turns.push({ role: "assistant", text: m.text });
      else if (m.role === "proposals") turns.push({ role: "assistant", text: m.text });
    }
    return turns.slice(-8);
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, history: historyForApi }),
      });
      const data = (await res.json().catch(() => null)) as InterpretResponse | null;
      if (!data) throw new Error("Invalid response");
      if (!data.ok && !data.actions?.length) {
        const msg = data.error?.message || "I couldn't interpret that. Try again or use manual entry.";
        setMessages((prev) => [...prev, { id: uid(), role: "assistant", text: msg }]);
        if (data.error?.code === "quota_exceeded" || data.error?.code === "rate_limited") {
          toast.message("Assistant limit reached — you can still type or use manual/scan.");
        }
      } else {
        const notice = data.error?.message || null;
        const summary = data.actions?.length
          ? `I found ${data.actions.length} suggested change${data.actions.length === 1 ? "" : "s"}. Check which existing item each will use (or pick/create one), then confirm to save.`
          : "I couldn’t map that to specific changes yet. You can clarify below or add it manually.";
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "proposals",
            text: summary,
            mode: data.mode,
            actions: data.actions || [],
            questions: data.questions || [],
            notice,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: "Something went wrong reaching the assistant. Please try again or use manual entry." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function confirmAction(messageId: string, action: ProposedAction) {
    if (confirmingId) return;
    setConfirmingId(action.id);
    try {
      const res = await executeAssistantActions({
        executionKey: `${messageId}:${action.id}:${uid()}`,
        actions: [
          {
            id: action.id,
            intent: action.intent as any,
            domain: action.domain,
            itemText: action.itemText,
            resolvedItemId: action.resolvedItemId ?? null,
            barcode: action.barcode ?? null,
            brand: action.brand ?? null,
            packageSize: action.packageSize ?? null,
            quantity: action.quantity ?? null,
            unit: action.unit ?? null,
            location: action.location ?? null,
            secondaryLocation: action.secondaryLocation ?? null,
            secondaryQuantity: action.secondaryQuantity ?? null,
            expirationDate: action.expirationDate ?? null,
            notes: action.notes ?? null,
            needsClarification: action.needsClarification ?? false,
            clarificationQuestion: action.clarificationQuestion ?? null,
            summary: action.summary ?? null,
            allowCreateNew: action.allowCreateNew ?? false,
          },
        ],
      });
      const r = res.results?.[0];
      const result = r ? { ok: r.ok, message: r.message } : { ok: false, message: res.error || "Could not save this change." };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.role === "proposals"
            ? { ...m, results: { ...(m.results || {}), [action.id]: result } }
            : m,
        ),
      );
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save this change.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.role === "proposals"
            ? { ...m, results: { ...(m.results || {}), [action.id]: { ok: false, message } } }
            : m,
        ),
      );
      toast.error(message);
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> Assistant</SheetTitle>
            {aiAvailable === false ? <Badge variant="outline">No-AI mode</Badge> : aiAvailable === true ? <Badge variant="secondary">AI ready</Badge> : null}
          </div>
          <SheetDescription>
            Mic or type to propose changes. I’ll show the existing item (brand/UPC/size when known) before you confirm — I won’t create a new item without your explicit choice.{" "}
            <span className="inline-flex items-center gap-1"><ScanBarcode className="inline h-3.5 w-3.5" /> Scanning is optional if you want the most precise product match.</span>
          </SheetDescription>
        </SheetHeader>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="max-w-[90%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">{m.text}</div>
              ) : m.role === "assistant" ? (
                <div className="max-w-[95%] rounded-2xl border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
              ) : (
                <div className="w-full rounded-2xl border bg-muted/20 p-3">
                  <ProposalMessage
                    msg={m}
                    confirmingId={confirmingId}
                    onUpdateActions={(actions) =>
                      setMessages((prev) => prev.map((x) => (x.id === m.id && x.role === "proposals" ? { ...x, actions } : x)))
                    }
                    onConfirmAction={(action) => void confirmAction(m.id, action)}
                  />
                </div>
              )}
            </div>
          ))}
          {sending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Interpreting…
            </div>
          ) : null}
        </div>

        <div className="border-t p-3 space-y-2">
          {speech.error ? <p className="text-xs text-destructive">{speech.error}</p> : null}
          {speech.listening && speech.interim ? (
            <p className="text-xs text-muted-foreground">Hearing: {speech.interim}</p>
          ) : null}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={speech.listening ? "Listening…" : "e.g. Add eggs to my shopping list, or I bought 2 lb ground beef for the freezer"}
            className="min-h-[72px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={speech.listening ? "destructive" : "outline"}
                size="sm"
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={!speech.supported && !speech.listening}
                title={speech.supported ? "Voice input" : "Speech recognition not supported in this browser"}
              >
                {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {speech.listening ? "Stop" : "Mic"}
              </Button>
              {!speech.supported ? <span className="text-xs text-muted-foreground">Mic not supported here — type instead.</span> : null}
            </div>
            <Button type="button" onClick={() => void send(input)} disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            No always-listening. Voice uses your browser’s speech-to-text when available. AI mode (if configured) sends minimal text to Gemini; otherwise no-AI fallback is used. Only confirmed actions are saved, and repeat confirmed items are remembered to improve future matches.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
