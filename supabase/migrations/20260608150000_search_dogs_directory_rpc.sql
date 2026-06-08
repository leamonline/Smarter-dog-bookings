-- ============================================================
-- search_dogs_directory — one server-side query for the Dogs Directory
--
-- Mirrors search_humans_directory. The dogs table outgrows the 50-row client
-- page, so search, the size/alert/incomplete filters, the Name|Recent sort,
-- the A–Z jump and the "Showing X of Y" count must ALL run server-side or they
-- silently miss every dog past the first page. This function is that single
-- combinable query; it returns one JSON object:
--
--   { rows: [...page of dogs (+ joined owner fields)...], total, letters }
--
-- - rows    : the requested page, ordered by the chosen sort. Each dog also
--             carries owner_name / owner_surname / owner_phone / owner_whatsapp
--             from the join, so the card can render the owner and the tel:/
--             wa.me links with no second round-trip (the dog row alone only
--             has human_id).
-- - total   : how many dogs match the search + filters (for the footer).
-- - letters : which initial letters of the dog NAME have at least one match
--             (so the A–Z rail can disable the empty ones). '#' = a
--             non-alphabetic initial.
--
-- Search spans the dog name/breed + owner name/surname/phone. Filters: size
-- ('small'/'medium'/'large', or 'unset' = size is null), alert (the alerts
-- array is non-empty) and incomplete (size is null OR the breed is blank).
-- Archived dogs (archived_at not null) are always excluded.
--
-- NOTE on 'incomplete': the client helper isIncompleteDogProfile also treats a
-- missing owner as incomplete, but dogs.human_id is NOT NULL with an FK to
-- humans, so the join here always resolves an owner — that branch can never
-- fire server-side. The RPC therefore drops it (it was a client-side
-- pagination artifact, not a real data gap).
--
-- security invoker so the dogs/humans RLS (staff-only) still applies; EXECUTE
-- is revoked from anon/public and granted to authenticated.
-- ============================================================

create or replace function public.search_dogs_directory(
  p_search     text    default null,
  p_size       text    default null,    -- 'small'|'medium'|'large'|'unset'|null(=any)
  p_alert      boolean default false,
  p_incomplete boolean default false,
  p_letter     text    default null,    -- 'A'..'Z', '#' (non-alpha), or null
  p_sort       text    default 'name',  -- 'name' = lower(name) ; 'recent' = created_at desc
  p_limit      integer default 50,
  p_offset     integer default 0
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
    select
      d.*,
      h.name     as owner_name,
      h.surname  as owner_surname,
      h.phone    as owner_phone,
      h.whatsapp as owner_whatsapp
    from dogs d
    left join humans h on h.id = d.human_id
    cross join q
    where d.archived_at is null
      and (
        q.term is null
        or d.name    ilike '%' || q.term || '%'
        or d.breed   ilike '%' || q.term || '%'
        or h.name    ilike '%' || q.term || '%'
        or h.surname ilike '%' || q.term || '%'
        or h.phone   ilike '%' || q.term || '%'
      )
      and (
        p_size is null or p_size = ''
        or (p_size = 'unset' and d.size is null)
        or (p_size <> 'unset' and d.size = p_size)
      )
      and (not p_alert or coalesce(cardinality(d.alerts), 0) > 0)
      and (not p_incomplete or d.size is null or btrim(coalesce(d.breed, '')) = '')
      and (
        p_letter is null or p_letter = ''
        or (p_letter = '#' and (d.name is null or d.name !~ '^[A-Za-z]'))
        or (p_letter <> '#' and upper(left(coalesce(d.name, ''), 1)) = upper(p_letter))
      )
  ),
  ranked as (
    select f.*,
      row_number() over (
        order by
          case when p_sort = 'recent' then f.created_at end desc,
          case when p_sort <> 'recent' then lower(coalesce(f.name, '')) end asc,
          f.created_at desc,
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

comment on function public.search_dogs_directory(text, text, boolean, boolean, text, text, integer, integer) is
  'Dogs Directory server query: search (dog name/breed + owner name/surname/phone) + filters (size small|medium|large|unset / alert / incomplete) + sort (name|recent) + initial letter + limit/offset. Excludes archived dogs. Returns { rows (with joined owner fields), total, letters }. security invoker so dogs/humans RLS applies.';

revoke all on function public.search_dogs_directory(text, text, boolean, boolean, text, text, integer, integer) from public;
revoke all on function public.search_dogs_directory(text, text, boolean, boolean, text, text, integer, integer) from anon;
grant execute on function public.search_dogs_directory(text, text, boolean, boolean, text, text, integer, integer) to authenticated;
