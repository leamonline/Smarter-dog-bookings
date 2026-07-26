-- ============================================================
-- Visit data quality — the honest authority classifier (Task 2, part 1)
--
-- Every projection needs to say how far a visit's data can be trusted, as an
-- explicit machine-readable status rather than as display wording. A screen
-- that only *phrases* uncertainty will eventually be re-worded by someone who
-- does not know the phrasing was load-bearing.
--
-- Five levels, most trustworthy first:
--   v1_authoritative     - created under the new policy; every commercial
--                          fact was recorded deliberately at the time.
--   legacy_trustworthy   - backfilled from a clean legacy group: one date,
--                          one owner, consistent statuses and money.
--   legacy_incomplete    - backfilled but something could not be inferred,
--                          e.g. commercial confirmation was left unresolved.
--   reconciliation_required - real money needs a staff decision (open deposit
--                          liability or service-prepayment reconciliation).
--   structurally_inconsistent - the aggregate itself does not hold together:
--                          a child on a different date, a child owned by a
--                          different customer, or no identifiable children.
--
-- Anything below v1_authoritative/legacy_trustworthy must disable actions
-- that need certainty. The classifier is READ-ONLY: it repairs nothing.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md (Task 2)
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
    select b.*, d.human_id as dog_owner
      from public.bookings b
      left join public.dogs d on d.id = b.dog_id
     where b.visit_id = p_visit_id
  ),
  facts as (
    select
      (select count(*) from children where visit_membership_state = 'included') as n_included,
      -- A child whose date or owner disagrees with the visit means the
      -- aggregate is not describing one real appointment.
      (select count(*) from children c, v
        where c.visit_membership_state = 'included'
          and (c.booking_date <> v.booking_date
               or c.dog_owner is distinct from v.human_id)) as n_mismatched,
      -- Money that genuinely needs a person to decide.
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
    -- A confirmed v1 visit is authoritative only when the command path froze
    -- every commercial snapshot that makes later policy decisions
    -- reproducible. Merely writing runtime_generation='visit_v1' is not an
    -- authority claim.
    when (select runtime_generation from v) = 'visit_v1'
     and (select confirmation_state from v) = 'confirmed'
     and (
       (select commercial_eligibility_at from v) is null
       or (select eligibility_policy_code from v) is null
       or (select policy_code from v) is null
       or (select customer_change_deadline_at from v) is null
       or (select terms_publication_id from v) is null
     ) then 'structurally_inconsistent'
    when facts.n_open_deposit_recon > 0
      or facts.n_open_prepay_recon > 0
      or facts.n_recon_deposit > 0 then 'reconciliation_required'
    when (select runtime_generation from v) = 'visit_v1' then 'v1_authoritative'
    -- A legacy visit whose commercial confirmation could not be inferred at
    -- backfill is honestly incomplete, not merely "unconfirmed".
    when (select confirmation_state from v) = 'unconfirmed'
     and (select lifecycle_state from v) = 'active' then 'legacy_incomplete'
    when exists (select 1 from public.booking_visit_backfill_review r
                  where (select id from v) = any (r.visit_ids)) then 'legacy_incomplete'
    else 'legacy_trustworthy'
  end
  from facts;
$$;
revoke all on function public.booking_visit_data_quality(uuid) from public, anon, authenticated;

comment on function public.booking_visit_data_quality(uuid) is
  'Explicit authority level for one visit: v1_authoritative | legacy_trustworthy | legacy_incomplete | reconciliation_required | structurally_inconsistent. A confirmed v1 row is structurally inconsistent when its eligibility, policy, deadline or Terms snapshot is missing. Read-only — never repairs, mutates or writes. Projections must gate certainty-requiring actions on this rather than on display wording.';

-- Children that cannot be rendered safely. Reported SEPARATELY so one broken
-- row can never make an entire multi-dog visit disappear from a customer's
-- list — the visit is shown with its identifiable dogs and an honest note.
create or replace function public.booking_visit_malformed_children(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'bookingId', b.id,
    'reason', case
      when d.id is null then 'dog_record_missing'
      when d.human_id is distinct from v.human_id then 'dog_belongs_to_another_customer'
      when b.booking_date <> v.booking_date then 'child_on_a_different_date'
      when nullif(trim(coalesce(b.slot,'')),'') is null then 'no_arrival_time'
      when nullif(trim(coalesce(b.service,'')),'') is null then 'no_service'
      else 'unknown'
    end) order by b.id), '[]'::jsonb)
  from public.bookings b
  join public.booking_visits v on v.id = b.visit_id
  left join public.dogs d on d.id = b.dog_id
  where b.visit_id = p_visit_id
    and b.visit_membership_state = 'included'
    and (d.id is null
         or d.human_id is distinct from v.human_id
         or b.booking_date <> v.booking_date
         or nullif(trim(coalesce(b.slot,'')),'') is null
         or nullif(trim(coalesce(b.service,'')),'') is null);
