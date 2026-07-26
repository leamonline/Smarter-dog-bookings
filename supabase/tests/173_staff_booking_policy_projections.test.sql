-- Staff booking-policy projections: role gates, all-open queue semantics,
-- exact due-time boundaries, revisions, visit-level billing and read-only
-- behaviour. Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id) values
  ('17300000-0000-4000-8000-000000000001'),
  ('17300000-0000-4000-8000-000000000003');

insert into public.staff_profiles (user_id, role, display_name) values
  ('17300000-0000-4000-8000-000000000001', 'owner', 'Projection Owner 173');

insert into public.humans (id, name, surname, phone, email, customer_user_id)
values (
  '17300000-0000-4000-8000-000000000010',
  'Projection173',
  'Customer',
  '07700900173',
  'projection173@example.test',
  '17300000-0000-4000-8000-000000000003'
);

insert into public.dogs (id, name, breed, size, human_id) values
  ('17300000-0000-4000-8000-000000000011', 'Alpha', 'Poodle', 'small',
   '17300000-0000-4000-8000-000000000010'),
  ('17300000-0000-4000-8000-000000000012', 'Bravo', 'Beagle', 'small',
   '17300000-0000-4000-8000-000000000010');

insert into public.booking_lineages (id, human_id)
select ('17300000-0000-4000-8000-0000000003' || lpad(g::text, 2, '0'))::uuid,
       '17300000-0000-4000-8000-000000000010'::uuid
from generate_series(1, 20) g;

insert into public.booking_terms_publication_versions
  (id, public_url, version_label, approved_content_sha256, published_at, recorded_by)
values (
  '17300000-0000-4000-8000-000000000101',
  'https://smarterdog.co.uk/terms/projection-173',
  'projection-173',
  repeat('a', 64),
  statement_timestamp() - interval '2 years',
  '17300000-0000-4000-8000-000000000001'
);

insert into public.booking_deposit_bank_instruction_versions
  (id, account_name, sort_code, account_number, recorded_by)
values (
  '17300000-0000-4000-8000-000000000102',
  'Smarter Dog Projection',
  '12-34-56',
  '12345678',
  '17300000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17300000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create or replace function pg_temp.confirmed_visit(
  p_id uuid,
  p_lineage uuid,
  p_date date,
  p_lifecycle text default 'active',
  p_row_revision integer default 1
) returns uuid
language plpgsql
as $$
declare
  v_eligibility_at timestamptz :=
    ((p_date - 20)::text || ' 09:00')::timestamp at time zone 'Europe/London';
begin
  insert into public.booking_visits (
    id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
    confirmation_state, policy_code, source, requested_at,
    commercial_eligibility_at, eligibility_policy_code, confirmed_at,
    customer_change_deadline_at, runtime_generation, terms_publication_id,
    terms_acknowledgement, terms_notice_method, terms_notice_at,
    terms_notice_by, cancelled_at, row_revision
  ) values (
    p_id, p_lineage, '17300000-0000-4000-8000-000000000010', p_date,
    p_lifecycle, 'not_required', 'confirmed', 'previous_day_1500_v1',
    'staff', v_eligibility_at, v_eligibility_at,
    'previous_day_1500_v1', v_eligibility_at,
    public.change_deadline_for('previous_day_1500_v1', p_date, '08:30'),
    'visit_v1', '17300000-0000-4000-8000-000000000101',
    'staff_notice', 'phone', v_eligibility_at,
    '17300000-0000-4000-8000-000000000001',
    case when p_lifecycle = 'cancelled' then statement_timestamp() else null end,
    p_row_revision
  );
  insert into public.booking_visit_deposits (
    visit_id, origin, state, requirement_decided_at, exemption_reason
  ) values (
    p_id, 'visit_v1', 'not_required', v_eligibility_at, 'staff_created'
  );
  return p_id;
end;
$$;

