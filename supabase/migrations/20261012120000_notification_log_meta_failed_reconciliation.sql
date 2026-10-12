-- ============================================================
-- notification_log must agree with Meta about WhatsApp delivery
--
-- THE GAP
--
-- The notify-* functions log a WhatsApp confirmation or reminder to
-- notification_log as 'sent' the moment Meta accepts it. Meta's verdict on
-- whether the message reached the phone arrives later as a status webhook,
-- which the agent writes onto the whatsapp_messages row. Since 7 October 2026
-- (commit 7257d4df) the agent also copies a 'failed' verdict onto the matching
-- notification_log row — but only in application code, only for rows that
-- already carry their provider_message_id when the verdict lands, and never
-- for anything that failed before that date.
--
-- The 12 October inbox assessment read notification_log directly and found
-- confirmations and reminders recorded as sent whose WhatsApp message had
-- failed with 131026 ("not on WhatsApp"): 32 rows between June and October
-- 2026, 18 confirmations and 14 reminders. The dashboard hook
-- (useDeliveryFailures) already reconciles these on the read side, so staff
-- saw them; every other reader of the log — reports, SQL, the next
-- assessment — did not. "Sent" is not delivery (AGENTS.md), and the log
-- should not claim it.
--
-- THE FIX
--
-- 1. whatsapp_meta_failure_summary(text): the one readable line staff see,
--    byte-for-byte what _shared/deliveryStatus.ts:metaFailureSummary writes,
--    so the backfilled rows and the live rows read the same.
-- 2. Backfill: every WhatsApp notification_log row still 'sent' whose
--    provider message Meta failed becomes 'failed' with that line.
-- 3. Two triggers close the race the hook comments on, in both orders:
--      a. whatsapp_messages status -> 'failed'  ⇒ patch the log row that
--         already carries that meta id (the common order).
--      b. notification_log gains a provider_message_id, or is written as
--         'sent' with one  ⇒ if that message has already failed, store the
--         row as 'failed' straight away (the race order: the verdict beat
--         the notify function to the row).
--    The agent's own copy in handleStatus stays; it is now redundant rather
--    than load-bearing.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
-- Only rows that are 'sent' are touched. A row already superseded by a
-- resend, an SMS fallback row, or a 'failed' row keeps its state. Rows with
-- no provider_message_id (cancellation notices via Twilio, welcome texts) are
-- out of reach here and are listed as follow-ups in the pull request.
--
-- Idempotent: create or replace / drop if exists / the backfill matches
-- nothing on a second run. Both functions are SECURITY DEFINER so the
-- reconciliation does not depend on which role happened to write the
-- status, and both carry the revoke block docs/migrations.md requires.
-- ============================================================

-- ── 1. The readable failure line (mirror of metaFailureSummary) ───
create or replace function public.whatsapp_meta_failure_summary(p_errors text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_errors jsonb;
  v_first  jsonb;
  v_code   text;
  v_what   text;
begin
  begin
    v_errors := p_errors::jsonb;
  exception when others then
    v_errors := null;
  end;
  if v_errors is null or jsonb_typeof(v_errors) <> 'array' or jsonb_array_length(v_errors) = 0 then
    return 'WhatsApp could not deliver this message.';
  end if;
  v_first := v_errors -> 0;
  if jsonb_typeof(v_first) <> 'object' then
    return 'WhatsApp could not deliver this message.';
  end if;
  v_code := v_first ->> 'code';
  if v_code = '131026' then
    return 'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).';
  end if;
  v_what := btrim(coalesce(nullif(v_first ->> 'title', ''), nullif(v_first ->> 'message', ''), 'delivery failed'));
  if v_code is not null then
    return format('WhatsApp could not deliver this: %s (Meta %s).', v_what, v_code);
  end if;
  return format('WhatsApp could not deliver this: %s.', v_what);
end;
$$;

revoke all on function public.whatsapp_meta_failure_summary(text) from public, anon, authenticated;
grant execute on function public.whatsapp_meta_failure_summary(text) to service_role;

comment on function public.whatsapp_meta_failure_summary(text) is
  'One readable line for staff from a whatsapp_messages.error_message JSON array. Mirrors supabase/functions/_shared/deliveryStatus.ts:metaFailureSummary; change both together.';

-- ── 2. Backfill the rows Meta had already failed ──────────────────
update public.notification_log nl
   set status        = 'failed',
       error_message = public.whatsapp_meta_failure_summary(m.error_message)
  from public.whatsapp_messages m
 where m.direction = 'outbound'
   and m.status = 'failed'
   and m.meta_message_id is not null
   and m.meta_message_id = nl.provider_message_id
   and nl.channel = 'whatsapp'
   and nl.status = 'sent';

-- ── 3a. Verdict lands after the log row has its id ────────────────
create or replace function public.reconcile_notification_log_on_meta_failure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.notification_log
     set status        = 'failed',
         error_message = public.whatsapp_meta_failure_summary(new.error_message)
   where provider_message_id = new.meta_message_id
     and channel = 'whatsapp'
     and status = 'sent';
  return null;
end;
$$;

revoke all on function public.reconcile_notification_log_on_meta_failure() from public, anon, authenticated;

drop trigger if exists trg_reconcile_notification_log_on_meta_failure on public.whatsapp_messages;
create trigger trg_reconcile_notification_log_on_meta_failure
  after update of status on public.whatsapp_messages
  for each row
  when (new.status = 'failed'
        and old.status is distinct from 'failed'
        and new.direction = 'outbound'
        and new.meta_message_id is not null)
  execute function public.reconcile_notification_log_on_meta_failure();

comment on function public.reconcile_notification_log_on_meta_failure() is
  'AFTER UPDATE OF status on whatsapp_messages: when Meta fails an outbound message, the still-sent WhatsApp notification_log row with that provider_message_id becomes failed with a readable reason.';

-- ── 3b. Log row arrives after the verdict ─────────────────────────
create or replace function public.reconcile_notification_log_row_with_meta()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_error text;
begin
  select m.error_message
    into v_error
    from public.whatsapp_messages m
   where m.direction = 'outbound'
     and m.meta_message_id = new.provider_message_id
     and m.status = 'failed'
   limit 1;
  if found then
    new.status        := 'failed';
    new.error_message := public.whatsapp_meta_failure_summary(v_error);
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_notification_log_row_with_meta() from public, anon, authenticated;

drop trigger if exists trg_reconcile_notification_log_row_with_meta on public.notification_log;
create trigger trg_reconcile_notification_log_row_with_meta
  before insert or update of provider_message_id, status on public.notification_log
  for each row
  when (new.channel = 'whatsapp'
        and new.status = 'sent'
        and new.provider_message_id is not null)
  execute function public.reconcile_notification_log_row_with_meta();

comment on function public.reconcile_notification_log_row_with_meta() is
  'BEFORE INSERT/UPDATE on notification_log: a WhatsApp row written as sent for a message Meta has already failed is stored as failed, so the log never says sent for a message that never arrived.';
