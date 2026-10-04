-- submit_customer_signup: detect a name collision by looking, not by catching
-- a constraint production does not have.
--
-- WHY
--
-- 20260902150000_signup_claims_existing_customer made a self-signup whose
-- typed name matches an existing customer submit as a CLAIM on that record
-- (claims_human_id) instead of dead-ending. It detected the collision by
-- catching unique_violation from unique(name, surname) on humans. Production
-- dropped that constraint in April 2026 (relax_human_uniqueness, never
-- committed), so on the live database the handler has never run: the shell
-- simply took the real name, became a silent duplicate of the existing
-- customer, and returned {"claims_existing": false}. Staff never saw the
-- "says they're an existing customer" prompt the feature was built for.
--
-- 20261004120000_reconcile_humans_with_prod brings the committed schema in
-- line with production, and pgTAP 184 immediately showed the gap. This
-- migration keeps the intended behaviour by finding the matching record
-- explicitly before the write. Everything else is unchanged: the customer
-- still writes only their own shell, never touches phone / customer_user_id
-- / history_flag, the claimed record is not read back to them, and staff
-- still resolve the claim through link_pending_signup().
--
-- Matching is exact on (name, surname), as the constraint was. Where more
-- than one record carries the name, the oldest non-signup record wins; the
-- claim is only a pointer for staff, who confirm the link by hand.

create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
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

  -- The typed name belongs to a record already on the books? That is almost
  -- always the same person on a new number. Keep the placeholder name, save
  -- everything else exactly as a normal signup would, and point the shell at
  -- the record it claims so staff can link rather than re-key.
  select h.id into v_existing_id
  from public.humans h
  where h.name = v_name
    and h.surname = v_surname
    and h.id <> v_human.id
  order by (h.source is distinct from 'self_signup') desc, h.created_at asc, h.id asc
  limit 1;

  if v_existing_id is null then
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
  else
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
  end if;

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
  'Finalises a Join the Pack signup on the caller''s own pending shell: owner details + policy agreement + dogs, atomically. If the typed name exactly matches an existing customer (looked up, not inferred from a constraint), keeps the placeholder name, records claims_human_id and still submits — staff link it with link_pending_signup(). Returns {"claims_existing": bool}. SECURITY DEFINER; touches only customer-permitted columns.';

comment on column public.humans.claims_human_id is
  'Self-signup only: the existing customer record this pending shell says it is (set by submit_customer_signup when the typed name exactly matches another record). Staff resolve it with link_pending_signup(); the shell is deleted on link, so this never outlives the pending state.';

revoke all on function public.submit_customer_signup(jsonb, jsonb) from public;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from anon;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from authenticated;
grant execute on function public.submit_customer_signup(jsonb, jsonb) to authenticated;
