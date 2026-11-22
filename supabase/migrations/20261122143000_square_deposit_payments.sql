-- Square deposits paid in the iPhone app.
--
-- A customer flagged humans.deposit_required already has that flag stamped
-- onto each new booking by stamp_booking_deposit. This migration records the
-- £10 card or Apple Pay payment taken for that booking (1000 pence, the same
-- figure as DEFAULT_DEPOSIT_AMOUNT / DEPOSIT_PER_DOG_PENCE) and decides what
-- happens to the money:
--
--   * cancelled with the salon's notice (minCancellationHours, default 24),
--     including exactly on the deadline: refund
--   * cancelled after that deadline, or marked No-show: the salon keeps it
--   * cancelled because the appointment was rescheduled: the same payment
--     moves onto the replacement booking
--   * cancelled by the salon, or with no customer cause: refund
--
-- The decision is made here, in the same transaction as the booking change,
-- including cancel_customer_booking and reschedule (both of which set status
-- and cancellation_cause). Square itself is called afterwards by an Edge
-- Function. Nothing in this file talks to Square, and nothing here turns the
-- feature on: the charge endpoint stays off until IOS_DEPOSITS_ENABLED=true.
--
-- Do not apply this to production from a pull request. Apply it by the usual
-- gated migration workflow, and only turn the flag on after the secrets exist.

set local lock_timeout = '5s';

-- ── 1. The payment record ───────────────────────────────────

create table if not exists public.deposit_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  original_booking_id uuid not null references public.bookings (id) on delete restrict,
  carried_from_booking_id uuid references public.bookings (id) on delete restrict,
  human_id uuid references public.humans (id) on delete restrict,
  amount_pence integer not null check (amount_pence = 1000),
  currency text not null default 'GBP' check (currency = 'GBP'),
  status text not null check (status in (
    'pending',
    'completed',
    'failed',
    'refund_due',
    'refund_pending',
    'refunded',
    'forfeited',
    'waived'
  )),
  square_payment_id text,
  square_refund_id text,
  idempotency_key text not null,
  refund_idempotency_key text,
  disposition text check (disposition is null or disposition in (
    'refund_due',
    'refunded',
    'forfeited',
    'carry_pending',
    'carried',
    'waived'
  )),
  disposition_reason text,
  disposition_at timestamptz,
  carry_txid bigint,
  -- Set while a charge is still pending, at the moment the booking is cancelled
  -- or marked a no-show. Settlement uses this instead of the clock at the
  -- moment Square replies, so a slow confirmation cannot turn an in-time
  -- cancellation into a forfeit.
  deferred_outcome text check (deferred_outcome is null or deferred_outcome in ('refund_due', 'forfeited')),
  deferred_at timestamptz,
  acted_by uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_payments_idempotency_key_key unique (idempotency_key)
);

comment on table public.deposit_payments is
  'One Square (or staff-waived) deposit for a booking. £10 / 1000 pence. Status is the money; disposition records refund, forfeit, carry or waive. Written only by security-definer functions (20261122143000).';

comment on column public.deposit_payments.amount_pence is
  'Always 1000. That is £10, DEFAULT_DEPOSIT_AMOUNT in src/engine/bookingRules.ts and DEPOSIT_PER_DOG_PENCE in src/constants/salon.ts.';

comment on column public.deposit_payments.idempotency_key is
  'Sent to Square as the payment idempotency key so a retry cannot take the £10 twice.';

comment on column public.deposit_payments.refund_idempotency_key is
  'Sent to Square as the refund idempotency key. Kept across a network failure; rotated only when Square rejects the refund.';

comment on column public.deposit_payments.carry_txid is
  'Set when a reschedule cancels the booking, so the replacement inserted in the same transaction can claim this payment.';

create unique index if not exists deposit_payments_one_live_per_booking
  on public.deposit_payments (booking_id)
  where status in ('pending', 'completed', 'refund_due', 'refund_pending');

create unique index if not exists deposit_payments_square_payment_id
  on public.deposit_payments (square_payment_id)
  where square_payment_id is not null;

create unique index if not exists deposit_payments_square_refund_id
  on public.deposit_payments (square_refund_id)
  where square_refund_id is not null;

create unique index if not exists deposit_payments_refund_idempotency_key
  on public.deposit_payments (refund_idempotency_key)
  where refund_idempotency_key is not null;

create index if not exists deposit_payments_booking_id
  on public.deposit_payments (booking_id);

-- ── 2. Who may read it ──────────────────────────────────────
-- Customers can read a payment on a booking they own. Staff can read all.
-- Nobody writes through the API: the functions below are the only writers.

alter table public.deposit_payments enable row level security;

revoke all on table public.deposit_payments from public, anon, authenticated;
grant select on table public.deposit_payments to authenticated;
grant select, insert, update on table public.deposit_payments to service_role;

drop policy if exists deposit_payments_select on public.deposit_payments;
create policy deposit_payments_select on public.deposit_payments
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
      join public.humans h on h.id = d.human_id
      where b.id = deposit_payments.booking_id
        and h.customer_user_id = (select auth.uid())
    )
  );

-- ── 3. The rule ─────────────────────────────────────────────
-- Keep this in step with src/engine/depositOutcome.ts. Exactly on the
-- notice deadline is still in time (refund), matching record_late_cancellation,
-- which does not count the deadline itself as a late cancellation.

