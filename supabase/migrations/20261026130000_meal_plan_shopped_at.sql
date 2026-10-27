-- Per-day shopping memory.
--
-- shopped_at — the last time "Shop …" pushed this planned day's ingredients to
-- the grocery list. Set by shopDays() after the grocery lines are written and
-- cleared whenever the day's meal changes (setMealDay / saveMealNote /
-- setCustomMealDay), so a badge can never outlive the meal it described.
--
-- Why a column: the grocery list is pooled and deduped, and its lines get
-- checked off as you shop, so "was this day shopped" cannot be inferred from
-- it. stock_holds is no signal either — holds only exist for ingredients the
-- pantry covered.
--
-- Additive and nullable: days shopped before this column existed simply read
-- as "not shopped" until they are shopped again (a no-op that dedupes to
-- "already on the list").
alter table public.meal_plan_days
  add column if not exists shopped_at timestamptz;

comment on column public.meal_plan_days.shopped_at is
  'Last time this planned day''s ingredients were pushed to the grocery list.';
