-- ============================================================
-- search_humans_directory — one server-side query for the Humans Directory
--
-- The directory holds ~800 humans but only the first 50 are on the client
-- until you page through, so search, filters, sort, the A–Z jump and the
-- "Showing X of Y" count must ALL run server-side or they silently miss the
-- other ~750 records. This function is that single combinable query: it
-- takes the search term, the four filter flags, the sort mode, an optional
-- initial letter and a limit/offset, and returns one JSON object:
--
--   { rows: [...page of humans...], total: <int>, letters: [<initials>] }
--
-- - rows    : the requested page, already ordered by the chosen sort.
-- - total   : how many humans match the search + filters (for the footer).
-- - letters : which initial letters have at least one match (so the A–Z
--             rail can disable the empty ones). '#' = a non-alphabetic
--             initial.
--
-- "No dogs" is the only filter that can't be expressed in PostgREST (it's an
-- anti-join), which is the main reason this lives in SQL. security invoker
-- so the humans/dogs RLS (staff-only) still applies; EXECUTE is revoked from
-- anon and granted to authenticated.
-- ============================================================

create or replace function public.search_humans_directory(
  p_search   text    default null,
  p_flagged  boolean default false,
  p_no_dogs  boolean default false,
  p_no_phone boolean default false,
  p_whatsapp boolean default false,
  p_letter   text    default null,    -- 'A'..'Z', '#' (non-alpha), or null
  p_sort     text    default 'first', -- 'first' = name,surname ; 'last' = surname,name
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

comment on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, text, text, integer, integer) is
  'Humans Directory server query: search (name/surname/phone/email + dog name/breed) + filter flags (flagged / no-dogs / no-phone / whatsapp) + sort (first|last) + initial letter + limit/offset. Returns { rows, total, letters }. security invoker so humans/dogs RLS applies.';

revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, text, text, integer, integer) from public;
revoke all on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, text, text, integer, integer) from anon;
grant execute on function public.search_humans_directory(text, boolean, boolean, boolean, boolean, text, text, integer, integer) to authenticated;
