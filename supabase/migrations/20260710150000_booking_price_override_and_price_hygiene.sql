-- ============================================================
-- Per-booking price override + custom-price hygiene  (review Phase 6)
--
-- Owner-confirmed price model (2026-07-10): three distinct prices —
--   * dogs.custom_price          — the dog's deliberately saved USUAL price
--   * bookings.price_override    — THIS booking's one-off agreed price (new)
--   * bookings.paid_amount       — what was actually taken at pick-up
-- Precedence when pricing a booking: price_override → custom_price (>0) →
-- salon_config.pricing (Settings guide) → hard-coded constant. The previous
-- paid_amount is never reused.
--
-- Until now the booking-edit modal ABUSED dogs.custom_price as the
-- per-booking price store (a one-off matting surcharge silently became the
-- dog's price forever), and a blanked price field persisted as 0 — pricing
-- future grooms at £0. The app-side fixes land with this migration; here:
--
--   1. bookings.price_override column (+ positive CHECK).
--   2. Null the three accidental custom_price = 0 rows (verified on prod
--      2026-07-10: Alfie/Shih Tzu, Marley/Poochon, Teddy/Yorkie×Pom — one
--      completed visit each, no payment ever recorded, i.e. the blanked-
--      field bug, not deliberate free grooms. Owner approved the fix).
--   3. Positive CHECK on dogs.custom_price so a zero can't sneak back.
--
-- Additive + idempotent. No RLS change: price_override is written through
-- the existing staff booking-update path only.
-- ============================================================

alter table public.bookings
  add column if not exists price_override numeric;

comment on column public.bookings.price_override is
  'This booking''s one-off agreed price in pounds (e.g. matting surcharge). Beats the dog''s usual custom_price and the guide price for THIS booking only; never copied to the dog. NULL = no override. Distinct from paid_amount (what was actually taken).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_price_override_positive'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_price_override_positive
      check (price_override is null or price_override > 0);
  end if;
end $$;

-- Accidental £0 "usual prices" → NULL (fall back to the guide price).
update public.dogs
set custom_price = null
where custom_price = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dogs_custom_price_positive'
      and conrelid = 'public.dogs'::regclass
  ) then
    alter table public.dogs
      add constraint dogs_custom_price_positive
      check (custom_price is null or custom_price > 0);
  end if;
end $$;

comment on column public.dogs.custom_price is
  'The dog''s deliberately saved usual price in pounds (staff-set on the dog card, or via "Save as usual price" in the booking editor). NULL = no usual price, use the guide. Never 0 — enforced by dogs_custom_price_positive.';