$$;
revoke all on function public.booking_visit_malformed_children(uuid) from public, anon, authenticated;

-- ── Ledger totals, counted once ─────────────────────────────────────
--
-- Derived from immutable events only. The deposit is £10 per VISIT, so it is
-- never summed per dog; a refund obligation is netted only while unsettled;
-- transfer legs cancel out by construction because the out leg belongs to the
-- source visit and the in leg to the destination.
create or replace function public.booking_visit_money_summary(p_visit_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with l as (
    select * from public.booking_financial_ledger where visit_id = p_visit_id
  )
  select jsonb_build_object(
    'depositReceivedPence',
      coalesce((select sum(amount_pence) from l where event_kind = 'deposit_received'), 0),
    'depositRetainedPence',
      coalesce((select sum(amount_pence) from l where event_kind = 'deposit_retained'), 0),
    'creditIssuedPence',
      coalesce((select sum(amount_pence) from l where event_kind = 'credit_issued'), 0),
    'creditAppliedPence',
      coalesce((select sum(amount_pence) from l where event_kind = 'credit_applied'), 0),
    -- Only obligations that have NOT been settled or cancelled still count as
    -- owed. Settling one must not leave it double-counted as both due and paid.
    'refundOutstandingPence',
      coalesce((select sum(o.amount_pence) from l o
                 where o.event_kind = 'refund_due'
                   and not exists (select 1 from public.booking_financial_ledger s
                                    where s.settles_event_id = o.id)), 0),
    'refundPaidPence',
      coalesce((select sum(amount_pence) from l where event_kind = 'refund_paid'), 0),
    'prepaymentTransferredOutPence',
      coalesce((select sum(amount_pence) from l
                 where event_kind = 'service_prepayment_transferred'
                   and related_visit_id is not null
                   and visit_id = p_visit_id
                   and reason like '%out of%'), 0),
    'servicePaymentsPence',
      coalesce((select sum(p.amount_pence) from public.booking_visit_service_payments p
                 where p.visit_id = p_visit_id), 0)
  );
$$;
revoke all on function public.booking_visit_money_summary(uuid) from public, anon, authenticated;

comment on function public.booking_visit_money_summary(uuid) is
  'Visit money derived from immutable ledger events only. A refund counts as outstanding only while unsettled, so settling it never double-counts as both due and paid. The £10 deposit is per visit and is never summed per dog.';

-- ── Indexes supporting the projection queries ───────────────────────
--
-- The customer list filters by owner and orders by date; the staff day view
-- filters by date; the attention queue looks for open reconciliations and
-- unsettled obligations regardless of age.

create index if not exists booking_visits_human_lifecycle_date_idx
  on public.booking_visits (human_id, lifecycle_state, booking_date desc);

create index if not exists booking_visits_date_lifecycle_idx
  on public.booking_visits (booking_date, lifecycle_state);

-- Partial indexes for the attention queue: the open sets are small, so these
-- stay tiny while removing a full scan of the reconciliation tables.
create index if not exists booking_deposit_money_recon_open_idx
  on public.booking_deposit_money_reconciliations (visit_id)
  where state = 'open';

create index if not exists booking_service_prepay_recon_open_idx
  on public.booking_service_prepayment_reconciliations (visit_id)
  where state = 'open';

-- An unsettled refund obligation is found by its absence of a settlement, so
-- index the settlement link as well as the obligation kind.
create index if not exists booking_financial_ledger_settles_idx
  on public.booking_financial_ledger (settles_event_id)
  where settles_event_id is not null;

create index if not exists booking_financial_ledger_refund_due_idx
  on public.booking_financial_ledger (human_id, visit_id)
  where event_kind = 'refund_due';

-- Deposits awaiting a decision, for the staff queue.
create index if not exists booking_visit_deposits_awaiting_idx
  on public.booking_visit_deposits (due_at)
  where state in ('awaiting_terms','awaiting_payment');
