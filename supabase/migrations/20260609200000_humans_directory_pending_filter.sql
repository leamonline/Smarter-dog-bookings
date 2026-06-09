-- ============================================================
-- New-customer approvals via the Humans directory, not the to-do list
--
-- WHY
-- Pending self-signups were surfaced as a salon_todos "signup_review" row.
-- We're moving that to a count badge on the Humans nav button + a
-- "New customers" filter in the directory. So:
--   1. search_humans_directory gains a p_pending flag → the directory can
--      list just the humans awaiting approval (approved_at NULL +
--      signup_submitted_at set; archived rows already excluded).
--   2. submit_customer_signup stops creating the signup_review to-do.
--   3. Existing signup_review to-dos are removed (obsolete).
--
-- The badge count itself is a direct staff query (staff_select_humans RLS),
-- no RPC needed. approve/reject keep their (now no-op) to-do cleanup — left
-- as-is to avoid churn.
-- ============================================================

-- ── 1. search_humans_directory: + p_pending ────────────────
-- Adding a parameter changes the signature, so DROP + CREATE (the old
-- 9-arg overload would otherwise linger and make calls ambiguous).
drop function if exists public.search_humans_directory(text, boolean, boolean, boolean, boolean, text, text, integer, integer);

create or replace function public.search_humans_directory(
  p_search   text    default null,
  p_flagged  boolean default false,
  p_no_dogs  boolean default false,
  p_no_phone boolean default false,
  p_whatsapp boolean default false,
  p_pending  boolean default false,   -- new self-signups awaiting approval
  p_letter   text    default null,
  p_sort     text    default 'first',
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  filtered as (
    select h.*
    from humans h, q
    where h.archived_at is null
      and (
        q.term is null
        or h.name    ilike '%' || q.term || '%'
        or h.surname ilike '%' || q.term || '%'
        or h.phone   ilike '%' || q.term || '%'
        or h.email   ilike '%' || q.term || '%'
        or exists (
          select 1 from dogs d
          where d.human_id = h.id
            and (d.name ilike '%' || q.term || '%'
              or d.breed ilike '%' || q.term || '%')
        )
      )
      and (not p_flagged  or coalesce(h.history_flag, '') <> '')
      and (not p_no_phone or coalesce(h.phone, '') = '')
      and (not p_whatsapp or h.whatsapp is true)
      and (not p_pending  or (h.approved_at is null and h.signup_submitted_at is not null))
      and (not p_no_dogs  or not exists (
        select 1 from dogs d where d.human_id = h.id
      ))
      and (
        p_letter is null or p_letter = ''
        or (p_letter = '#' and (h.name is null or h.name !~ '^[A-Za-z]'))
        or (p_letter <> '#' and upper(left(coalesce(h.name, ''), 1)) = upper(p_letter))
      )
  ),
  ranked as (
    select f.*,
      row_number() over (
        order by
          case when p_sort = 'last' then lower(coalesce(f.surname, '')) end asc,
          case when p_sort = 'last' then lower(coalesce(f.name, '')) end asc,
          case when p_sort <> 'last' then lower(coalesce(f.name, '')) end asc,
          case when p_sort <> 'last' then lower(coalesce(f.surname, '')) end asc,
          f.id asc
      ) as rn
    from filtered f
  )
  select jsonb_build_object(
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(p) - 'rn' order by p.rn)
        from (
          select * from ranked
          where rn > greatest(p_offset, 0)
            and rn <= greatest(p_offset, 0) + greatest(p_limit, 0)
        ) p
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered),
    'letters', coalesce(
      (
        select array_agg(distinct l order by l)
        from (
          select case
            when name is null or name !~ '^[A-Za-z]' then '#'
            else upper(left(name, 1))
          end as l
          from filtered
        ) t
      ),
      array[]::text[]
    )
  );
$$;

comment on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) is
  'Humans Directory server query: search + filter flags (flagged / no-dogs / no-phone / whatsapp / pending-new-customer) + sort + initial letter + limit/offset. Returns { rows, total, letters }. security invoker so humans/dogs RLS applies.';

revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) from public;
revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) from anon;
grant execute on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) to authenticated;

-- ── 2. submit_customer_signup: drop the to-do creation ──────
create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.submit_customer_signup(jsonb, jsonb) is
  'Finalises a Join the Pack signup: writes owner details + policy agreement onto the caller''s shell human and inserts dogs, atomically, stamping signup_submitted_at. SECURITY DEFINER; touches only customer-permitted columns. (Staff are notified via the Humans directory badge/filter, not a to-do.)';

-- ── 3. Remove obsolete signup_review to-dos ─────────────────
delete from public.salon_todos where kind = 'signup_review';
