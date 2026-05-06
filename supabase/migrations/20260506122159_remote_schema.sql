create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

create sequence "public"."briefings_id_seq";

drop trigger if exists "notify_booking_cancelled_trigger" on "public"."bookings";

drop trigger if exists "notify_booking_confirmed_trigger" on "public"."bookings";

drop trigger if exists "notify_booking_ready_trigger" on "public"."bookings";

drop policy "customer_cancel_own_bookings" on "public"."bookings";

drop policy "customer_cancel_own_bookings_update" on "public"."bookings";

drop policy "customer_insert_own_bookings" on "public"."bookings";

drop policy "customer_select_own_bookings" on "public"."bookings";

drop policy "staff_delete_bookings" on "public"."bookings";

drop policy "staff_insert_bookings" on "public"."bookings";

drop policy "staff_select_bookings" on "public"."bookings";

drop policy "staff_update_bookings" on "public"."bookings";

drop policy "customer_select_day_settings" on "public"."day_settings";

drop policy "staff_all_day_settings" on "public"."day_settings";

drop policy "customer_insert_own_dogs" on "public"."dogs";

drop policy "customer_select_own_dogs" on "public"."dogs";

drop policy "staff_insert_dogs" on "public"."dogs";

drop policy "staff_select_dogs" on "public"."dogs";

drop policy "customer_select_own_trusted_contacts" on "public"."human_trusted_contacts";

drop policy "staff_all_trusted_contacts" on "public"."human_trusted_contacts";

drop policy "customer_select_own_human" on "public"."humans";

drop policy "customer_update_own_human" on "public"."humans";

drop policy "staff_select_humans" on "public"."humans";

drop policy "staff_update_humans" on "public"."humans";

drop policy "customer_select_own_notifications" on "public"."notification_log";

drop policy "staff_select_notification_log" on "public"."notification_log";

drop policy "customer_select_salon_config" on "public"."salon_config";

drop policy "staff_select_salon_config" on "public"."salon_config";

drop policy "Owners can update any profile" on "public"."staff_profiles";

drop policy "Users can update own profile" on "public"."staff_profiles";

drop policy "Customer delete own waitlist" on "public"."waitlist_entries";

drop policy "Customer insert own waitlist" on "public"."waitlist_entries";

drop policy "Customer select own waitlist" on "public"."waitlist_entries";

drop policy "staff_delete_dogs" on "public"."dogs";

drop policy "staff_update_dogs" on "public"."dogs";

drop policy "staff_delete_humans" on "public"."humans";

drop policy "staff_insert_humans" on "public"."humans";

alter table "public"."humans" drop constraint "humans_name_surname_key";

alter table "public"."notification_log" drop constraint "notification_log_trigger_type_check";

drop index if exists "public"."humans_name_surname_key";


  create table "public"."briefings" (
    "id" integer not null default nextval('public.briefings_id_seq'::regclass),
    "briefing_date" date not null default CURRENT_DATE,
    "content" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."briefings" enable row level security;

alter table "public"."dogs" add column "dob" text;

alter table "public"."humans" add column "customer_notes" text not null default ''::text;

alter table "public"."humans" add column "phone_normalised" text generated always as (regexp_replace(regexp_replace(COALESCE(phone, ''::text), '[^0-9+]'::text, ''::text, 'g'::text), '^(\+?44|0044)'::text, '0'::text)) stored;

alter table "public"."humans" alter column "surname" drop not null;

alter sequence "public"."briefings_id_seq" owned by "public"."briefings"."id";

CREATE UNIQUE INDEX briefings_briefing_date_key ON public.briefings USING btree (briefing_date);

CREATE UNIQUE INDEX briefings_pkey ON public.briefings USING btree (id);

CREATE INDEX humans_phone_normalised_idx ON public.humans USING btree (phone_normalised) WHERE (phone_normalised <> ''::text);

CREATE UNIQUE INDEX humans_phone_unique ON public.humans USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));

CREATE UNIQUE INDEX idx_notification_log_idempotent ON public.notification_log USING btree (booking_id, trigger_type) WHERE (status = ANY (ARRAY['pending'::text, 'sent'::text]));

alter table "public"."briefings" add constraint "briefings_pkey" PRIMARY KEY using index "briefings_pkey";

alter table "public"."briefings" add constraint "briefings_briefing_date_key" UNIQUE using index "briefings_briefing_date_key";

