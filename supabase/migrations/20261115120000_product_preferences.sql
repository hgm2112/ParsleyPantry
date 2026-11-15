-- Product preferences: remember a household/user's usual product for a given
-- item/term (brand, package size, UPC/barcode) so the assistant can prefer it
-- and ask when multiple variants exist. Preferences live in ParsleyPantry's DB
-- (not AI memory). Additive; does not modify existing data.

create table if not exists public.product_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Null = household-wide preference; set for a per-user preference.
  user_id uuid references auth.users (id) on delete cascade,
  domain text not null check (domain in ('food', 'household')),
  -- Normalized lookup key/term (e.g. canonical ingredient name or user phrase).
  term text not null,
  -- Generic/canonical catalog identity when known (food items).
  canonical_item_id uuid references public.items (id) on delete set null,
  -- Preferred food catalog item (specific product/variant).
  preferred_item_id uuid references public.items (id) on delete set null,
  -- Preferred household-supplies catalog item.
  preferred_household_item_id uuid references public.household_items (id) on delete set null,
  preferred_barcode text,
  brand text,
  package_size text,
  -- 'manual' when user explicitly chose/saved; 'learned' when inferred from use.
  source text not null default 'manual' check (source in ('manual', 'learned')),
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_preferences_domain_item_check check (
    (domain = 'food' and preferred_household_item_id is null)
    or (domain = 'household' and preferred_item_id is null and canonical_item_id is null)
  )
);

create index if not exists product_preferences_household_idx
  on public.product_preferences (household_id, domain);
create index if not exists product_preferences_lookup_idx
  on public.product_preferences (household_id, domain, lower(term));
create index if not exists product_preferences_user_idx
  on public.product_preferences (user_id) where user_id is not null;
create index if not exists product_preferences_barcode_idx
  on public.product_preferences (household_id, preferred_barcode) where preferred_barcode is not null;

-- Prevent duplicate preference rows for the same scope/term/domain+target.
create unique index if not exists product_preferences_unique_idx
  on public.product_preferences (
    household_id,
    domain,
    lower(term),
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(preferred_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(preferred_household_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(preferred_barcode, '')
  );

-- Keep updated_at current when moddatetime is available (created in init).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'moddatetime') then
    drop trigger if exists set_product_preferences_updated_at on public.product_preferences;
    create trigger set_product_preferences_updated_at
      before update on public.product_preferences
      for each row execute procedure moddatetime(updated_at);
  end if;
end $$;

alter table public.product_preferences enable row level security;

drop policy if exists "member product preferences" on public.product_preferences;
create policy "member product preferences" on public.product_preferences
  for all using (public.is_member(household_id))
  with check (public.is_member(household_id));
