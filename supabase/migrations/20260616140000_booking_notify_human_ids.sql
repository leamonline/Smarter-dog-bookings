-- Migration: per-booking notification recipients
--
-- Lets staff choose WHO is notified for a booking — the dog's owner plus any of
-- the owner's trusted humans. NULL/empty preserves today's behaviour (notify
-- the dog's owner only).
--
-- Idempotency on notification_log must also become per-recipient: the existing
-- unique index keyed on (booking_id, trigger_type) allows only ONE pending/sent
-- row per booking per event, which would reject the 2nd+ recipient. Recreate it
-- as (booking_id, trigger_type, human_id) so each recipient gets independent
-- de-dup + delivery tracking. The new key is a superset of the old one, so no
-- existing single-recipient row can violate it.

alter table public.bookings
  add column if not exists notify_human_ids uuid[];

comment on column public.bookings.notify_human_ids is
  'Explicit list of human ids to notify for this booking (owner + chosen trusted humans). NULL/empty => notify the dog owner only.';

drop index if exists public.idx_notification_log_idempotent;

create unique index if not exists idx_notification_log_idempotent
  on public.notification_log (booking_id, trigger_type, human_id)
  where status in ('pending', 'sent');
