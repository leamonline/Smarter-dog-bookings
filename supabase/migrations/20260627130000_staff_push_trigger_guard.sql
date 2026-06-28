-- ============================================================
-- Staff Web Push triggers — widen the exception guard to cover the name lookup
--
-- 20260625140000 wrapped only the net.http_post() in each trigger's
-- `begin ... exception when others then null; end;` block, but the
-- `SELECT ... INTO v_name` (the cosmetic sender/customer name lookup) ran
-- OUTSIDE that guard. Because these are AFTER INSERT triggers firing inside the
-- originating transaction, if that SELECT raised (lock_timeout / statement_timeout
-- / deadlock under contention on the humans / whatsapp_conversations row) the
-- exception would propagate and ROLL BACK the real customer write
-- (whatsapp_messages / salon_todos / waitlist_entries) — violating the migration's
-- own "push plumbing must NEVER roll back a customer write" promise.
--
-- Fix: recreate the three affected trigger functions with the ENTIRE body
-- (lookup + POST) inside the exception block, so v_name simply stays NULL and
-- buildStaffPushMessage's fallbacks take over if the lookup ever fails.
-- (notify_staff_booking_event already has no query outside its guard — unchanged.)
--
-- Idempotent: create-or-replace only; the triggers already point at these
-- functions, so no trigger DDL is needed.
-- ============================================================

create or replace function public.notify_staff_inbound_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  begin
    select h.name into v_name from whatsapp_conversations c
      left join humans h on h.id = c.human_id where c.id = new.conversation_id;
    perform net.http_post(
      url := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(get_webhook_secret(), '')),
      body := jsonb_build_object(
        'event_type', 'message',
        'dedupe_key', 'staffmsg:' || new.conversation_id || ':' || floor(extract(epoch from now()) / 60)::bigint,
        'context', jsonb_build_object('senderName', v_name)));
  exception when others then null;
  end;
  return new;
end; $$;

create or replace function public.notify_staff_signup_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  begin
    select nullif(trim(coalesce(h.name,'') || ' ' || coalesce(h.surname,'')), '') into v_name
      from humans h where h.id = new.human_id;
    perform net.http_post(
      url := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(get_webhook_secret(), '')),
      body := jsonb_build_object(
        'event_type', 'new_client',
        'dedupe_key', 'signup:' || new.id,
        'context', jsonb_build_object('customerName', v_name)));
  exception when others then null;
  end;
  return new;
end; $$;

create or replace function public.notify_staff_waitlist_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  begin
    select nullif(trim(coalesce(h.name,'') || ' ' || coalesce(h.surname,'')), '') into v_name
      from humans h where h.id = new.human_id;
    perform net.http_post(
      url := get_supabase_url() || '/functions/v1/notify-staff',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(get_webhook_secret(), '')),
      body := jsonb_build_object(
        'event_type', 'waitlist',
        'dedupe_key', 'waitlist:' || new.id,
        'context', jsonb_build_object(
          'customerName', v_name,
          'bookingDate',  new.target_date)));
  exception when others then null;
  end;
  return new;
end; $$;