create or replace function pg_temp.unconfirmed_visit(
  p_id uuid,
  p_lineage uuid,
  p_date date,
  p_approval text,
  p_row_revision integer default 1
) returns uuid
language plpgsql
as $$
begin
  insert into public.booking_visits (
    id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
    confirmation_state, source, requested_at, runtime_generation,
    terms_publication_id, row_revision
  ) values (
    p_id, p_lineage, '17300000-0000-4000-8000-000000000010', p_date,
    'active', p_approval, 'unconfirmed', 'website', statement_timestamp(),
    'visit_v1', '17300000-0000-4000-8000-000000000101',
    p_row_revision
  );
  return p_id;
end;
$$;

-- An approval that is already three months old must remain all-open.
select pg_temp.unconfirmed_visit(
  '17300000-0000-4000-8000-000000000501',
  '17300000-0000-4000-8000-000000000301',
  current_date - 90,
  'waiting_staff',
  6
);
select pg_temp.unconfirmed_visit(
  '17300000-0000-4000-8000-000000000502',
  '17300000-0000-4000-8000-000000000302',
  current_date + 30,
  'alternative_pending'
);
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000503',
  '17300000-0000-4000-8000-000000000303',
  current_date + 31
);

insert into public.booking_change_requests (
  id, source_visit_id, human_id, revision, kind, channel, reason_code, status,
  requested_at, requested_booking_date, requested_slot_assignments,
  requested_destination_hash, source_revision
) values
  (
    '17300000-0000-4000-8000-000000000701',
    '17300000-0000-4000-8000-000000000503',
    '17300000-0000-4000-8000-000000000010',
    2, 'reschedule', 'website', 'source_deadline_late', 'pending_staff',
    statement_timestamp(), current_date + 40,
    '[{"dog_id":"17300000-0000-4000-8000-000000000011","slot":"09:00"}]'::jsonb,
    'pending-173', 1
  ),
  (
    '17300000-0000-4000-8000-000000000702',
    '17300000-0000-4000-8000-000000000502',
    '17300000-0000-4000-8000-000000000010',
    4, 'staff_alternative', 'staff', 'staff_alternative', 'waiting_customer',
    statement_timestamp(), current_date + 41,
    '[{"dog_id":"17300000-0000-4000-8000-000000000011","slot":"10:00"}]'::jsonb,
    'alternative-173', 1
  );

-- Both unresolved deposit states are already due; a future deadline is not
-- due. Exact equality is exercised below through the same deterministic
-- predicate used by the projection.
select pg_temp.unconfirmed_visit(
  '17300000-0000-4000-8000-000000000504',
  '17300000-0000-4000-8000-000000000304',
  current_date + 32,
  'approved'
);
select pg_temp.unconfirmed_visit(
  '17300000-0000-4000-8000-000000000505',
  '17300000-0000-4000-8000-000000000305',
  current_date + 33,
  'approved'
);
select pg_temp.unconfirmed_visit(
  '17300000-0000-4000-8000-000000000506',
  '17300000-0000-4000-8000-000000000306',
  current_date + 34,
  'approved'
);

insert into public.booking_visit_deposits (
  visit_id, origin, state, requirement_reason, requirement_decided_at,
  bank_instruction_id, due_at, customer_payment_reference,
  terms_publication_id, terms_accepted_at
) values
  (
    '17300000-0000-4000-8000-000000000504', 'visit_v1',
    'awaiting_terms', 'three_incidents_12m', statement_timestamp(),
    '17300000-0000-4000-8000-000000000102', statement_timestamp(),
    'PROJ173-504', '17300000-0000-4000-8000-000000000101', null
  ),
  (
    '17300000-0000-4000-8000-000000000505', 'visit_v1',
    'awaiting_payment', 'three_incidents_12m', statement_timestamp(),
    '17300000-0000-4000-8000-000000000102', statement_timestamp(),
    'PROJ173-505', '17300000-0000-4000-8000-000000000101',
    statement_timestamp()
  ),
  (
    '17300000-0000-4000-8000-000000000506', 'visit_v1',
    'awaiting_terms', 'three_incidents_12m', statement_timestamp(),
    '17300000-0000-4000-8000-000000000102',
    statement_timestamp() + interval '1 day',
    'PROJ173-506', '17300000-0000-4000-8000-000000000101', null
  );

