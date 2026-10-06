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

### 2. Environment

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign up — your household is created automatically.

## Deploy (Vercel)

Import the repo, set the two Supabase env vars in the project settings, and
deploy. Note: `@supabase/supabase-js` wants Node 22+ (Vercel default); on
Node 20 it only prints a deprecation warning.

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
