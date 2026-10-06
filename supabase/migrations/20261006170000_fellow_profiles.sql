-- Household members can see each other's names/emails so the members list
-- and shared views (meal plan authorship, etc.) can render identities.
create policy "read fellow member profiles" on public.profiles
  for select using (
    exists (
      select 1
      from public.household_members mine
      where mine.user_id = auth.uid()
        and exists (
          select 1
          from public.household_members theirs
          where theirs.household_id = mine.household_id
            and theirs.user_id = profiles.id
        )
    )
  );
