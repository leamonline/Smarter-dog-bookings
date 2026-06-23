-- 20260623130000_dog_pregnancy_gate.sql
--
-- Item 3: pregnant dogs cannot be booked through self-service or autonomous
-- booking; staff may arrange an exception. Enforced as a BEFORE INSERT trigger
-- on bookings (mirrors trg_enforce_booking_calendar) so EVERY non-staff insert
-- path is covered — customer RPC, WhatsApp Flow, autonomous apply, and any
-- future route. Staff inserts bypass via is_staff().
--
-- Design: docs/superpowers/specs/2026-06-23-capacity-consolidation-and-booking-policies-design.md
-- Apply to prod BY HAND before merging the app code that depends on it.

-- 1. Staff-managed flag. Default false. Only staff can UPDATE dogs (RLS:
--    staff_update_dogs); customers have no UPDATE path, so they can't set it.
alter table public.dogs
  add column if not exists is_pregnant boolean not null default false;

-- 2. Trigger-only gate helper. One dog per booking row, so no array logic.
--    SECURITY DEFINER so it reads the true flag regardless of the caller's RLS
--    view; FOR SHARE locks the dog so a concurrent staff flag flip can't race
--    the insert. Distinct integrity vs pregnancy P0001 messages.
create or replace function public.assert_booking_dog_not_pregnant(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pregnant boolean;
begin
  select is_pregnant into v_pregnant
    from public.dogs
   where id = p_dog_id
   for share;

  if not found then
    raise exception using errcode = 'P0001',
      message = 'That dog is no longer available. Please refresh and try again.';
  end if;

  if v_pregnant then
    raise exception using errcode = 'P0001',
      message = 'We can''t book a pregnant dog online — please call the salon.';
  end if;
end;
$$;

comment on function public.assert_booking_dog_not_pregnant(uuid) is
  'Trigger-only pregnancy gate. Raises P0001 with distinct integrity vs pregnancy messages. Never client-callable.';

-- Not a client-callable endpoint: only the trigger (running as the function
-- owner, see enforce_dog_not_pregnant below) calls it.
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from public;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from anon;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from authenticated;

-- 3. The gate. SECURITY DEFINER so the definer-owned call chain can reach the
--    revoked helper (clients still can't call the helper directly). is_staff()
--    reads the JWT, so service-role (auth.uid() null) is non-staff and gated,
--    exactly like trg_enforce_booking_calendar.
create or replace function public.enforce_dog_not_pregnant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    perform public.assert_booking_dog_not_pregnant(new.dog_id);
  end if;
  return new;
end;
$$;

comment on function public.enforce_dog_not_pregnant() is
  'BEFORE INSERT trigger on bookings: blocks a pregnant dog for every non-staff insert (customer, WhatsApp Flow, autonomous apply, future routes). Staff bypass via is_staff().';

drop trigger if exists trg_enforce_dog_not_pregnant on public.bookings;
create trigger trg_enforce_dog_not_pregnant
  before insert on public.bookings
  for each row execute function public.enforce_dog_not_pregnant();
