-- Remove the broad customer UPDATE path on humans. Customer profile writes now
-- go through the two narrow SECURITY DEFINER functions below; staff retain the
-- existing full-row policy.
drop policy if exists "customer_update_own_human" on public.humans;
drop policy if exists "combined_update_humans" on public.humans;

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
  limit 1
  for update;

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
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  select * into v_dog
  from public.dogs d
  where d.id = p_dog_id and d.human_id = v_my_id
  limit 1
  for update;

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
    and d.human_id = v_my_id
  returning d.* into v_dog;

  if not found then
    raise exception 'dog_not_found' using errcode = '42704';
  end if;

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

  -- Share one owner-row lock with submit_customer_signup and the customer dog
  -- RPCs. Approval therefore cannot race past a newly inserted or edited dog
  -- whose authoritative size still needs staff confirmation.
  perform h.id
  from public.humans h
  where h.id = p_human_id
    and h.approved_at is null
  for update;

  if not found then
    return;
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

-- Customer dog writes and cancellation now hold human/dog/booking rows. Keep
-- the staff merge command on the same deterministic humans -> bookings -> dogs
-- order so it cannot deadlock those paths or delete a dog inserted while the
-- loser human is being merged.
create or replace function public.merge_humans(p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.humans%rowtype;
begin
  if not public.is_staff() then
    raise exception 'merge_humans: staff only';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'merge_humans: winner and loser are required';
  end if;
  if p_winner = p_loser then
    raise exception 'merge_humans: winner and loser must differ';
  end if;

  -- Lock both people first, in UUID order. Customer dog creation/editing and
  -- signup approval take the same owner-row lock before touching dogs.
  perform h.id
  from public.humans h
  where h.id = any(array[p_winner, p_loser])
  order by h.id
  for update;

  select * into l
  from public.humans
  where id = p_loser;
  if not found then
    raise exception 'merge_humans: loser % not found', p_loser;
  end if;
  if not exists (select 1 from public.humans where id = p_winner) then
    raise exception 'merge_humans: winner % not found', p_winner;
  end if;

  -- Cancellation takes booking rows before their dog rows. Lock every booking
  -- that either belongs to a loser-owned dog or directly names the loser as
  -- collector, then lock the loser-owned dogs in UUID order.
  perform b.id
  from public.bookings b
  left join public.dogs d on d.id = b.dog_id
  where b.pickup_by_id = p_loser
     or d.human_id = p_loser
  order by b.id
  for update of b;

  perform d.id
  from public.dogs d
  where d.human_id = p_loser
  order by d.id
  for update of d;

  -- Reassign references from loser -> winner before deleting the loser. The
  -- booking and dog mutations follow the same order as the locks above.
  update public.bookings
  set pickup_by_id = p_winner
  where pickup_by_id = p_loser;

  update public.dogs
  set human_id = p_winner
  where human_id = p_loser;

  update public.waitlist_entries
  set human_id = p_winner
  where human_id = p_loser;

  update public.whatsapp_conversations
  set human_id = p_winner
  where human_id = p_loser;

  update public.notification_log
  set human_id = p_winner
  where human_id = p_loser;

  update public.human_trusted_contacts t
  set human_id = p_winner
  where t.human_id = p_loser
    and t.trusted_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = p_winner
        and e.trusted_id = t.trusted_id
    );

  update public.human_trusted_contacts t
  set trusted_id = p_winner
  where t.trusted_id = p_loser
    and t.human_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = t.human_id
        and e.trusted_id = p_winner
    );

  -- Deletion frees the unique phone and intentionally removes the loser's
  -- private calendar tokens plus any remaining duplicate trusted links.
  delete from public.humans where id = p_loser;

  update public.humans w
  set phone = coalesce(nullif(w.phone, ''), l.phone),
      email = coalesce(nullif(w.email, ''), l.email),
      address = case
        when coalesce(w.address, '') = '' then l.address else w.address
      end,
      fb = case when coalesce(w.fb, '') = '' then l.fb else w.fb end,
      insta = case when coalesce(w.insta, '') = '' then l.insta else w.insta end,
      tiktok = case when coalesce(w.tiktok, '') = '' then l.tiktok else w.tiktok end,
      history_flag = case
        when coalesce(w.history_flag, '') = '' then l.history_flag
        else w.history_flag
      end,
      notes = case
        when coalesce(l.notes, '') = '' then w.notes
        when coalesce(w.notes, '') = '' then l.notes
        else w.notes || E'\n\n' || l.notes
      end,
      sms = w.sms or l.sms,
      whatsapp = w.whatsapp or l.whatsapp
  where w.id = p_winner;
