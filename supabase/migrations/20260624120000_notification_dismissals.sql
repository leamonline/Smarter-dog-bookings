-- ============================================================
-- notification_dismissals — staff "dismiss" for the dashboard
-- "Delivery issues" card.
--
-- One row per booking. A booking's failure is hidden from the dashboard
-- aggregate card when dismissed_at >= the booking's most recent failed
-- notification (notification_log.created_at). A later failure has a newer
-- created_at than the dismissal, so it re-surfaces automatically.
--
-- Dashboard-card scope only: the per-booking pill badge and the in-booking
-- DeliveryFailureCard (driven by useBookingDeliveryFailure) are NOT affected
-- — that filtering lives in the client, not here.
--
-- Writes go through dismiss_delivery_failure() (SECURITY DEFINER) so
-- dismissed_at uses the DB clock (skew-free vs notification_log.created_at)
-- and is_staff() is enforced. No client INSERT/UPDATE policy exists.
--
-- Idempotent: create-if-not-exists / drop-if-exists / create-or-replace /
-- guarded publication add — safe to re-run.
-- ============================================================

create table if not exists public.notification_dismissals (
  booking_id    uuid primary key references public.bookings(id) on delete cascade,
  dismissed_at  timestamptz not null default now(),
  dismissed_by  uuid default auth.uid()
);

alter table public.notification_dismissals enable row level security;

drop policy if exists "Staff can select notification dismissals" on public.notification_dismissals;
create policy "Staff can select notification dismissals"
  on public.notification_dismissals
  for select
  to authenticated
  using (is_staff());

create or replace function public.dismiss_delivery_failure(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  insert into public.notification_dismissals (booking_id, dismissed_at, dismissed_by)
    values (p_booking_id, now(), auth.uid())
  on conflict (booking_id)
    do update set dismissed_at = now(), dismissed_by = auth.uid();
end;
$$;

-- Supabase auto-grants EXECUTE to anon on new public functions; lock down.
revoke all on function public.dismiss_delivery_failure(uuid) from public;
revoke all on function public.dismiss_delivery_failure(uuid) from anon;
grant execute on function public.dismiss_delivery_failure(uuid) to authenticated;

-- Realtime: clear the card on other staff devices when one dismisses.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_dismissals'
  ) then
    alter publication supabase_realtime add table public.notification_dismissals;
  end if;
end $$;
