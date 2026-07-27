-- ============================================================
-- Staff booking-policy projections (Path B Task 2, part 2)
--
-- These are read-only, all-open projections. They deliberately do not use an
-- appointment-date lower bound: old approvals, reconciliations and refund
-- obligations remain visible until their authoritative state is resolved.
--
-- SECURITY DEFINER is required because the policy aggregate, evidence and
-- money tables grant no direct access to authenticated users. Both entry
-- points assert the staff role before reading any data and expose only an
-- authenticated EXECUTE grant.
-- ============================================================

-- Projection-specific access paths. The queue indexes are partial so resolved
-- history does not make the operational indexes grow without bound; the full
-- visit indexes support the audit-detail projection.
create index if not exists booking_visits_staff_approval_queue_idx
  on public.booking_visits (approval_state, booking_date, id)
  where lifecycle_state = 'active' and confirmation_state = 'unconfirmed';

create index if not exists booking_visits_active_confirmed_date_idx
  on public.booking_visits (booking_date, id, human_id)
  where lifecycle_state = 'active' and confirmation_state = 'confirmed';

create index if not exists booking_change_requests_pending_staff_queue_idx
  on public.booking_change_requests (received_at, id, source_visit_id)
  where status = 'pending_staff';

create index if not exists booking_change_requests_source_received_idx
  on public.booking_change_requests (source_visit_id, received_at, id);

create index if not exists booking_change_requests_proposed_received_idx
  on public.booking_change_requests (proposed_visit_id, received_at, id)
  where proposed_visit_id is not null;

create index if not exists booking_change_destinations_request_revision_idx
  on public.booking_change_destination_reservations
    (request_id, proposal_revision desc, id);

create index if not exists booking_incident_audit_incident_time_idx
  on public.booking_policy_incident_audit (incident_id, occurred_at, id);

create index if not exists booking_deposit_recon_visit_time_idx
  on public.booking_deposit_money_reconciliations (visit_id, opened_at, id);

create index if not exists booking_service_recon_visit_time_idx
  on public.booking_service_prepayment_reconciliations (visit_id, opened_at, id);

create index if not exists booking_financial_ledger_refund_due_time_idx
  on public.booking_financial_ledger (due_at, id)
  where event_kind = 'refund_due';

create index if not exists booking_financial_ledger_related_visit_idx
  on public.booking_financial_ledger (related_visit_id, recorded_at, id)
  where related_visit_id is not null;