create or replace function smarter_dog_private.square_deposit_outcome(
  p_status text,
  p_cause text,
  p_date date,
  p_slot text,
  p_at timestamptz
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hours numeric;
  v_start timestamp without time zone;
  v_now_london timestamp without time zone;
begin
  if p_status = 'No-show' then
    return 'forfeited';
  end if;

  if p_status is distinct from 'Cancelled' then
    return null;
  end if;

  if p_cause = 'reschedule' then
    return 'carry_pending';
  end if;

  -- Salon, system, or no cause (including "deposit not received"): the
  -- customer did not cancel late, so a payment already taken is returned.
  if p_cause is distinct from 'customer' then
    return 'refund_due';
  end if;

  if p_date is null or nullif(trim(coalesce(p_slot, '')), '') is null then
    return 'refund_due';
  end if;

  begin
    v_hours := smarter_dog_private.cancellation_notice_hours();
    v_start := p_date + p_slot::time;
    v_now_london := p_at at time zone 'Europe/London';
  exception
    when others then
      return 'refund_due';
  end;

  if v_now_london > v_start - (v_hours * interval '1 hour') then
    return 'forfeited';
  end if;

  return 'refund_due';
end;
$$;

comment on function smarter_dog_private.square_deposit_outcome(text, text, date, text, timestamptz) is
  'refund_due, forfeited, carry_pending, or null. Notice window is cancellation_notice_hours() (default 24). Exactly on the deadline refunds. Mirrors src/engine/depositOutcome.ts.';

revoke all on function smarter_dog_private.square_deposit_outcome(text, text, date, text, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function smarter_dog_private.apply_square_deposit_outcome(
  p_booking_id uuid,
  p_status text,
  p_cause text,
  p_date date,
  p_slot text,
  p_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outcome text;
begin
  v_outcome := smarter_dog_private.square_deposit_outcome(
    p_status, p_cause, p_date, p_slot, p_at);
  if v_outcome is null then
    return null;
  end if;

  if v_outcome = 'carry_pending' then
    update public.deposit_payments
       set disposition = 'carry_pending',
           carry_txid = txid_current(),
           disposition_at = p_at,
           disposition_reason = 'rescheduled',
           updated_at = p_at
     where booking_id = p_booking_id
       and status in ('pending', 'completed');
    return v_outcome;
  end if;

  if v_outcome = 'forfeited' then
    update public.deposit_payments
       set status = 'forfeited',
           disposition = 'forfeited',
           disposition_at = p_at,
           disposition_reason = case
             when p_status = 'No-show' then 'no_show'
             else 'late_cancellation'
           end,
           updated_at = p_at
     where booking_id = p_booking_id
       and status = 'completed';
    update public.deposit_payments
       set deferred_outcome = 'forfeited',
           deferred_at = p_at,
           disposition_reason = case
             when p_status = 'No-show' then 'no_show'
             else 'late_cancellation'
           end,
           updated_at = p_at
     where booking_id = p_booking_id
       and status = 'pending';
    return v_outcome;
  end if;

  update public.deposit_payments
     set status = 'refund_due',
         disposition = 'refund_due',
         refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
         disposition_at = p_at,
         disposition_reason = case
           when p_cause = 'customer' then 'cancelled_with_notice'
           when p_cause = 'salon' then 'salon_cancelled'
           else 'cancelled'
         end,
         updated_at = p_at
   where booking_id = p_booking_id
     and status = 'completed';

  update public.deposit_payments
     set deferred_outcome = 'refund_due',
         deferred_at = p_at,
         disposition_reason = case
           when p_cause = 'customer' then 'cancelled_with_notice'
           when p_cause = 'salon' then 'salon_cancelled'
           else 'cancelled'
         end,
         updated_at = p_at
   where booking_id = p_booking_id
     and status = 'pending';

  return v_outcome;
end;
$$;

revoke all on function smarter_dog_private.apply_square_deposit_outcome(uuid, text, text, date, text, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.apply_square_deposit_on_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;
  perform smarter_dog_private.apply_square_deposit_outcome(
    new.id,
    new.status,
    new.cancellation_cause,
    new.booking_date,
    new.slot,
    now()
  );
  return new;
end;
$$;

comment on function public.apply_square_deposit_on_booking_status() is
  'AFTER UPDATE of bookings.status. Applies the Square deposit rule to a completed payment. No row means no change, so bookings without an app deposit are untouched.';

revoke all on function public.apply_square_deposit_on_booking_status()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_apply_square_deposit_on_booking_status on public.bookings;
create trigger trg_apply_square_deposit_on_booking_status
  after update of status on public.bookings
  for each row
  execute function public.apply_square_deposit_on_booking_status();

-- ── 4. Reschedule carries the payment onto the new booking ──

create or replace function smarter_dog_private.attach_carried_square_deposit(
  p_new_booking_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dog uuid;
  v_status text;
  v_payment uuid;
  v_payment_status text;
begin
  select b.dog_id, b.status
    into v_dog, v_status
    from public.bookings b
   where b.id = p_new_booking_id;

  if v_dog is null or v_status not in ('Booked', 'Reconfirmed') then
    return null;
  end if;

  if exists (
    select 1
    from public.deposit_payments live
    where live.booking_id = p_new_booking_id
      and live.status in ('pending', 'completed', 'refund_due', 'refund_pending')
  ) then
    return null;
  end if;

  select p.id, p.status
    into v_payment, v_payment_status
    from public.deposit_payments p
    join public.bookings old on old.id = p.booking_id
   where old.dog_id = v_dog
     and old.id <> p_new_booking_id
     and p.disposition = 'carry_pending'
     and p.status in ('pending', 'completed')
     and (
       p.carry_txid = txid_current()
       or p.disposition_at > now() - interval '15 minutes'
     )
   order by (p.carry_txid is not distinct from txid_current()) desc,
            p.disposition_at desc
   limit 1
   for update of p;

  if v_payment is null then
    return null;
  end if;

  update public.deposit_payments
     set carried_from_booking_id = booking_id,
         booking_id = p_new_booking_id,
         disposition = 'carried',
         carry_txid = null,
         updated_at = now()
   where id = v_payment;

  if v_payment_status = 'completed' then
    update public.bookings
       set deposit_required = true,
           deposit_amount = 10,
           payment = 'Deposit Paid'
     where id = p_new_booking_id
       and coalesce(payment, '') is distinct from 'Paid in Full';
  end if;

  return v_payment;
end;
$$;

comment on function smarter_dog_private.attach_carried_square_deposit(uuid) is
  'Moves a reschedule-held Square deposit onto the replacement booking for the same dog. Same transaction always matches; a follow-up insert within 15 minutes matches too (the WhatsApp reschedule is two calls).';

revoke all on function smarter_dog_private.attach_carried_square_deposit(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.attach_carried_square_deposit_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform smarter_dog_private.attach_carried_square_deposit(new.id);
  return new;
end;
$$;

revoke all on function public.attach_carried_square_deposit_on_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_attach_carried_square_deposit on public.bookings;
create trigger trg_attach_carried_square_deposit
  after insert on public.bookings
  for each row
  execute function public.attach_carried_square_deposit_on_insert();

-- ── 5. Ask the Edge Function to refund, once ────────────────
-- The first move into refund_due from money we were holding, from a forfeit
-- staff have decided to return, or from a pending charge Square completed for
-- the wrong amount, calls out once. A later failure puts the row back to
-- refund_due from refund_pending and must not call out again by itself, or a
-- Square outage would retry forever.

create or replace function public.dispatch_square_deposit_refund()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform net.http_post(
      url := public.get_supabase_url() || '/functions/v1/square-deposit-refund',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := jsonb_build_object('deposit_payment_id', new.id)
    );
  exception when others then
    raise warning 'dispatch_square_deposit_refund: refund call failed (%) — the booking change is unaffected', sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.dispatch_square_deposit_refund() is
  'Tells square-deposit-refund to return a deposit Square has already taken. Swallows its own errors so a booking change cannot roll back because Square was unreachable.';

revoke all on function public.dispatch_square_deposit_refund()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_dispatch_square_deposit_refund on public.deposit_payments;
create trigger trg_dispatch_square_deposit_refund
  after update of status on public.deposit_payments
  for each row
  when (
    new.status = 'refund_due'
    and old.status in ('completed', 'forfeited', 'pending')
  )
  execute function public.dispatch_square_deposit_refund();

-- ── 6. Staff waive and refund ───────────────────────────────

create or replace function public.staff_waive_booking_deposit(
  p_booking_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_human uuid;
  v_updated integer;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'waiver_reason_must_be_1_to_500_characters' using errcode = '22023';
  end if;
  if p_booking_id is null or not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.deposit_payments p
    where p.booking_id = p_booking_id
      and p.status = 'pending'
  ) then
    raise exception 'deposit_charge_in_progress' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.deposit_payments p
    where p.booking_id = p_booking_id
      and p.square_payment_id is not null
      and p.status in ('completed', 'refund_due', 'refund_pending', 'refunded', 'forfeited')
  ) then
    raise exception 'deposit_already_taken' using errcode = 'P0001';
  end if;

  perform b.id from public.bookings b where b.id = p_booking_id for update;

  update public.deposit_payments
     set status = 'waived',
         disposition = 'waived',
         disposition_reason = v_reason,
         disposition_at = now(),
         acted_by = (select auth.uid()),
         updated_at = now()
   where booking_id = p_booking_id
     and status = 'pending'
     and square_payment_id is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 and not exists (
    select 1 from public.deposit_payments where booking_id = p_booking_id and status = 'waived'
  ) then
    select d.human_id into v_human
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
     where b.id = p_booking_id;

    insert into public.deposit_payments (
      booking_id, original_booking_id, human_id, amount_pence, currency,
      status, idempotency_key, disposition, disposition_reason, disposition_at, acted_by
    ) values (
      p_booking_id, p_booking_id, v_human, 1000, 'GBP',
      'waived', gen_random_uuid()::text, 'waived', v_reason, now(), (select auth.uid())
    );
  end if;

  update public.bookings
     set deposit_required = false
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'status', 'waived', 'booking_id', p_booking_id);
end;
$$;

comment on function public.staff_waive_booking_deposit(uuid, text) is
  'Staff only. This booking no longer requires a deposit, so the unpaid-deposit auto-cancel will not take it. Refuses once Square has a payment id — that money is refunded, not waived. Does not clear humans.deposit_required.';

revoke all on function public.staff_waive_booking_deposit(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_waive_booking_deposit(uuid, text) to authenticated;

create or replace function public.staff_refund_booking_deposit(
  p_booking_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row public.deposit_payments%rowtype;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'refund_reason_must_be_1_to_500_characters' using errcode = '22023';
  end if;

  select * into v_row
    from public.deposit_payments
   where booking_id = p_booking_id
     and status in ('completed', 'forfeited', 'refund_due', 'refund_pending', 'refunded')
   order by case status
     when 'completed' then 0
     when 'forfeited' then 1
     when 'refund_due' then 2
     when 'refund_pending' then 3
     else 4
   end, created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'deposit_not_refundable' using errcode = 'P0001';
  end if;

  if v_row.status in ('refund_due', 'refund_pending', 'refunded') then
    return jsonb_build_object(
      'ok', true,
      'deposit_payment_id', v_row.id,
      'status', v_row.status,
      'square_payment_id', v_row.square_payment_id,
      'square_refund_id', v_row.square_refund_id,
      'refund_idempotency_key', v_row.refund_idempotency_key,
      'amount_pence', v_row.amount_pence,
      'currency', v_row.currency
    );
  end if;

  if v_row.square_payment_id is null then
    raise exception 'deposit_not_refundable' using errcode = 'P0001';
  end if;

  update public.deposit_payments
     set status = 'refund_due',
         disposition = 'refund_due',
         disposition_reason = v_reason,
         disposition_at = now(),
         acted_by = (select auth.uid()),
         refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
         updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'deposit_payment_id', v_row.id,
    'status', v_row.status,
    'square_payment_id', v_row.square_payment_id,
    'square_refund_id', v_row.square_refund_id,
    'refund_idempotency_key', v_row.refund_idempotency_key,
    'amount_pence', v_row.amount_pence,
    'currency', v_row.currency
  );
end;
$$;

comment on function public.staff_refund_booking_deposit(uuid, text) is
  'Staff only. Marks a taken deposit (including one the rules had kept) as refund_due. Repeating the call returns the same row and the same Square idempotency key.';

revoke all on function public.staff_refund_booking_deposit(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_refund_booking_deposit(uuid, text) to authenticated;

-- ── 7. Edge Function writers (service role only) ────────────

create or replace function public.prepare_square_deposit_charge(
  p_booking_id uuid,
  p_customer_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_human uuid;
  v_owner uuid;
  v_row public.deposit_payments%rowtype;
  v_id uuid := gen_random_uuid();
  v_key text := gen_random_uuid()::text;
begin
  if p_booking_id is null or p_customer_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  select d.human_id, h.customer_user_id
    into v_human, v_owner
    from public.dogs d
    join public.humans h on h.id = d.human_id
   where d.id = v_booking.dog_id;

  if v_owner is distinct from p_customer_user_id then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  if not coalesce(v_booking.deposit_required, false) then
    return jsonb_build_object('ok', false, 'reason', 'deposit_not_required');
  end if;

  if v_booking.status not in ('Booked', 'Reconfirmed') then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_payable');
  end if;

  if coalesce(v_booking.payment, '') in ('Deposit Paid', 'Paid in Full') then
    return jsonb_build_object('ok', false, 'reason', 'deposit_already_paid');
  end if;

  if exists (
    select 1 from public.deposit_payments
    where booking_id = p_booking_id and status = 'waived'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'deposit_waived');
  end if;

  select * into v_row
    from public.deposit_payments
   where booking_id = p_booking_id
     and status in ('pending', 'completed', 'refund_due', 'refund_pending')
   for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'deposit_payment_id', v_row.id,
      'idempotency_key', v_row.idempotency_key,
      'amount_pence', v_row.amount_pence,
      'currency', v_row.currency,
      'status', v_row.status,
      'square_payment_id', v_row.square_payment_id,
      'already_exists', true
    );
  end if;

  insert into public.deposit_payments (
    id, booking_id, original_booking_id, human_id,
    amount_pence, currency, status, idempotency_key
  ) values (
    v_id, p_booking_id, p_booking_id, v_human,
    1000, 'GBP', 'pending', v_key
  );

  return jsonb_build_object(
    'ok', true,
    'deposit_payment_id', v_id,
    'idempotency_key', v_key,
    'amount_pence', 1000,
    'currency', 'GBP',
    'status', 'pending',
    'square_payment_id', null,
    'already_exists', false
  );
end;
$$;

comment on function public.prepare_square_deposit_charge(uuid, uuid) is
  'Service role. Opens (or returns) the single pending £10 charge for a booking the given customer owns. The idempotency key is created here, before Square is called.';

revoke all on function public.prepare_square_deposit_charge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_square_deposit_charge(uuid, uuid) to service_role;

create or replace function public.settle_square_deposit_charge(
  p_payment_id uuid,
  p_square_payment_id text,
  p_square_status text,
  p_amount_pence integer,
  p_currency text,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.deposit_payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_row from public.deposit_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- A waiver that landed while Square was still deciding must not drop the
  -- money. If Square captured it, send it back.
  if v_row.status = 'waived' and p_square_status = 'COMPLETED' then
    update public.deposit_payments
       set status = 'refund_due',
           square_payment_id = nullif(p_square_payment_id, ''),
           refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
           disposition = 'refund_due',
           disposition_reason = 'waived_after_capture',
           disposition_at = now(),
           last_error = case
             when p_amount_pence is distinct from 1000 or upper(coalesce(p_currency, '')) <> 'GBP'
               then 'amount_mismatch'
             else null
           end,
           updated_at = now()
     where id = v_row.id
     returning * into v_row;
    return jsonb_build_object('ok', true, 'status', v_row.status, 'square_payment_id', v_row.square_payment_id);
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object(
      'ok', true,
      'deposit_payment_id', v_row.id,
      'status', v_row.status,
      'square_payment_id', v_row.square_payment_id,
      'unchanged', true
    );
  end if;

  if p_square_status = 'COMPLETED' then
    if p_amount_pence is distinct from 1000 or upper(coalesce(p_currency, '')) <> 'GBP' then
      -- Square took something other than the £10 we asked for. Hold the
      -- payment id and send it straight back; do not mark the booking paid.
      update public.deposit_payments
         set status = 'refund_due',
             square_payment_id = nullif(p_square_payment_id, ''),
             refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
             disposition = 'refund_due',
             disposition_reason = 'amount_mismatch',
             disposition_at = now(),
             last_error = 'amount_mismatch',
             updated_at = now()
       where id = v_row.id
       returning * into v_row;
      return jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'status', v_row.status);
    end if;

    if v_row.deferred_outcome = 'forfeited' then
      update public.deposit_payments
         set status = 'forfeited',
             disposition = 'forfeited',
             square_payment_id = p_square_payment_id,
             last_error = null,
             updated_at = now()
       where id = v_row.id
       returning * into v_row;
      return jsonb_build_object('ok', true, 'status', v_row.status, 'square_payment_id', v_row.square_payment_id);
    end if;

    if v_row.deferred_outcome = 'refund_due' then
      update public.deposit_payments
         set status = 'refund_due',
             disposition = 'refund_due',
             square_payment_id = p_square_payment_id,
             refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
             last_error = null,
             updated_at = now()
       where id = v_row.id
       returning * into v_row;
      return jsonb_build_object('ok', true, 'status', v_row.status, 'square_payment_id', v_row.square_payment_id);
    end if;

    update public.deposit_payments
       set status = 'completed',
           square_payment_id = p_square_payment_id,
           last_error = null,
           updated_at = now()
     where id = v_row.id
     returning * into v_row;

    select * into v_booking from public.bookings where id = v_row.booking_id;
    if v_booking.status in ('Cancelled', 'No-show') then
      perform smarter_dog_private.apply_square_deposit_outcome(
        v_booking.id,
        v_booking.status,
        v_booking.cancellation_cause,
        v_booking.booking_date,
        v_booking.slot,
        now()
      );
    else
      update public.bookings
         set deposit_amount = 10,
             payment = 'Deposit Paid'
       where id = v_booking.id
         and coalesce(payment, '') is distinct from 'Paid in Full';
    end if;

    select * into v_row from public.deposit_payments where id = p_payment_id;
    return jsonb_build_object(
      'ok', true,
      'deposit_payment_id', v_row.id,
      'status', v_row.status,
      'square_payment_id', v_row.square_payment_id
    );
  end if;

  if p_square_status in ('FAILED', 'CANCELED') then
    update public.deposit_payments
       set status = 'failed',
           square_payment_id = nullif(p_square_payment_id, ''),
           last_error = left(coalesce(p_error, p_square_status), 500),
           updated_at = now()
     where id = v_row.id
     returning * into v_row;
    return jsonb_build_object('ok', false, 'reason', 'declined', 'status', v_row.status);
  end if;

  update public.deposit_payments
     set last_error = left(coalesce(p_error, p_square_status, 'pending'), 500),
         square_payment_id = coalesce(nullif(p_square_payment_id, ''), square_payment_id),
         updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'deposit_payment_id', v_row.id);
end;
$$;

comment on function public.settle_square_deposit_charge(uuid, text, text, integer, text, text) is
  'Service role. Records Square''s answer. A completed £10 payment marks the booking Deposit Paid unless the booking is already cancelled or a no-show, in which case the refund/forfeit rule runs immediately.';

revoke all on function public.settle_square_deposit_charge(uuid, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_square_deposit_charge(uuid, text, text, integer, text, text)
  to service_role;

create or replace function public.begin_square_deposit_refund(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.deposit_payments%rowtype;
begin
  select * into v_row from public.deposit_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.status = 'refunded' then
    return jsonb_build_object(
      'ok', true, 'state', 'refunded',
      'deposit_payment_id', v_row.id,
      'square_refund_id', v_row.square_refund_id,
      'status', v_row.status
    );
  end if;

  if v_row.status not in ('refund_due', 'refund_pending') then
    return jsonb_build_object('ok', false, 'reason', 'not_refundable', 'status', v_row.status);
  end if;

  if v_row.square_payment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_square_payment');
  end if;

  update public.deposit_payments
     set status = 'refund_pending',
         refund_idempotency_key = coalesce(refund_idempotency_key, gen_random_uuid()::text),
         updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'state', 'send',
    'deposit_payment_id', v_row.id,
    'square_payment_id', v_row.square_payment_id,
    'refund_idempotency_key', v_row.refund_idempotency_key,
    'amount_pence', v_row.amount_pence,
    'currency', v_row.currency,
    'reason', left(coalesce(v_row.disposition_reason, 'cancelled_with_notice'), 192)
  );
end;
$$;

comment on function public.begin_square_deposit_refund(uuid) is
  'Service role. Locks a refund_due payment, keeps its Square idempotency key, and marks it refund_pending so two callers send one refund.';

revoke all on function public.begin_square_deposit_refund(uuid) from public, anon, authenticated;
grant execute on function public.begin_square_deposit_refund(uuid) to service_role;

create or replace function public.settle_square_deposit_refund(
  p_payment_id uuid,
  p_square_refund_id text,
  p_square_status text,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.deposit_payments%rowtype;
begin
  select * into v_row from public.deposit_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_row.status = 'refunded' then
    return jsonb_build_object('ok', true, 'status', 'refunded', 'square_refund_id', v_row.square_refund_id);
  end if;

  if p_square_status = 'COMPLETED' then
    update public.deposit_payments
       set status = 'refunded',
           disposition = 'refunded',
           square_refund_id = coalesce(nullif(p_square_refund_id, ''), square_refund_id),
           last_error = null,
           updated_at = now()
     where id = v_row.id
     returning * into v_row;

    -- The £10 has gone back. An appointment that still says Deposit Paid would
    -- subtract it from the amount due at collection.
    update public.bookings
       set payment = 'Due at Pick-up',
           deposit_amount = null
     where id = v_row.booking_id
       and payment = 'Deposit Paid';

    return jsonb_build_object('ok', true, 'status', v_row.status, 'square_refund_id', v_row.square_refund_id);
  end if;

  if p_square_status in ('FAILED', 'REJECTED') then
    update public.deposit_payments
       set status = 'refund_due',
           refund_idempotency_key = gen_random_uuid()::text,
           last_error = left(coalesce(p_error, p_square_status), 500),
           updated_at = now()
     where id = v_row.id
     returning * into v_row;
    return jsonb_build_object('ok', false, 'reason', 'refund_rejected', 'status', v_row.status);
  end if;

  if nullif(btrim(coalesce(p_square_status, '')), '') is null then
    update public.deposit_payments
       set status = 'refund_due',
           last_error = left(coalesce(p_error, 'square_unreachable'), 500),
           updated_at = now()
     where id = v_row.id
       and status = 'refund_pending'
     returning * into v_row;
    return jsonb_build_object('ok', false, 'reason', 'square_unreachable', 'status', coalesce(v_row.status, 'refund_due'));
  end if;

  update public.deposit_payments
     set status = 'refund_pending',
         square_refund_id = coalesce(nullif(p_square_refund_id, ''), square_refund_id),
         last_error = left(p_error, 500),
         updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'square_refund_id', v_row.square_refund_id);
end;
$$;

comment on function public.settle_square_deposit_refund(uuid, text, text, text) is
  'Service role. COMPLETED stores the refund id. FAILED or REJECTED returns the row to refund_due with a new idempotency key. A network failure (null status) returns it to refund_due and keeps the key.';

revoke all on function public.settle_square_deposit_refund(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_square_deposit_refund(uuid, text, text, text) to service_role;

-- Webhook reconciliation. Prefer Square's payment id. If the charge response
-- was lost, the row is still pending with no id, and Square's reference_id
-- is the booking id we sent.
create or replace function public.deposit_payment_for_square_event(
  p_square_payment_id text,
  p_reference_id text
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'deposit_payment_id', p.id,
    'booking_id', p.booking_id,
    'status', p.status,
    'square_payment_id', p.square_payment_id,
    'square_refund_id', p.square_refund_id,
    'amount_pence', p.amount_pence,
    'currency', p.currency
  )
  from public.deposit_payments p
  where (
      nullif(p_square_payment_id, '') is not null
      and p.square_payment_id = p_square_payment_id
    )
    or (
      p.status in ('pending', 'waived')
      and p.square_payment_id is null
      and p.booking_id = case
        when p_reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then p_reference_id::uuid
      end
    )
  order by (p.square_payment_id is not distinct from nullif(p_square_payment_id, '')) desc
  limit 1;
$$;

revoke all on function public.deposit_payment_for_square_event(text, text) from public, anon, authenticated;
grant execute on function public.deposit_payment_for_square_event(text, text) to service_role;

-- A merge moves the customer's dogs first, then deletes the losing human.
-- Point any deposit at the dog's new owner so that delete is not blocked.
create or replace function public.reassign_deposit_payments_before_human_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.deposit_payments p
     set human_id = d.human_id,
         updated_at = now()
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where p.human_id = old.id
     and b.id = p.booking_id
     and d.human_id is distinct from old.id;

  update public.deposit_payments
     set human_id = null,
         updated_at = now()
   where human_id = old.id;

  return old;
end;
$$;

revoke all on function public.reassign_deposit_payments_before_human_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_reassign_deposit_payments_before_human_delete on public.humans;
create trigger trg_reassign_deposit_payments_before_human_delete
  before delete on public.humans
  for each row
  execute function public.reassign_deposit_payments_before_human_delete();

-- WhatsApp reschedule cancels the old visit inside
-- reschedule_whatsapp_booking_group without a cancellation cause. Without
-- one, the deposit rule would refund a moved appointment. Stamp reschedule
-- in the same update. Body otherwise unchanged from 20260723090000.

create or replace function public.reschedule_whatsapp_booking_group(
  p_bookings             jsonb,
  p_booking_date         date,
  p_human_id             uuid,
  p_old_group_id         uuid    default null,
  p_old_booking_id       uuid    default null,
  p_expected_old_ids     uuid[]  default null,
  p_reason               text    default 'Rescheduled via WhatsApp',
  p_flow_token           text    default null,
  p_expected_old_date    date    default null,
  p_expected_old_slot    text    default null,
  p_expected_services    jsonb   default null,
  p_expected_old_snapshot jsonb  default null
)
returns table (
  new_booking_ids       uuid[],
  cancelled_booking_ids uuid[],
  replayed              boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token                 text := p_flow_token;
  v_reason                text := left(coalesce(p_reason, 'Rescheduled via WhatsApp'), 500);
  v_request_hash          text;
  v_canonical_bookings    jsonb;
  v_canonical_snapshot    jsonb;
  v_canonical_ids         uuid[];
  v_prior_hash            text;
  v_prior_new_ids         uuid[];
  v_prior_cancelled_ids   uuid[];
  v_session_human_id      uuid;
  v_session_type          text;
  v_session_status        text;
  v_session_expires_at    timestamptz;
  v_anchor_booking_id     uuid;
  v_anchor_group_id       uuid;
  v_source_group_id       uuid;
  v_source_date           date;
  v_scope_count           integer;
  v_owned_count           integer;
  v_booked_count          integer;
  v_anchor_count          integer;
  v_expected_count        integer;
  v_old_ids               uuid[];
  v_old_dog_ids           uuid[];
  v_replacement_dog_ids   uuid[];
  v_live_snapshot         jsonb;
  v_live_slot             text;
  v_live_services         jsonb;
  v_cancelled_ids         uuid[];
  v_created_ids           uuid[];
  v_lock_keys             text[];
  v_lock_key              text;
  v_updated_count         integer;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_flow_token is null or btrim(p_flow_token) = '' then
    raise exception 'flow_token is required' using errcode = '22023';
  end if;
  if p_old_group_id is null and p_old_booking_id is null then
    raise exception 'the old visit must be identified by group id or booking id'
      using errcode = '22023';
  end if;
  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array'
      using errcode = '22023';
  end if;
  if p_expected_old_ids is null then
    raise exception 'expected_old_ids is required'
      using errcode = '22023';
  end if;
  if cardinality(p_expected_old_ids) = 0 then
    raise exception 'expected_old_ids must not be empty'
      using errcode = '22023';
  end if;
  if p_expected_old_snapshot is null then
    raise exception 'expected_old_snapshot is required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_expected_old_snapshot) <> 'array' then
    raise exception 'expected old snapshot must be a JSON array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_expected_old_snapshot) = 0 then
    raise exception 'expected_old_snapshot must not be empty'
      using errcode = '22023';
  end if;

  v_expected_count := jsonb_array_length(p_bookings);
  if v_expected_count < 1 or v_expected_count > 4 then
    raise exception 'A booking group must have between 1 and 4 dogs (got %)',
      v_expected_count using errcode = '22023';
  end if;
  if p_booking_date is null then
    raise exception 'booking_date is required' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(e order by
           coalesce(e->>'dog_id', ''),
           coalesce(e->>'slot', ''),
           coalesce(e->>'service', ''),
           e::text), '[]'::jsonb)
    into v_canonical_bookings
    from jsonb_array_elements(p_bookings) e;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_canonical_ids
    from unnest(coalesce(p_expected_old_ids, '{}'::uuid[])) id;

  select coalesce(jsonb_agg(e order by
           coalesce(e->>'booking_id', ''), e::text), '[]'::jsonb)
    into v_canonical_snapshot
    from jsonb_array_elements(coalesce(p_expected_old_snapshot, '[]'::jsonb)) e;

  -- JSONB object text is canonical for key order. Arrays that are sets are
  -- sorted above, so semantically identical redeliveries share one hash while
  -- reviewed IDs, cancellation reason, exact row snapshot and destination
  -- payload are all bound.
  v_request_hash := md5(jsonb_build_object(
    'version', 2,
    'bookings', v_canonical_bookings,
    'booking_date', p_booking_date,
    'human_id', p_human_id,
    'old_group_id', p_old_group_id,
    'old_booking_id', p_old_booking_id,
    'expected_old_ids', v_canonical_ids,
    'reason', v_reason,
    'expected_old_date', p_expected_old_date,
    'expected_old_slot', p_expected_old_slot,
    'expected_services', p_expected_services,
    'expected_old_snapshot', v_canonical_snapshot
  )::text);

  -- 1. Token advisory lock.
  perform pg_advisory_xact_lock(
    hashtextextended('wa_resched|' || v_token, 0)
  );

  -- 2. Flow session row lock and identity/type binding. Completed sessions are
  -- allowed through this lookup so an existing receipt can still replay.
  select fs.human_id, fs.flow_type, fs.status, fs.expires_at
    into v_session_human_id, v_session_type, v_session_status, v_session_expires_at
    from public.whatsapp_flow_sessions fs
   where fs.flow_token = v_token
   for update;

  if not found
     or v_session_human_id is distinct from p_human_id
     or v_session_type is distinct from 'cancel_reschedule' then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  select r.request_hash, r.new_booking_ids, r.cancelled_booking_ids
    into v_prior_hash, v_prior_new_ids, v_prior_cancelled_ids
    from public.whatsapp_reschedule_receipts r
   where r.flow_token = v_token;

  if found then
    if v_prior_hash <> v_request_hash then
      raise exception 'reschedule_idempotency_conflict' using errcode = 'P0002';
    end if;
    new_booking_ids := v_prior_new_ids;
    cancelled_booking_ids := v_prior_cancelled_ids;
    replayed := true;
    return next;
    return;
  end if;

  -- Receipt pruning never reopens a completed Flow, regardless of the legacy
  -- representative booking_id marker.
  if v_session_status = 'completed' then
    raise exception 'reschedule_already_completed' using errcode = 'P0002',
      detail = 'this completed Flow receipt has been pruned';
  end if;
  if v_session_status <> 'active' or v_session_expires_at <= now() then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  -- Resolve a real anchor before taking the membership lock. This read is
  -- intentionally provisional and is revalidated after every blocking lock.
  if p_old_booking_id is not null then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.id = p_old_booking_id;
  elsif cardinality(v_canonical_ids) > 0 then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from unnest(v_canonical_ids) expected(id)
      join public.bookings b on b.id = expected.id
     where p_old_group_id is null or b.group_id = p_old_group_id
     order by b.id
     limit 1;
  elsif jsonb_array_length(v_canonical_snapshot) > 0 then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from jsonb_array_elements(v_canonical_snapshot) snap
      join public.bookings b on b.id = nullif(snap->>'booking_id', '')::uuid
     where p_old_group_id is null or b.group_id = p_old_group_id
     order by b.id
     limit 1;
  elsif p_expected_old_date is not null then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.group_id = p_old_group_id
       and b.booking_date = p_expected_old_date
     order by b.id
     limit 1;
  else
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.group_id = p_old_group_id
     order by b.booking_date, b.id
     limit 1;
  end if;

  if v_anchor_booking_id is null then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;
  v_source_group_id := coalesce(p_old_group_id, v_anchor_group_id);

  -- 3. Exact group-or-booking + source-date membership advisory lock. This is
  -- the key validate_booking_capacity takes on INSERT and membership changes.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_cancellation|'
        || coalesce(v_source_group_id, v_anchor_booking_id)::text
        || '|'
        || v_source_date::text,
      0
    )
  );

  -- 4. Deterministic booking locks over the entire scope, including rows that
  -- are cancelled or belong to another owner; those facts are checked only
  -- after the lock set is stable.
  perform b.id
    from public.bookings b
   where (v_source_group_id is not null
          and b.group_id = v_source_group_id
          and b.booking_date = v_source_date)
      or (v_source_group_id is null and b.id = v_anchor_booking_id)
   order by b.id
   for update;

  -- 5. Deterministic dog locks prevent an ownership reassignment between
  -- validation and mutation.
  perform d.id
    from public.dogs d
   where d.id in (
     select b.dog_id
       from public.bookings b
      where (v_source_group_id is not null
             and b.group_id = v_source_group_id
             and b.booking_date = v_source_date)
         or (v_source_group_id is null and b.id = v_anchor_booking_id)
   )
   order by d.id
   for update;

  select
    count(*)::integer,
    count(*) filter (where d.human_id = p_human_id)::integer,
    count(*) filter (where b.status = 'Booked')::integer,
    count(*) filter (
      where b.id = v_anchor_booking_id
        and b.group_id is not distinct from v_anchor_group_id
        and b.booking_date = v_source_date
    )::integer,
    coalesce(array_agg(b.id order by b.id), '{}'::uuid[]),
    coalesce(array_agg(b.dog_id order by b.dog_id), '{}'::uuid[]),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'booking_id', b.id,
        'dog_id', b.dog_id,
        'booking_date', b.booking_date,
        'slot', b.slot,
        'service', b.service
      ) order by b.id
    ), '[]'::jsonb),
    min(b.slot),
    coalesce(jsonb_object_agg(b.dog_id::text, b.service), '{}'::jsonb)
    into
      v_scope_count,
      v_owned_count,
      v_booked_count,
      v_anchor_count,
      v_old_ids,
      v_old_dog_ids,
      v_live_snapshot,
      v_live_slot,
      v_live_services
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where (v_source_group_id is not null
          and b.group_id = v_source_group_id
          and b.booking_date = v_source_date)
      or (v_source_group_id is null and b.id = v_anchor_booking_id);

  if v_scope_count = 0
     or v_owned_count <> v_scope_count
     or v_booked_count <> v_scope_count
     or v_anchor_count <> 1
     or (p_old_group_id is not null
         and v_anchor_group_id is distinct from p_old_group_id) then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  if p_expected_old_ids is not null
     and v_old_ids is distinct from v_canonical_ids then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_date is not null
     and v_source_date is distinct from p_expected_old_date then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_slot is not null
     and v_live_slot is distinct from p_expected_old_slot then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_services is not null
     and v_live_services is distinct from p_expected_services then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_snapshot is not null
     and v_live_snapshot is distinct from v_canonical_snapshot then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;

  -- A reschedule is a complete replacement: exactly the same dog set and row
  -- cardinality, with no duplicate destination dog.
  select coalesce(array_agg((e->>'dog_id')::uuid order by (e->>'dog_id')::uuid),
                  '{}'::uuid[])
    into v_replacement_dog_ids
    from jsonb_array_elements(p_bookings) e;

  if cardinality(v_old_dog_ids) <> v_expected_count
     or cardinality(v_replacement_dog_ids) <> v_expected_count
     or cardinality(array(select distinct unnest(v_replacement_dog_ids)))
          <> v_expected_count
     or v_old_dog_ids is distinct from v_replacement_dog_ids then
    raise exception 'reschedule_replacement_dog_mismatch'
      using errcode = 'P0002';
  end if;

  -- 6. Old and destination capacity locks in one sorted order.
  select array_agg(distinct key order by key)
    into v_lock_keys
    from (
      select b.booking_date::text || '|' || b.slot as key
        from public.bookings b
       where b.id = any(v_old_ids)
      union
      select p_booking_date::text || '|' || (e->>'slot')
        from jsonb_array_elements(p_bookings) e
       where nullif(e->>'slot', '') is not null
    ) locks;

  if v_lock_keys is not null then
    foreach v_lock_key in array v_lock_keys loop
      perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
    end loop;
  end if;

  -- Queue confirmations before cancellations. The cancellation constraint
  -- trigger remains deferred until replacement creation and cardinality
  -- checks have succeeded; any exception rolls every notification row back.
  set constraints notify_booking_cancelled_trigger deferred;

  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancellation_cause = 'reschedule',
           cancel_reason = v_reason
     where b.id = any(v_old_ids)
       and b.status = 'Booked'
    returning b.id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_cancelled_ids
    from cancelled;

  if v_cancelled_ids is distinct from v_old_ids then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(created.id order by created.id), '{}'::uuid[])
    into v_created_ids
    from public.create_whatsapp_booking_group(
      p_bookings,
      p_booking_date,
      p_human_id
    ) created;

  if cardinality(v_created_ids) <> v_expected_count
     or cardinality(array(select distinct unnest(v_created_ids)))
          <> v_expected_count then
    raise exception 'reschedule_replacement_booking_count_mismatch'
      using errcode = 'P0002';
  end if;

  set constraints notify_booking_cancelled_trigger immediate;

  insert into public.whatsapp_reschedule_receipts (
    flow_token,
    request_hash,
    new_booking_ids,
    cancelled_booking_ids
  ) values (
    v_token,
    v_request_hash,
    v_created_ids,
    v_cancelled_ids
  );

  update public.whatsapp_flow_sessions fs
     set status = 'completed',
         booking_id = v_created_ids[1],
         updated_at = now()
   where fs.flow_token = v_token
     and fs.human_id = p_human_id
     and fs.flow_type = 'cancel_reschedule'
     and fs.status = 'active';
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  new_booking_ids := v_created_ids;
  cancelled_booking_ids := v_cancelled_ids;
  replayed := false;
  return next;
end;
$$;

comment on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) is
  'Service-role WhatsApp reschedule command. The old visit is cancelled with cancellation_cause reschedule so a paid deposit is carried, not refunded. Otherwise unchanged from 20260723090000.';

revoke all on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) to service_role;
