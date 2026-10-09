-- Add household_members (and profiles for name changes) to realtime publication
-- so postgres_changes listeners (global sync + per-household members channel) receive events.

alter publication supabase_realtime add table public.household_members;
alter publication supabase_realtime add table public.profiles;
