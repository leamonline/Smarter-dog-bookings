-- ============================================================
-- Self-signup that collides with an existing customer: record the claim,
-- don't dead-end the customer.
--
-- Before: an existing customer who signs up to the portal with a NEW number
-- gets a "New member / Pending 07…" shell. When they type their real name on
-- the profile form, submit_customer_signup hits unique(name, surname) on
-- their own existing record and raises "We may already have you on file
-- under that name — please contact the salon." Nothing is saved, and the
-- salon then hits humans_phone_unique from the other side (fixed for staff
-- by link_pending_signup, migration 20260902120000).
--
-- After: on that collision the RPC finds the existing record with that
-- exact (name, surname), stamps it onto the shell as `claims_human_id`,
-- saves everything else the customer typed (address, email, policies, dogs)
-- onto the shell exactly as a normal signup would, and marks the signup
-- submitted. The customer lands on the usual "we're reviewing" hold with
-- tailored copy. Staff see "Says they're an existing customer: <name>" on
-- the shell's card and link it in one tap via link_pending_signup(), which
-- moves the verified number, portal login and dogs onto the real record.
--
-- Security posture is unchanged: the customer still writes only their own
-- shell (matched on customer_user_id = auth.uid()), still never touches
-- phone / customer_user_id / history_flag, and cannot read or alter the
-- record they claim — the claim is a pointer for staff, and the actual
-- link stays behind is_staff() in link_pending_signup().
-- ============================================================

alter table public.humans
  add column if not exists claims_human_id uuid references public.humans(id) on delete set null;

comment on column public.humans.claims_human_id is
  'Self-signup only: the existing customer record this pending shell says it is (set by submit_customer_signup when the typed name collides with unique(name, surname)). Staff resolve it with link_pending_signup(); the shell is deleted on link, so this never outlives the pending state.';

-- Return type changes (void → jsonb), so the old signature must go first.
drop function if exists public.submit_customer_signup(jsonb, jsonb);

create function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns jsonb
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
  v_breed text;
  v_existing_id uuid;
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
    -- The typed name belongs to a record already on the books. That is
    -- almost always the same person on a new number. Keep the placeholder
    -- name (the real one cannot be stored twice), save everything else
    -- exactly as a normal signup would, and point the shell at the record
    -- it claims so staff can link rather than re-key.
    select h.id into v_existing_id
    from public.humans h
    where h.name = v_name
      and h.surname = v_surname
      and h.id <> v_human.id
    limit 1;

    if v_existing_id is null then
      raise exception 'We may already have you on file under that name — please contact the salon.'
        using errcode = 'P0001';
    end if;

    update public.humans h
    set address = v_address,
        postcode = nullif(trim(coalesce(p_owner->>'postcode', '')), ''),
        email = nullif(trim(coalesce(p_owner->>'email', '')), ''),
        sms = coalesce((p_owner->>'sms')::boolean, false),
        whatsapp = coalesce((p_owner->>'whatsapp')::boolean, false),
        heard_about_us = nullif(trim(coalesce(p_owner->>'heard_about_us', '')), ''),
        policies_accepted_at = now(),
        policies_version = nullif(trim(coalesce(p_owner->>'policies_version', '')), ''),
        signup_submitted_at = now(),
        claims_human_id = v_existing_id
    where h.id = v_human.id;
  end;

  for v_elem in select * from jsonb_array_elements(p_dogs) loop
    v_breed := trim(coalesce(v_elem->>'breed', ''));
    if trim(coalesce(v_elem->>'name', '')) = '' or v_breed = '' then
      raise exception 'Each dog needs a name and breed.' using errcode = 'P0001';
    end if;

    insert into public.dogs (
      human_id, name, breed, reported_size, size, sex, dob,
      microchip, neutered, vet, colour, groom_notes, alerts
    ) values (
      v_human.id,
      trim(v_elem->>'name'),
      v_breed,
      nullif(trim(lower(coalesce(v_elem->>'size', ''))), ''),
      public.derive_canonical_dog_size(v_breed),
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

  -- Only a boolean goes back: the customer typed the name themselves, but
  -- nothing about the claimed record is disclosed.
  return jsonb_build_object('claims_existing', v_existing_id is not null);
end;
$$;

comment on function public.submit_customer_signup(jsonb, jsonb) is
  'Finalises a Join the Pack signup on the caller''s own pending shell: owner details + policy agreement + dogs, atomically. If the typed name collides with an existing customer, keeps the placeholder name, records claims_human_id and still submits — staff link it with link_pending_signup(). Returns {"claims_existing": bool}. SECURITY DEFINER; touches only customer-permitted columns.';

revoke all on function public.submit_customer_signup(jsonb, jsonb) from public;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from anon;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from authenticated;
grant execute on function public.submit_customer_signup(jsonb, jsonb) to authenticated;
