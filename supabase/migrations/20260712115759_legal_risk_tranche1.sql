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