-- One pure predicate owns both deposit and refund equality semantics. Keeping
-- it deterministic lets pgTAP prove equality and the next microsecond exactly,
-- while the revoked grant prevents callers choosing the queue's decision time.
create or replace function smarter_dog_private.booking_policy_due_at_or_before(
  p_due_at timestamptz,
  p_at timestamptz
) returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select p_due_at <= p_at;
$$;
revoke all on function smarter_dog_private.booking_policy_due_at_or_before(
  timestamptz, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.list_staff_booking_policy_attention()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_generated_at timestamptz := statement_timestamp();
  v_waiting_approvals jsonb;
  v_alternatives jsonb;
  v_pending_changes jsonb;
  v_deposit_checks_due jsonb;
  v_deposit_reconciliations jsonb;
  v_service_reconciliations jsonb;
  v_threshold_reviews jsonb;
  v_refunds jsonb;
begin
  perform smarter_dog_private.require_staff();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitId', v.id,
        'visitRevision', v.row_revision
      )
      order by v.booking_date, v.id
    ),
    '[]'::jsonb
  )
  into v_waiting_approvals
  from public.booking_visits v
  where v.lifecycle_state = 'active'
    and v.confirmation_state = 'unconfirmed'
    and v.approval_state = 'waiting_staff';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitId', v.id,
        'visitRevision', v.row_revision,
        'requestId', request.id,
        'requestRevision', request.revision
      )
      order by v.booking_date, v.id
    ),
    '[]'::jsonb
  )
  into v_alternatives
  from public.booking_visits v
  left join lateral (
    select r.id, r.revision
    from public.booking_change_requests r
    where r.source_visit_id = v.id
      and r.status = 'waiting_customer'
    order by r.received_at desc, r.id
    limit 1
  ) request on true
  where v.lifecycle_state = 'active'
    and v.confirmation_state = 'unconfirmed'
    and v.approval_state = 'alternative_pending';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitId', source_visit.id,
        'visitRevision', source_visit.row_revision,
        'requestId', request.id,
        'requestRevision', request.revision
      )
      order by request.received_at, request.id
    ),
    '[]'::jsonb
  )
  into v_pending_changes
  from public.booking_change_requests request
  join public.booking_visits source_visit
    on source_visit.id = request.source_visit_id
  where request.status = 'pending_staff';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitId', v.id,
        'visitRevision', v.row_revision,
        'state', d.state,
        'dueAt', d.due_at
      )
      order by d.due_at, v.id
    ),
    '[]'::jsonb
  )
  into v_deposit_checks_due
  from public.booking_visit_deposits d
  join public.booking_visits v on v.id = d.visit_id
  where d.state in ('awaiting_terms','awaiting_payment')
    and smarter_dog_private.booking_policy_due_at_or_before(
      d.due_at,
      v_generated_at
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reconciliationId', reconciliation.id,
        'visitId', v.id,
        'visitRevision', v.row_revision
      )
      order by reconciliation.opened_at, reconciliation.id
    ),
    '[]'::jsonb
  )
  into v_deposit_reconciliations
  from public.booking_deposit_money_reconciliations reconciliation
  join public.booking_visits v on v.id = reconciliation.visit_id
  where reconciliation.state = 'open';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reconciliationId', reconciliation.id,
        'visitId', v.id,
        'visitRevision', v.row_revision
      )
      order by reconciliation.opened_at, reconciliation.id
    ),
    '[]'::jsonb
  )
  into v_service_reconciliations
  from public.booking_service_prepayment_reconciliations reconciliation
  join public.booking_visits v on v.id = reconciliation.visit_id
  where reconciliation.state = 'open';

  -- There is intentionally no mutable "threshold review" record yet. This
  -- queue item is the current authoritative resolver result for an active,
  -- confirmed visit whose deposit still says not_required. It is intentionally
  -- not filtered by start time: unresolved work cannot silently disappear
  -- when the appointment clock passes.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitId', v.id,
        'visitRevision', v.row_revision,
        'reasonCode', 'three_incidents_12m'
      )
      order by v.booking_date, v.id
    ),
    '[]'::jsonb
  )
  into v_threshold_reviews
  from public.booking_visits v
  left join public.booking_visit_deposits d on d.visit_id = v.id
  cross join lateral (
    select public.resolve_deposit_requirement(
      v.human_id,
      v.booking_date,
      coalesce(v.commercial_eligibility_at, v.confirmed_at, v.requested_at),
      coalesce(v.eligibility_policy_code, v.policy_code, 'legacy_24h')
    ) as requirement
  ) resolved
  where v.lifecycle_state = 'active'
    and v.confirmation_state = 'confirmed'
    and coalesce(d.state, 'not_required') = 'not_required'
    and (resolved.requirement ->> 'required')::boolean
    and resolved.requirement ->> 'reasonCode' = 'three_incidents_12m';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'obligationId', obligation.id,
        'humanId', obligation.human_id,
        'visitId', obligation.visit_id,
        'amountPence', obligation.amount_pence,
        'dueAt', obligation.due_at,
        'refundOrigin', obligation.refund_origin,
        'overdue',
          smarter_dog_private.booking_policy_due_at_or_before(
            obligation.due_at,
            v_generated_at
          )
      )
      order by obligation.due_at, obligation.id
    ),
    '[]'::jsonb
  )
  into v_refunds
  from public.booking_financial_ledger obligation
  where obligation.event_kind = 'refund_due'
    and not exists (
      select 1
      from public.booking_financial_ledger settlement
      where settlement.settles_event_id = obligation.id
    );

  return jsonb_build_object(
    'generatedAt', v_generated_at,
    'counts', jsonb_build_object(
      'waitingApprovals', jsonb_array_length(v_waiting_approvals),
      'alternatives', jsonb_array_length(v_alternatives),
      'pendingChanges', jsonb_array_length(v_pending_changes),
      'depositChecksDue', jsonb_array_length(v_deposit_checks_due),
      'depositReconciliations', jsonb_array_length(v_deposit_reconciliations),
      'servicePrepaymentReconciliations', jsonb_array_length(v_service_reconciliations),
      'thresholdReviews', jsonb_array_length(v_threshold_reviews),
      'refundsPending', jsonb_array_length(v_refunds),
      'refundsOverdue', (
        select count(*)::int
        from jsonb_array_elements(v_refunds) refund
        where (refund ->> 'overdue')::boolean
      )
    ),
    'waitingApprovals', v_waiting_approvals,
    'alternatives', v_alternatives,
    'pendingChanges', v_pending_changes,
    'depositChecksDue', v_deposit_checks_due,
    'depositReconciliations', v_deposit_reconciliations,
    'servicePrepaymentReconciliations', v_service_reconciliations,
    'thresholdReviews', v_threshold_reviews,
    'refunds', v_refunds
  );
