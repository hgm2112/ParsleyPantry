-- Restore baseline role privileges on the public schema.
--
-- `DROP SCHEMA public CASCADE` (used to reset a database) removes not only the
-- schema's objects but also the schema-scoped `ALTER DEFAULT PRIVILEGES` that a
-- Supabase project configures at creation. Replaying the other migrations
-- recreates tables/RLS/functions but never re-grants, so `anon`,
-- `authenticated`, and `service_role` end up with NO access to public and every
-- PostgREST query fails with 42501 ("permission denied").
--
-- Run this LAST (it sorts after every other migration by timestamp) so that on
-- a fresh rebuild `grant all on all tables` covers everything created earlier.
-- Keep it as the final migration for any future schema reset.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- Preserve the restrictions set in 20261006160000_init.sql: the SECURITY
-- DEFINER helpers must not be executable by the public pseudo-role, and the
-- household RPCs are for signed-in users only.
revoke all on function public.is_member(uuid), public.is_owner(uuid) from public;
grant execute on function public.is_member(uuid), public.is_owner(uuid)
  to authenticated, anon;

revoke all on function public.join_household(text), public.set_current_household(uuid) from public;
grant execute on function public.join_household(text), public.set_current_household(uuid)
  to authenticated;