end;
$$;

comment on function public.merge_humans(uuid, uuid) is
  'Staff-only. Reassigns every reference from the loser human to the winner using deterministic human, booking and dog locks, backfills blank contact fields, then deletes the loser.';

revoke all on function public.merge_humans(uuid, uuid) from public;
revoke all on function public.merge_humans(uuid, uuid) from anon;
revoke all on function public.merge_humans(uuid, uuid) from authenticated;
grant execute on function public.merge_humans(uuid, uuid) to authenticated;

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

  begin
    if (
      select count(*) <> count(distinct nullif(e->>'dog_id', '')::uuid)
      from jsonb_array_elements(p_bookings) e
    ) then
      raise exception 'The same dog is listed more than once' using errcode = '22023';
    end if;
  exception
    when invalid_text_representation then
      raise exception 'dog_id must be a valid UUID' using errcode = '22023';
  end;

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

  -- Hold every existing requested dog row through insertion. Staff
  -- reassignment and size edits must not move or change a dog after this RPC
  -- has accepted its ownership and authoritative capacity size.
  perform d.id
  from public.dogs d
  join (
    select distinct nullif(e->>'dog_id', '')::uuid as dog_id
    from jsonb_array_elements(p_bookings) e
  ) requested on requested.dog_id = d.id
  order by d.id
  for update of d;

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

drop function if exists public.add_customer_trusted_human(text, text, text, text);

