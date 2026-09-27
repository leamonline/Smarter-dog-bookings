-- A no-show revived onto a closed day must pass the closed-day guard.
--
-- guard_active_booking_on_closed_day() (20260728214151) re-checks a row only
-- when something brings it onto the date: an insert, a date/visit/dog change,
-- or a revival from a terminal status. Its revival test predates the
-- first-class `No-show` status (20260919090000) and only recognised
-- `Cancelled` and `Completed`. So a `No-show` -> `Booked` correction (the day
-- stack's "They turned up") changed nothing the guard looked at, and could put
-- an active booking on a closed day without its closure-rearrangement task.
--
-- The only change is adding 'No-show' to the OLD-status revival list. The body
-- is otherwise identical to 20260728214151. CREATE OR REPLACE keeps the
-- trigger binding and the ACL; the REVOKE is restated so a re-run is a no-op.

create or replace function smarter_dog_private.guard_active_booking_on_closed_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_membership_state = 'included'
     and coalesce(new.status, 'Booked') not in ('Cancelled', 'Completed')
     and (
       tg_op = 'INSERT'
       or old.booking_date is distinct from new.booking_date
       or old.status in ('Cancelled', 'Completed', 'No-show')
       or old.visit_membership_state is distinct from 'included'
       or old.visit_id is distinct from new.visit_id
       or old.dog_id is distinct from new.dog_id
     ) then
    -- Share a date-scoped lock with the close command. Without it, an insert
    -- could check an open day while a concurrent close had already collected
    -- its affected visits, then commit afterwards without a linked task.
    perform pg_advisory_xact_lock(
      hashtextextended('smarter_dog|close_day|' || new.booking_date::text, 0)
    );

    if exists (
      select 1
        from public.day_settings ds
       where ds.setting_date = new.booking_date
         and ds.is_open is false
    )
    and not exists (
      select 1
        from public.salon_todos t
       where t.kind = 'closure_rearrangement'
         and t.booking_visit_id = new.visit_id
         and t.closure_date = new.booking_date
         and not t.done
    ) then
      raise exception 'active_booking_requires_open_day_or_closure_task'
        using errcode = 'SCL03';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function smarter_dog_private.guard_active_booking_on_closed_day()
  from public, anon, authenticated, service_role;
