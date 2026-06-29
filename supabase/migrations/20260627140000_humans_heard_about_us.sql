-- ============================================================
-- "Where did you hear about us?" — referral source at customer self-signup
--
-- One nullable column on humans stores the chosen dropdown option OR the
-- free text the customer typed for "Other". It's asked once during signup and
-- shown read-only to staff afterwards (never editable in the customer portal).
--
-- Existing rows default to NULL (active customers / staff-created humans), so
-- this is a safe additive change. Apply to prod BEFORE the front-end starts
-- sending heard_about_us through submit_customer_signup.
--
-- No prevent_customer_critical_column_update change: that trigger is a
-- blacklist (customer_user_id / history_flag / phone), so a brand-new column
-- is writable by the signup RPC without touching it.
-- ============================================================

alter table public.humans
  add column if not exists heard_about_us text;

comment on column public.humans.heard_about_us is
  'Referral source captured at customer self-signup ("Where did you hear about us?"). Stores the chosen option label or the free text typed for "Other". Set once at signup, shown read-only to staff. NULL for pre-feature rows and staff-created humans.';

-- Re-create submit_customer_signup (idempotent CREATE OR REPLACE) — a faithful
-- copy of the live function with heard_about_us added to the owner UPDATE.
create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_human    public.humans%rowtype;
  v_name     text;
  v_surname  text;
  v_address  text;
  v_elem     jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_human from public.humans h where h.customer_user_id = v_uid limit 1;
  if v_human.id is null then
    raise exception 'No account is linked to set up' using errcode = '28000';
  end if;

  v_name    := trim(coalesce(p_owner->>'name', ''));
  v_surname := trim(coalesce(p_owner->>'surname', ''));
  v_address := trim(coalesce(p_owner->>'address', ''));
  if v_name = '' or v_surname = '' or v_address = '' then
    raise exception 'Please give your name and address.' using errcode = 'P0001';
  end if;

  if p_dogs is null or jsonb_typeof(p_dogs) <> 'array' or jsonb_array_length(p_dogs) < 1 then
    raise exception 'Please tell us about at least one dog.' using errcode = 'P0001';
  end if;

  begin
    update public.humans h set
      name                 = v_name,
      surname              = v_surname,
      address              = v_address,
      postcode             = nullif(trim(coalesce(p_owner->>'postcode', '')), ''),
      email                = nullif(trim(coalesce(p_owner->>'email', '')), ''),
      sms                  = coalesce((p_owner->>'sms')::boolean, false),
      whatsapp             = coalesce((p_owner->>'whatsapp')::boolean, false),
      heard_about_us       = nullif(trim(coalesce(p_owner->>'heard_about_us', '')), ''),
      policies_accepted_at = now(),
      policies_version     = nullif(trim(coalesce(p_owner->>'policies_version', '')), ''),
      signup_submitted_at  = now()
    where h.id = v_human.id;
  exception when unique_violation then
    raise exception 'We may already have you on file under that name — please contact the salon.'
      using errcode = 'P0001';
  end;

  for v_elem in select * from jsonb_array_elements(p_dogs) loop
    if trim(coalesce(v_elem->>'name', '')) = '' or trim(coalesce(v_elem->>'breed', '')) = '' then
      raise exception 'Each dog needs a name and breed.' using errcode = 'P0001';
    end if;
    insert into public.dogs (
      human_id, name, breed, size, sex, dob,
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
        array(select jsonb_array_elements_text(
          case when jsonb_typeof(v_elem->'alerts') = 'array' then v_elem->'alerts' else '[]'::jsonb end)),
        '{}'::text[])
    );
  end loop;
end;
$function$;
