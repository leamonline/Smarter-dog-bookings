-- One-off list of customers a past no-show would put on a deposit.
--
-- THIS IS NOT A MIGRATION. Nothing in CI, and nothing that deploys the
-- website, runs this file. Do not move it under supabase/migrations/.
-- Do not run the update until Leam has read the list and decided.
--
-- Running this file as it stands only prints two lists. It does not change
-- any row. The update is in a comment at the bottom, and it only works
-- after migration 20261122160000_no_show_sets_deposit_required.sql is
-- already on the database (it writes the two columns that migration adds).
--
-- Who is listed: a customer with at least one booking whose status is
-- No-show, and whose deposit tag is still off. A cancellation is not
-- included. Someone already tagged is listed separately and would not be
-- changed. Phone numbers, email addresses and street addresses are not
-- selected.
--
-- The update, if Leam asks for it, tags exactly the people in the first
-- list. It records the earliest no-show we still have for them. The time
-- it stores is when this script ran, not when the dog was marked, because
-- that moment was not kept. Staff can still switch the tag off afterwards.

-- ── 1. People a backfill would put on a deposit ──────────────────────
select
  h.id,
  h.name,
  h.surname,
  h.archived_at is not null as archived,
  count(*) as no_show_count,
  min(b.booking_date) as earliest_no_show,
  max(b.booking_date) as latest_no_show,
  string_agg(distinct d.name, ', ' order by d.name) as dogs
from public.bookings b
join public.dogs d on d.id = b.dog_id
join public.humans h on h.id = d.human_id
where b.status = 'No-show'
  and h.deposit_required = false
group by h.id, h.name, h.surname, h.archived_at
order by latest_no_show desc nulls last, h.surname, h.name;

-- ── 2. People who already require a deposit and also have a no-show ──
-- Shown so the two groups can be compared. The update below does not
-- touch them, and does not replace a reason staff already wrote.
select
  h.id,
  h.name,
  h.surname,
  count(*) as no_show_count,
  min(b.booking_date) as earliest_no_show,
  max(b.booking_date) as latest_no_show
from public.bookings b
join public.dogs d on d.id = b.dog_id
join public.humans h on h.id = d.human_id
where b.status = 'No-show'
  and h.deposit_required = true
group by h.id, h.name, h.surname
order by h.surname, h.name;

-- ── Apply only if Leam has agreed, and only after the migration ──────
-- Uncomment the transaction, read the RETURNING rows, then COMMIT.
-- Add `and h.id in (...)` if the decision is to tag some of the list
-- and leave others. A customer with no dog name still gets a sentence;
-- the wording matches flag_deposit_after_no_show().
--
-- begin;
--
-- update public.humans h
--    set deposit_required = true,
--        deposit_required_reason = c.reason,
--        deposit_required_set_at = statement_timestamp(),
--        updated_at = statement_timestamp()
--   from (
--     select distinct on (d.human_id)
--            d.human_id,
--            'Deposit required after a no-show'
--              || case
--                   when nullif(btrim(coalesce(d.name, '')), '') is not null
--                     then ': ' || btrim(d.name)
--                   else ''
--                 end
--              || ' on '
--              || to_char(b.booking_date, 'FMDD')
--              || ' '
--              || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from b.booking_date)::integer]
--              || ' '
--              || to_char(b.booking_date, 'YYYY') as reason
--       from public.bookings b
--       join public.dogs d on d.id = b.dog_id
--      where b.status = 'No-show'
--      order by d.human_id, b.booking_date, b.id
--   ) c
--  where h.id = c.human_id
--    and h.deposit_required = false
-- returning h.id, h.name, h.surname, h.deposit_required_reason;
--
-- commit;
