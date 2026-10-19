-- Structured reason codes for create_customer_booking_group's account refusals (#1006).
--
-- Migration 20260826120000 made every booking gate state its reason in the
-- exception's DETAIL field, and mapDenialReason prefers that over guessing from
-- the prose. This RPC's four account-state refusals were left out, so the
-- frontend recognised them by message only. This migration adds the code
-- alongside the existing message for exactly those four:
--
--   awaiting approval        P0001  detail = 'awaiting_approval'
--   profile incomplete       P0001  detail = 'profile_incomplete'
--   dog size unconfirmed     22023  detail = 'dog_size_unconfirmed'
--   dog not on this account  42704  detail = 'dog_not_owned'
--
-- Nothing else changes: every message, every SQLSTATE, every check and its
-- order, the locks and the insert are copied verbatim from the latest
-- definition (20260712115759_legal_risk_tranche1.sql). Idempotent: create or
-- replace, then the same revoke/grant block.

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
      using errcode = 'P0001', detail = 'awaiting_approval';
  end if;

  if coalesce(trim(v_name), '') = ''
     or coalesce(trim(v_surname), '') = ''
     or coalesce(trim(v_address), '') = ''
     or v_policies_at is null then
    raise exception 'Please complete your profile (name, address and policy agreement) before booking'
      using errcode = 'P0001', detail = 'profile_incomplete';
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
        using errcode = '42704', detail = 'dog_not_owned';
    end if;

    if v_dog_size is null then
      raise exception 'dog_size_unconfirmed'
        using errcode = '22023', detail = 'dog_size_unconfirmed';
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