select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000507',
  '17300000-0000-4000-8000-000000000307',
  current_date + 35
);
insert into public.booking_deposit_money_reconciliations
  (id, visit_id, human_id, amount_pence, state, opened_reason, opened_at)
values (
  '17300000-0000-4000-8000-000000000711',
  '17300000-0000-4000-8000-000000000507',
  '17300000-0000-4000-8000-000000000010',
  1000, 'open', 'old deposit evidence needs review',
  statement_timestamp() - interval '120 days'
);

select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000508',
  '17300000-0000-4000-8000-000000000308',
  current_date + 36
);
insert into public.booking_service_prepayment_reconciliations
  (id, visit_id, human_id, amount_pence, evidence, state, opened_reason, opened_at)
values (
  '17300000-0000-4000-8000-000000000712',
  '17300000-0000-4000-8000-000000000508',
  '17300000-0000-4000-8000-000000000010',
  2500, '{"source":"projection test"}', 'open',
  'old service prepayment needs a decision',
  statement_timestamp() - interval '120 days'
);

-- Three unwaived incidents form the resolver-owned threshold.
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000509',
  '17300000-0000-4000-8000-000000000309',
  current_date - 100,
  'cancelled'
);
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000510',
  '17300000-0000-4000-8000-000000000310',
  current_date - 70,
  'cancelled'
);
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000511',
  '17300000-0000-4000-8000-000000000311',
  current_date - 40,
  'cancelled'
);
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000512',
  '17300000-0000-4000-8000-000000000312',
  current_date - 10
);

insert into public.booking_policy_incidents (
  id, revision, visit_id, human_id, kind, appointment_date, recorded_by, reason
) values
  (
    '17300000-0000-4000-8000-000000000721', 1,
    '17300000-0000-4000-8000-000000000509',
    '17300000-0000-4000-8000-000000000010',
    'late_cancellation', current_date - 100,
    '17300000-0000-4000-8000-000000000001', 'threshold incident one'
  ),
  (
    '17300000-0000-4000-8000-000000000722', 2,
    '17300000-0000-4000-8000-000000000510',
    '17300000-0000-4000-8000-000000000010',
    'no_show', current_date - 70,
    '17300000-0000-4000-8000-000000000001', 'threshold incident two'
  ),
  (
    '17300000-0000-4000-8000-000000000723', 3,
    '17300000-0000-4000-8000-000000000511',
    '17300000-0000-4000-8000-000000000010',
    'late_arrival_unserviceable', current_date - 40,
    '17300000-0000-4000-8000-000000000001', 'threshold incident three'
  );

insert into public.bookings
  (booking_date, slot, dog_id, size, service, status, visit_id)
values (
  current_date - 10, '08:30',
  '17300000-0000-4000-8000-000000000011',
  'small', 'Full Groom', 'Booked',
  '17300000-0000-4000-8000-000000000512'
);

-- Two unsettled refunds: one exactly due with no visit, one future visit-bound
-- service-prepayment promise. A third obligation is settled and must vanish.
insert into public.booking_financial_ledger (
  id, human_id, event_kind, amount_pence, reason, idempotency_key, due_at,
  refund_origin, refund_deadline_basis, refund_calendar_source,
  refund_calendar_coverage_id
)
select
  '17300000-0000-4000-8000-000000000801',
  '17300000-0000-4000-8000-000000000010',
  'refund_due', 1500, 'account credit refund', 'projection-173-refund-1',
  statement_timestamp(), 'account_credit', 'deposit_working_days',
  verified.calendar_source, verified.coverage_id
from public.refund_due_at_verified(statement_timestamp()) verified;

insert into public.booking_financial_ledger (
  id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
  due_at, refund_origin, refund_deadline_basis
) values (
  '17300000-0000-4000-8000-000000000802',
  '17300000-0000-4000-8000-000000000010',
  '17300000-0000-4000-8000-000000000508',
  'refund_due', 2500, 'service prepayment refund',
  'projection-173-refund-2', statement_timestamp() + interval '1 day',
  'service_prepayment', 'staff_explicit'
);