end;
$$;
revoke all on function public.list_staff_booking_policy_attention() from public, anon, authenticated;
grant execute on function public.list_staff_booking_policy_attention() to authenticated;

comment on function public.list_staff_booking_policy_attention() is
  'READ-ONLY all-open staff queue. No appointment-date lower bound: unresolved approvals, changes, threshold reviews, reconciliations and refunds remain until resolved. Deposit and refund due states compare against the same captured statement_timestamp through a revoked deterministic boundary predicate.';

create or replace function public.list_staff_booking_visit(p_visit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform smarter_dog_private.require_staff();

  select jsonb_build_object(
    'visit', jsonb_build_object(
      'id', v.id,
      'revision', v.row_revision,
      'lineageId', v.lineage_id,
      'humanId', v.human_id,
      'bookingDate', v.booking_date,
      'lifecycleState', v.lifecycle_state,
      'approvalState', v.approval_state,
      'confirmationState', v.confirmation_state,
      'policyCode', v.policy_code,
      'source', v.source,
      'requestedAt', v.requested_at,
      'commercialEligibilityAt', v.commercial_eligibility_at,
      'eligibilityPolicyCode', v.eligibility_policy_code,
      'runtimeGeneration', v.runtime_generation,
      'confirmedAt', v.confirmed_at,
      'deadlineAt', v.customer_change_deadline_at,
      'isLastMinute', v.is_last_minute,
      'supersedesVisitId', v.supersedes_visit_id,
      'continuesCancelledVisitId', v.continues_cancelled_visit_id,
      'cancelledAt', v.cancelled_at,
      'completedAt', v.completed_at,
      'termsPublicationId', v.terms_publication_id,
      'termsAcknowledgement', v.terms_acknowledgement,
      'termsNoticeMethod', v.terms_notice_method,
      'termsNoticeAt', v.terms_notice_at,
      'termsNoticeBy', v.terms_notice_by,
      'dataQuality', public.booking_visit_data_quality(v.id)
    ),
    'customer', jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'surname', h.surname,
      'phone', h.phone,
      'email', h.email
    ),
    'dogs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'bookingId', booking.id,
          'dogId', dog.id,
          'dogName', dog.name,
          'slot', booking.slot,
          'service', booking.service,
          'addOns', to_jsonb(coalesce(booking.addons, '{}'::text[])),
          'size', booking.size,
          'status', booking.status,
          'membershipState', booking.visit_membership_state,
          'payment', booking.payment,
          'paymentMethod', booking.payment_method,
          'paidAt', booking.paid_at,
          'paidAmount', booking.paid_amount
        )
        order by booking.slot, dog.name, booking.id
      )
      from public.bookings booking
      join public.dogs dog on dog.id = booking.dog_id
      where booking.visit_id = v.id
    ), '[]'::jsonb),
    'deposit', case
      when deposit.visit_id is null then null
      else jsonb_build_object(
        'state', deposit.state,
        'amountPence', deposit.amount_pence,
        'requirementReason', deposit.requirement_reason,
        'exemptionReason', deposit.exemption_reason,
        'dueAt', deposit.due_at,
        'customerPaymentReference', deposit.customer_payment_reference,
        'staffVerificationReference', deposit.staff_verification_reference,
        'satisfactionSource', deposit.satisfaction_source,
        'satisfactionEventId', deposit.satisfaction_event_id,
        'dispositionEventId', deposit.disposition_event_id,
        'bankReceivedAt', deposit.bank_received_at,
        'termsPublicationId', deposit.terms_publication_id,
        'termsAcceptedAt', deposit.terms_accepted_at,
        'updatedAt', deposit.updated_at
      )
    end,
    'billSummary', jsonb_build_object(
      'billRevision', bill.bill_revision,
      'grossServiceTotalPence', bill.gross_service_total_pence,
      'nonDepositPaidPence', bill.non_deposit_paid_pence,
      'depositPartPaymentPence', bill.deposit_part_payment_pence,
      'amountDuePence', bill.amount_due_pence
    ),
    'changeRequests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', request.id,
          'revision', request.revision,
          'sourceVisitId', request.source_visit_id,
          'sourceVisitRevision', source_visit.row_revision,
          'proposedVisitId', request.proposed_visit_id,
          'humanId', request.human_id,
          'kind', request.kind,
          'channel', request.channel,
          'reasonCode', request.reason_code,
          'status', request.status,
          'requestedAt', request.requested_at,
          'receivedAt', request.received_at,
          'providerMessageId', request.provider_message_id,
          'customerMessage', request.customer_message,
          'requestedBookingDate', request.requested_booking_date,
          'requestedSlotAssignments', request.requested_slot_assignments,
          'destinationHash', request.requested_destination_hash,
          'sourceRevision', request.source_revision,
          'reviewId', request.review_id,
          'decidedAt', request.decided_at,
          'decidedBy', request.decided_by,
          'decisionReason', request.decision_reason,
          'destinationReservation', (
            select jsonb_build_object(
              'id', reservation.id,
              'proposalRevision', reservation.proposal_revision,
              'purpose', reservation.purpose,
              'bookingDate', reservation.booking_date,
              'slotAssignments', reservation.slot_assignments,
              'destinationHash', reservation.destination_hash,
              'state', reservation.state
            )
            from public.booking_change_destination_reservations reservation
            where reservation.request_id = request.id
            order by reservation.proposal_revision desc, reservation.id
            limit 1
          )
        )
        order by request.received_at, request.id
      )
      from public.booking_change_requests request
      join public.booking_visits source_visit
        on source_visit.id = request.source_visit_id
      where request.source_visit_id = v.id
        or request.proposed_visit_id = v.id
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', incident.id,
          'revision', incident.revision,
          'visitId', incident.visit_id,
          'visitRevision', incident_visit.row_revision,
          'humanId', incident.human_id,
          'kind', incident.kind,
          'appointmentDate', incident.appointment_date,
          'reason', incident.reason,
          'recordedAt', incident.recorded_at,
          'recordedBy', incident.recorded_by,
          'waivedAt', incident.waived_at,
          'waivedBy', incident.waived_by,
          'waiverReason', incident.waiver_reason,
          'audit', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', incident_audit.id,
                'action', incident_audit.action,
                'reason', incident_audit.reason,
                'actorId', incident_audit.actor_id,
                'occurredAt', incident_audit.occurred_at
              )
              order by incident_audit.occurred_at, incident_audit.id
            )
            from public.booking_policy_incident_audit incident_audit
            where incident_audit.incident_id = incident.id
          ), '[]'::jsonb)
        )
        order by incident.appointment_date, incident.id
      )
      from public.booking_policy_incidents incident
      join public.booking_visits incident_visit
        on incident_visit.id = incident.visit_id
      where incident.visit_id = v.id
    ), '[]'::jsonb),
    'depositReconciliations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', reconciliation.id,
          'visitId', reconciliation.visit_id,
          'amountPence', reconciliation.amount_pence,
          'state', reconciliation.state,
          'openedReason', reconciliation.opened_reason,
          'resolution', reconciliation.resolution,
          'resolutionEventId', reconciliation.resolution_event_id,
          'openedAt', reconciliation.opened_at,
          'resolvedAt', reconciliation.resolved_at,
          'resolvedBy', reconciliation.resolved_by
        )
        order by reconciliation.opened_at, reconciliation.id
      )
      from public.booking_deposit_money_reconciliations reconciliation
      where reconciliation.visit_id = v.id
    ), '[]'::jsonb),
    'servicePrepaymentReconciliations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', reconciliation.id,
          'visitId', reconciliation.visit_id,
          'amountPence', reconciliation.amount_pence,
          'evidence', reconciliation.evidence,
          'state', reconciliation.state,
          'targetVisitId', reconciliation.target_visit_id,
          'obligationEventId', reconciliation.obligation_event_id,
          'openedReason', reconciliation.opened_reason,
          'openedAt', reconciliation.opened_at,
          'resolvedAt', reconciliation.resolved_at,
          'resolvedBy', reconciliation.resolved_by,
          'resolutionReason', reconciliation.resolution_reason
        )
        order by reconciliation.opened_at, reconciliation.id
      )
      from public.booking_service_prepayment_reconciliations reconciliation
      where reconciliation.visit_id = v.id
    ), '[]'::jsonb),
    'financialLedger', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ledger.id,
          'humanId', ledger.human_id,
          'visitId', ledger.visit_id,
          'relatedVisitId', ledger.related_visit_id,
          'eventKind', ledger.event_kind,
          'amountPence', ledger.amount_pence,
          'reason', ledger.reason,
          'dueAt', ledger.due_at,
          'settlesEventId', ledger.settles_event_id,
          'actualPaidAt', ledger.actual_paid_at,
          'bankReference', ledger.bank_reference,
          'refundOrigin', ledger.refund_origin,
          'refundDeadlineBasis', ledger.refund_deadline_basis,
          'refundCalendarSource', ledger.refund_calendar_source,
          'refundCalendarCoverageId', ledger.refund_calendar_coverage_id,
          'recordedBy', ledger.recorded_by,
          'recordedAt', ledger.recorded_at
        )
        order by ledger.recorded_at, ledger.id
      )
      from public.booking_financial_ledger ledger
      where ledger.visit_id = v.id
        or ledger.related_visit_id = v.id
    ), '[]'::jsonb),
    'policyAudit', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', audit.id,
          'visitId', audit.visit_id,
          'humanId', audit.human_id,
          'action', audit.action,
          'actorId', audit.actor_id,
          'actorScope', audit.actor_scope,
          'reason', audit.reason,
          'detail', audit.detail,
          'occurredAt', audit.occurred_at
        )
        order by audit.occurred_at, audit.id
      )
      from public.booking_policy_audit audit
      where audit.visit_id = v.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.booking_visits v
  join public.humans h on h.id = v.human_id
  left join public.booking_visit_deposits deposit on deposit.visit_id = v.id
  left join public.booking_visit_bill_summary bill on bill.visit_id = v.id
  where v.id = p_visit_id;

  return v_result;
end;
$$;
revoke all on function public.list_staff_booking_visit(uuid) from public, anon, authenticated;
grant execute on function public.list_staff_booking_visit(uuid) to authenticated;

comment on function public.list_staff_booking_visit(uuid) is
  'READ-ONLY complete staff audit projection for one booking visit. Includes the current visit revision, every mutable request and incident revision, the visit-level bill summary, reconciliations, immutable financial facts and policy audit.';
