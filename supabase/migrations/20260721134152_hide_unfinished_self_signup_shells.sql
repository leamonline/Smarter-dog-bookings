-- Keep temporary Join the Pack onboarding shells out of the staff Humans
-- directory. create_pending_customer() must create the row before onboarding
-- can resume across sessions, but it is not a customer awaiting staff action
-- until submit_customer_signup() stamps signup_submitted_at. Approved legacy
-- self-signups remain visible even if their submission timestamp is absent.

create or replace function public.search_humans_directory(
  p_search   text    default null,
  p_flagged  boolean default false,
  p_no_dogs  boolean default false,
  p_no_phone boolean default false,
  p_whatsapp boolean default false,
  p_pending  boolean default false,
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
        h.source is distinct from 'self_signup'
        or h.approved_at is not null
        or h.signup_submitted_at is not null
      )
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
  'Humans Directory server query. Excludes unfinished self-signup onboarding shells; supports search, filters, sort, initial letter and pagination. Returns { rows, total, letters }. SECURITY INVOKER so humans/dogs RLS applies.';

revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) from public;
revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) from anon;
grant execute on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, boolean, text, text, integer, integer) to authenticated;