insert into public.booking_financial_ledger (
  id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
  due_at, refund_origin, refund_deadline_basis, refund_calendar_source,
  refund_calendar_coverage_id
)
select
  '17300000-0000-4000-8000-000000000803',
  '17300000-0000-4000-8000-000000000010',
  '17300000-0000-4000-8000-000000000507',
  'refund_due', 1000, 'already paid refund', 'projection-173-refund-3',
  verified.due_at, 'deposit', 'deposit_working_days',
  verified.calendar_source, verified.coverage_id
from public.refund_due_at_verified(statement_timestamp()) verified;
insert into public.booking_financial_ledger (
  human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
  settles_event_id, actual_paid_at, bank_reference
) values (
  '17300000-0000-4000-8000-000000000010',
  '17300000-0000-4000-8000-000000000507',
  'refund_paid', 1000, 'settled before projection',
  'projection-173-refund-paid',
  '17300000-0000-4000-8000-000000000803',
  statement_timestamp(), 'PROJ173-PAID'
);

-- Detail fixture: two dogs share one £10 received deposit; mutable request
-- and incident revisions must travel with the staff view.
select pg_temp.confirmed_visit(
  '17300000-0000-4000-8000-000000000513',
  '17300000-0000-4000-8000-000000000313',
  current_date + 38,
  'active',
  9
);
insert into public.bookings (
  booking_date, slot, dog_id, size, service, status, visit_id,
  addons, price_override, payment, payment_method, paid_at, paid_amount
) values
  (
    current_date + 38, '08:30',
    '17300000-0000-4000-8000-000000000011',
    'small', 'Full Groom', 'Booked',
    '17300000-0000-4000-8000-000000000513',
    '{"Flea Bath"}', 45, 'Paid in Full', 'card', statement_timestamp(), 30
  ),
  (
    current_date + 38, '09:00',
    '17300000-0000-4000-8000-000000000012',
    'small', 'Bath & Brush', 'Booked',
    '17300000-0000-4000-8000-000000000513',
    '{}', 35, 'Paid in Full', 'card', statement_timestamp(), 20
  );

insert into public.booking_visit_service_payments (
  id, visit_id, human_id, bill_revision, amount_pence, payment_method,
  actual_paid_at, reference, recorded_by, reason, idempotency_key
) values (
  '17300000-0000-4000-8000-000000000811',
  '17300000-0000-4000-8000-000000000513',
  '17300000-0000-4000-8000-000000000010',
  2, 1500, 'card', statement_timestamp(), 'PROJ173-SERVICE',
  '17300000-0000-4000-8000-000000000001',
  'part payment for projection fixture',
  'projection-173-service-payment'
);

insert into public.booking_financial_ledger (
  id, human_id, visit_id, event_kind, amount_pence, reason, idempotency_key,
  recorded_by
) values (
  '17300000-0000-4000-8000-000000000810',
  '17300000-0000-4000-8000-000000000010',
  '17300000-0000-4000-8000-000000000513',
  'deposit_received', 1000, 'deposit received for detail fixture',
  'projection-173-deposit-received',
  '17300000-0000-4000-8000-000000000001'
);
update public.booking_visit_deposits
set state = 'received',
    requirement_reason = 'three_incidents_12m',
    exemption_reason = null,
    requirement_decided_at = statement_timestamp(),
    bank_instruction_id = '17300000-0000-4000-8000-000000000102',
    bank_received_at = statement_timestamp(),
    satisfaction_source = 'bank',
    satisfaction_event_id = '17300000-0000-4000-8000-000000000810',
    recorded_at = statement_timestamp(),
    recorded_by = '17300000-0000-4000-8000-000000000001',
    terms_publication_id = '17300000-0000-4000-8000-000000000101',
    terms_accepted_at = statement_timestamp()
where visit_id = '17300000-0000-4000-8000-000000000513';