create or replace function public.list_customer_trusted_humans()
returns table (
  id uuid,
  name text,
  surname text,
  phone text,
  relationship text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    trusted.id,
    trusted.name,
    trusted.surname,
    trusted.phone,
    link.relationship
  from public.human_trusted_contacts link
  join public.humans owner on owner.id = link.human_id
  join public.humans trusted on trusted.id = link.trusted_id
  where owner.customer_user_id = (select auth.uid())
  order by
    lower(coalesce(trusted.name, '')),
    lower(coalesce(trusted.surname, '')),
    trusted.id;
$$;

revoke all on function public.list_customer_trusted_humans() from public;
revoke all on function public.list_customer_trusted_humans() from anon;
revoke all on function public.list_customer_trusted_humans() from authenticated;
grant execute on function public.list_customer_trusted_humans() to authenticated;

-- Preserve staff-capacity override audit fields on metadata-only booking
-- updates (including cancellation). This is the latest effective function
-- from 20260702170000, with only the metadata-only return moved ahead of the
-- non-staff override sanitisation.
create or replace function public.validate_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_enforce       boolean;
  v_override      boolean;
  v_is_staff      boolean;
  v_slots         text[];
  v_exclude_id    uuid;
  v_seats_used    integer[];
  v_slot_index    integer;
  v_max_seats     integer;
  v_used          integer;
  v_seats_needed  integer;
  v_early_close   boolean;
  v_has_large     boolean;
  v_can_share     boolean;
  i               integer;
  v_prev_slot     text;
  v_next_slot     text;
  v_daily_cap     integer;
  v_day_count     integer;
  v_blocked_seats integer;
begin
  v_is_staff := is_staff();

  -- BEGIN: cancellation visit membership serialisation
  -- A cancellation takes this visit key before it captures and locks the
  -- visit's rows. Every INSERT and every membership/date-changing UPDATE must
  -- take the same destination key before the metadata-only return below, or a
  -- writer could join the visit after cancellation captured its member IDs.
  --
  -- Deliberately do not take OLD's visit key here. PostgreSQL already holds an
  -- UPDATE's target row before this row trigger; taking OLD's key would invert
  -- cancellation's visit-key-then-row-lock order. The existing cancellation
  -- scope revalidation serialises departures through that row lock instead.
  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and (
         new.group_id is distinct from old.group_id
         or new.booking_date is distinct from old.booking_date
       )
     )
  then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'customer_booking_cancellation|'
          || coalesce(new.group_id, new.id)::text
          || '|'
          || new.booking_date::text,
        0
      )
    );
  end if;

  -- The application write paths use READ COMMITTED. If the destination lock
  -- waited for a cancellation, this VOLATILE trigger's following query sees
  -- that commit and prevents a Booked row joining the cancelled visit. Also
  -- prevent an existing grouped cancellation from being reactivated.
  if new.group_id is not null
     and new.status is distinct from 'Cancelled'
     and (
       (tg_op = 'UPDATE' and old.status = 'Cancelled')
       or exists (
         select 1
           from public.bookings b
          where b.id <> new.id
            and b.group_id = new.group_id
            and b.booking_date = new.booking_date
            and b.status = 'Cancelled'
       )
     )
  then
    raise exception 'booking_visit_already_cancelled'
      using errcode = 'SDC03';
  end if;
  -- END: cancellation visit membership serialisation

  if tg_op = 'UPDATE'
     and new.booking_date is not distinct from old.booking_date
     and new.slot is not distinct from old.slot
     and new.size is not distinct from old.size
     and coalesce(new.staff_capacity_override, false)
         is not distinct from coalesce(old.staff_capacity_override, false)
     -- Reactivating a Cancelled booking re-adds a seat, so it is NOT a
     -- metadata-only change — fall through to the full capacity check.
     and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
  then
    return new;
  end if;

  if not v_is_staff then
    new.staff_capacity_override := false;
  end if;

  select coalesce(sc.enforce_server_capacity, true)
    into v_enforce
    from salon_config sc
   limit 1;

  if not found then
    v_enforce := true;
  end if;

  v_override := coalesce(new.staff_capacity_override, false) and v_is_staff;
  if v_override then
    new.staff_capacity_override_by := auth.uid();
    new.staff_capacity_override_at := now();
  else
    new.staff_capacity_override_by := null;
    new.staff_capacity_override_at := null;
  end if;

  if not v_enforce then
    perform set_config('booking_diag.v_enforce',  v_enforce::text,  true);
    perform set_config('booking_diag.v_override', v_override::text, true);
    return new;
  end if;

  -- Serialise concurrent inserts/updates targeting the same (date, slot).
  -- Without this, two transactions inserting into the same slot can both
  -- read v_used = N-1 in their BEFORE trigger before either commits,
  -- both pass the (v_used + needed > max) check, and both rows land.
  -- The lock is transaction-scoped (released on commit/rollback) and
  -- keyed per-slot, so different slots remain concurrent.
  perform pg_advisory_xact_lock(
    hashtextextended(new.booking_date::text || '|' || new.slot, 0)
  );

  -- ------------------------------------------------------------------
  -- DAILY DOG CAP (total dogs per day, across every slot).
  --
  -- The per-slot 2-2-1 logic below never looks at the day total, so a day
  -- with spare seats in some slot could be pushed past the salon's real
  -- throughput. Cap the day total for non-staff writes only (customers and
  -- the WhatsApp/AI agent run as a non-staff role); staff are trusted to
  -- overbook deliberately. A cancelled row frees its place, so skip when
  -- the resulting row is Cancelled.
  --
  -- The per-slot lock above does NOT make this race-safe (two inserts into
  -- DIFFERENT slots on the same day wouldn't contend), so take a second
  -- lock keyed on the date alone. Acquired AFTER the slot lock, so the lock
  -- order is identical for every transaction (no deadlock).
  -- ------------------------------------------------------------------
  if not v_is_staff and coalesce(new.status, 'Booked') <> 'Cancelled' then
    perform pg_advisory_xact_lock(
      hashtextextended('booking_day_cap|' || new.booking_date::text, 0)
    );

    select coalesce(sc.daily_dog_cap, 14)
      into v_daily_cap
      from salon_config sc
     limit 1;
    if v_daily_cap is null then
      v_daily_cap := 14;
    end if;

    select count(*)
      into v_day_count
      from bookings b
     where b.booking_date = new.booking_date
       and b.status is distinct from 'Cancelled'
       and b.id <> new.id;

    perform set_config('booking_diag.v_day_count', v_day_count::text, true);
    perform set_config('booking_diag.v_daily_cap', v_daily_cap::text, true);

    if (v_day_count + 1) > v_daily_cap then
      raise exception
        'Day is fully booked: % already has % dog(s) (maximum % per day)',
        to_char(new.booking_date, 'DD Mon YYYY'), v_day_count, v_daily_cap;
    end if;
  end if;

  -- The bookable grid for THIS date: canonical slots plus the date's
  -- sanitised extra_slots. Extra-slot bookings join the seats array, so
  -- the 2-2-1 windowing runs across the 13:00 → extras boundary
  -- (get_max_seats_for_slot is array-length agnostic).
  v_slots := active_slots_for(new.booking_date);

  if tg_op = 'UPDATE' then
    v_exclude_id := new.id;
  else
    v_exclude_id := null;
  end if;

  v_seats_used := array[]::integer[];
  for i in 1..array_length(v_slots, 1) loop
    v_seats_used := v_seats_used || get_seats_used(new.booking_date, v_slots[i], v_exclude_id);
  end loop;

  v_slot_index := null;
  for i in 1..array_length(v_slots, 1) loop
    if v_slots[i] = new.slot then
      v_slot_index := i;
      exit;
    end if;
  end loop;

  if v_slot_index is null then
    raise exception 'Invalid slot: %', new.slot;
  end if;

  v_seats_needed := get_seats_needed(new.size, new.slot);
  v_used         := v_seats_used[v_slot_index];
  v_early_close  := has_large_dog(new.booking_date, '12:00', v_exclude_id);
  v_has_large    := has_large_dog(new.booking_date, new.slot, v_exclude_id);

  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  if new.slot = '13:00' and v_early_close then
    v_max_seats := 0;
  end if;

  -- ------------------------------------------------------------------
  -- STAFF-BLOCKED SEATS (day_settings.overrides).
  --
  -- A blocked seat removes one usable seat from THIS slot only — it never
  -- cascades into the 2-2-1 windowing of neighbours (v_seats_used) or the
  -- daily cap, mirroring the TS engines. Placed before the large-dog and
  -- general checks so every downstream comparison inherits the reduction,
  -- and inside the per-slot advisory lock taken above. The key/value shape
  -- guards skip the known malformed legacy overrides rows (date-keyed
  -- slots, numeric seat values — same pattern as get_blocked_seats).
  -- ------------------------------------------------------------------
  select count(*)
    into v_blocked_seats
    from day_settings ds,
         lateral jsonb_each_text(coalesce(ds.overrides -> new.slot, '{}'::jsonb)) as seat(k, v)
   where ds.setting_date = new.booking_date
     and seat.k ~ '^[0-9]+$'
     and seat.v = 'blocked';

  v_blocked_seats := coalesce(v_blocked_seats, 0);
  v_max_seats     := greatest(v_max_seats - v_blocked_seats, 0);

  -- Stash diagnostics for the AFTER trigger. set_config(local=true)
  -- persists for the rest of the transaction.
  perform set_config('booking_diag.v_enforce',          v_enforce::text,       true);
  perform set_config('booking_diag.v_override',         v_override::text,      true);
  perform set_config('booking_diag.v_used',             v_used::text,          true);
  perform set_config('booking_diag.v_max_seats',        v_max_seats::text,     true);
  perform set_config('booking_diag.v_seats_needed',     v_seats_needed::text,  true);
  perform set_config('booking_diag.v_seats_used_array', v_seats_used::text,    true);
  perform set_config('booking_diag.v_blocked_seats',    v_blocked_seats::text, true);

  if new.size = 'large' then

    if not is_large_dog_slot(new.slot) then
      if not v_is_staff then
        raise exception 'Large dogs need approval for this slot (%)', new.slot;
      end if;
    end if;

    if new.slot = '09:00' then
      if get_seats_used(new.booking_date, '08:30', v_exclude_id) > 0
         and not v_override then
        raise exception '09:00 large dog conditional: 08:30 must be empty';
      end if;
      if get_seats_used(new.booking_date, '10:00', v_exclude_id) > 1
         and not v_override then
        raise exception '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      end if;
    end if;

    if new.slot = '12:00' then
      if get_seats_used(new.booking_date, '13:00', v_exclude_id) > 0
         and not v_override then
        raise exception '12:00 large dog requires 13:00 to be empty (early close)';
      end if;
    end if;

    if new.slot = '13:00' and v_early_close and not v_override then
      raise exception '13:00 is closed — large dog at 12:00 triggered early close';
    end if;

    v_can_share := large_dog_can_share(new.slot);

    if not v_can_share then
      if v_slot_index > 1 then
        v_prev_slot := v_slots[v_slot_index - 1];
        if is_large_dog_slot(v_prev_slot)
           and not large_dog_can_share(v_prev_slot)
           and has_large_dog(new.booking_date, v_prev_slot, v_exclude_id) then
          if not (
            (v_prev_slot = '12:30' and new.slot = '13:00') or
            (v_prev_slot = '13:00' and new.slot = '12:30')
          ) and not v_override then
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          end if;
        end if;
      end if;

      if v_slot_index < array_length(v_slots, 1) then
        v_next_slot := v_slots[v_slot_index + 1];
        if is_large_dog_slot(v_next_slot)
           and not large_dog_can_share(v_next_slot)
           and has_large_dog(new.booking_date, v_next_slot, v_exclude_id) then
          if not (
            (new.slot = '12:30' and v_next_slot = '13:00') or
            (new.slot = '13:00' and v_next_slot = '12:30')
          ) and not v_override then
            raise exception 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          end if;
        end if;
      end if;
    end if;

    if v_can_share and v_has_large and not v_override then
      raise exception 'Only a small/medium dog can share this slot with a large dog';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot) and v_used > 0 and not v_override then
      raise exception 'Large dog fills this slot — already has bookings';
    end if;

    if not v_can_share and is_large_dog_slot(new.slot)
       and v_seats_needed > v_max_seats and not v_override then
      raise exception 'Not enough capacity (2-2-1 rule)';
    end if;

  end if;

  if (v_used + v_seats_needed) > v_max_seats and not v_override then
    if new.size = 'large' then
      raise exception 'Not enough capacity (2-2-1 rule)';
    elsif new.slot = '13:00' and v_early_close then
      raise exception '13:00 closed — early close from 12:00 large dog';
    elsif v_blocked_seats > 0 then
      -- The shortfall involves a staff-blocked seat; "Slot is full" is the
      -- honest customer-facing message (and is already in the client's
      -- capacity-rejection matcher).
      raise exception 'Slot is full';
    elsif v_max_seats < 2 then
      raise exception 'Capped at 1 (2-2-1 rule)';
    else
      raise exception 'Slot is full';
    end if;
  end if;

  if new.size <> 'large' and v_has_large and not v_override then
    if is_large_dog_slot(new.slot) and not large_dog_can_share(new.slot) then
      raise exception 'Large dog fills this slot';
    end if;
  end if;

  return new;
