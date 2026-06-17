-- ============================================================
-- humans.phone — reject mobile-shaped numbers with the wrong digit count.
--
-- Background: a customer's WhatsApp Booking Confirmation bounced with Meta
-- error 131026 "Message undeliverable" because the number on file was
-- "+44768938855" — a UK mobile missing a digit (+44 then only 9 digits; a
-- valid UK mobile is +447 then 9 digits). It slipped in because the staff
-- forms validated phone numbers with a naive "10+ digits" count, and no
-- write path (forms, the create_pending_customer signup RPC, or the
-- whatsapp-agent insert) ran the strict UK-mobile check. There is no
-- BEFORE INSERT trigger and the BEFORE UPDATE phone guard only fires for
-- non-staff, so staff/RPC/edge writes reach the column unchecked.
--
-- This adds a column-level backstop that mirrors src/utils/phone.js
-- (validateContactPhone): IF a value looks like a UK mobile, it must be a
-- VALID one. Landlines, international numbers and anything not mobile-shaped
-- are left alone — the salon keeps them as contact-of-record even though we
-- can't message them.
--
-- Added NOT VALID on purpose: it enforces the rule on every future INSERT and
-- UPDATE immediately (covering the forms, the signup RPC and the whatsapp-agent
-- insert), but does NOT retro-reject the handful of existing legacy rows that
-- are mobile-shaped-but-broken. Those are corrected by hand (we can't recover a
-- missing digit), then the constraint can be VALIDATEd separately once the
-- column is known-clean:
--     alter table public.humans validate constraint humans_phone_mobile_shape;
--
-- Apply individually to prod; idempotent. Migrations aren't auto-applied.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'humans_phone_mobile_shape'
      and conrelid = 'public.humans'::regclass
  ) then
    alter table public.humans
      add constraint humans_phone_mobile_shape
      check (
        phone is null
        or btrim(phone) = ''
        -- Compare on the digits-only form. A national part beginning with 7
        -- (after dropping a 44 or 0 prefix) means "this is a UK mobile" and
        -- must therefore be exactly the right length; otherwise allow it.
        or case
             when regexp_replace(phone, '\D', '', 'g') ~ '^447'
               then regexp_replace(phone, '\D', '', 'g') ~ '^447\d{9}$'
             when regexp_replace(phone, '\D', '', 'g') ~ '^07'
               then regexp_replace(phone, '\D', '', 'g') ~ '^07\d{9}$'
             when regexp_replace(phone, '\D', '', 'g') ~ '^7'
               then regexp_replace(phone, '\D', '', 'g') ~ '^7\d{9}$'
             else true
           end
      )
      not valid;
  end if;
end $$;
