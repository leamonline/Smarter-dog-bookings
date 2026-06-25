-- ============================================================
-- Staff Web Push — fan-out triggers
--
-- AFTER INSERT triggers that POST to the notify-staff edge function (via
-- pg_net, Bearer get_webhook_secret(), URL from get_supabase_url()) for the
-- six staff-relevant events. notify-staff itself is dark-launched behind
-- STAFF_PUSH_ENABLED, so until that secret is set these POSTs are no-ops.
--
-- SOURCES (each a SEPARATE trigger — none touch existing behaviour):
--   booking_events  AFTER INSERT  → created→new_booking, rescheduled→reschedule,
--                                   cancelled→cancellation (reconfirmed ignored)
--   whatsapp_messages AFTER INSERT WHERE direction='inbound' → message
--   salon_todos     AFTER INSERT WHERE kind='signup_review'  → new_client
--   waitlist_entries AFTER INSERT → waitlist  (ADDITIVE — the existing
--                                   notify_waitlist_joined_trigger is untouched)
--
-- SAFETY: every POST is wrapped in an exception-swallowing block. These run
-- inside the originating transaction (e.g. booking_events fires within a
-- booking insert), so a push-plumbing failure must NEVER roll back a real
-- customer write. pg_net is async/fire-and-forget; we additionally guard.
--
-- ACTOR SUPPRESSION: booking_events carries actor_id; we forward it so
-- notify-staff suppresses ONLY that user's own devices (a staff member who
-- made the booking isn't pinged for it; other staff still are).
--
-- Idempotent: drop trigger if exists + create or replace function.
-- ============================================================

-- ── 1. booking_events → new_booking / reschedule / cancellation ──
create or replace function public.notify_staff_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
begin
  v_event_type := case new.event_type
    when 'created'     then 'new_booking'
    when 'rescheduled' then 'reschedule'
    when 'cancelled'   then 'cancellation'
    else null
  end;

  if v_event_type is null then
    return new; -- 'reconfirmed' and anything else: not a staff push event
  end if;

  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'event_type', v_event_type,
        'dedupe_key', 'bookevt:' || new.id,
        'actor_id',   new.actor_id,
        'context', jsonb_build_object(
          'customerName',        new.customer_name,
          'dogName',             new.dog_name,
          'service',             new.service,
          'bookingDate',         new.booking_date,
          'slot',                new.slot,
          'previousBookingDate', new.previous_booking_date,
          'previousSlot',        new.previous_slot,
          'bookingId',           new.booking_id
        )
      )
    );
  exception when others then
    null; -- never let staff-push plumbing break the originating write
  end;

  return new;
end;
$$;

drop trigger if exists trg_staff_push_booking_event on public.booking_events;
create trigger trg_staff_push_booking_event
  after insert on public.booking_events
  for each row execute function public.notify_staff_booking_event();

-- ── 2. whatsapp_messages (inbound) → message ─────────────────
create or replace function public.notify_staff_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Best-effort sender name from the conversation's linked human.
  select h.name
    into v_name
    from whatsapp_conversations c
    left join humans h on h.id = c.human_id
   where c.id = new.conversation_id;

  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'event_type', 'message',
        -- Coalesce a burst of messages from one conversation into a single
        -- push per ~minute (matches the staff dedupe unique index).
        'dedupe_key', 'staffmsg:' || new.conversation_id || ':'
                       || floor(extract(epoch from now()) / 60)::bigint,
        'context', jsonb_build_object('senderName', v_name)
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_staff_push_inbound_message on public.whatsapp_messages;
create trigger trg_staff_push_inbound_message
  after insert on public.whatsapp_messages
  for each row
  when (new.direction = 'inbound')
  execute function public.notify_staff_inbound_message();

-- ── 3. salon_todos (signup_review) → new_client ──────────────
create or replace function public.notify_staff_signup_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '')
    into v_name
    from humans h
   where h.id = new.human_id;

  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'event_type', 'new_client',
        'dedupe_key', 'signup:' || new.id,
        'context', jsonb_build_object('customerName', v_name)
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_staff_push_signup_review on public.salon_todos;
create trigger trg_staff_push_signup_review
  after insert on public.salon_todos
  for each row
  when (new.kind = 'signup_review')
  execute function public.notify_staff_signup_review();

-- ── 4. waitlist_entries → waitlist (ADDITIVE) ────────────────
create or replace function public.notify_staff_waitlist_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '')
    into v_name
    from humans h
   where h.id = new.human_id;

  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'event_type', 'waitlist',
        'dedupe_key', 'waitlist:' || new.id,
        'context', jsonb_build_object(
          'customerName', v_name,
          'bookingDate',  new.target_date
        )
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_staff_push_waitlist_joined on public.waitlist_entries;
create trigger trg_staff_push_waitlist_joined
  after insert on public.waitlist_entries
  for each row execute function public.notify_staff_waitlist_joined();
