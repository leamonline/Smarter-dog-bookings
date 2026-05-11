-- ============================================================
-- customer_phone_on_file(p_phone)
--
-- Pre-auth check used by the customer login page: does the salon
-- have this phone number on file? Called BEFORE supabase.auth
-- .signInWithOtp() so we don't pay to send an SMS to numbers that
-- aren't ours.
--
-- Returns true if a humans row exists with the phone in either
-- the +44... or the 07... format. Returns false otherwise.
-- Never raises — the caller relies on a clean boolean.
--
-- SECURITY DEFINER so it bypasses RLS for the lookup. Granted to
-- anon because OTP request is necessarily unauthenticated.
--
-- Privacy note: this RPC does leak whether a given phone is on
-- file (an attacker could enumerate the salon's customer list).
-- For a single salon with a small customer base this trade-off
-- is acceptable — the upside (no wasted Twilio SMS cost, a
-- clearer error to legitimate users) outweighs the small
-- enumeration risk. Supabase's API gateway already rate-limits
-- anon callers by IP, providing a basic abuse cap.
-- ============================================================

create or replace function public.customer_phone_on_file(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with normalised as (
    select replace(coalesce(p_phone, ''), ' ', '') as v_normalised
  )
  select exists (
    select 1
    from   humans h, normalised n
    where  h.phone = n.v_normalised
       or  h.phone = replace(n.v_normalised, '+44', '0')
  );
$$;

revoke all on function public.customer_phone_on_file(text) from public;
revoke all on function public.customer_phone_on_file(text) from authenticated;
grant execute on function public.customer_phone_on_file(text) to anon;
grant execute on function public.customer_phone_on_file(text) to authenticated;

comment on function public.customer_phone_on_file(text) is
  'Pre-auth boolean check used by the customer login page: returns true if the salon has this phone number on file (in either +44 or 07 form). Used to gate Twilio SMS sends so we do not pay to text numbers that are not ours.';
