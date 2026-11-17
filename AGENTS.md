<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-11-16)

Goal: recipe edit screen rebuilt around pantry status (mobile + desktop parity), "Mark dinner as made" polish, plan→recipe navigation, Next.js 16.4.6, and session notes consolidated in `sessions.md`.

The full session journal lives in **`sessions.md`** (newest at top). This file keeps the standing rules plus current pointers; don't re-add dated session archives here.

Durable notes:
- **Recipe editor** (`components/recipes/recipe-editor.tsx`): Name → Cooking/No-cook toggle → Ingredients → collapsible Details. Pantry status is presence (>0 stock at the canonical root); optional rows are never counted as missing.
- Ingredient rows render as **one flat list** with explicit grid placement and an `sm:contents` controls wrapper — typing a name that moves a row between groups must not remount the input.
- Group bands: "Need to buy", "In your pantry", "Optional · not in pantry"; the last two collapse on phones (use the `useSyncExternalStore` breakpoint pattern, same as Details).
- Paste parser lives in `recipe-editor.tsx`: a leading number (+ optional unit word) becomes the amount, the rest the name.
- `components/assistant/assistant-panel.tsx`: the sparkle button sits at `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]` on phones (on the nav edge) — this is app-wide.
- `next.config.ts` sets `cacheComponents: true`; Next 16 Activity preserves ~3 routes, so forms that must start fresh need an explicit reset (see `household-add-form.tsx`).
- Household items are isolated from food `items`/`inventory`; grocery rows link via `household_item_id` with `item_id` null.
- Both pantry and household filter rows go through `components/filter-pill.tsx`; keep them identical. Copy UPC label: valid GTIN (8/12/13/14 digits) → `UPC:`, anything else → `Code:`.
- Mobile bottom nav stays the original 5 tabs (Household is desktop-sidebar only).
- `batches-mockup.png` remains untracked in the working tree (reference only; not committed).

Open (carried forward):
- Wire `batch-actions-sheet.tsx` into the Home pantry widget (or remove it).
- Verify Quick Bites cook/undo end-to-end and confirm `/recipes` counts/redirects on a fresh deploy.
- Optional: surface brand/barcode on list cards; add a "duplicates" warning.
- Deferred: read-only recipe rows with an edit bottom sheet.

## Safety: destructive and irreversible actions

Before taking any destructive or irreversible action, you MUST get the user's explicit confirmation that clearly states the action and its scope. Do not proceed on assumptions.

Destructive/irreversible actions include (but are not limited to):
- Deleting user accounts or auth users (e.g. Supabase `auth.users`), profiles, or identity records
- Deleting or wiping application data (rows/records), especially in bulk or for an entire user/account
- Dropping/truncating tables or schemas, running destructive migrations, or removing production/stored data
- Any operation that cannot be reliably undone

When requesting confirmation:
- State exactly what will be deleted/changed, for whom/which target (e.g. which user/account/environment), and that it is permanent/irreversible (and whether backups/PITR are known to exist, if relevant).
- Distinguish “delete this user’s app data” from “delete the account/auth user/profile” — treat them as different scopes and confirm each if both apply.
- Wait for an explicit “yes/proceed” to that specific scope before acting. If the user’s intent is ambiguous, ask a clarifying question instead of inferring.

## How to explain changes (novice-friendly)

When you finish work or answer questions, include a short **plain-English summary** first (2–5 sentences) for someone who isn't technical:
- Say **what changed** in everyday words (what the app/site can do now).
- Say **exactly what I need to do next**, if anything — be specific and spell it out. List the exact steps, clicks, or words/commands I must use (for example: “Nothing you need to do.”, “Click **Save** on the settings page.”, or “Run this exact command: `...`” / “Say: `...`”). If I don't need to do anything, say that clearly.
- Avoid jargon and long technical run-downs. If technical details are needed, put them **after** the simple summary under a separate “Details (optional)” heading.