insert into public.booking_change_requests (
  id, source_visit_id, human_id, revision, kind, channel, reason_code, status,
  requested_at
) values (
  '17300000-0000-4000-8000-000000000703',
  '17300000-0000-4000-8000-000000000513',
  '17300000-0000-4000-8000-000000000010',
  7, 'cancel', 'staff', 'on_time_customer_change', 'closed',
  statement_timestamp()
);
insert into public.booking_policy_incidents (
  id, revision, visit_id, human_id, kind, appointment_date, recorded_by, reason
) values (
  '17300000-0000-4000-8000-000000000724', 5,
  '17300000-0000-4000-8000-000000000513',
  '17300000-0000-4000-8000-000000000010',
  'late_partial_change', current_date + 38,
  '17300000-0000-4000-8000-000000000001',
  'detail revision fixture'
);

-- ── 1-2: staff-only role gate ──────────────────────────────────────

select set_config(
  'request.jwt.claims',
  '{"sub":"17300000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.list_staff_booking_policy_attention() $$,
  '42501', null, 'a customer cannot read the staff attention queue'
);
select throws_ok(
  $$ select public.list_staff_booking_visit(
       '17300000-0000-4000-8000-000000000513') $$,
  '42501', null, 'a customer cannot read staff visit detail'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17300000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 3-21: all-open queue and exact boundaries ──────────────────────

select is(
  smarter_dog_private.booking_policy_due_at_or_before(
    timestamptz '2026-07-26 15:00:00+00',
    timestamptz '2026-07-26 15:00:00+00'
  ),
  true,
  'the due predicate includes the exact server-time boundary'
);
select is(
  smarter_dog_private.booking_policy_due_at_or_before(
    timestamptz '2026-07-26 15:00:00.000001+00',
    timestamptz '2026-07-26 15:00:00+00'
  ),
  false,
  'the due predicate excludes one microsecond after the boundary'
);
select is(
  has_function_privilege(
    'authenticated',
    'smarter_dog_private.booking_policy_due_at_or_before(timestamptz,timestamptz)',
    'EXECUTE'
  ),
  false,
  'the deterministic boundary helper is not callable by application roles'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'waitingApprovals'
    ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000501'
  ),
  'a three-month-old waiting approval remains visible'
);
select is(
  (select item ->> 'visitRevision'
     from jsonb_array_elements(
       public.list_staff_booking_policy_attention() -> 'waitingApprovals'
     ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000501'),
  '6',
  'attention work carries the current optimistic visit row revision'
);
select is(
  (public.list_staff_booking_policy_attention() -> 'counts'
    ->> 'waitingApprovals')::int,
  jsonb_array_length(
    public.list_staff_booking_policy_attention() -> 'waitingApprovals'
  ),
  'the waiting-approval count is derived from the returned array'
);
select is(
  public.list_staff_booking_policy_attention() -> 'alternatives' -> 0
    ->> 'requestRevision',
  '4',
  'an alternative carries its mutable request revision'
);
select is(
  public.list_staff_booking_policy_attention() -> 'pendingChanges' -> 0
    ->> 'requestRevision',
  '2',
  'a pending staff change carries its mutable request revision'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'depositChecksDue'
    ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000504'
      and item ->> 'state' = 'awaiting_terms'
  ),
  'awaiting_terms is present once its due time has passed'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'depositChecksDue'
    ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000505'
      and item ->> 'state' = 'awaiting_payment'
  ),
  'awaiting_payment is present once its due time has passed'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'depositChecksDue'
    ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000506'
  ),
  'a future deposit deadline is not due'
);
select is(
  public.list_staff_booking_policy_attention() -> 'depositReconciliations' -> 0
    ->> 'reconciliationId',
  '17300000-0000-4000-8000-000000000711',
  'an old open deposit reconciliation remains visible'
);
select is(
  public.list_staff_booking_policy_attention()
    -> 'servicePrepaymentReconciliations' -> 0 ->> 'reconciliationId',
  '17300000-0000-4000-8000-000000000712',
  'an old open service-prepayment reconciliation remains visible'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'thresholdReviews'
    ) item
    where item ->> 'visitId' = '17300000-0000-4000-8000-000000000512'
      and item ->> 'reasonCode' = 'three_incidents_12m'
  ),
  'an unresolved threshold review remains visible after appointment start'
);
select is(
  (public.list_staff_booking_policy_attention() -> 'counts'
    ->> 'refundsPending')::int,
  2,
  'only the two unsettled refund obligations are pending'
);
select is(
  (public.list_staff_booking_policy_attention() -> 'counts'
    ->> 'refundsOverdue')::int,
  1,
  'the due refund is overdue and the future promise is not'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'refunds'
    ) item
    where item ->> 'obligationId' = '17300000-0000-4000-8000-000000000801'
      and item -> 'visitId' = 'null'::jsonb
  ),
  'an account-credit refund with no visit remains actionable'
);
select is(
  (select item ->> 'overdue'
     from jsonb_array_elements(
       public.list_staff_booking_policy_attention() -> 'refunds'
     ) item
    where item ->> 'obligationId' = '17300000-0000-4000-8000-000000000801'),
  'true',
  'the refund uses the same server-time overdue predicate'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      public.list_staff_booking_policy_attention() -> 'refunds'
    ) item
    where item ->> 'obligationId' = '17300000-0000-4000-8000-000000000803'
  ),
  'a settled refund obligation is absent'
);
select ok(
  (public.list_staff_booking_policy_attention() ->> 'generatedAt') is not null,
  'the queue reports the one server instant used for its derived state'
);

