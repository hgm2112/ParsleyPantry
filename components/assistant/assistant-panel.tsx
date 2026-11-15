"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Mic, MicOff, ScanBarcode, Send, Sparkles } from "lucide-react";
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
  match?: {
    kind: "item" | "household_item" | "none" | "ambiguous";
    id?: string | null;
    name?: string | null;
    candidates?: Array<{ id: string; name: string; barcode?: string | null }>;
    reason?: string;
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
    };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function ActionEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (next: ProposedAction) => void;
}) {
  const set = (patch: Partial<ProposedAction>) => onChange({ ...action, ...patch });
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={action.needsClarification ? "destructive" : "secondary"}>
          {action.intent.replace(/_/g, " ")}
        </Badge>
        <Badge variant="outline">{action.domain}</Badge>
        {action.match?.kind === "ambiguous" ? (
          <Badge variant="destructive">ambiguous match</Badge>
        ) : action.match?.kind === "item" || action.match?.kind === "household_item" ? (
          <Badge variant="secondary">matched</Badge>
        ) : (
          <Badge variant="outline">new/unmatched</Badge>
        )}
      </div>

      {action.summary ? <p className="mt-2 text-sm font-semibold text-foreground">{action.summary}</p> : null}
      {action.needsClarification && action.clarificationQuestion ? (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{action.clarificationQuestion}</p>
      ) : null}
      {action.match?.kind === "ambiguous" && action.match.candidates?.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Possible matches: {action.match.candidates.map((c) => c.name).join(", ")}. Edit the item name or clarify below.
        </p>
      ) : null}
      {action.match?.name && (action.match.kind === "item" || action.match.kind === "household_item") ? (
        <p className="mt-1 text-xs text-muted-foreground">Matched to: {action.match.name}</p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Item
          <Input value={action.itemText} onChange={(e) => set({ itemText: e.target.value })} />
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
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Unit
          <Input value={action.unit ?? ""} onChange={(e) => set({ unit: e.target.value || null })} placeholder="lb, oz, can…" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Location
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={action.location ?? ""}
            onChange={(e) => set({ location: (e.target.value || null) as ProposedAction["location"] })}
          >
            <option value="">(none)</option>
            <option value="pantry">pantry</option>
            <option value="fridge">fridge</option>
            <option value="freezer">freezer</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Brand
          <Input value={action.brand ?? ""} onChange={(e) => set({ brand: e.target.value || null })} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Package size
          <Input value={action.packageSize ?? ""} onChange={(e) => set({ packageSize: e.target.value || null })} placeholder="e.g. 28 oz can" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
          Expiration / notes
          <Input
            value={action.expirationDate ?? action.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null, expirationDate: action.expirationDate ?? null })}
            placeholder="Expiration date or note"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled title="Execution is enabled in Phase 3">
          Confirm change (Phase 3)
        </Button>
        <span className="text-xs text-muted-foreground">Review only for now — saving/executing comes in Phase 3.</span>
      </div>
    </div>
  );
}

function ProposalMessage({
  msg,
  onUpdateActions,
}: {
  msg: Extract<ChatMessage, { role: "proposals" }>;
  onUpdateActions: (actions: ProposedAction[]) => void;
}) {
  const actions = msg.actions;
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
            onChange={(next) => {
              const copy = actions.slice();
              copy[idx] = next;
              onUpdateActions(copy);
            }}
          />
        ))}
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions proposed. Try rephrasing or add the item manually/scan it.</p>
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Tell me what you bought, used, or need. I’ll suggest changes for you to review — nothing is saved until you confirm (saving is enabled in a later phase). Tip: for new packaged items, scanning the barcode is usually most accurate.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
          ? `I found ${data.actions.length} suggested change${data.actions.length === 1 ? "" : "s"}. Review and edit below, then reply to correct anything.`
          : "I couldn’t map that to specific changes yet. You can clarify below or use manual add/scan.";
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
        { id: uid(), role: "assistant", text: "Something went wrong reaching the assistant. Please try again or use manual entry/scan." },
      ]);
    } finally {
      setSending(false);
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
            Mic or type to propose changes. Review carefully — nothing saves until confirmed (execution in Phase 3).{" "}
            <span className="inline-flex items-center gap-1"><ScanBarcode className="inline h-3.5 w-3.5" /> Scan preferred for new barcoded items.</span>
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
                    onUpdateActions={(actions) =>
                      setMessages((prev) => prev.map((x) => (x.id === m.id && x.role === "proposals" ? { ...x, actions } : x)))
                    }
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
            placeholder={speech.listening ? "Listening…" : "e.g. Add eggs to my shopping list, or I bought 2 lb ground beef (1 freezer, 1 fridge)"}
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
            No always-listening. Voice uses your browser’s speech-to-text when available. AI mode (if configured) sends minimal text to Gemini; otherwise no-AI fallback is used.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
