-- ============================================================
-- Make the data-quality classifier local to one visit
--
-- The first version consulted booking_visit_backfill_review, which is a view
-- that aggregates across EVERY visit and booking. Called once per visit by the
-- customer projection, that turned a twelve-visit customer list into ~2.1
-- seconds (≈28ms per visit, almost all of it re-scanning the whole table).
-- Caught by EXPLAIN (ANALYZE, BUFFERS) at ~9,600 visits.
--
-- The review view stays as the staff reconciliation worklist, where a
-- whole-table scan is appropriate and infrequent. The classifier now derives
-- the same judgement from facts local to the visit it is asked about, so cost
-- is proportional to that visit's own children rather than to the table.
-- ============================================================

create or replace function public.booking_visit_data_quality(p_visit_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select * from public.booking_visits where id = p_visit_id
  ),
  children as (
    select b.status, b.payment, b.deposit_required, b.booking_date,
           b.visit_membership_state, d.human_id as dog_owner
      from public.bookings b
      left join public.dogs d on d.id = b.dog_id
     where b.visit_id = p_visit_id
  ),
  facts as (
    select
      (select count(*) from children where visit_membership_state = 'included') as n_included,
      (select count(*) from children c, v
        where c.visit_membership_state = 'included'
          and (c.booking_date <> v.booking_date
               or c.dog_owner is distinct from v.human_id)) as n_mismatched,
      -- A visit whose children mix still-open and terminal work was flagged
      -- at backfill and never resolved. Detected here from the visit's OWN
      -- children rather than by scanning the review view.
      (select count(*) from children
        where visit_membership_state = 'included'
          and status not in ('Cancelled','Completed')) as n_open,
      (select count(*) from children
        where visit_membership_state = 'included'
          and status in ('Cancelled','Completed')) as n_terminal,
      -- Per-dog money that disagrees within one visit.
      (select count(distinct coalesce(payment,'')) from children
        where visit_membership_state = 'included') as n_payment_kinds,
      (select count(distinct deposit_required) from children
        where visit_membership_state = 'included') as n_deposit_flags,
      (select count(*) from public.booking_deposit_money_reconciliations r
        where r.visit_id = p_visit_id and r.state = 'open') as n_open_deposit_recon,
      (select count(*) from public.booking_service_prepayment_reconciliations r
        where r.visit_id = p_visit_id and r.state = 'open') as n_open_prepay_recon,
      (select count(*) from public.booking_visit_deposits dp
        where dp.visit_id = p_visit_id
          and dp.state = 'reconciliation_required') as n_recon_deposit
  )
  select case
    when (select count(*) from v) = 0 then 'structurally_inconsistent'
    when facts.n_included = 0 then 'structurally_inconsistent'
    when facts.n_mismatched > 0 then 'structurally_inconsistent'
    when facts.n_open_deposit_recon > 0
      or facts.n_open_prepay_recon > 0
      or facts.n_recon_deposit > 0 then 'reconciliation_required'
    when (select runtime_generation from v) = 'visit_v1' then 'v1_authoritative'
    -- Commercial confirmation could not be inferred at backfill.
    when (select confirmation_state from v) = 'unconfirmed'
     and (select lifecycle_state from v) = 'active' then 'legacy_incomplete'
    -- Children disagree about whether the visit happened, or about money.
    when facts.n_open > 0 and facts.n_terminal > 0 then 'legacy_incomplete'
    when facts.n_included > 1
     and (facts.n_payment_kinds > 1 or facts.n_deposit_flags > 1) then 'legacy_incomplete'
    else 'legacy_trustworthy'
  end
  from facts;
$$;
revoke all on function public.booking_visit_data_quality(uuid) from public, anon, authenticated;

comment on function public.booking_visit_data_quality(uuid) is
  'Explicit authority level for ONE visit, derived only from that visit and its own children so cost does not grow with the table: v1_authoritative | legacy_trustworthy | legacy_incomplete | reconciliation_required | structurally_inconsistent. Read-only. booking_visit_backfill_review remains the staff worklist for the same conditions across all visits.';
