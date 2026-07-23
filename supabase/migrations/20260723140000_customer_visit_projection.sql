-- ============================================================
-- Customer visit projection (Task 2, part 2) — READ-ONLY
--
-- One record per visit, every identifiable dog nested in deterministic order,
-- and actions taken from server-calculated capabilities. Nothing here
-- creates a visit, repairs a backfill or writes a financial row.
--
-- SECURITY DEFINER is used deliberately and is justified below; ownership is
-- proved explicitly on every row rather than assumed.
--
-- Plan: docs/superpowers/plans/2026-07-23-path-b-execution-plan.md (Task 2)
-- ============================================================

-- ── Customer-safe wording for an authority level ────────────────────
--
-- The machine-readable level stays internal. The customer sees plain language
-- and never an implementation label, a staff note or internal reasoning.
create or replace function smarter_dog_private.customer_quality_note(p_quality text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_quality
    when 'v1_authoritative' then null
    when 'legacy_trustworthy' then null
    when 'legacy_incomplete' then
      'We''re double-checking the details of this appointment. It''s still booked — message the team if anything looks wrong.'
    when 'reconciliation_required' then
      'There''s something to sort out on this booking. The team will be in touch.'
    when 'structurally_inconsistent' then
      'Something doesn''t look right with this booking. Please message the team.'
    else null
  end;
$$;
revoke all on function smarter_dog_private.customer_quality_note(text) from public, anon, authenticated;

-- ── The projection ──────────────────────────────────────────────────
--
-- SECURITY DEFINER justification: the underlying tables (booking_visits,
-- booking_visit_deposits, booking_financial_ledger) deliberately grant NO
-- access to `authenticated` at all — customers must never read them directly,
-- and adding customer RLS policies to money tables would be a much larger
-- attack surface than one function that filters by auth.uid(). The function
-- therefore derives the owner from auth.uid() itself and every row is scoped
-- to that human; there is no caller-supplied identity to spoof.
create or replace function public.list_customer_booking_visits(
  p_include_history boolean default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  v_show_history boolean;
  v_result jsonb;
begin
  -- Ownership is derived, never passed in.
  select h.id into v_human
    from public.humans h
   where h.customer_user_id = (select auth.uid())
   limit 1;
  if v_human is null then
    return '[]'::jsonb;
  end if;

  select show_customer_history into v_show_history
    from public.booking_policy_settings where singleton;
  v_show_history := coalesce(p_include_history, v_show_history, true);

  select coalesce(jsonb_agg(row order by (row->>'bookingDate') desc, row->>'visitId'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'visitId', v.id,
      'revision', v.revision,
      'bookingDate', v.booking_date,
      'lifecycleState', v.lifecycle_state,
      'approvalState', v.approval_state,
      'confirmationState', v.confirmation_state,
      -- An inactive-policy visit is governed by its own stored legacy state;
      -- an active-policy visit by its frozen policy and Terms versions.
      'policyCode', v.policy_code,
      'deadlineAt', v.customer_change_deadline_at,
      'isLastMinute', v.is_last_minute,
      'termsPublication', case
        when tp.id is null then null
        else jsonb_build_object('id', tp.id, 'publicUrl', tp.public_url,
                                'version', tp.version_label)
      end,
      -- Every identifiable dog, deterministically ordered.
      'dogs', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'bookingId', b.id,
                 'dogId', b.dog_id,
                 'dogName', d.name,
                 'slot', b.slot,
                 'serviceLabel', b.service,
                 'addOnLabels', to_jsonb(coalesce(b.addons, '{}'::text[]))
               ) order by b.slot, d.name, b.id)
          from public.bookings b
          join public.dogs d on d.id = b.dog_id
         where b.visit_id = v.id
           and b.visit_membership_state = 'included'
           and d.human_id = v.human_id
           and b.booking_date = v.booking_date
      ), '[]'::jsonb),
      -- Reported separately: one broken child never removes the visit.
      'unavailableDogCount',
        jsonb_array_length(public.booking_visit_malformed_children(v.id)),
      'deposit', case
        when dep.visit_id is null then null
        else jsonb_build_object(
          'state', dep.state,
          'amountPence', dep.amount_pence,
          'dueAt', dep.due_at,
          -- Payment instructions only while genuinely payable, and always the
          -- snapshotted bank version, never today's settings.
          'paymentInstructions', case
            when dep.state = 'awaiting_payment' and bi.id is not null
              then jsonb_build_object(
                'accountName', bi.account_name, 'sortCode', bi.sort_code,
                'accountNumber', bi.account_number,
                'customerReference', coalesce(dep.customer_payment_reference,''))
            else null end,
          -- Plain-language only. Never an incident count, kind, date or the
          -- internal reason code.
          'reason', case
            when dep.state = 'not_required' then null
            when dep.requirement_reason = 'staff_applied_requirement'
              then 'The team has applied a £10 deposit to this booking.'
            when dep.requirement_reason is not null
              then 'A £10 deposit is needed because of recent booking history.'
            else null end)
      end,
      'dataQualityNote', smarter_dog_private.customer_quality_note(q.quality),
      -- Capabilities come from the server. The client renders them; it never
      -- recalculates a deadline or an eligibility.
      'capabilities', case
        when q.quality in ('v1_authoritative','legacy_trustworthy')
          then jsonb_build_object(
            'cancel', public.visit_actionability(v.id, 'cancel', statement_timestamp()),
            'reschedule', public.visit_actionability(v.id, 'reschedule', statement_timestamp()),
            'withdraw', public.visit_actionability(v.id, 'withdraw', statement_timestamp()))
        -- Uncertain data disables every action that needs certainty, with a
        -- clear machine-readable reason rather than a silent absence.
        else jsonb_build_object(
          'cancel', jsonb_build_object('allowed', false, 'reasonCode', 'staff_review_required'),
          'reschedule', jsonb_build_object('allowed', false, 'reasonCode', 'staff_review_required'),
          'withdraw', jsonb_build_object('allowed', false, 'reasonCode', 'staff_review_required'))
      end
    ) as row
    from public.booking_visits v
    cross join lateral (select public.booking_visit_data_quality(v.id) as quality) q
    left join public.booking_visit_deposits dep on dep.visit_id = v.id
    left join public.booking_deposit_bank_instruction_versions bi
           on bi.id = dep.bank_instruction_id
    left join public.booking_terms_publication_versions tp
           on tp.id = v.terms_publication_id
   where v.human_id = v_human
     and (
       -- Upcoming is always visible; the history switch hides only RESOLVED
       -- terminal history, never something still needing attention.
       v.lifecycle_state = 'active'
       or v_show_history
       or exists (select 1 from public.booking_deposit_money_reconciliations r
                   where r.visit_id = v.id and r.state = 'open')
       or exists (select 1 from public.booking_service_prepayment_reconciliations r
                   where r.visit_id = v.id and r.state = 'open')
     )
  ) rows;

  return v_result;
end;
$$;
revoke all on function public.list_customer_booking_visits(boolean) from public;
revoke all on function public.list_customer_booking_visits(boolean) from anon;
revoke all on function public.list_customer_booking_visits(boolean) from authenticated;
grant execute on function public.list_customer_booking_visits(boolean) to authenticated;

comment on function public.list_customer_booking_visits(boolean) is
  'READ-ONLY customer visit projection: one record per visit with every identifiable dog nested deterministically. SECURITY DEFINER because the underlying visit/deposit/ledger tables grant customers no access at all; the owner is derived from auth.uid() and every row is scoped to it, so there is no caller-supplied identity to spoof. Uncertain data still shows the visit but disables certainty-requiring actions with reasonCode staff_review_required. Contains no staff note, audit metadata, incident detail or internal reason code.';
