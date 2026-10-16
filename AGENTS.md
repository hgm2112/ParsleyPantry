<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Session Snapshot (2026-10-16)

Goal: keep `/stats`, `/home`, and plan custom-meals coherent and refreshed.

Shipped and pushed:
- Stats Other Meals section + streak excludes eaten Leftovers / custom meals (`642a814`).
- Home page now resolves fresh via `await connection()`, passes custom-meal and recipe-type data, fixed Pizza icon and No-cook alignment (`b83b654`).

Verified: `npx tsc --noEmit` → green; `npm run build` → successful; `npm run lint` → 12 pre-existing unrelated errors only.

Open:
- Confirm deployed numbers/UI in fresh browser.
- Optional stray-file and lint-error cleanup.
