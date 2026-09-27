-- #879: stored payment evidence, not a new ledger or a change to takings.
begin;

create table public.booking_payment_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before_values jsonb,
  after_values jsonb,
  actor_id uuid,
  actor_role text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  restored_from bigint references public.booking_payment_history(id),
  reason text,
  check ((operation = 'INSERT' and before_values is null and after_values is not null)
      or (operation = 'UPDATE' and before_values is not null and after_values is not null)
      or (operation = 'DELETE' and before_values is not null and after_values is null)),
  check ((restored_from is null and reason is null)
      or (operation = 'UPDATE' and restored_from is not null
          and reason is not null and length(btrim(reason)) between 1 and 500))
);
create index booking_payment_history_booking_id_idx
  on public.booking_payment_history (booking_id, id desc);
comment on table public.booking_payment_history is
  'Database-owned before/after payment evidence from installation onwards. Not a ledger. No names, contact details or banking references. No cascading booking/actor FK: deletion must not erase history. Production rollout requires an approved retention/disposal policy.';

alter table public.booking_payment_history enable row level security;
revoke all on public.booking_payment_history from public, anon, authenticated, service_role;
revoke all on sequence public.booking_payment_history_id_seq from public, anon, authenticated, service_role;
grant select on public.booking_payment_history to authenticated, service_role;
create policy staff_read_payment_history on public.booking_payment_history
  for select to authenticated using ((select public.is_staff()));

create function public.booking_payment_snapshot(p_booking public.bookings)
returns jsonb language sql immutable set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'payment', p_booking.payment,
    'paid_amount', p_booking.paid_amount,
    'payment_method', p_booking.payment_method,
    'paid_at', p_booking.paid_at,
    'deposit_amount', p_booking.deposit_amount,
    'deposit_received_at', p_booking.deposit_received_at
  );
$$;
revoke all on function public.booking_payment_snapshot(public.bookings) from public, anon, authenticated;

create function public.record_booking_payment_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_context jsonb;
begin
  if TG_OP <> 'INSERT' then v_before := public.booking_payment_snapshot(old); end if;
  if TG_OP <> 'DELETE' then v_after := public.booking_payment_snapshot(new); end if;
  if TG_OP = 'UPDATE' and v_before = v_after then return null; end if;
  -- Only the server recovery command sets this transaction-local context.
  -- It is reset before returning; no client-facing context-setting RPC exists.
  v_context := nullif(current_setting('app.payment_restore', true), '')::jsonb;
  if TG_OP <> 'UPDATE' or (v_context->>'booking_id')::uuid is distinct from new.id then
    v_context := null;
  end if;
  insert into public.booking_payment_history
    (booking_id, operation, before_values, after_values, actor_id, actor_role,
     restored_from, reason)
  values
    (case when TG_OP = 'DELETE' then old.id else new.id end,
     TG_OP, v_before, v_after, auth.uid(),
     coalesce(nullif(auth.role(), ''), session_user::text),
     (v_context->>'event_id')::bigint, v_context->>'reason');
  return null;
end;
$$;
revoke all on function public.record_booking_payment_history() from public, anon, authenticated, service_role;

-- AFTER sees the payment/deposit timestamps written by existing BEFORE triggers.
-- Do not use UPDATE OF: another trigger may change a payment field indirectly.
create trigger trg_record_booking_payment_history
  after insert or update or delete on public.bookings
  for each row execute function public.record_booking_payment_history();

create function public.restore_booking_payment(
  p_booking_id uuid, p_event_id bigint, p_expected_latest_id bigint, p_reason text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_event public.booking_payment_history;
  v_latest public.booking_payment_history;
  v_target jsonb;
  v_result bigint;
begin
  if not public.is_staff() then
    raise exception using errcode = '42501', message = 'Staff access required';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A correction reason of 1 to 500 characters is required';
  end if;
  -- Serialise with ordinary booking writes as well as other restorations.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking no longer exists';
  end if;
  select * into v_latest from public.booking_payment_history
    where booking_id = p_booking_id order by id desc limit 1;
  if v_latest.id is null or p_expected_latest_id is distinct from v_latest.id
     or public.booking_payment_snapshot(v_booking) is distinct from v_latest.after_values then
    raise exception using errcode = '40001', message = 'Payment changed; reload its history before restoring';
  end if;
  select * into v_event from public.booking_payment_history
    where id = p_event_id and booking_id = p_booking_id and operation = 'UPDATE';
  if not found then
    raise exception using errcode = '22023', message = 'Choose a payment change for this booking';
  end if;
  v_target := v_event.before_values;
  if public.booking_payment_snapshot(v_booking) = v_target then
    raise exception using errcode = '22023', message = 'These payment values are already current';
  end if;
  perform set_config('app.payment_restore', jsonb_build_object(
    'booking_id', p_booking_id, 'event_id', p_event_id, 'reason', btrim(p_reason)
  )::text, true);
  update public.bookings set
    payment = v_target->>'payment',
    paid_amount = (v_target->>'paid_amount')::numeric,
    payment_method = v_target->>'payment_method',
    paid_at = (v_target->>'paid_at')::timestamptz,
    deposit_amount = (v_target->>'deposit_amount')::numeric,
    deposit_received_at = (v_target->>'deposit_received_at')::timestamptz
  where id = p_booking_id
  returning * into v_booking;
  perform set_config('app.payment_restore', '', true);
  if public.booking_payment_snapshot(v_booking) is distinct from v_target then
    -- Preserve existing trigger rules; never silently claim a partial recovery.
    raise exception using errcode = '22023', message = 'Existing booking rules prevent an exact restore; operator review required';
  end if;
  select id into v_result from public.booking_payment_history
    where booking_id = p_booking_id order by id desc limit 1;
  return v_result;
end;
$$;
revoke all on function public.restore_booking_payment(uuid, bigint, bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.restore_booking_payment(uuid, bigint, bigint, text) to authenticated;
comment on function public.restore_booking_payment(uuid, bigint, bigint, text) is
  'Staff-only correction to the before-values of a recorded UPDATE. Requires the latest history id and a reason; locks the booking and records the restore as a new event. Does not recreate deleted bookings or repair pre-history data.';

commit;