alter table "public"."notification_log" add constraint "notification_log_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['confirmed'::text, 'reminder'::text, 'cancelled'::text, 'waitlist_joined'::text]))) not valid;

alter table "public"."notification_log" validate constraint "notification_log_trigger_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.demo_add_dog(p_name text, p_breed text, p_size text, p_human_id uuid)
 RETURNS public.dogs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dog dogs%rowtype;
BEGIN
  INSERT INTO dogs (name, breed, size, human_id)
  VALUES (p_name, p_breed, p_size, p_human_id)
  RETURNING * INTO v_dog;
  RETURN v_dog;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_demo_customer(p_human_id uuid)
 RETURNS SETOF public.humans
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM humans WHERE id = p_human_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_demo_customers()
 RETURNS TABLE(id uuid, name text, surname text, phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT h.id, h.name, h.surname, h.phone
  FROM humans h
  WHERE h.phone IS NOT NULL AND h.phone <> ''
  ORDER BY h.name;
$function$
;

CREATE OR REPLACE FUNCTION public.link_or_create_customer_human(p_phone text, p_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid          uuid := auth.uid();
  v_normalised   text;
  v_match_count  int;
  v_existing     humans%rowtype;
  v_human        humans%rowtype;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- Re-entrancy: caller already owns a humans row → return it, never relink/create.
  select * into v_existing
  from   humans
  where  customer_user_id = v_uid
  limit  1;

  if found then
    return jsonb_build_object('status', 'existing', 'human', to_jsonb(v_existing));
  end if;

  -- Normalise phone independently of the frontend.
  v_normalised := regexp_replace(
                    regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'),
                    '^(\+?44|0044)', '0'
                  );

  if v_normalised = '' then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  -- Refuse to guess on duplicate matches.
  select count(*) into v_match_count
  from   humans
  where  phone_normalised = v_normalised;

  if v_match_count > 1 then
    return jsonb_build_object('status', 'ambiguous', 'human', null);
  end if;

  if v_match_count = 1 then
    select * into v_human
    from   humans
    where  phone_normalised = v_normalised
    limit  1;

    if v_human.customer_user_id is null then
      update humans
      set    customer_user_id = v_uid,
             updated_at       = now()
      where  id = v_human.id
      returning * into v_human;
      return jsonb_build_object('status', 'linked', 'human', to_jsonb(v_human));
    elsif v_human.customer_user_id = v_uid then
      return jsonb_build_object('status', 'existing', 'human', to_jsonb(v_human));
    else
      return jsonb_build_object('status', 'claimed_by_other', 'human', null);
    end if;
  end if;

  -- No match: create a fresh humans row for this user.
  insert into humans (name, surname, phone, email, customer_user_id)
  values (
    coalesce(nullif(trim(p_name),  ''), 'Customer'),
    null,
    v_normalised,
    nullif(trim(p_email), ''),
    v_uid
  )
  returning * into v_human;

  return jsonb_build_object('status', 'created', 'human', to_jsonb(v_human));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_booking_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'type', 'DELETE',
    'table', 'bookings',
    'old_record', row_to_json(OLD)::jsonb,
    'schema', 'public'
  );

  PERFORM net.http_post(
    url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-cancelled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := payload
  );

  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.active_slots()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'];
$function$
;

CREATE OR REPLACE FUNCTION public.bump_conversation_unread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.direction = 'inbound' then
    update whatsapp_conversations
      set unread_count = unread_count + 1
      where id = new.conversation_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_max_seats_for_slot(p_slot_index integer, p_seats_used integer[])
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  num_slots integer;
  prev_prev boolean; prev boolean; nxt boolean; nxt_nxt boolean;
BEGIN
  num_slots := array_length(p_seats_used, 1);
  prev_prev := (p_slot_index - 2 >= 1) AND (p_seats_used[p_slot_index - 2] >= 2);
  prev      := (p_slot_index - 1 >= 1) AND (p_seats_used[p_slot_index - 1] >= 2);
  nxt       := (p_slot_index + 1 <= num_slots) AND (p_seats_used[p_slot_index + 1] >= 2);
  nxt_nxt   := (p_slot_index + 2 <= num_slots) AND (p_seats_used[p_slot_index + 2] >= 2);
  IF (prev_prev AND prev) OR (prev AND nxt) OR (nxt AND nxt_nxt) THEN RETURN 1; END IF;
  RETURN 2;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_seats_needed(p_size text, p_slot text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_size <> 'large' THEN RETURN 1; END IF;
  CASE p_slot
    WHEN '08:30' THEN RETURN 1;
    WHEN '09:00' THEN RETURN 1;
    WHEN '12:00' THEN RETURN 1;
    WHEN '12:30' THEN RETURN 2;
    WHEN '13:00' THEN RETURN 2;
    ELSE RETURN 2;
  END CASE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_seats_used(p_date date, p_slot text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE total integer;
BEGIN
  SELECT COALESCE(SUM(get_seats_needed(b.size, b.slot)), 0) INTO total
    FROM bookings b
   WHERE b.booking_date = p_date AND b.slot = p_slot
     AND (p_exclude_id IS NULL OR b.id <> p_exclude_id);
  RETURN total;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_large_dog(p_date date, p_slot text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bookings b
     WHERE b.booking_date = p_date AND b.slot = p_slot AND b.size = 'large'
       AND (p_exclude_id IS NULL OR b.id <> p_exclude_id)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from staff_profiles
    where user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.link_customer_to_human(p_phone text)
 RETURNS SETOF public.humans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_human     humans%rowtype;
  v_normalised text;
  v_alt        text;
begin
  v_normalised := replace(p_phone, ' ', '');
  v_alt := replace(v_normalised, '+44', '0');

  select *
  into   v_human
  from   humans
  where  phone = v_normalised
     or  phone = v_alt
  limit  1;

  if v_human.id is null then
    return;
  end if;

  if v_human.customer_user_id is not null
     and v_human.customer_user_id <> auth.uid() then
    return;
  end if;

  if v_human.customer_user_id is null then
    update humans
    set    customer_user_id = auth.uid()
    where  id = v_human.id
    returning * into v_human;
  end if;

  return next v_human;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_whatsapp_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_staff() then
    raise exception 'not authorised'
      using hint = 'Only staff can mark WhatsApp conversations as read';
  end if;

  update whatsapp_conversations
    set unread_count = 0
    where id = p_conversation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_booking_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enforce boolean; v_slots text[]; v_exclude_id uuid;
  v_seats_used integer[]; v_slot_index integer; v_max_seats integer;
  v_used integer; v_seats_needed integer; v_early_close boolean;
  v_has_large boolean; v_can_share boolean; i integer;
  v_prev_slot text; v_next_slot text;
BEGIN
  SELECT COALESCE(sc.enforce_server_capacity, true) INTO v_enforce FROM salon_config sc LIMIT 1;
  IF NOT FOUND THEN v_enforce := true; END IF;
  IF NOT v_enforce THEN RETURN NEW; END IF;

  v_slots := active_slots();
  IF TG_OP = 'UPDATE' THEN v_exclude_id := NEW.id; ELSE v_exclude_id := NULL; END IF;

  v_seats_used := ARRAY[]::integer[];
  FOR i IN 1..array_length(v_slots, 1) LOOP
    v_seats_used := v_seats_used || get_seats_used(NEW.booking_date, v_slots[i], v_exclude_id);
  END LOOP;

  v_slot_index := NULL;
  FOR i IN 1..array_length(v_slots, 1) LOOP
    IF v_slots[i] = NEW.slot THEN v_slot_index := i; EXIT; END IF;
  END LOOP;
  IF v_slot_index IS NULL THEN RAISE EXCEPTION 'Invalid slot: %', NEW.slot; END IF;

  v_seats_needed := get_seats_needed(NEW.size, NEW.slot);
  v_used := v_seats_used[v_slot_index];
  v_early_close := has_large_dog(NEW.booking_date, '12:00', v_exclude_id);
  v_has_large := has_large_dog(NEW.booking_date, NEW.slot, v_exclude_id);
  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  IF NEW.slot = '13:00' AND v_early_close THEN v_max_seats := 0; END IF;

  IF NEW.size = 'large' THEN
    IF NOT is_large_dog_slot(NEW.slot) THEN
      RAISE EXCEPTION 'Large dogs need approval for this slot (%)' , NEW.slot;
    END IF;
    IF NEW.slot = '09:00' THEN
      IF get_seats_used(NEW.booking_date, '08:30', v_exclude_id) > 0 THEN
        RAISE EXCEPTION '09:00 large dog conditional: 08:30 must be empty';
      END IF;
      IF get_seats_used(NEW.booking_date, '10:00', v_exclude_id) > 1 THEN
        RAISE EXCEPTION '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      END IF;
    END IF;
    IF NEW.slot = '12:00' THEN
      IF get_seats_used(NEW.booking_date, '13:00', v_exclude_id) > 0 THEN
        RAISE EXCEPTION '12:00 large dog requires 13:00 to be empty (early close)';
      END IF;
    END IF;
    IF NEW.slot = '13:00' AND v_early_close THEN
      RAISE EXCEPTION '13:00 is closed — large dog at 12:00 triggered early close';
    END IF;

    v_can_share := large_dog_can_share(NEW.slot);

    IF NOT v_can_share THEN
      IF v_slot_index > 1 THEN
        v_prev_slot := v_slots[v_slot_index - 1];
        IF is_large_dog_slot(v_prev_slot) AND NOT large_dog_can_share(v_prev_slot)
           AND has_large_dog(NEW.booking_date, v_prev_slot, v_exclude_id) THEN
          IF NOT ((v_prev_slot = '12:30' AND NEW.slot = '13:00') OR (v_prev_slot = '13:00' AND NEW.slot = '12:30')) THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;
      IF v_slot_index < array_length(v_slots, 1) THEN
        v_next_slot := v_slots[v_slot_index + 1];
        IF is_large_dog_slot(v_next_slot) AND NOT large_dog_can_share(v_next_slot)
           AND has_large_dog(NEW.booking_date, v_next_slot, v_exclude_id) THEN
          IF NOT ((NEW.slot = '12:30' AND v_next_slot = '13:00') OR (NEW.slot = '13:00' AND v_next_slot = '12:30')) THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_can_share AND v_has_large THEN
      RAISE EXCEPTION 'Only a small/medium dog can share this slot with a large dog';
    END IF;
    IF NOT v_can_share AND v_used > 0 THEN
      RAISE EXCEPTION 'Large dog fills this slot — already has bookings';
    END IF;
    IF NOT v_can_share AND v_seats_needed > v_max_seats THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    END IF;
  END IF;

  IF (v_used + v_seats_needed) > v_max_seats THEN
    IF NEW.size = 'large' THEN RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    ELSIF NEW.slot = '13:00' AND v_early_close THEN RAISE EXCEPTION '13:00 closed — early close from 12:00 large dog';
    ELSIF v_max_seats < 2 THEN RAISE EXCEPTION 'Capped at 1 (2-2-1 rule)';
    ELSE RAISE EXCEPTION 'Slot is full';
    END IF;
  END IF;

  IF NEW.size <> 'large' AND v_has_large THEN
    IF is_large_dog_slot(NEW.slot) AND NOT large_dog_can_share(NEW.slot) THEN
      RAISE EXCEPTION 'Large dog fills this slot';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

grant delete on table "public"."briefings" to "anon";

grant insert on table "public"."briefings" to "anon";

grant references on table "public"."briefings" to "anon";

grant select on table "public"."briefings" to "anon";

grant trigger on table "public"."briefings" to "anon";

grant truncate on table "public"."briefings" to "anon";

grant update on table "public"."briefings" to "anon";

grant delete on table "public"."briefings" to "authenticated";

grant insert on table "public"."briefings" to "authenticated";

grant references on table "public"."briefings" to "authenticated";

grant select on table "public"."briefings" to "authenticated";

grant trigger on table "public"."briefings" to "authenticated";

grant truncate on table "public"."briefings" to "authenticated";

grant update on table "public"."briefings" to "authenticated";

grant delete on table "public"."briefings" to "service_role";

grant insert on table "public"."briefings" to "service_role";

grant references on table "public"."briefings" to "service_role";

grant select on table "public"."briefings" to "service_role";

grant trigger on table "public"."briefings" to "service_role";

grant truncate on table "public"."briefings" to "service_role";

grant update on table "public"."briefings" to "service_role";


  create policy "combined_delete_bookings"
  on "public"."bookings"
  as permissive
  for delete
  to authenticated
using ((public.is_staff() OR ((booking_date >= CURRENT_DATE) AND (EXISTS ( SELECT 1
   FROM (public.dogs
     JOIN public.humans ON ((humans.id = dogs.human_id)))
  WHERE ((dogs.id = bookings.dog_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid))))))));



  create policy "combined_insert_bookings"
  on "public"."bookings"
  as permissive
  for insert
  to authenticated
with check ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM (public.dogs
     JOIN public.humans ON ((humans.id = dogs.human_id)))
  WHERE ((dogs.id = bookings.dog_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_select_bookings"
  on "public"."bookings"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM (public.dogs
     JOIN public.humans ON ((humans.id = dogs.human_id)))
  WHERE ((dogs.id = bookings.dog_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_update_bookings"
  on "public"."bookings"
  as permissive
  for update
  to authenticated
using ((public.is_staff() OR ((booking_date >= CURRENT_DATE) AND (EXISTS ( SELECT 1
   FROM (public.dogs
     JOIN public.humans ON ((humans.id = dogs.human_id)))
  WHERE ((dogs.id = bookings.dog_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid))))))))
with check ((public.is_staff() OR ((status = 'Cancelled'::text) AND (booking_date >= CURRENT_DATE) AND (EXISTS ( SELECT 1
   FROM (public.dogs
     JOIN public.humans ON ((humans.id = dogs.human_id)))
  WHERE ((dogs.id = bookings.dog_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid))))))));



  create policy "Allow service role full access"
  on "public"."briefings"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "combined_select_day_settings"
  on "public"."day_settings"
  as permissive
  for select
  to authenticated
using (true);



  create policy "staff_delete_day_settings"
  on "public"."day_settings"
  as permissive
  for delete
  to authenticated
using (public.is_staff());



  create policy "staff_insert_day_settings"
  on "public"."day_settings"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());



  create policy "staff_update_day_settings"
  on "public"."day_settings"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "combined_insert_dogs"
  on "public"."dogs"
  as permissive
  for insert
  to authenticated
with check ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = dogs.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_select_dogs"
  on "public"."dogs"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = dogs.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_select_trusted_contacts"
  on "public"."human_trusted_contacts"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = human_trusted_contacts.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "staff_delete_trusted_contacts"
  on "public"."human_trusted_contacts"
  as permissive
  for delete
  to authenticated
using (public.is_staff());



  create policy "staff_insert_trusted_contacts"
  on "public"."human_trusted_contacts"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());



  create policy "staff_update_trusted_contacts"
  on "public"."human_trusted_contacts"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "combined_select_humans"
  on "public"."humans"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (customer_user_id = ( SELECT auth.uid() AS uid))));



  create policy "combined_update_humans"
  on "public"."humans"
  as permissive
  for update
  to authenticated
using ((public.is_staff() OR (customer_user_id = ( SELECT auth.uid() AS uid))))
with check ((public.is_staff() OR (customer_user_id = ( SELECT auth.uid() AS uid))));



  create policy "combined_select_notification_log"
  on "public"."notification_log"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (human_id IN ( SELECT humans.id
   FROM public.humans
  WHERE (humans.customer_user_id = ( SELECT auth.uid() AS uid))))));



  create policy "combined_select_salon_config"
  on "public"."salon_config"
  as permissive
  for select
  to authenticated
using (true);



  create policy "combined_delete_waitlist_entries"
  on "public"."waitlist_entries"
  as permissive
  for delete
  to authenticated
using ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = waitlist_entries.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_insert_waitlist_entries"
  on "public"."waitlist_entries"
  as permissive
  for insert
  to authenticated
with check ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = waitlist_entries.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "combined_select_waitlist_entries"
  on "public"."waitlist_entries"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.humans
  WHERE ((humans.id = waitlist_entries.human_id) AND (humans.customer_user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "staff_delete_dogs"
  on "public"."dogs"
  as permissive
  for delete
  to authenticated
using (public.is_staff());



  create policy "staff_update_dogs"
  on "public"."dogs"
  as permissive
  for update
  to authenticated
using (public.is_staff())
with check (public.is_staff());



  create policy "staff_delete_humans"
  on "public"."humans"
  as permissive
  for delete
  to authenticated
using (public.is_staff());



  create policy "staff_insert_humans"
  on "public"."humans"
  as permissive
  for insert
  to authenticated
with check (public.is_staff());


CREATE TRIGGER trg_notify_booking_delete AFTER DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_delete();

CREATE TRIGGER trg_notify_booking_insert AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_insert();


