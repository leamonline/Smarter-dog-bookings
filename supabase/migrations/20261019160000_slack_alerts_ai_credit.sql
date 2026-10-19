-- ============================================================
-- #salon-today Slack alerts: allow the 'ai_credit' alert type
--
-- The Anthropic account ran out of credit on 19 Oct 2026 and every AI
-- feature failed silently all morning. slack-alerts gains an 'ai_credit'
-- mode (raised by whatsapp-agent, dashboard-summary and
-- whatsapp-update-notes when Anthropic answers "credit balance is too
-- low"), deduplicated to one alert per London day via alert_key
-- 'aicredit:<date>'. The ledger's alert_type CHECK must admit it, or the
-- claim INSERT fails with 23514 and the alert is never sent.
--
-- Widening only: every existing value stays valid. Apply BEFORE the
-- function deploys; until then an ai_credit claim fails harmlessly
-- (slack-alerts logs "claim failed" and posts nothing).
--
-- Additive + idempotent.
-- ============================================================

alter table public.slack_alerts
  drop constraint if exists slack_alerts_alert_type_check;

alter table public.slack_alerts
  add constraint slack_alerts_alert_type_check check (alert_type in (
    'cancellation',
    'moved_off',
    'new_booking',
    'moved_in',
    'no_show',
    'ready_overdue',
    'unanswered',
    'summary',
    'ai_credit'
  ));
