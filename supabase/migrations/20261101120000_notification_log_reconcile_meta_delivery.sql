-- ============================================================
-- notification_log must also forgive a Meta failure that Meta then retracts
--
-- THE GAP
--
-- Migration 20261012120000 makes the log follow Meta when a WhatsApp message
-- fails: the status webhook writes whatsapp_messages.status = 'failed' and a
-- trigger flips the still-sent notification_log row to 'failed'. That road
-- only runs one way.
--
-- On 1 November 2026 Meta sent a 131026 ("undeliverable") for a day-before
-- reminder and then, four seconds later, reported the same message delivered
-- and, four minutes after that, read. whatsapp-agent's handleStatus writes each
-- status as it arrives, so the message ended 'read' (its error_message left
-- behind), but the log row stayed 'failed'. Two jobs trust that row:
--
--   * reminder-sms-fallback texted the customer at 16:15 (its code is fixed
--     in the same change: it now asks whatsapp_messages before trusting a
--     'failed' row);
--   * the 19:00 late reminder pass sent the WhatsApp again, because the
--     idempotency index on notification_log only covers 'pending' and 'sent'
--     rows, so a 'failed' row does not block a resend.
--
-- THE FIX
--
-- When a message leaves 'failed' for 'delivered' or 'read', put its
-- notification_log row back to 'sent', but only a row whose failure was the
-- Meta reconciliation's own (its error_message is the readable line that
-- whatsapp_meta_failure_summary writes, which always begins "WhatsApp could
-- not deliver"). A row that failed for any other reason is not touched.
--
-- Two guards keep the webhook write safe:
--   * if a later resend already holds the (booking_id, trigger_type, human_id)
--     slot as 'pending' or 'sent', the row stays 'failed': flipping it would
--     break the idempotency index, and the customer's reminder is the resend's
--     to account for;
--   * a unique_violation from a race is swallowed, so the status update on
--     whatsapp_messages can never be aborted by this trigger.
--
-- No backfill: on production exactly one row fit, and the resend above blocks
-- it. The existing before-insert/update trigger on notification_log re-reads
-- whatsapp_messages and only fails a row whose message is currently 'failed',
-- so setting the row back to 'sent' for a delivered message does not loop.
--
-- Idempotent: create or replace throughout, no drop statements (the Supabase
-- MCP tool can apply it to staging).
-- ============================================================

create or replace function public.reconcile_notification_log_on_meta_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  begin
    update public.notification_log nl
       set status        = 'sent',
           error_message = null
     where nl.provider_message_id = new.meta_message_id
       and nl.channel = 'whatsapp'
       and nl.status = 'failed'
       and nl.error_message like 'WhatsApp could not deliver%'
       and not exists (
         select 1
           from public.notification_log o
          where o.id <> nl.id
            and o.booking_id = nl.booking_id
            and o.trigger_type = nl.trigger_type
            and o.human_id = nl.human_id
            and o.status in ('pending', 'sent')
       );
  exception when unique_violation then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.reconcile_notification_log_on_meta_delivery() from public, anon, authenticated;

create or replace trigger trg_reconcile_notification_log_on_meta_delivery
  after update of status on public.whatsapp_messages
  for each row
  when (new.status in ('delivered', 'read')
        and old.status = 'failed'
        and new.direction = 'outbound'
        and new.meta_message_id is not null)
  execute function public.reconcile_notification_log_on_meta_delivery();

comment on function public.reconcile_notification_log_on_meta_delivery() is
  'AFTER UPDATE OF status on whatsapp_messages: when Meta reports an outbound message delivered or read after having failed it, the WhatsApp notification_log row that the failure reconciliation marked failed goes back to sent, unless a resend already holds its slot.';