end;
$function$;

comment on function validate_booking_capacity() is
  'BEFORE trigger on bookings: 2-2-1 seat rules over the per-date grid (active_slots_for: canonical + extra_slots), large-dog rules, daily dog cap (non-staff), and staff-blocked seats. Serialised by per-slot + per-date advisory locks. staff_capacity_override (staff only) bypasses the seat rules.';

revoke all on function validate_booking_capacity() from public, anon, authenticated, service_role;

-- Customers must cancel through one server-authoritative command. Remove every
-- known customer-capable UPDATE and DELETE policy, including consolidated
-- production names, then restore explicit staff-only mutation policies.
drop policy if exists "customer_cancel_own_bookings_update" on public.bookings;
drop policy if exists "customer_cancel_own_bookings" on public.bookings;
drop policy if exists "combined_update_bookings" on public.bookings;
drop policy if exists "combined_delete_bookings" on public.bookings;

drop policy if exists "staff_update_bookings" on public.bookings;
create policy "staff_update_bookings" on public.bookings
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "staff_delete_bookings" on public.bookings;
create policy "staff_delete_bookings" on public.bookings
  for delete to authenticated
  using ((select public.is_staff()));

create or replace function public.cancel_customer_booking(
  p_booking_id uuid,
  p_reason text
)
returns table (
  target_booking_id uuid,
  booking_group_id uuid,
  cancelled_booking_ids uuid[],
  cancelled_count integer,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human_id uuid;
  v_group_id uuid;
  v_booking_date date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_scope_count integer;
  v_owned_count integer;
  v_booked_count integer;
  v_target_scope_matches boolean;
  v_booking_ids uuid[];
  v_earliest_start timestamp without time zone;
  v_settings jsonb := '{}'::jsonb;
  v_settings_count integer;
  v_allow_value jsonb;
  v_hours_value jsonb;
  v_allow_cancellations boolean := true;
  v_min_cancellation_hours numeric := 24;
  v_cancelled_count integer;
  v_cancelled_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_booking_id is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'cancellation_reason_must_be_1_to_500_characters'
      using errcode = '22023';
  end if;

  select h.id
    into v_human_id
    from public.humans h
   where h.customer_user_id = v_uid
   limit 1;

  if v_human_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  -- Resolve only an owned target. A missing target and another customer's
  -- target deliberately produce the same non-disclosing outcome.
  select b.group_id, b.booking_date
    into v_group_id, v_booking_date
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where b.id = p_booking_id
     and d.human_id = v_human_id;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  -- Serialise cancellation attempts for one stored visit. Recurring staff
  -- bookings reuse group_id across dates, so the visit key includes the
  -- target date as well as its group (or singleton target) identifier.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_cancellation|'
        || coalesce(v_group_id, p_booking_id)::text
        || '|'
        || v_booking_date::text,
      0
    )
  );

  -- Lock every scoped row in deterministic order before checking status or
  -- ownership. Revalidation after the advisory lock closes the gap between
  -- resolving the target and taking row locks.
  perform b.id
    from public.bookings b
   where (v_group_id is not null
          and b.group_id = v_group_id
          and b.booking_date = v_booking_date)
      or (v_group_id is null and b.id = p_booking_id)
   order by b.id
   for update;

  -- Ownership lives on dogs, not bookings. Hold those rows as well so a staff
  -- merge cannot reassign a scoped dog after validation but before mutation.
  perform d.id
    from public.dogs d
    join public.bookings b on b.dog_id = d.id
   where (v_group_id is not null
          and b.group_id = v_group_id
          and b.booking_date = v_booking_date)
      or (v_group_id is null and b.id = p_booking_id)
   order by d.id
   for update of d;

  select
    count(*)::integer,
    count(*) filter (where d.human_id = v_human_id)::integer,
    count(*) filter (where b.status = 'Booked')::integer,
    coalesce(
      bool_or(
        b.id = p_booking_id
        and b.group_id is not distinct from v_group_id
        and b.booking_date is not distinct from v_booking_date
      ),
      false
    ),
    coalesce(array_agg(b.id order by b.id), '{}'::uuid[]),
    min(b.booking_date + b.slot::time)
  into
    v_scope_count,
    v_owned_count,
    v_booked_count,
    v_target_scope_matches,
    v_booking_ids,
    v_earliest_start
  from public.bookings b
  left join public.dogs d on d.id = b.dog_id
  where (v_group_id is not null
         and b.group_id = v_group_id
         and b.booking_date = v_booking_date)
     or (v_group_id is null and b.id = p_booking_id);

  if v_scope_count < 1
     or not v_target_scope_matches
     or v_owned_count <> v_scope_count
     or v_booked_count <> v_scope_count
     or v_earliest_start is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  select count(*)::integer,
         coalesce(
           (array_agg(sc.settings order by sc.id))[1],
           '{}'::jsonb
         )
    into v_settings_count, v_settings
    from public.salon_config sc;

  if v_settings_count > 1 then
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'salon_config_not_singleton',
            hint = 'contact_staff';
  end if;

  if v_settings_count = 0 or jsonb_typeof(v_settings) <> 'object' then
    v_settings := '{}'::jsonb;
  end if;

  -- Treat malformed or missing values as the documented defaults rather
  -- than allowing a JSON cast error to escape to a customer.
  v_allow_value := v_settings #> '{customerPortal,allowCancellations}';
  if jsonb_typeof(v_allow_value) = 'boolean' then
    v_allow_cancellations := v_allow_value = 'true'::jsonb;
  end if;

  if not v_allow_cancellations then
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'customerPortal.allowCancellations=false',
            hint = 'contact_staff';
  end if;

  v_hours_value := v_settings -> 'minCancellationHours';
  if jsonb_typeof(v_hours_value) = 'number'
     and (v_hours_value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' then
    begin
      v_min_cancellation_hours := (v_hours_value #>> '{}')::numeric;
      if v_min_cancellation_hours > 876000 then
        v_min_cancellation_hours := 24;
      end if;
    exception
      when numeric_value_out_of_range or invalid_text_representation then
        v_min_cancellation_hours := 24;
    end;
  end if;

  -- Work entirely in London wall time. Exactly on the deadline remains
  -- cancellable; only a request made after it is rejected.
  if (now() at time zone 'Europe/London')
       > v_earliest_start - (v_min_cancellation_hours * interval '1 hour') then
    raise exception 'cancellation_deadline_passed'
      using errcode = 'SDC02', hint = 'contact_staff';
  end if;

  update public.bookings b
     set status = 'Cancelled',
         cancel_reason = v_reason
   where b.id = any(v_booking_ids)
     and b.status = 'Booked';

  get diagnostics v_cancelled_count = row_count;

  if v_cancelled_count <> v_scope_count then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  target_booking_id := p_booking_id;
  booking_group_id := v_group_id;
  cancelled_booking_ids := v_booking_ids;
  cancelled_count := v_cancelled_count;
  cancelled_at := v_cancelled_at;
  return next;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid, text) from public;
revoke all on function public.cancel_customer_booking(uuid, text) from anon;
revoke all on function public.cancel_customer_booking(uuid, text) from authenticated;
grant execute on function public.cancel_customer_booking(uuid, text) to authenticated;
