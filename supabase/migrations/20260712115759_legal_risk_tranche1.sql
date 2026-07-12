-- Remove the broad customer UPDATE path on humans. Customer profile writes now
-- go through the two narrow SECURITY DEFINER functions below; staff retain the
-- existing full-row policy.
drop policy if exists "customer_update_own_human" on public.humans;

drop policy if exists "staff_update_humans" on public.humans;
create policy "staff_update_humans" on public.humans
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create or replace function public.update_customer_contact_details(
  p_name text,
  p_surname text,
  p_address text,
  p_postcode text default null,
  p_email text default null,
  p_whatsapp boolean default false,
  p_fb text default null,
  p_insta text default null,
  p_tiktok text default null
)
returns table (
  id uuid,
  name text,
  surname text,
  address text,
  postcode text,
  email text,
  whatsapp boolean,
  fb text,
  insta text,
  tiktok text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
     or nullif(trim(coalesce(p_surname, '')), '') is null
     or nullif(trim(coalesce(p_address, '')), '') is null then
    raise exception 'profile_fields_required' using errcode = '22023';
  end if;

  return query
  update public.humans h
     set name = trim(p_name),
         surname = trim(p_surname),
         address = trim(p_address),
         postcode = coalesce(nullif(upper(trim(coalesce(p_postcode, ''))), ''), h.postcode),
         email = nullif(trim(coalesce(p_email, '')), ''),
         whatsapp = coalesce(p_whatsapp, false),
         fb = nullif(trim(coalesce(p_fb, '')), ''),
         insta = nullif(trim(coalesce(p_insta, '')), ''),
         tiktok = nullif(trim(coalesce(p_tiktok, '')), '')
   where h.customer_user_id = v_uid
  returning h.id, h.name, h.surname, h.address, h.postcode,
            h.email, h.whatsapp, h.fb, h.insta, h.tiktok;

  if not found then
    raise exception 'no_linked_human' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_customer_contact_details(
  text, text, text, text, text, boolean, text, text, text
) from public;
revoke all on function public.update_customer_contact_details(
  text, text, text, text, text, boolean, text, text, text
) from anon;
revoke all on function public.update_customer_contact_details(
  text, text, text, text, text, boolean, text, text, text
) from authenticated;
grant execute on function public.update_customer_contact_details(
  text, text, text, text, text, boolean, text, text, text
) to authenticated;

create or replace function public.complete_customer_profile(
  p_name text,
  p_surname text,
  p_address text,
  p_postcode text default null,
  p_policies_version text default null
)
returns table (
  id uuid,
  name text,
  surname text,
  address text,
  postcode text,
  policies_accepted_at timestamptz,
  policies_version text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version text := nullif(trim(coalesce(p_policies_version, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null
     or nullif(trim(coalesce(p_surname, '')), '') is null
     or nullif(trim(coalesce(p_address, '')), '') is null
     or v_version is null then
    raise exception 'profile_fields_required' using errcode = '22023';
  end if;

  return query
  update public.humans h
     set name = trim(p_name),
         surname = trim(p_surname),
         address = trim(p_address),
         postcode = coalesce(nullif(upper(trim(coalesce(p_postcode, ''))), ''), h.postcode),
         policies_accepted_at = coalesce(h.policies_accepted_at, now()),
         policies_version = coalesce(h.policies_version, v_version)
   where h.customer_user_id = v_uid
  returning h.id, h.name, h.surname, h.address, h.postcode,
            h.policies_accepted_at, h.policies_version;

  if not found then
    raise exception 'no_linked_human' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.complete_customer_profile(
  text, text, text, text, text
) from public;
revoke all on function public.complete_customer_profile(
  text, text, text, text, text
) from anon;
revoke all on function public.complete_customer_profile(
  text, text, text, text, text
) from authenticated;
grant execute on function public.complete_customer_profile(
  text, text, text, text, text
) to authenticated;

-- Customer-supplied dog size is an estimate only. Staff remain the sole
-- authority for dogs.size; customer flows write dogs.reported_size instead.
alter table public.dogs add column if not exists reported_size text;
alter table public.dogs drop constraint if exists dogs_reported_size_check;
alter table public.dogs add constraint dogs_reported_size_check
  check (reported_size is null or reported_size in ('small', 'medium', 'large'));

-- Customers and staff share the authenticated role, so retain the table grant
-- and enforce the write boundary through staff-only INSERT RLS plus narrow
-- SECURITY DEFINER customer RPCs.
drop policy if exists "customer_insert_own_dogs" on public.dogs;
drop policy if exists "combined_insert_dogs" on public.dogs;
drop policy if exists "staff_insert_dogs" on public.dogs;
create policy "staff_insert_dogs" on public.dogs
  for insert to authenticated
  with check ((select public.is_staff()));

-- PostgreSQL cannot change an existing RETURNS TABLE shape through CREATE OR
-- REPLACE. Drop and recreate this exact input signature atomically so callers
-- keep the same RPC contract while receiving both size fields.
drop function if exists public.create_customer_dog(text, text, text, uuid);
create or replace function public.create_customer_dog(
  p_name text,
  p_breed text default null,
  p_size text default null,
  p_human_id uuid default null
)
returns table (
  id uuid,
  name text,
  breed text,
  size text,
  reported_size text,
  human_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_dog public.dogs%rowtype;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_breed text := nullif(trim(coalesce(p_breed, '')), '');
  v_size text := nullif(trim(lower(coalesce(p_size, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  if p_human_id is null or p_human_id <> v_my_id then
    raise exception 'not_your_human' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_size is not null and v_size not in ('small', 'medium', 'large') then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  insert into public.dogs (name, breed, reported_size, human_id, size)
  values (v_name, v_breed, v_size, v_my_id, null)
  returning * into v_dog;

  return query
    select v_dog.id, v_dog.name, v_dog.breed, v_dog.size,
           v_dog.reported_size, v_dog.human_id;
end;
$$;

revoke all on function public.create_customer_dog(text, text, text, uuid) from public;
revoke all on function public.create_customer_dog(text, text, text, uuid) from anon;
revoke all on function public.create_customer_dog(text, text, text, uuid) from authenticated;
grant execute on function public.create_customer_dog(text, text, text, uuid) to authenticated;

drop function if exists public.update_customer_dog(uuid, text, text, text, text);
create or replace function public.update_customer_dog(
  p_dog_id uuid,
  p_name text,
  p_breed text default null,
  p_size text default null,
  p_dob text default null
)
returns table (
  id uuid,
  name text,
  breed text,
  size text,
  reported_size text,
  dob text,
  human_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_dog public.dogs%rowtype;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_breed text := nullif(trim(coalesce(p_breed, '')), '');
  v_size text := nullif(trim(lower(coalesce(p_size, ''))), '');
  v_dob text := nullif(trim(coalesce(p_dob, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  select * into v_dog
  from public.dogs d
  where d.id = p_dog_id and d.human_id = v_my_id
  limit 1;

  if v_dog.id is null then
    raise exception 'dog_not_found' using errcode = '42704';
  end if;

  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_size is not null and v_size not in ('small', 'medium', 'large') then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  update public.dogs d
  set name = v_name,
      breed = v_breed,
      size = case
        when d.breed is not distinct from v_breed
         and d.reported_size is not distinct from v_size
          then d.size
        else null
      end,
      reported_size = v_size,
      dob = v_dob
  where d.id = p_dog_id
  returning d.* into v_dog;

  return query
    select v_dog.id, v_dog.name, v_dog.breed, v_dog.size,
           v_dog.reported_size, v_dog.dob, v_dog.human_id;
end;
$$;

revoke all on function public.update_customer_dog(uuid, text, text, text, text) from public;
revoke all on function public.update_customer_dog(uuid, text, text, text, text) from anon;
revoke all on function public.update_customer_dog(uuid, text, text, text, text) from authenticated;
grant execute on function public.update_customer_dog(uuid, text, text, text, text) to authenticated;

create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human public.humans%rowtype;
  v_name text;
  v_surname text;
  v_address text;
  v_elem jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_human
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_human.id is null then
    raise exception 'No account is linked to set up' using errcode = '28000';
  end if;

  if v_human.source is distinct from 'self_signup'
     or v_human.approved_at is not null
     or v_human.signup_submitted_at is not null then
    raise exception 'signup_not_pending' using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(p_owner->>'name', ''));
  v_surname := trim(coalesce(p_owner->>'surname', ''));
  v_address := trim(coalesce(p_owner->>'address', ''));
  if v_name = '' or v_surname = '' or v_address = '' then
    raise exception 'Please give your name and address.' using errcode = 'P0001';
  end if;

  if p_dogs is null
     or jsonb_typeof(p_dogs) <> 'array'
     or jsonb_array_length(p_dogs) < 1 then
    raise exception 'Please tell us about at least one dog.' using errcode = 'P0001';
  end if;

  begin
    update public.humans h
    set name = v_name,
        surname = v_surname,
        address = v_address,
        postcode = nullif(trim(coalesce(p_owner->>'postcode', '')), ''),
        email = nullif(trim(coalesce(p_owner->>'email', '')), ''),
        sms = coalesce((p_owner->>'sms')::boolean, false),
        whatsapp = coalesce((p_owner->>'whatsapp')::boolean, false),
        heard_about_us = nullif(trim(coalesce(p_owner->>'heard_about_us', '')), ''),
        policies_accepted_at = now(),
        policies_version = nullif(trim(coalesce(p_owner->>'policies_version', '')), ''),
        signup_submitted_at = now()
    where h.id = v_human.id;
  exception when unique_violation then
    raise exception 'We may already have you on file under that name — please contact the salon.'
      using errcode = 'P0001';
  end;

  for v_elem in select * from jsonb_array_elements(p_dogs) loop
    if trim(coalesce(v_elem->>'name', '')) = ''
       or trim(coalesce(v_elem->>'breed', '')) = '' then
      raise exception 'Each dog needs a name and breed.' using errcode = 'P0001';
    end if;

    insert into public.dogs (
      human_id, name, breed, reported_size, sex, dob,
      microchip, neutered, vet, colour, groom_notes, alerts
    ) values (
      v_human.id,
      trim(v_elem->>'name'),
      trim(v_elem->>'breed'),
      nullif(trim(lower(coalesce(v_elem->>'size', ''))), ''),
      nullif(trim(lower(coalesce(v_elem->>'sex', ''))), ''),
      nullif(trim(coalesce(v_elem->>'dob', '')), ''),
      nullif(trim(coalesce(v_elem->>'microchip', '')), ''),
      (v_elem->>'neutered')::boolean,
      nullif(trim(coalesce(v_elem->>'vet', '')), ''),
      nullif(trim(coalesce(v_elem->>'colour', '')), ''),
      coalesce(trim(v_elem->>'groom_notes'), ''),
      coalesce(
        array(
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(v_elem->'alerts') = 'array' then v_elem->'alerts'
              else '[]'::jsonb
            end
          )
        ),
        '{}'::text[]
      )
    );
  end loop;
end;
$$;

revoke all on function public.submit_customer_signup(jsonb, jsonb) from public;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from anon;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from authenticated;
grant execute on function public.submit_customer_signup(jsonb, jsonb) to authenticated;

create or replace function public.approve_customer_signup(p_human_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.dogs d
    join public.humans h on h.id = d.human_id
    where h.id = p_human_id
      and h.approved_at is null
      and d.archived_at is null
      and d.size is null
  ) then
    raise exception 'signup_dog_size_unconfirmed' using errcode = 'P0001';
  end if;

  update public.humans
  set approved_at = now(),
      approved_by = (select auth.uid())
  where id = p_human_id
    and approved_at is null;

  if not found then
    return;
  end if;

  update public.salon_todos
  set done = true
  where human_id = p_human_id
    and kind = 'signup_review'
    and not done;
end;
$$;

revoke all on function public.approve_customer_signup(uuid) from public;
revoke all on function public.approve_customer_signup(uuid) from anon;
revoke all on function public.approve_customer_signup(uuid) from authenticated;
grant execute on function public.approve_customer_signup(uuid) to authenticated;

create or replace function public.create_customer_booking_group(
  p_bookings jsonb,
  p_booking_date date
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human_id uuid;
  v_name text;
  v_surname text;
  v_address text;
  v_policies_at timestamptz;
  v_approved_at timestamptz;
  v_count int;
  v_group_id uuid;
  v_elem jsonb;
  v_idx int;
  v_dog_id uuid;
  v_slot text;
  v_service text;
  v_dog_size text;
  v_size text;
  v_addons text[];
  v_payment text;
  v_new_id uuid;
  v_slot_list text[];
  v_lock_slot text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select h.id, h.name, h.surname, h.address,
         h.policies_accepted_at, h.approved_at
  into v_human_id, v_name, v_surname, v_address,
       v_policies_at, v_approved_at
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1;

  if v_human_id is null then
    raise exception 'No customer record is linked to this account'
      using errcode = '28000';
  end if;

  if v_approved_at is null then
    raise exception 'Your account is awaiting approval. We''ll be in touch as soon as you''re set up.'
      using errcode = 'P0001';
  end if;

  if coalesce(trim(v_name), '') = ''
     or coalesce(trim(v_surname), '') = ''
     or coalesce(trim(v_address), '') = ''
     or v_policies_at is null then
    raise exception 'Please complete your profile (name, address and policy agreement) before booking'
      using errcode = 'P0001';
  end if;

  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_bookings);
  if v_count < 1 or v_count > 4 then
    raise exception 'A booking group must have between 1 and 4 dogs (got %)', v_count
      using errcode = '22023';
  end if;

  if p_booking_date is null then
    raise exception 'booking_date is required' using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct (e->>'dog_id'))
    from jsonb_array_elements(p_bookings) e
  ) then
    raise exception 'The same dog is listed more than once' using errcode = '22023';
  end if;

  v_group_id := case when v_count > 1 then gen_random_uuid() else null end;

  select array_agg(distinct (e->>'slot') order by (e->>'slot'))
  into v_slot_list
  from jsonb_array_elements(p_bookings) e
  where nullif(e->>'slot', '') is not null;

  if v_slot_list is not null then
    foreach v_lock_slot in array v_slot_list loop
      perform pg_advisory_xact_lock(
        hashtextextended(p_booking_date::text || '|' || v_lock_slot, 0)
      );
    end loop;
  end if;

  v_idx := 0;
  for v_elem in select * from jsonb_array_elements(p_bookings) loop
    v_idx := v_idx + 1;

    v_dog_id := nullif(v_elem->>'dog_id', '')::uuid;
    v_slot := nullif(v_elem->>'slot', '');
    v_service := nullif(trim(coalesce(v_elem->>'service', '')), '');

    if v_dog_id is null then
      raise exception 'Row %: dog_id is required', v_idx using errcode = '22023';
    end if;
    if v_slot is null then
      raise exception 'Row %: slot is required', v_idx using errcode = '22023';
    end if;
    if v_service is null then
      raise exception 'Row %: service is required', v_idx using errcode = '22023';
    end if;

    select d.size into v_dog_size
    from public.dogs d
    where d.id = v_dog_id
      and d.human_id = v_human_id;

    if not found then
      raise exception 'Row %: that dog is not on your account', v_idx
        using errcode = '42704';
    end if;

    if v_dog_size is null then
      raise exception 'dog_size_unconfirmed' using errcode = '22023';
    end if;

    v_size := nullif(trim(lower(v_dog_size)), '');
    if v_size not in ('small', 'medium', 'large') then
      raise exception 'Row %: invalid size "%"', v_idx, v_size
        using errcode = '22023';
    end if;

    v_addons := coalesce(
      array(
        select jsonb_array_elements_text(
          case
            when jsonb_typeof(v_elem->'addons') = 'array' then v_elem->'addons'
            else '[]'::jsonb
          end
        )
      ),
      '{}'::text[]
    );
    v_payment := coalesce(nullif(v_elem->>'payment', ''), 'Due at Pick-up');

    insert into public.bookings (
      booking_date, slot, dog_id, size, service,
      status, confirmed, addons, payment, group_id
    ) values (
      p_booking_date, v_slot, v_dog_id, v_size, v_service,
      'Booked', false, v_addons, v_payment, v_group_id
    )
    returning bookings.id into v_new_id;

    id := v_new_id;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.create_customer_booking_group(jsonb, date) from public;
revoke all on function public.create_customer_booking_group(jsonb, date) from anon;
revoke all on function public.create_customer_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_customer_booking_group(jsonb, date) to authenticated;
