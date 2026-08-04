-- ============================================================
-- Public (anon) read of day_settings open/closed status for a FIXED
-- rolling window (today .. today+90), with no caller-supplied range.
--
-- day_settings carries internal fields (overrides jsonb, extra_slots
-- text[]) that must stay staff-only, and the table itself is staff-only
-- under RLS (20260603160000_lock_day_settings_to_staff_and_rpc.sql).
--
-- get_open_days(p_start, p_end) already exists for this same data, but it
-- was deliberately locked to authenticated-only (20260603130000) after
-- Supabase's default grants accidentally leaked it to anon -- reopening
-- that grant would re-couple a login-gated consumer (the customer booking
-- wizard) and a new anon-public one onto one grant lifecycle. This is a
-- deliberate narrow sibling instead, with its own independent grant.
--
-- The window is a literal in the function body, not a parameter: there is
-- no p_start/p_end to widen, so there is no caller-supplied range to
-- validate or cap. Changing the horizon is a one-line migration, not a
-- runtime argument -- removing that argument entirely removes the
-- wide-range-scraping concern by construction rather than by trusting
-- every caller to respect a cap.
-- ============================================================

create or replace function public.get_public_open_days()
returns table(setting_date date, is_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.setting_date, d.is_open
  from   public.day_settings d
  where  d.setting_date between current_date and current_date + 90;
$$;

comment on function public.get_public_open_days() is
  'Public (anon) read of day_settings for a fixed rolling window (today..today+90 days). Returns only (setting_date, is_open) -- no overrides/extra_slots. No caller-supplied date range by design. SECURITY DEFINER to bypass staff-only day_settings RLS. Deliberate sibling of the authenticated get_open_days (booking wizard) -- independent grant lifecycle, not a widened grant on it.';

revoke all on function public.get_public_open_days() from public;
revoke all on function public.get_public_open_days() from anon;
revoke all on function public.get_public_open_days() from authenticated;
grant execute on function public.get_public_open_days() to anon, authenticated, service_role;