-- ── 22-33: complete detail, revisions and visit-level money ─────────

select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000999'
  ),
  null::jsonb,
  'an unknown visit returns null without disclosing another record'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'visit' ->> 'revision',
  '9',
  'staff detail carries the current optimistic visit row revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'changeRequests' -> 0 ->> 'revision',
  '7',
  'staff detail carries each mutable request revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'changeRequests' -> 0 ->> 'sourceVisitRevision',
  '9',
  'staff detail pairs a request with the current source-visit revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'incidents' -> 0 ->> 'revision',
  '5',
  'staff detail carries each mutable incident revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'incidents' -> 0 ->> 'visitRevision',
  '9',
  'staff detail pairs an incident with the current visit revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'billSummary' ->> 'depositPartPaymentPence',
  '1000',
  'one £10 visit deposit is applied once, not once per dog'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'visit' ->> 'termsNoticeBy',
  '17300000-0000-4000-8000-000000000001',
  'staff detail includes the actor who gave the frozen Terms notice'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'billSummary' ->> 'billRevision',
  '2',
  'the bill summary reports the latest immutable service-payment revision'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'billSummary' ->> 'grossServiceTotalPence',
  '9000',
  'gross value uses agreed service and add-on prices, not paid_amount'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'billSummary' ->> 'nonDepositPaidPence',
  '1500',
  'non-deposit paid value comes from immutable visit-payment evidence'
);
select is(
  public.list_staff_booking_visit(
    '17300000-0000-4000-8000-000000000513'
  ) -> 'billSummary' ->> 'amountDuePence',
  '6500',
  'amount due subtracts the service payment and one visit deposit'
);

-- ── 34-35: both projections are read-only ──────────────────────────

create temp table projection_before as
select
  (select count(*) from public.booking_visits) visits,
  (select count(*) from public.booking_change_requests) requests,
  (select count(*) from public.booking_policy_incidents) incidents,
  (select count(*) from public.booking_financial_ledger) ledger,
  (select count(*) from public.booking_policy_audit) audit,
  (select updated_at from public.booking_visits
    where id = '17300000-0000-4000-8000-000000000513') detail_updated_at;

select public.list_staff_booking_policy_attention();
select public.list_staff_booking_visit(
  '17300000-0000-4000-8000-000000000513'
);

select is(
  (select count(*)::int
     from projection_before before
    where before.visits = (select count(*) from public.booking_visits)
      and before.requests = (select count(*) from public.booking_change_requests)
      and before.incidents = (select count(*) from public.booking_policy_incidents)
      and before.ledger = (select count(*) from public.booking_financial_ledger)
      and before.audit = (select count(*) from public.booking_policy_audit)),
  1,
  'reading either projection creates no row'
);
select is(
  (select updated_at from public.booking_visits
    where id = '17300000-0000-4000-8000-000000000513'),
  (select detail_updated_at from projection_before),
  'reading either projection mutates no existing visit'
);

select * from finish();
rollback;
