# ParsleyPantry

A barcode-first household pantry app — the Phase 1 replacement for KitchenOwl.
Built with Next.js 16, Supabase, and Tailwind; designed to deploy on Vercel.

## Features

- **Inventory** — barcode scanning (native `BarcodeDetector`, `@zxing/browser`
  fallback for Firefox/Safari), Open Food Facts product lookup, pantry/fridge/
  freezer locations, expiration-date guessing, low-stock flags, continuous
  "shop add" mode.
- **Grocery list** — grouped by **store aisle** (each store has its own aisle
  layout) or by category, check-off, inline editing, add from inventory /
  recipe / manual, one-tap bulk add.
- **Recipes** — create and edit recipes with ingredient amounts, push all
  ingredients to the grocery list in one tap.
- **Meal planner** — week view (one recipe per day + notes), week navigation,
  "shop this week" sends every planned recipe's ingredients to the list.
- **KitchenOwl import** — bring over your KitchenOwl export (items, categories,
  recipes). Idempotent: re-runs skip what's already there.
- **Households** — email + password auth, invite codes, join/switch
  households, member list, realtime sync across devices (Supabase Realtime).

## Stack

Next.js 16 (App Router, `cacheComponents`/PPR) · React 19 · Tailwind CSS v4 ·
shadcn/ui (Base UI primitives) · Supabase (Postgres + Auth + RLS + Realtime) ·
zod · sonner · @zxing/browser

## Setup

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run every file in `supabase/migrations/` in filename
   order (or `supabase db push` if you use the CLI). The schema includes RLS
   policies, the household bootstrap trigger (each sign-up gets a household,
   default categories, and settings), join/switch RPCs, and Realtime
   publications.
3. Project Settings → API → copy the **Project URL** and **anon key**.
4. **Authentication → URL Configuration** — required, or confirmation emails
   point at localhost:
   - **Site URL** → your production origin (`https://parsleypantry.vercel.app`)
   - **Redirect URLs** → `https://parsleypantry.vercel.app/**` **and**
     `http://localhost:3000/**`. GoTrue silently discards a sign-up
     `emailRedirectTo` that isn't in this list and falls back to Site URL —
     that's exactly how a production sign-up ends up with a
     `http://localhost:3000/...` confirmation link. Listing both keeps
     local sign-ups confirming on localhost and production ones on the
     deployed site.

### 2. Environment

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Run

Use Node.js 22 or later (`nvm use` / install with `nvm install 22`).

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign up — your household is created automatically.

## Deploy (Vercel)

Import the repo, set the two Supabase env vars in the project settings, and
deploy. Note: `@supabase/supabase-js` wants Node 22+ (Vercel default); on
Node 20 it only prints a deprecation warning.

### Daily leftovers reminder (optional)

Settings → "Leftovers reminder" sends a daily web-push notification about
what's on your leftovers list. Generate a VAPID keypair:

```bash
npx web-push generate-vapid-keys
```

Then set these env vars in Vercel (never commit them):

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public key from the keypair
- `VAPID_PRIVATE_KEY` — private key from the keypair
- `VAPID_SUBJECT` — contact for the VAPID spec, e.g. `mailto:you@example.com`
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API (cron-only; never
  expose to the browser)
- `CRON_SECRET` — any long random string; the cron route rejects requests
  without `Authorization: Bearer <CRON_SECRET>`

How it fires: Vercel Hobby only allows one cron expression per deployment, so
`vercel.json` registers 24 hourly jobs on the same path. Each run only sends to
users whose local due window (scheduled time + 2h, wrapping midnight) contains
that hour, and a per-device/day delivery row guarantees exactly one send. On
iPhone/iPad, web push works only in the installed Home Screen app (iOS 16.4+);
deactivating/deleting the app eventually deactivates that subscription.

Then point Supabase **Authentication → URL Configuration** at the deployed
URL (Site URL + the Vercel origin in Redirect URLs, `http://localhost:3000/**`
kept for dev) — Setup step 1.4 explains why, otherwise confirmation emails
from production sign-ups link to localhost.

Before the first deploy, run every migration in `supabase/migrations/` in
filename order in the Supabase SQL Editor — this includes
`20261009120000_meal_plan_kind.sql` (the day-kind column for eating out /
meal kits / no-cook days),
`20261009160000_restore_default_signup_categories.sql` (re-asserts the
signup bootstrap so every new standalone account gets the plain default
categories, never KitchenOwl-style labels; it carries two read-only
diagnostics and an opt-in cleanup for households that already drifted),
and `20261016120000_reminder_notifications.sql` (daily leftovers reminder:
per-user notification settings, per-device push subscriptions, delivery
dedup — needed before enabling the reminder, not for the widget itself).

## Install on your phone

The app is a PWA (web app manifest + minimal service worker, registered in
production builds). Installing it adds a home-screen icon and opens in a
standalone window — no app-store step.

**iOS / iPadOS** — open the site in Safari, tap **Share**, then **Add to Home
Screen**.

**Android / Chrome** — open the site; tap **Install** in the address bar (or
the ⋮ menu → **Install app**).

To test locally, build and run the production server (the service worker only
registers in production, so `npm run dev` won't trigger it):

```bash
npm run build && npm start
```

Then open the site on your phone over the same network (or on the deployed
Vercel URL, which is HTTPS as required for service workers) and install.

## Migrating from KitchenOwl

1. In KitchenOwl: Export → save the JSON.
2. In ParsleyPantry: **Settings → Import from KitchenOwl** → choose the file →
   preview counts → import.
3. Catalog items, categories (emoji/aisle labels are cleaned up), and recipes
   with ingredients come over; ingredient names are linked to catalog items.
   Pantry quantities are not part of the KitchenOwl export — add stock as you
   shop.

The import skips anything that already exists, so running it twice is safe.

## Development

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npx next typegen   # regenerate typed route helpers after adding routes
```

### Quality gates (local + CI)

Install the Git pre-push hook locally (once per clone) — it runs `npx tsc
--noEmit` before every push and aborts the push on any type error:

```bash
bash scripts/install-hooks.sh
```

Every push to `main` and every pull request targeting `main` is also checked
by the **"Typecheck and Production Build"** GitHub Actions workflow
(`.github/workflows/typecheck-build.yml`), which runs `npm ci`, `npx tsc --noEmit`,
and `npm run build`.

To make the check required for merges: **Settings → Branches → Branch protection
rules → main → Require status checks to pass before merging**, then add
"Typecheck and Production Build / build".

Notes for working in this codebase:

- Next.js 16 rules apply: no `export const dynamic`, DB reads and
  `cookies()`/`params`/`searchParams` go inside `<Suspense>`, `params` and
  `searchParams` are Promises, middleware lives in `proxy.ts`.
- shadcn components use Base UI — no `asChild`; pass `render={<Link … />}` to
  make a button a link.
- Supabase client is untyped; cast query results at call sites.

## Layout

```
app/(app)      authed app: inventory, grocery, recipes, plan, settings, import
app/(auth)     login / signup / password reset
proxy.ts       session-cookie routing
lib/           auth (server), OFF lookup, expiry heuristics, pure helpers
components/    feature UIs + ui/ primitives
supabase/      migrations (schema, RLS, triggers, RPCs, realtime)
```

## Data attribution

Barcode product data from [Open Food Facts](https://world.openfoodfacts.org),
licensed ODbL — attribution is rendered in the UI where the data is used.
