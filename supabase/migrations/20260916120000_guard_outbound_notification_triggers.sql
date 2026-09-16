-- ============================================================
-- Outbound notification triggers must never roll back the write
-- that fired them
--
-- THE BUG
--
-- Five public trigger functions POST via pg_net with no exception handler.
-- They are AFTER triggers, but an AFTER trigger still runs INSIDE the
-- originating transaction, so anything they raise aborts that transaction.
-- Two of them sit directly on `bookings`:
--
--   notify_on_booking_insert       bookings   -> notify-booking-confirmed
--   notify_on_booking_cancelled    bookings   -> notify-booking-cancelled
--   fire_whatsapp_agent            whatsapp_events -> the agent
--   notify_waitlist_joined_trigger waitlist_entries -> notify-waitlist-joined
--   notify_on_booking_ready        (no trigger attached since 20260526171449)
--
-- So a Vault hiccup, a missing secret or a pg_net problem does not merely
-- lose a confirmation message — it stops the customer booking at all. The
-- notification tail wags the booking dog.
--
-- This was found while testing the #salon-today Slack alerts: rewriting
-- get_supabase_url() to raise, to prove the NEW trigger's guard held, made a
-- plain `insert into bookings` fail with
--
--   ERROR:  simulated alert plumbing failure
--   CONTEXT: SQL statement "SELECT net.http_post(... notify-booking-confirmed ...)"
--            PL/pgSQL function notify_on_booking_insert() line 3 at PERFORM
--
-- THE FIX
--
-- Wrap each POST in the exception-swallowing block the repository already
-- decided on for this class. notify_staff_booking_event()
-- (20260625140000) and notify_slack_booking_event() (20260916090000) both
-- carry it, with the reasoning in their headers; these five predate that
-- decision and never caught up.
--
-- WHY `raise warning` RATHER THAN A BARE `null`
--
-- The existing guarded functions swallow silently. These five are CUSTOMER
-- notification paths — booking confirmations, cancellations, waitlist
-- replies — and if one silently stops firing, the first anyone hears is a
-- customer saying they never got a confirmation. A warning changes no
-- transaction semantics (warnings never abort) but leaves a trail in the
-- Postgres log, so a broken notification path is discoverable rather than
-- invisible. fire_whatsapp_agent already used `raise warning` for its
-- missing-config path, so this matches its own local precedent.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
-- The bodies are otherwise reproduced exactly as they stand on production
-- (read back with pg_get_functiondef, not copied from migration files —
-- docs/migrations.md records that several of these were hardened directly
-- against prod and never in a migration, so the committed history is not
-- the authority here). Same URLs, same payloads, same SECURITY DEFINER and
-- search_path. Only the guard is added.
--
-- notify_on_booking_ready() has had no trigger since 20260526171449 dropped
-- it. It is guarded anyway rather than left as a loaded gun for whoever
-- re-attaches it; dropping the function outright is a separate decision.
--
-- Idempotent: create or replace throughout.
-- ============================================================

-- ── 1. bookings: INSERT -> booking confirmation ───────────────
create or replace function public.notify_on_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-booking-confirmed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'type',   'INSERT',
        'table',  'bookings',
        'record', row_to_json(NEW)
      )
    );
  exception when others then
    raise warning 'notify_on_booking_insert: outbound notification failed (%) — the booking write is unaffected', sqlerrm;
  end;
  return new;
end;
$$;

-- ── 2. bookings: cancellation ─────────────────────────────────
create or replace function public.notify_on_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-booking-cancelled',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'type',       'UPDATE',
        'table',      'bookings',
        'record',     row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
    );
  exception when others then
    raise warning 'notify_on_booking_cancelled: outbound notification failed (%) — the booking write is unaffected', sqlerrm;
  end;
  return new;
end;
$$;

-- ── 3. bookings: ready for pick-up (currently unattached) ─────
create or replace function public.notify_on_booking_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-booking-ready',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'type',       'UPDATE',
        'table',      'bookings',
        'record',     row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
    );
  exception when others then
    raise warning 'notify_on_booking_ready: outbound notification failed (%) — the booking write is unaffected', sqlerrm;
  end;
  return new;
end;
$$;

-- ── 4. waitlist_entries: someone joined ───────────────────────
create or replace function public.notify_waitlist_joined_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-waitlist-joined',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'type',   'INSERT',
        'table',  'waitlist_entries',
        'record', row_to_json(NEW)
      )
    );
  exception when others then
    raise warning 'notify_waitlist_joined_trigger: outbound notification failed (%) — the waitlist write is unaffected', sqlerrm;
  end;
  return new;
end;
$$;

-- ── 5. whatsapp_events: hand the event to the agent ───────────
--
-- The whole body is guarded, not just the POST: the app_settings reads can
-- fail too, and whatsapp_events is the forensic record of every inbound
-- message. Losing that row because the agent was unreachable would destroy
-- the audit trail precisely when it is most wanted. The existing
-- missing-config early return is preserved exactly.
create or replace function public.fire_whatsapp_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_url text;
  v_secret    text;
  v_req_id    bigint;
begin
  begin
    select value into v_agent_url from app_settings where key = 'agent_url';
    select value into v_secret    from app_settings where key = 'agent_secret';

    if v_agent_url is null or v_secret is null then
      raise warning 'fire_whatsapp_agent: agent_url or agent_secret missing in app_settings — skipping';
      return new;
    end if;

    select into v_req_id
      net.http_post(
        url     := v_agent_url,
        headers := jsonb_build_object(
          'content-type',   'application/json',
          'x-agent-secret', v_secret
        ),
        body    := jsonb_build_object('event_id', new.id),
        timeout_milliseconds := 15000
      );
  exception when others then
    raise warning 'fire_whatsapp_agent: dispatch failed (%) — the whatsapp_events row is unaffected', sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.notify_on_booking_insert() is
  'Posts a new booking to notify-booking-confirmed. The POST is wrapped in an exception-swallowing block: this is an AFTER trigger but still runs inside the booking transaction, so a notification failure must never prevent the customer booking. Logs a warning so a broken path stays discoverable.';
comment on function public.notify_on_booking_cancelled() is
  'Posts a cancellation to notify-booking-cancelled. Guarded so a notification failure cannot roll back the cancellation. Logs a warning.';
comment on function public.notify_on_booking_ready() is
  'Posts a ready-for-pick-up notice to notify-booking-ready. No trigger has been attached since 20260526171449; guarded anyway so re-attaching it cannot reintroduce the roll-back bug. Logs a warning.';
comment on function public.notify_waitlist_joined_trigger() is
  'Posts a waitlist join to notify-waitlist-joined. Guarded so a notification failure cannot roll back the waitlist entry. Logs a warning.';
comment on function public.fire_whatsapp_agent() is
  'Hands an inbound whatsapp_events row to the agent. The whole body is guarded -- the app_settings reads as well as the POST -- because whatsapp_events is the forensic record of every inbound message and must survive an unreachable agent. Logs a warning.';

-- Supabase grants EXECUTE on new public functions to anon + authenticated,
-- and the documented checklist (docs/migrations.md) says every migration that
-- creates a function ends with the revoke. create or replace preserves
-- existing privileges, so these are belt and braces -- but they are also what
-- supabase/tests/179 asserts, and this class has regressed three times.
revoke execute on function public.notify_on_booking_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_booking_cancelled() from public, anon, authenticated;
revoke execute on function public.notify_on_booking_ready() from public, anon, authenticated;
revoke execute on function public.notify_waitlist_joined_trigger() from public, anon, authenticated;
revoke execute on function public.fire_whatsapp_agent() from public, anon, authenticated;
