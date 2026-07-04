-- ============================================================
-- Payment method + paid_at (minimal ledger, improvement #3)
--
-- Records HOW and WHEN a booking was settled, without a separate ledger table:
--   payment_method  cash | card | bank_transfer | null (staff-set at mark-paid)
--   paid_at         stamped on the transition into 'Paid in Full' (trigger)
--   paid_amount     the amount recorded as taken (staff/app-set)
--
-- One settlement per booking (the deposit stays in deposit_amount). paid_at
-- mirrors completed_at: trigger-stamped on entering 'Paid in Full', cleared
-- (with method + amount) when moved back out. No backfill — accrues from deploy.
--
-- Additive + idempotent. Touches no gate, capacity, or RLS.
-- ============================================================

alter table public.bookings add column if not exists payment_method text;
comment on column public.bookings.payment_method is
  'How a Paid-in-Full booking was settled: cash | card | bank_transfer | null. Set by staff at mark-paid; cleared if payment is moved back off Paid in Full.';

alter table public.bookings add column if not exists paid_at timestamptz;
comment on column public.bookings.paid_at is
  'When the booking was marked Paid in Full (trigger-stamped, cleared if moved back out). NULL while not fully paid. No historical backfill — accrues from 2026-07-04.';

alter table public.bookings add column if not exists paid_amount numeric;
comment on column public.bookings.paid_amount is
  'Amount recorded as taken at full payment (usually the appointment total). NULL while not fully paid.';

-- BEFORE UPDATE: stamp paid_at on the transition into 'Paid in Full'; clear
-- paid_at + method + amount when leaving it. Only touches NEW, never raises.
-- payment_method / paid_amount are set by the same app UPDATE when marking paid;
-- the Paid-in-Full branch leaves them alone so those values persist.
create or replace function set_booking_paid_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment = 'Paid in Full' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
    new.payment_method := null;
    new.paid_amount := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_booking_paid_at on public.bookings;
create trigger trg_set_booking_paid_at
  before update on public.bookings
  for each row
  when (old.payment is distinct from new.payment)
  execute function set_booking_paid_at();

revoke execute on function public.set_booking_paid_at() from public, anon, authenticated;
