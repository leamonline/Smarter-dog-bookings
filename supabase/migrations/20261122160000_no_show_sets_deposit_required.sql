-- When a booking is marked No-show, require a deposit from that customer.
--
-- Staff record a no-show by setting bookings.status to 'No-show' (the Today
-- screen's "Didn't show" action, and any later app that writes the same
-- status, including a future iOS app). This trigger turns
-- humans.deposit_required on for the dog's owner. It never turns the flag
-- off: "They turned up", a cancellation, or another edit leaves it as staff
-- last set it. Staff can still switch it off on the customer card.
--
-- The first no-show that turns the flag on records why, on the customer, as
-- deposit_required_reason plus deposit_required_set_at. A later no-show while
-- the flag is already on does not overwrite that note. Switching the flag
-- off does not erase the note; the next no-show that has to turn the flag
-- back on replaces it.
--
-- Inserting a row that is already a no-show does nothing. Historical rows
-- are not updated here. The one-off list and the optional update live in
-- scripts/no-show-deposit-backfill.sql, which is not a migration and is not
-- applied by merging this file.
--
-- Idempotent. Apply to production by hand before merging, the same way as
-- every other migration. Do not fold the backfill into this file.

alter table public.humans
  add column if not exists deposit_required_reason text,
  add column if not exists deposit_required_set_at timestamptz;

comment on column public.humans.deposit_required is
  'Deposit tag: every booking for this owner is created awaiting a bank-transfer deposit (see stamp_booking_deposit). Staff set it by hand. A booking marked No-show also turns it on, and nothing turns it off except staff.';

comment on column public.humans.deposit_required_reason is
  'Why the deposit tag was last turned on automatically, for example "Deposit required after a no-show: Pepper on 22 Nov 2026". Null when staff turned it on themselves, or when it has never been turned on. Not cleared when staff switch the tag off.';

comment on column public.humans.deposit_required_set_at is
  'When the deposit tag was last turned on automatically. Null when staff turned it on themselves, or when it has never been turned on. Not cleared when staff switch the tag off.';

create or replace function public.flag_deposit_after_no_show()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_human_id uuid;
  v_dog_name text;
  v_reason text;
begin
  if tg_op is distinct from 'UPDATE' then
    return new;
  end if;
  if new.status is not distinct from old.status or new.status is distinct from 'No-show' then
    return new;
  end if;

  select d.human_id, d.name
    into v_human_id, v_dog_name
    from public.dogs d
   where d.id = new.dog_id;

  if v_human_id is null then
    return new;
  end if;

  -- UK date, independent of the database locale. Day has no leading zero.
  v_reason :=
    'Deposit required after a no-show'
    || case
         when nullif(btrim(coalesce(v_dog_name, '')), '') is not null
           then ': ' || btrim(v_dog_name)
         else ''
       end
    || ' on '
    || to_char(new.booking_date, 'FMDD')
    || ' '
    || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from new.booking_date)::integer]
    || ' '
    || to_char(new.booking_date, 'YYYY');

  -- The WHERE keeps a deposit staff already required, and the note that
  -- explained it. Only the transition that turns the tag on records a reason.
  update public.humans
     set deposit_required = true,
         deposit_required_reason = v_reason,
         deposit_required_set_at = statement_timestamp(),
         updated_at = statement_timestamp()
   where id = v_human_id
     and deposit_required = false;

  return new;
end;
$$;

comment on function public.flag_deposit_after_no_show() is
  'AFTER UPDATE of bookings.status to No-show: turn on humans.deposit_required for that dog''s owner and record the appointment that did it. Never clears the tag.';

revoke all on function public.flag_deposit_after_no_show() from public;
revoke all on function public.flag_deposit_after_no_show() from anon;
revoke all on function public.flag_deposit_after_no_show() from authenticated;

drop trigger if exists trg_flag_deposit_after_no_show on public.bookings;
create trigger trg_flag_deposit_after_no_show
  after update of status on public.bookings
  for each row
  when (new.status is distinct from old.status and new.status = 'No-show')
  execute function public.flag_deposit_after_no_show();
