-- ============================================================
-- Lock day_settings to staff + the get_open_days RPC
--
-- SECURITY: day_settings carries internal fields (overrides jsonb,
-- extra_slots text[]) that must stay staff-only. A SELECT policy let
-- authenticated customers read full rows directly. Customers now read
-- open/closed days ONLY via public.get_open_days (SECURITY DEFINER,
-- returns just (setting_date, is_open), range-capped, authenticated-only).
--
-- DRIFT: the leaky SELECT exists under TWO names across environments:
--   * customer_select_day_settings  -> from 20260401142945 (fresh db reset)
--   * combined_select_day_settings  -> live prod drift (USING (true))
-- Drop BOTH so this converges in either world.
--
-- STAFF ACCESS: in prod the combined SELECT is the ONLY SELECT policy, so
-- staff reads/upserts/realtime depend on it (Postgres requires a SELECT
-- policy for the ON CONFLICT UPDATE path; realtime delivery is RLS-gated on
-- SELECT). This migration reconciles files and prod onto ONE explicit shape:
-- staff_select/insert/update/delete_day_settings (all is_staff()), retiring
-- the broad staff_all_day_settings FOR ALL policy. After this, a fresh
-- `supabase db reset` reproduces prod's policy set minus the hole (same
-- remediation pattern as combined_*_waitlist_entries / staff_insert_bookings).
--
-- Every statement is idempotent (drop ... if exists, then create) so it is
-- safe to apply by hand to drifted prod and to replay on a clean reset.
-- ============================================================

alter table public.day_settings enable row level security;

-- 1. Remove the customer-readable SELECT under BOTH names (file + prod drift).
drop policy if exists "customer_select_day_settings" on public.day_settings;
drop policy if exists "combined_select_day_settings" on public.day_settings;

-- 2. Retire the broad FOR ALL staff policy (fresh-reset name) in favour of the
--    explicit per-command split below, matching prod's shape.
drop policy if exists "staff_all_day_settings" on public.day_settings;

-- 3. Explicit, staff-only policies for every command (idempotent recreate).
drop policy if exists "staff_select_day_settings" on public.day_settings;
create policy "staff_select_day_settings"
  on public.day_settings for select
  to authenticated
  using ((select is_staff()));

drop policy if exists "staff_insert_day_settings" on public.day_settings;
create policy "staff_insert_day_settings"
  on public.day_settings for insert
  to authenticated
  with check ((select is_staff()));

drop policy if exists "staff_update_day_settings" on public.day_settings;
create policy "staff_update_day_settings"
  on public.day_settings for update
  to authenticated
  using    ((select is_staff()))
  with check ((select is_staff()));

drop policy if exists "staff_delete_day_settings" on public.day_settings;
create policy "staff_delete_day_settings"
  on public.day_settings for delete
  to authenticated
  using ((select is_staff()));
