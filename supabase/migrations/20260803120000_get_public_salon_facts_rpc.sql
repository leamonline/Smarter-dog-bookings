-- ============================================================
-- Public (anon) read of curated salon facts for the marketing website.
--
-- salon_config.settings is a jsonb grab-bag that ALSO holds depositBank
-- (real sort code / account number) — see 20260726144001, which moved the
-- booking-policy-related keys (autoConfirm, customerPortal.*, depositBank,
-- depositReleaseHours, termsUrl) to the new typed booking_policy_settings
-- table and left salon_config.settings as compatibility data only for
-- those keys. businessName/businessPhone/businessEmail/businessAddress/
-- businessHours/closures were NOT part of that move and remain here.
--
-- This function extracts ONLY those named public-facing keys -- never
-- `select settings`, never `select *` -- so a future field added to
-- `settings` (or to the table) is excluded by default rather than leaked
-- by default. Mirrors the same named-key-extraction safety pattern
-- already used by current_customer_booking_rules().
-- ============================================================

create or replace function public.get_public_salon_facts()
returns table (
  business_name text,
  business_phone text,
  business_email text,
  business_address text,
  business_hours jsonb,
  closures jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sc.settings->>'businessName', 'Smarter Dog Grooming')  as business_name,
    coalesce(sc.settings->>'businessPhone', '')                     as business_phone,
    coalesce(sc.settings->>'businessEmail', '')                     as business_email,
    coalesce(sc.settings->>'businessAddress', '')                   as business_address,
    coalesce(sc.settings->'businessHours', '{}'::jsonb)             as business_hours,
    coalesce(sc.settings->'closures', '[]'::jsonb)                  as closures,
    sc.updated_at
  from public.salon_config sc
  limit 1;
$$;

comment on function public.get_public_salon_facts() is
  'Public-safe read of salon_config.settings: business name/phone/email/address, public opening-hours text, and reference closures only. Explicitly excludes depositBank, pricing, large_dog_slots, daily_dog_cap, enforce_capacity, notifications, customerPortal, advanceBookingWeeks, minCancellationHours -- extracted by named key, never select settings/select *. SECURITY DEFINER to bypass staff-only salon_config RLS. Powers the marketing website (smarter-dog-website repo); no services/pricing summary included.';

-- Supabase auto-grants EXECUTE on new public functions to anon +
-- authenticated + service_role regardless of "revoke from public" --
-- revoke all three explicitly, then grant back only what's intended.
revoke all on function public.get_public_salon_facts() from public;
revoke all on function public.get_public_salon_facts() from anon;
revoke all on function public.get_public_salon_facts() from authenticated;
grant execute on function public.get_public_salon_facts() to anon, authenticated, service_role;
