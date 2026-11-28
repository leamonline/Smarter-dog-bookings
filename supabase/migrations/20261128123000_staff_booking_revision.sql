-- Monotonic for the row, even when two writes share a transaction timestamp.
-- Existing clients keep writing their current field-scoped payloads.
alter table public.bookings
  add column staff_revision integer not null default 0 check (staff_revision >= 0);

create function smarter_dog_private.advance_staff_booking_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.staff_revision := 0;
  else
    new.staff_revision := old.staff_revision + 1;
  end if;
  return new;
end;
$$;

revoke execute on function smarter_dog_private.advance_staff_booking_revision()
  from public, anon, authenticated;

create trigger trg_bookings_advance_staff_revision
before insert or update on public.bookings
for each row execute function smarter_dog_private.advance_staff_booking_revision();
