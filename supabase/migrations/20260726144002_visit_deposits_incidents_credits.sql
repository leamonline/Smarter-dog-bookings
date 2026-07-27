-- ============================================================
-- Visit deposits, incidents, overrides and credit ledger
-- (previous_day_1500_v1 programme, phase 1)
--
-- Money is an immutable event ledger. Deposit state records whether the £10
-- visit obligation is satisfied, never "cash arrived" by itself, and every
-- satisfied state must link source-specific evidence. Nothing here releases
-- capacity for an unpaid or unchecked deposit: `Deposit check due` is a
-- derived attention state, not a timer-driven mutation.
--
-- All amounts are integer pence. The deposit is exactly 1000 pence per visit,
-- never per dog.
--
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 3)
-- ============================================================

-- ── 1. Command receipts (idempotency for every later visit command) ──

create table smarter_dog_private.booking_command_receipts (
  actor_scope text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_scope, idempotency_key)
);
revoke all on smarter_dog_private.booking_command_receipts from public;
revoke all on smarter_dog_private.booking_command_receipts from anon, authenticated, service_role;

-- ── 2. Working-day refund calendar ──────────────────────────────────
--
-- England-and-Wales bank holidays, independent of salon opening days. A
-- missing row must never be read as "an ordinary weekday", so the coverage
-- table records exactly which range has been verified.

create table public.booking_refund_non_working_days (
  holiday_date date primary key,
  label text not null check (nullif(trim(label),'') is not null),
  calendar_source text not null,
  recorded_at timestamptz not null default now()
);

create table public.booking_refund_calendar_coverage (
  id uuid primary key default gen_random_uuid(),
  calendar_source text not null,
  calendar_version text not null,
  covers_from date not null,
  covers_to date not null,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  check (covers_to >= covers_from),
  unique (calendar_source, calendar_version, covers_from, covers_to)
);

alter table public.booking_refund_non_working_days enable row level security;
alter table public.booking_refund_calendar_coverage enable row level security;
revoke all on public.booking_refund_non_working_days from public;
revoke all on public.booking_refund_non_working_days from anon, authenticated;
revoke all on public.booking_refund_calendar_coverage from public;
revoke all on public.booking_refund_calendar_coverage from anon, authenticated;

-- England-and-Wales bank holidays covering the activation horizon plus
-- headroom. Annual maintenance is documented in the reconciliation runbook.
insert into public.booking_refund_non_working_days (holiday_date, label, calendar_source) values
  (date '2026-01-01', 'New Year''s Day', 'gov.uk/bank-holidays'),
  (date '2026-04-03', 'Good Friday', 'gov.uk/bank-holidays'),
  (date '2026-04-06', 'Easter Monday', 'gov.uk/bank-holidays'),
  (date '2026-05-04', 'Early May bank holiday', 'gov.uk/bank-holidays'),
  (date '2026-05-25', 'Spring bank holiday', 'gov.uk/bank-holidays'),
  (date '2026-08-31', 'Summer bank holiday', 'gov.uk/bank-holidays'),
  (date '2026-12-25', 'Christmas Day', 'gov.uk/bank-holidays'),
  (date '2026-12-28', 'Boxing Day (substitute)', 'gov.uk/bank-holidays'),
  (date '2027-01-01', 'New Year''s Day', 'gov.uk/bank-holidays'),
  (date '2027-03-26', 'Good Friday', 'gov.uk/bank-holidays'),
  (date '2027-03-29', 'Easter Monday', 'gov.uk/bank-holidays'),
  (date '2027-05-03', 'Early May bank holiday', 'gov.uk/bank-holidays'),
  (date '2027-05-31', 'Spring bank holiday', 'gov.uk/bank-holidays'),
  (date '2027-08-30', 'Summer bank holiday', 'gov.uk/bank-holidays'),
  (date '2027-12-27', 'Christmas Day (substitute)', 'gov.uk/bank-holidays'),
  (date '2027-12-28', 'Boxing Day (substitute)', 'gov.uk/bank-holidays')
on conflict (holiday_date) do nothing;

insert into public.booking_refund_calendar_coverage
  (calendar_source, calendar_version, covers_from, covers_to)
values ('gov.uk/bank-holidays', '2026-07-22', date '2026-01-01', date '2027-12-31')
on conflict do nothing;

-- Five UK working days from p_from, skipping weekends and recorded holidays.
-- Returns the due instant plus the coverage evidence used, so a refund
-- obligation can never silently rely on an uncovered calendar.
create or replace function public.refund_due_at(p_from timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := (p_from at time zone 'Europe/London')::date;
  v_added int := 0;
begin
  while v_added < 5 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6
       and not exists (select 1 from public.booking_refund_non_working_days
                        where holiday_date = v_date) then
      v_added := v_added + 1;
    end if;
  end loop;
  return (v_date::text || ' 17:00')::timestamp at time zone 'Europe/London';
end;
$$;
revoke all on function public.refund_due_at(timestamptz) from public, anon, authenticated;

-- Which coverage row (if any) actually spans the five-working-day window.
create or replace function public.refund_calendar_coverage_for(p_from timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
    from public.booking_refund_calendar_coverage c
   where c.covers_from <= (p_from at time zone 'Europe/London')::date
     and c.covers_to >= (public.refund_due_at(p_from) at time zone 'Europe/London')::date
   order by c.recorded_at desc, c.covers_to desc, c.covers_from asc, c.id asc
   limit 1;
$$;
revoke all on function public.refund_calendar_coverage_for(timestamptz) from public, anon, authenticated;

-- ── 3. Incidents, audit and staff overrides ─────────────────────────

create table public.booking_policy_incidents (
  id uuid primary key default gen_random_uuid(),
  revision integer not null default 1 check (revision > 0),
  visit_id uuid not null unique,
  human_id uuid not null references public.humans(id),
  kind text not null check (kind in ('late_cancellation','late_reschedule','no_show','late_arrival_unserviceable','late_partial_change')),
  appointment_date date not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  reason text not null,
  waived_at timestamptz,
  waived_by uuid references auth.users(id),
  waiver_reason text,
  check ((waived_at is null) = (waived_by is null)),
  check (waived_at is null or nullif(trim(waiver_reason),'') is not null),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id)
);

create index booking_policy_incidents_human_date_idx
  on public.booking_policy_incidents(human_id, appointment_date)
  where waived_at is null;

create table public.booking_policy_incident_audit (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.booking_policy_incidents(id),
  action text not null check (action in ('recorded','waived','unwaived','corrected')),
  reason text not null,
  actor_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default now()
);

create table public.customer_booking_rule_overrides (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  mode text not null check (mode in ('required','waived')),
  reason text not null check (nullif(trim(reason),'') is not null),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  idempotency_key text not null unique,
  check (effective_to is null or effective_to > effective_from)
);

create unique index customer_booking_rule_overrides_one_current
  on public.customer_booking_rule_overrides(human_id)
  where effective_to is null;

create table public.booking_policy_audit (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.booking_visits(id),
  human_id uuid references public.humans(id),
  action text not null,
  actor_id uuid references auth.users(id),
  actor_scope text not null check (actor_scope in ('customer','staff','service','system')),
  reason text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index booking_policy_audit_visit_idx
  on public.booking_policy_audit(visit_id, occurred_at, id);

-- ── 4. The immutable financial ledger ───────────────────────────────

create table public.booking_financial_ledger (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  visit_id uuid references public.booking_visits(id),
  related_visit_id uuid references public.booking_visits(id),
  event_kind text not null check (event_kind in (
    'deposit_received','deposit_transferred','deposit_retained','service_prepayment_transferred',
    'refund_due','refund_paid','refund_cancelled','credit_issued','credit_reserved',
    'credit_released','credit_applied'
  )),
  amount_pence integer not null check (amount_pence > 0),
  reason text not null,
  idempotency_key text not null unique,
  due_at timestamptz,
  settles_event_id uuid references public.booking_financial_ledger(id),
  actual_paid_at timestamptz,
  bank_reference text,
  refund_origin text check (refund_origin in ('deposit','account_credit','service_prepayment')),
  refund_deadline_basis text check (refund_deadline_basis in ('deposit_working_days','staff_explicit')),
  refund_calendar_source text,
  refund_calendar_coverage_id uuid,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  check (
    (event_kind = 'refund_due') =
    (due_at is not null and refund_origin is not null and refund_deadline_basis is not null)
  ),
  check (
    event_kind <> 'refund_due'
    or (
      refund_deadline_basis = 'deposit_working_days'
      and refund_origin in ('deposit','account_credit')
      and refund_calendar_source is not null
      and refund_calendar_coverage_id is not null
    )
    or (
      refund_deadline_basis = 'staff_explicit'
      and refund_origin = 'service_prepayment'
      and refund_calendar_source is null
      and refund_calendar_coverage_id is null
    )
  ),
  check (
    (event_kind in ('refund_paid','refund_cancelled')) = (settles_event_id is not null)
  ),
  check ((event_kind = 'refund_paid') =
    (actual_paid_at is not null and nullif(trim(bank_reference),'') is not null)),
  check (event_kind = 'refund_due' or refund_calendar_source is null),
  check (event_kind = 'refund_due' or refund_calendar_coverage_id is null),
  check (event_kind = 'refund_due' or refund_origin is null),
  check (event_kind = 'refund_due' or refund_deadline_basis is null),
  check (event_kind = 'refund_paid' or (actual_paid_at is null and bank_reference is null)),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  foreign key (related_visit_id, human_id) references public.booking_visits(id, human_id)
);

alter table public.booking_financial_ledger
  add constraint booking_financial_ledger_coverage_fk
  foreign key (refund_calendar_coverage_id)
  references public.booking_refund_calendar_coverage(id);

create unique index booking_financial_ledger_one_refund_settlement
  on public.booking_financial_ledger(settles_event_id)
  where event_kind in ('refund_paid','refund_cancelled');

create index booking_financial_ledger_human_kind_idx
  on public.booking_financial_ledger(human_id, event_kind);
create index booking_financial_ledger_visit_idx
  on public.booking_financial_ledger(visit_id, recorded_at, id);

-- Ledger rows are facts: never updated, never deleted.
create or replace function public.guard_immutable_booking_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_guard_booking_financial_ledger on public.booking_financial_ledger;
create trigger trg_guard_booking_financial_ledger
  before update or delete on public.booking_financial_ledger
  for each row execute function public.guard_immutable_booking_row();

drop trigger if exists trg_guard_booking_policy_incident_audit on public.booking_policy_incident_audit;
create trigger trg_guard_booking_policy_incident_audit
  before update or delete on public.booking_policy_incident_audit
  for each row execute function public.guard_immutable_booking_row();

drop trigger if exists trg_guard_booking_policy_audit on public.booking_policy_audit;
create trigger trg_guard_booking_policy_audit
  before update or delete on public.booking_policy_audit
  for each row execute function public.guard_immutable_booking_row();

-- ── 5. The one-per-visit deposit record ─────────────────────────────

create table public.booking_visit_deposits (
  visit_id uuid primary key references public.booking_visits(id),
  origin text not null check (origin in ('legacy_import','visit_v1')),
  state text not null check (state in (
    'not_required','awaiting_terms','awaiting_payment','received',
    'received_liability','not_received','reconciliation_required'
  )),
  amount_pence integer not null default 1000 check (amount_pence = 1000),
  requirement_reason text,
  exemption_reason text,
  requirement_decided_at timestamptz not null,
  customer_payment_reference text,
  staff_verification_reference text,
  bank_instruction_id uuid references public.booking_deposit_bank_instruction_versions(id),
  due_at timestamptz,
  bank_received_at timestamptz,
  satisfaction_source text check (satisfaction_source in ('bank','credit','transfer','legacy_import')),
  satisfaction_event_id uuid,
  disposition_event_id uuid,
  recorded_at timestamptz,
  recorded_by uuid references auth.users(id),
  terms_publication_id uuid references public.booking_terms_publication_versions(id),
  terms_accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    state = 'reconciliation_required'
    or (state = 'not_required' and due_at is null and bank_received_at is null)
    or (state in ('awaiting_terms','awaiting_payment')
        and due_at is not null and nullif(trim(requirement_reason),'') is not null
        and bank_received_at is null and recorded_at is null)
    or (state = 'received' and satisfaction_source is not null
        and satisfaction_event_id is not null and recorded_at is not null
        and (origin = 'legacy_import' or recorded_by is not null)
        and ((satisfaction_source = 'bank' and bank_received_at is not null)
             or (satisfaction_source = 'credit' and bank_received_at is null)
             or (satisfaction_source = 'transfer' and bank_received_at is null)
             or satisfaction_source = 'legacy_import'))
    or (state = 'received_liability' and satisfaction_source = 'bank'
        and satisfaction_event_id is not null
        and bank_received_at is not null and recorded_at is not null
        and recorded_by is not null)
    or (state = 'not_received' and recorded_at is not null
        and (origin = 'legacy_import' or recorded_by is not null))
  ),
  check (state in ('received','received_liability')
         or (satisfaction_source is null and satisfaction_event_id is null and disposition_event_id is null)),
  check (state = 'received_liability' or disposition_event_id is null),
  check (state in ('not_required','reconciliation_required')
         or (origin = 'legacy_import' and state in ('received','received_liability','not_received'))
         or bank_instruction_id is not null),
  check (
    origin = 'legacy_import' or state not in ('awaiting_terms','awaiting_payment','received')
    or terms_publication_id is not null
  ),
  check (
    origin = 'legacy_import' or state not in ('awaiting_payment','received')
    or terms_accepted_at is not null
  )
);

create unique index booking_visit_deposits_v1_reference_unique
  on public.booking_visit_deposits(customer_payment_reference)
  where origin = 'visit_v1' and customer_payment_reference is not null;

alter table public.booking_visit_deposits
  add foreign key (satisfaction_event_id) references public.booking_financial_ledger(id),
  add foreign key (disposition_event_id) references public.booking_financial_ledger(id);

drop trigger if exists booking_visit_deposits_updated on public.booking_visit_deposits;
create trigger booking_visit_deposits_updated before update on public.booking_visit_deposits
  for each row execute function update_modified_column();

-- Deposit evidence must actually describe this visit's £10.
create or replace function public.check_booking_visit_deposit_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d record;
  ev record;
  v record;
begin
  select * into d from public.booking_visit_deposits where visit_id = new.visit_id;
  if not found then
    return null;
  end if;
  select * into v from public.booking_visits where id = d.visit_id;

  -- A v1 deposit must carry its visit's immutable Terms publication.
  if d.origin = 'visit_v1' and d.terms_publication_id is not null
     and v.terms_publication_id is distinct from d.terms_publication_id then
    raise exception 'deposit %: Terms publication must match the visit snapshot', d.visit_id
      using errcode = 'P0001';
  end if;

  if d.satisfaction_event_id is not null then
    select * into ev from public.booking_financial_ledger where id = d.satisfaction_event_id;
    if not found or ev.human_id <> v.human_id or ev.amount_pence <> 1000 then
      raise exception 'deposit %: satisfaction evidence must be this customer''s £10', d.visit_id
        using errcode = 'P0001';
    end if;
    if d.satisfaction_source = 'bank' and ev.event_kind <> 'deposit_received' then
      raise exception 'deposit %: bank satisfaction needs a deposit_received event', d.visit_id
        using errcode = 'P0001';
    end if;
    if d.satisfaction_source = 'credit' and ev.event_kind <> 'credit_applied' then
      raise exception 'deposit %: credit satisfaction needs a credit_applied event', d.visit_id
        using errcode = 'P0001';
    end if;
    if d.satisfaction_source = 'transfer' and ev.event_kind <> 'deposit_transferred' then
      raise exception 'deposit %: transfer satisfaction needs a deposit_transferred event', d.visit_id
        using errcode = 'P0001';
    end if;
    if d.satisfaction_source <> 'legacy_import' and ev.visit_id is distinct from d.visit_id then
      raise exception 'deposit %: satisfaction evidence belongs to another visit', d.visit_id
        using errcode = 'P0001';
    end if;
  end if;

  if d.disposition_event_id is not null then
    select * into ev from public.booking_financial_ledger where id = d.disposition_event_id;
    if not found or ev.human_id <> v.human_id or ev.amount_pence <> 1000
       or ev.event_kind not in ('refund_due','credit_issued','deposit_transferred') then
      raise exception 'deposit %: disposition must be a £10 refund, credit or transfer', d.visit_id
        using errcode = 'P0001';
    end if;
  end if;

  -- received_liability is valid only while exactly one reconciliation is open
  -- (no disposition) or once its disposition matches a resolved one.
  if d.state = 'received_liability' then
    if d.disposition_event_id is null then
      if (select count(*) from public.booking_deposit_money_reconciliations r
           where r.visit_id = d.visit_id and r.state = 'open') <> 1 then
        raise exception 'deposit %: an unresolved liability needs exactly one open reconciliation',
          d.visit_id using errcode = 'P0001';
      end if;
    else
      if not exists (select 1 from public.booking_deposit_money_reconciliations r
                      where r.visit_id = d.visit_id and r.state = 'resolved') then
        raise exception 'deposit %: a resolved liability needs its reconciliation closed',
          d.visit_id using errcode = 'P0001';
      end if;
      if exists (select 1 from public.booking_deposit_money_reconciliations r
                  where r.visit_id = d.visit_id and r.state = 'open') then
        raise exception 'deposit %: a resolved liability cannot keep an open reconciliation',
          d.visit_id using errcode = 'P0001';
      end if;
    end if;
  end if;

  return null;
end;
$$;

create table public.booking_deposit_money_reconciliations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  amount_pence integer not null check (amount_pence = 1000),
  state text not null check (state in ('open','resolved')),
  opened_reason text not null check (nullif(trim(opened_reason),'') is not null),
  resolution text check (resolution in ('refund','credit','transfer')),
  resolution_event_id uuid references public.booking_financial_ledger(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'open') = (resolved_at is null and resolution is null and resolution_event_id is null))
);

create unique index booking_deposit_money_recon_one_open
  on public.booking_deposit_money_reconciliations(visit_id)
  where state = 'open';

drop trigger if exists ct_booking_visit_deposit_evidence on public.booking_visit_deposits;
create constraint trigger ct_booking_visit_deposit_evidence
  after insert or update on public.booking_visit_deposits
  deferrable initially deferred
  for each row execute function public.check_booking_visit_deposit_evidence();

-- ── 6. Change requests, destination holds and transfer reservations ─

create table public.booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  source_visit_id uuid not null references public.booking_visits(id),
  proposed_visit_id uuid references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  revision integer not null default 1 check (revision > 0),
  kind text not null check (kind in ('cancel','reschedule','partial_change','staff_alternative')),
  channel text not null check (channel in ('website','whatsapp','staff')),
  reason_code text not null check (reason_code in (
    'on_time_customer_change','salon_change','accepted_late_customer_request',
    'source_deadline_late','destination_last_minute_staff_review',
    'auto_confirm_disabled_staff_review','staff_alternative','staff_partial_change'
  )),
  status text not null check (status in (
    'pending_staff','waiting_customer','accepted','declined','withdrawn','closed'
  )),
  requested_at timestamptz not null,
  received_at timestamptz not null default now(),
  provider_message_id text,
  customer_message text,
  requested_booking_date date,
  requested_slot_assignments jsonb,
  requested_destination_hash text,
  source_revision bigint,
  review_id uuid,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_reason text,
  outcome_key text unique,
  foreign key (source_visit_id, human_id) references public.booking_visits(id, human_id),
  unique (id, human_id, source_visit_id),
  check (
    (kind in ('reschedule','staff_alternative')
      and requested_booking_date is not null and requested_slot_assignments is not null
      and requested_destination_hash is not null and source_revision is not null)
    or
    (kind not in ('reschedule','staff_alternative')
      and requested_booking_date is null and requested_slot_assignments is null
      and requested_destination_hash is null and source_revision is null and review_id is null)
  )
);

create unique index booking_change_requests_one_open_per_visit
  on public.booking_change_requests(source_visit_id)
  where status in ('pending_staff','waiting_customer');

-- Reason code must agree with kind, and a proposed visit must share the owner.
create or replace function public.check_booking_change_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v record;
begin
  select * into r from public.booking_change_requests where id = new.id;
  if not found then
    return null;
  end if;

  if r.kind = 'cancel' and r.reason_code not in (
       'on_time_customer_change','salon_change','accepted_late_customer_request',
       'source_deadline_late') then
    raise exception 'change request %: reason % is not valid for a cancellation', r.id, r.reason_code
      using errcode = 'P0001';
  end if;
  if r.kind = 'staff_alternative' and r.reason_code <> 'staff_alternative' then
    raise exception 'change request %: a staff alternative needs the staff_alternative reason', r.id
      using errcode = 'P0001';
  end if;
  if r.kind = 'partial_change' and r.reason_code <> 'staff_partial_change' then
    raise exception 'change request %: a partial change needs the staff_partial_change reason', r.id
      using errcode = 'P0001';
  end if;
  if r.channel = 'whatsapp' and r.provider_message_id is null then
    raise exception 'change request %: a WhatsApp request needs its provider message id', r.id
      using errcode = 'P0001';
  end if;

  if r.proposed_visit_id is not null then
    select * into v from public.booking_visits where id = r.proposed_visit_id;
    if not found or v.human_id <> r.human_id then
      raise exception 'change request %: the proposed visit belongs to another customer', r.id
        using errcode = 'P0001';
    end if;
    if r.status not in ('accepted','closed') then
      raise exception 'change request %: a proposed visit exists only once accepted', r.id
        using errcode = 'P0001';
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists ct_booking_change_request on public.booking_change_requests;
create constraint trigger ct_booking_change_request
  after insert or update on public.booking_change_requests
  deferrable initially deferred
  for each row execute function public.check_booking_change_request();

-- Destination data is immutable once the request exists.
create or replace function public.guard_booking_change_request_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.requested_booking_date is distinct from old.requested_booking_date
     or new.requested_slot_assignments is distinct from old.requested_slot_assignments
     or new.requested_destination_hash is distinct from old.requested_destination_hash
     or new.source_visit_id is distinct from old.source_visit_id
     or new.human_id is distinct from old.human_id
     or new.kind is distinct from old.kind then
    raise exception 'change request %: destination and identity are immutable', old.id
      using errcode = 'P0001';
  end if;
  if new.revision < old.revision then
    raise exception 'change request %: revision cannot move backwards', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_change_request_destination on public.booking_change_requests;
create trigger trg_guard_booking_change_request_destination
  before update on public.booking_change_requests
  for each row execute function public.guard_booking_change_request_destination();

create table public.booking_change_destination_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  human_id uuid not null references public.humans(id),
  source_visit_id uuid not null,
  proposal_revision integer not null check (proposal_revision > 0),
  purpose text not null check (purpose in (
    'auto_confirm_review','new_booking_alternative','reschedule_counterproposal'
  )),
  booking_date date not null,
  slot_assignments jsonb not null,
  destination_hash text not null,
  state text not null check (state in ('held','consumed','released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  foreign key (request_id, human_id, source_visit_id)
    references public.booking_change_requests(id, human_id, source_visit_id),
  check ((state = 'held') = (consumed_at is null and released_at is null)),
  check ((state = 'consumed') = (consumed_at is not null and released_at is null)),
  check ((state = 'released') = (released_at is not null and consumed_at is null))
);

create unique index booking_change_one_held_destination
  on public.booking_change_destination_reservations(request_id)
  where state = 'held';

create table public.booking_deposit_transfer_reservations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  source_visit_id uuid not null,
  destination_visit_id uuid not null,
  source_satisfaction_event_id uuid not null,
  amount_pence integer not null check (amount_pence = 1000),
  state text not null check (state in ('held','applied','released')),
  fallback_source_disposition text not null check (fallback_source_disposition in ('retain','refund','credit')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  released_at timestamptz,
  foreign key (source_visit_id, human_id) references public.booking_visits(id, human_id),
  foreign key (destination_visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'held') = (applied_at is null and released_at is null)),
  check ((state = 'applied') = (applied_at is not null and released_at is null)),
  check ((state = 'released') = (released_at is not null and applied_at is null))
);

alter table public.booking_deposit_transfer_reservations
  add foreign key (source_satisfaction_event_id)
    references public.booking_financial_ledger(id);

create unique index booking_deposit_transfer_one_active_source
  on public.booking_deposit_transfer_reservations(source_visit_id)
  where state = 'held';
create unique index booking_deposit_transfer_one_use_per_satisfaction
  on public.booking_deposit_transfer_reservations(source_satisfaction_event_id);
create unique index booking_deposit_transfer_one_source_per_destination
  on public.booking_deposit_transfer_reservations(destination_visit_id);

-- The destination must be the source's direct same-lineage successor.
create or replace function public.check_booking_deposit_transfer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  src record;
  dst record;
  ev record;
begin
  select * into t from public.booking_deposit_transfer_reservations where id = new.id;
  if not found then
    return null;
  end if;
  select * into src from public.booking_visits where id = t.source_visit_id;
  select * into dst from public.booking_visits where id = t.destination_visit_id;
  if not found or src.lineage_id <> dst.lineage_id
     or dst.supersedes_visit_id is distinct from src.id then
    raise exception 'transfer %: the destination must be the source''s direct successor', t.id
      using errcode = 'P0001';
  end if;
  if t.state = 'held' and dst.confirmation_state <> 'unconfirmed' then
    raise exception 'transfer %: a held transfer needs an unconfirmed destination', t.id
      using errcode = 'P0001';
  end if;
  select * into ev from public.booking_financial_ledger where id = t.source_satisfaction_event_id;
  if not found or ev.human_id <> t.human_id or ev.amount_pence <> 1000
     or ev.visit_id is distinct from t.source_visit_id then
    raise exception 'transfer %: the satisfaction event must be the source visit''s £10', t.id
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists ct_booking_deposit_transfer on public.booking_deposit_transfer_reservations;
create constraint trigger ct_booking_deposit_transfer
  after insert or update on public.booking_deposit_transfer_reservations
  deferrable initially deferred
  for each row execute function public.check_booking_deposit_transfer();

create table public.booking_late_deposit_satisfaction_requests (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  due_at_snapshot timestamptz not null,
  source_kind text not null check (source_kind in ('reserved_credit','reserved_transfer')),
  reservation_id uuid not null,
  amount_pence integer not null check (amount_pence = 1000),
  terms_publication_id uuid not null references public.booking_terms_publication_versions(id),
  terms_accepted_at timestamptz not null,
  requested_at timestamptz not null default now(),
  state text not null check (state in ('pending','accepted','declined')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_reason text,
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'pending') = (decided_at is null))
);

create unique index booking_late_deposit_one_open
  on public.booking_late_deposit_satisfaction_requests(visit_id)
  where state = 'pending';

-- ── 7. Credit reservations ──────────────────────────────────────────

create table public.customer_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  visit_id uuid not null unique references public.booking_visits(id),
  amount_pence integer not null check (amount_pence > 0),
  state text not null check (state in ('reserved','released','applied')),
  reserve_event_id uuid not null unique references public.booking_financial_ledger(id),
  terminal_event_id uuid unique references public.booking_financial_ledger(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'reserved') = (terminal_event_id is null))
);

drop trigger if exists customer_credit_reservations_updated on public.customer_credit_reservations;
create trigger customer_credit_reservations_updated before update on public.customer_credit_reservations
  for each row execute function update_modified_column();

create or replace function public.check_customer_credit_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cr record;
  ev record;
begin
  select * into cr from public.customer_credit_reservations where id = new.id;
  if not found then
    return null;
  end if;
  select * into ev from public.booking_financial_ledger where id = cr.reserve_event_id;
  if not found or ev.event_kind <> 'credit_reserved'
     or ev.human_id <> cr.human_id or ev.amount_pence <> cr.amount_pence then
    raise exception 'credit reservation %: reserve evidence must match human and amount', cr.id
      using errcode = 'P0001';
  end if;
  if cr.terminal_event_id is not null then
    select * into ev from public.booking_financial_ledger where id = cr.terminal_event_id;
    if not found
       or (cr.state = 'applied' and ev.event_kind <> 'credit_applied')
       or (cr.state = 'released' and ev.event_kind <> 'credit_released')
       or ev.human_id <> cr.human_id or ev.amount_pence <> cr.amount_pence
       or ev.visit_id is distinct from cr.visit_id then
      raise exception 'credit reservation %: terminal evidence must match state, human, visit and amount',
        cr.id using errcode = 'P0001';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists ct_customer_credit_reservation on public.customer_credit_reservations;
create constraint trigger ct_customer_credit_reservation
  after insert or update on public.customer_credit_reservations
  deferrable initially deferred
  for each row execute function public.check_customer_credit_reservation();

-- Permanent gross credit = credit_issued - credit_applied - account-credit
-- refunds actually paid. credit_reserved/credit_released are audit events and
-- never enter the gross equation; available credit subtracts the operational
-- reservations and unresolved account-credit refund obligations exactly once.
create or replace function public.customer_credit_balance(p_human_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with gross as (
    select
      coalesce(sum(case when l.event_kind = 'credit_issued' then l.amount_pence else 0 end), 0)
      - coalesce(sum(case when l.event_kind = 'credit_applied' then l.amount_pence else 0 end), 0)
      - coalesce(sum(case when l.event_kind = 'refund_paid'
                           and exists (select 1 from public.booking_financial_ledger o
                                        where o.id = l.settles_event_id
                                          and o.refund_origin = 'account_credit')
                          then l.amount_pence else 0 end), 0) as pence
    from public.booking_financial_ledger l
    where l.human_id = p_human_id
  ),
  reserved as (
    select coalesce(sum(r.amount_pence), 0) as pence
      from public.customer_credit_reservations r
     where r.human_id = p_human_id and r.state = 'reserved'
  ),
  pending_refunds as (
    select coalesce(sum(o.amount_pence), 0) as pence
      from public.booking_financial_ledger o
     where o.human_id = p_human_id
       and o.event_kind = 'refund_due'
       and o.refund_origin = 'account_credit'
       and not exists (select 1 from public.booking_financial_ledger s
                        where s.settles_event_id = o.id)
  )
  select jsonb_build_object(
    'grossPence', gross.pence,
    'reservedPence', reserved.pence + pending_refunds.pence,
    'availablePence', greatest(gross.pence - reserved.pence - pending_refunds.pence, 0)
  )
  from gross, reserved, pending_refunds;
$$;
revoke all on function public.customer_credit_balance(uuid) from public, anon, authenticated;

create or replace function public.get_staff_customer_credit_balance(p_human_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return public.customer_credit_balance(p_human_id);
end;
$$;
revoke all on function public.get_staff_customer_credit_balance(uuid) from public;
revoke all on function public.get_staff_customer_credit_balance(uuid) from anon;
revoke all on function public.get_staff_customer_credit_balance(uuid) from authenticated;
grant execute on function public.get_staff_customer_credit_balance(uuid) to authenticated;

-- The customer sees only their own available/reserved totals.
create or replace function public.get_customer_credit_balance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  v jsonb;
begin
  select id into v_human from public.humans where customer_user_id = (select auth.uid());
  if v_human is null then
    raise exception 'No customer record' using errcode = 'P0001';
  end if;
  v := public.customer_credit_balance(v_human);
  return jsonb_build_object(
    'availablePence', v->'availablePence',
    'reservedPence', v->'reservedPence'
  );
end;
$$;
revoke all on function public.get_customer_credit_balance() from public;
revoke all on function public.get_customer_credit_balance() from anon;
revoke all on function public.get_customer_credit_balance() from authenticated;
grant execute on function public.get_customer_credit_balance() to authenticated;

-- ── 8. Non-deposit service payments and prepayment reconciliation ───

create table public.booking_visit_service_payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  bill_revision integer not null check (bill_revision > 0),
  amount_pence integer not null check (amount_pence > 0),
  payment_method text not null,
  actual_paid_at timestamptz not null,
  reference text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  reason text not null,
  idempotency_key text not null unique,
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id)
);

create index booking_visit_service_payments_visit_revision_idx
  on public.booking_visit_service_payments (visit_id, bill_revision desc);

drop trigger if exists trg_guard_booking_visit_service_payments on public.booking_visit_service_payments;
create trigger trg_guard_booking_visit_service_payments
  before update or delete on public.booking_visit_service_payments
  for each row execute function public.guard_immutable_booking_row();

create table public.booking_service_prepayment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  human_id uuid not null references public.humans(id),
  amount_pence integer not null check (amount_pence > 0),
  evidence jsonb not null,
  state text not null check (state in ('open','refund_due','transferred','closed')),
  target_visit_id uuid references public.booking_visits(id),
  obligation_event_id uuid references public.booking_financial_ledger(id),
  opened_reason text not null check (nullif(trim(opened_reason),'') is not null),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_reason text,
  foreign key (visit_id, human_id) references public.booking_visits(id, human_id),
  foreign key (target_visit_id, human_id) references public.booking_visits(id, human_id),
  check ((state = 'open') = (resolved_at is null)),
  check (state <> 'transferred' or target_visit_id is not null),
  check (state <> 'refund_due' or obligation_event_id is not null)
);

create unique index booking_service_prepayment_one_open
  on public.booking_service_prepayment_reconciliations(visit_id)
  where state = 'open';

-- ── 9. Customer contact evidence (same-day waiver) ──────────────────

create table public.booking_customer_contact_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  channel text not null check (channel in ('website','whatsapp','phone','email','in_person')),
  contacted_at timestamptz not null,
  provider_message_id text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  idempotency_key text not null unique,
  check (channel <> 'whatsapp' or provider_message_id is not null)
);

-- Contact evidence must be real: never in the future, and before the visit
-- starts, or it cannot support the same-day/last-minute waiver.
create or replace function public.check_booking_contact_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
begin
  if new.contacted_at > statement_timestamp() then
    raise exception 'contact evidence cannot be in the future' using errcode = 'P0001';
  end if;
  v_start := public.visit_start_at(new.visit_id);
  if v_start is not null and new.contacted_at >= v_start then
    raise exception 'contact evidence must precede the appointment start' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_booking_contact_event on public.booking_customer_contact_events;
create trigger trg_check_booking_contact_event
  before insert on public.booking_customer_contact_events
  for each row execute function public.check_booking_contact_event();

-- ── 10. RLS + revokes on every new table ────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'booking_policy_incidents','booking_policy_incident_audit','customer_booking_rule_overrides',
    'booking_policy_audit','booking_financial_ledger','booking_visit_deposits',
    'booking_deposit_money_reconciliations','booking_change_requests',
    'booking_change_destination_reservations','booking_deposit_transfer_reservations',
    'booking_late_deposit_satisfaction_requests','customer_credit_reservations',
    'booking_visit_service_payments','booking_service_prepayment_reconciliations',
    'booking_customer_contact_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Explicit, greppable revokes for the money-bearing tables (the loop above
-- already applied them; these make the contract visible in review).
revoke all on public.booking_financial_ledger from anon, authenticated;
revoke all on public.booking_visit_deposits from anon, authenticated;
revoke all on public.booking_policy_incidents from anon, authenticated;
revoke all on public.customer_credit_reservations from anon, authenticated;

-- ── 11. The visit bill summary ──────────────────────────────────────
--
-- Server-owned read model for the part-payment rule: the £10 reduces the bill
-- exactly once per visit, and never by summing duplicated legacy dog rows.

-- Database counterpart of the application guide-price resolver. Booking value
-- uses the agreed one-off override, then the dog's usual price, then the
-- current Settings guide. Both integer-pence JSON and the legacy "£42" format
-- are tolerated so the read model remains valid during a rolling deployment.
create or replace function smarter_dog_private.booking_guide_price_pence(
  p_service text,
  p_size text
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_key text;
  v_value jsonb;
  v_raw text;
begin
  v_service_key := case lower(trim(coalesce(p_service, '')))
    when 'full groom' then 'full-groom'
    when 'full-groom' then 'full-groom'
    when 'bath & brush' then 'bath-and-brush'
    when 'bath and brush' then 'bath-and-brush'
    when 'bath-and-brush' then 'bath-and-brush'
    when 'bath & de-shed' then 'bath-and-deshed'
    when 'bath and de-shed' then 'bath-and-deshed'
    when 'bath-and-deshed' then 'bath-and-deshed'
    when 'puppy groom' then 'puppy-groom'
    when 'puppy-groom' then 'puppy-groom'
    else lower(trim(coalesce(p_service, '')))
  end;

  select sc.pricing #> array[v_service_key, lower(trim(coalesce(p_size, '')))]
    into v_value
    from public.salon_config sc
   order by sc.updated_at desc nulls last, sc.id
   limit 1;

  if jsonb_typeof(v_value) = 'number' then
    return round((v_value #>> '{}')::numeric)::integer;
  end if;
  v_raw := v_value #>> '{}';
  if v_raw ~ '^£?[0-9]+(\.[0-9]{1,2})?\+?$' then
    return round(regexp_replace(v_raw, '[£+]', '', 'g')::numeric * 100)::integer;
  end if;

  return case v_service_key
    when 'full-groom' then case lower(p_size)
      when 'small' then 4200 when 'medium' then 4600 when 'large' then 6000
      else null end
    when 'bath-and-brush' then case lower(p_size)
      when 'small' then 3800 when 'medium' then 4200 when 'large' then 5500
      else null end
    when 'bath-and-deshed' then case lower(p_size)
      when 'small' then 3800 when 'medium' then 4200 when 'large' then 5500
      else null end
    when 'puppy-groom' then case lower(p_size)
      when 'small' then 3800 when 'medium' then 3800
      else null end
    else null
  end;
end;
$$;
revoke all on function smarter_dog_private.booking_guide_price_pence(text, text)
  from public, anon, authenticated;

create or replace view public.booking_visit_bill_summary
with (security_invoker = true) as
select
  v.id as visit_id,
  v.human_id,
  v.booking_date,
  coalesce(sp.bill_revision, 1) as bill_revision,
  coalesce(svc.gross_service_total_pence, 0) as gross_service_total_pence,
  coalesce(sp.non_deposit_paid_pence, 0) as non_deposit_paid_pence,
  case
    when d.state = 'received'
     and d.satisfaction_source in ('bank','credit','transfer','legacy_import')
     and d.disposition_event_id is null
     and not exists (
       select 1 from public.booking_financial_ledger l
        where l.visit_id = v.id
          and l.event_kind in ('deposit_retained','deposit_transferred','credit_issued','refund_due')
          and l.id <> coalesce(d.satisfaction_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
     )
    then 1000
    else 0
  end as deposit_part_payment_pence,
  greatest(
    coalesce(svc.gross_service_total_pence, 0)::int
    - coalesce(sp.non_deposit_paid_pence, 0)::int
    - case
        when d.state = 'received'
         and d.satisfaction_source in ('bank','credit','transfer','legacy_import')
         and d.disposition_event_id is null
         and not exists (
           select 1 from public.booking_financial_ledger l
            where l.visit_id = v.id
              and l.event_kind in ('deposit_retained','deposit_transferred','credit_issued','refund_due')
              and l.id <> coalesce(d.satisfaction_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
         )
        then 1000 else 0 end,
    0)::int as amount_due_pence
from public.booking_visits v
left join public.booking_visit_deposits d on d.visit_id = v.id
left join lateral (
  select coalesce(sum(
    case
      when b.price_override is not null and b.price_override > 0
        then round(b.price_override * 100)::integer
      when dog.custom_price is not null and dog.custom_price > 0
        then dog.custom_price * 100
      else coalesce(
        smarter_dog_private.booking_guide_price_pence(b.service, b.size),
        0
      )
    end
    + coalesce((
      select sum(case addon
        when 'Flea Bath' then 1000
        else 0
      end)
      from unnest(coalesce(b.addons, '{}'::text[])) addon
    ), 0)
  ), 0)::integer as gross_service_total_pence
    from public.bookings b
    join public.dogs dog on dog.id = b.dog_id
   where b.visit_id = v.id and b.visit_membership_state = 'included'
) svc on true
left join lateral (
  select coalesce(sum(p.amount_pence), 0)::int as non_deposit_paid_pence,
         coalesce(max(p.bill_revision), 1) as bill_revision
    from public.booking_visit_service_payments p
   where p.visit_id = v.id
) sp on true;

revoke all on public.booking_visit_bill_summary from public;
revoke all on public.booking_visit_bill_summary from anon, authenticated;

-- ── 12. Deposit requirement resolver ────────────────────────────────
--
-- Fixed order: eligibility snapshot → last-minute → insufficient window →
-- staff override → three-incident episode threshold → single uncleared
-- incident → not required.

create or replace function public.resolve_deposit_requirement(
  p_human_id uuid,
  p_booking_date date,
  p_eligibility_at timestamptz,
  p_policy_code text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_deadline timestamptz;
  v_start timestamptz;
  v_override record;
  v_hold int;
  v_due timestamptz;
  v_count int;
  v_latest date;
  v_episode_start date;
  v_prev date;
  v_gap_closed boolean := false;
  v_threshold boolean := false;
  v_incident record;
  v_window date[];
  v_reason text;
  v_customer_reason text;
  v_required boolean;
  v_bank_ok boolean;
  v_terms_ok boolean;
begin
  select * into s from public.booking_policy_settings where singleton;
  v_hold := s.deposit_hold_hours;
  v_deadline := public.change_deadline_for(coalesce(p_policy_code, 'previous_day_1500_v1'),
                                           p_booking_date, '08:30');
  v_start := (p_booking_date::text || ' 08:30')::timestamp at time zone 'Europe/London';

  -- 2. Same-day / last-minute: eligibility after the change deadline.
  if p_eligibility_at > v_deadline then
    return jsonb_build_object(
      'required', false, 'reasonCode', 'same_day_or_last_minute',
      'customerReason', null, 'incidentCount12m', 0,
      'amountPence', 1000, 'holdHours', v_hold, 'dueAt', null);
  end if;

  -- 3. The hold window would outlast the appointment.
  if p_eligibility_at + make_interval(hours => v_hold) > v_start then
    return jsonb_build_object(
      'required', false, 'reasonCode', 'insufficient_window',
      'customerReason', null, 'incidentCount12m', 0,
      'amountPence', 1000, 'holdHours', v_hold, 'dueAt', null);
  end if;

  v_due := least(p_eligibility_at + make_interval(hours => v_hold), v_start);

  -- 4. A current audited staff override wins.
  select * into v_override
    from public.customer_booking_rule_overrides o
   where o.human_id = p_human_id
     and o.effective_from <= p_eligibility_at
     and (o.effective_to is null or o.effective_to > p_eligibility_at)
   order by o.effective_from desc
   limit 1;
  if found then
    if v_override.mode = 'waived' then
      return jsonb_build_object(
        'required', false, 'reasonCode', 'staff_waived',
        'customerReason', null, 'incidentCount12m', 0,
        'amountPence', 1000, 'holdHours', v_hold, 'dueAt', null);
    end if;
    v_required := true;
    v_reason := 'staff_applied_requirement';
    v_customer_reason := 'staff_applied_requirement';
  end if;

  -- 5/6. Incident episodes. A gap of 12 calendar months or more closes the
  -- prior episode; later incidents start afresh.
  if v_required is not true then
    v_prev := null;
    v_episode_start := null;
    v_window := '{}'::date[];
    for v_incident in
      select i.appointment_date
        from public.booking_policy_incidents i
       where i.human_id = p_human_id
         and i.waived_at is null
         and i.appointment_date <= p_booking_date
       order by i.appointment_date
    loop
      if v_prev is not null and v_incident.appointment_date >= v_prev + interval '12 months' then
        v_window := '{}'::date[]; -- gap closed the episode
        v_threshold := false;
      end if;
      v_window := v_window || v_incident.appointment_date;
      -- Three incidents inside an inclusive rolling 12 months.
      if cardinality(v_window) >= 3
         and v_incident.appointment_date
             <= v_window[cardinality(v_window) - 2] + interval '12 months' then
        v_threshold := true;
      end if;
      v_prev := v_incident.appointment_date;
      v_latest := v_incident.appointment_date;
    end loop;

    v_count := cardinality(coalesce(v_window, '{}'::date[]));

    if v_threshold and v_latest is not null
       and p_booking_date <= v_latest + interval '12 months' then
      v_required := true;
      v_reason := 'three_incidents_12m';
      v_customer_reason := 'recent_booking_history';
    elsif v_latest is not null then
      -- A single uncleared incident: cleared only by a later completed visit.
      if not exists (
        select 1 from public.booking_visits bv
         where bv.human_id = p_human_id
           and bv.lifecycle_state = 'completed'
           and bv.booking_date > v_latest
      ) then
        v_required := true;
        v_reason := 'next_booking_after_incident';
        v_customer_reason := 'recent_booking_history';
      end if;
    end if;
  end if;

  if v_required is not true then
    return jsonb_build_object(
      'required', false, 'reasonCode', 'not_required',
      'customerReason', null, 'incidentCount12m', coalesce(v_count, 0),
      'amountPence', 1000, 'holdHours', v_hold, 'dueAt', null);
  end if;

  -- A required result is invalid without complete bank details and a
  -- recorded Terms publication; the caller must raise a staff alert rather
  -- than start an impossible deadline.
  v_bank_ok := s.current_bank_instruction_id is not null
    and s.bank_account_name is not null
    and s.bank_sort_code is not null
    and s.bank_account_number is not null;
  v_terms_ok := s.current_terms_publication_id is not null;

  return jsonb_build_object(
    'required', true,
    'reasonCode', v_reason,
    'customerReason', v_customer_reason,
    'incidentCount12m', coalesce(v_count, 0),
    'amountPence', 1000,
    'holdHours', v_hold,
    'dueAt', v_due,
    'blocked', not (v_bank_ok and v_terms_ok),
    'blockedReason', case
      when not v_bank_ok and not v_terms_ok then 'bank_and_terms_incomplete'
      when not v_bank_ok then 'bank_details_incomplete'
      when not v_terms_ok then 'terms_publication_missing'
      else null end);
end;
$$;
revoke all on function public.resolve_deposit_requirement(uuid, date, timestamptz, text) from public, anon, authenticated;

-- ── 13. Legacy opening-money reconciliation commands ────────────────

create table public.booking_legacy_money_audit (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.booking_visits(id),
  classification text not null check (classification in (
    'no_deposit','awaiting_10_deposit','received_10_deposit','service_prepayment','received_liability'
  )),
  evidence jsonb not null,
  reason text not null check (nullif(trim(reason),'') is not null),
  row_set_hash text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  actor text not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);
alter table public.booking_legacy_money_audit enable row level security;
revoke all on public.booking_legacy_money_audit from public;
revoke all on public.booking_legacy_money_audit from anon, authenticated;

drop trigger if exists trg_guard_booking_legacy_money_audit on public.booking_legacy_money_audit;
create trigger trg_guard_booking_legacy_money_audit
  before update or delete on public.booking_legacy_money_audit
  for each row execute function public.guard_immutable_booking_row();

-- Deterministic evidence hash over the visit's current legacy money fields.
create or replace function public.legacy_visit_money_hash(p_visit_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select md5(coalesce(string_agg(
    b.id::text || '|' || b.deposit_required::text || '|' ||
    coalesce(b.deposit_reference,'') || '|' || coalesce(b.deposit_due_by::text,'') || '|' ||
    coalesce(b.deposit_received_at::text,'') || '|' || coalesce(b.payment,'') || '|' ||
    coalesce(b.payment_method,'') || '|' || coalesce(b.paid_at::text,'') || '|' ||
    coalesce(b.paid_amount::text,''),
    ';' order by b.id), ''))
  from public.bookings b
  where b.visit_id = p_visit_id;
$$;
revoke all on function public.legacy_visit_money_hash(uuid) from public, anon, authenticated;

create or replace function public.preview_legacy_visit_opening_money(
  p_visit_id uuid,
  p_classification text,
  p_evidence jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  src jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_distinct_refs int;
  v_distinct_times int;
  v_amounts numeric[];
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_classification not in ('no_deposit','awaiting_10_deposit','received_10_deposit',
                              'service_prepayment','received_liability') then
    raise exception 'unknown legacy money classification' using errcode = '22023';
  end if;
  select * into v from public.booking_visits where id = p_visit_id;
  if not found then
    raise exception 'unknown visit' using errcode = 'P0001';
  end if;
  if v.runtime_generation <> 'legacy_compat' then
    raise exception 'only legacy visits carry opening money' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object(
    'bookingId', b.id, 'depositRequired', b.deposit_required,
    'depositReference', b.deposit_reference, 'depositDueBy', b.deposit_due_by,
    'depositReceivedAt', b.deposit_received_at, 'payment', b.payment,
    'paymentMethod', b.payment_method, 'paidAt', b.paid_at, 'paidAmount', b.paid_amount
  ) order by b.id) into src
    from public.bookings b where b.visit_id = p_visit_id;

  select count(distinct b.deposit_reference), count(distinct b.deposit_received_at),
         array_agg(distinct b.paid_amount)
    into v_distinct_refs, v_distinct_times, v_amounts
    from public.bookings b
   where b.visit_id = p_visit_id and b.deposit_required;

  if p_classification = 'received_10_deposit' then
    if v_distinct_refs > 1 or v_distinct_times > 1 then
      v_blockers := v_blockers ||
        jsonb_build_array('child rows disagree on deposit reference or receipt time');
    end if;
    if (p_evidence ->> 'bankReceivedAt') is null then
      v_blockers := v_blockers ||
        jsonb_build_array('a received deposit needs an evidenced bank receipt time');
    end if;
  end if;
  if p_classification = 'service_prepayment' and (p_evidence ->> 'amountPence') is null then
    v_blockers := v_blockers || jsonb_build_array('service prepayment needs its evidenced amount');
  end if;

  return jsonb_build_object(
    'visitId', p_visit_id,
    'classification', p_classification,
    'sourceEvidence', coalesce(src, '[]'::jsonb),
    'blockers', v_blockers,
    'expectedHash', public.legacy_visit_money_hash(p_visit_id));
end;
$$;
revoke all on function public.preview_legacy_visit_opening_money(uuid, text, jsonb) from public;
revoke all on function public.preview_legacy_visit_opening_money(uuid, text, jsonb) from anon;
revoke all on function public.preview_legacy_visit_opening_money(uuid, text, jsonb) from authenticated;
grant execute on function public.preview_legacy_visit_opening_money(uuid, text, jsonb) to authenticated;

create or replace function public.record_legacy_visit_opening_money(
  p_visit_id uuid,
  p_expected_hash text,
  p_classification text,
  p_evidence jsonb,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  prior record;
  v_hash text;
  v_before jsonb;
  v_after jsonb;
  v_event_id uuid;
  v_state text;
  v_bank_at timestamptz;
  v_amount int;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a legacy money record requires a reason' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'a legacy money record requires an idempotency key' using errcode = '22023';
  end if;

  select * into prior from public.booking_legacy_money_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if prior.visit_id = p_visit_id and prior.classification = p_classification then
      return jsonb_build_object('replayed', true, 'after', prior.after_state);
    end if;
    raise exception 'idempotency key already used for a different record' using errcode = 'P0001';
  end if;

  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found or v.runtime_generation <> 'legacy_compat' then
    raise exception 'only legacy visits carry opening money' using errcode = 'P0001';
  end if;

  v_hash := public.legacy_visit_money_hash(p_visit_id);
  if v_hash <> p_expected_hash then
    raise exception 'stale_money_hash: the underlying rows changed since preview'
      using errcode = 'P0001';
  end if;

  v_before := to_jsonb((select d from public.booking_visit_deposits d where d.visit_id = p_visit_id));

  if p_classification = 'no_deposit' then
    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, exemption_reason)
    values (p_visit_id, 'legacy_import', 'not_required', now(), 'Legacy visit had no deposit')
    on conflict (visit_id) do update set state = 'not_required',
      exemption_reason = 'Legacy visit had no deposit',
      due_at = null, bank_received_at = null;

  elsif p_classification = 'awaiting_10_deposit' then
    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, requirement_reason,
       customer_payment_reference, due_at)
    values (p_visit_id, 'legacy_import', 'awaiting_payment', now(),
            'Legacy deposit requirement migrated',
            p_evidence ->> 'depositReference',
            (p_evidence ->> 'dueAt')::timestamptz)
    on conflict (visit_id) do update set state = 'awaiting_payment',
      requirement_reason = 'Legacy deposit requirement migrated',
      due_at = (p_evidence ->> 'dueAt')::timestamptz;

  elsif p_classification in ('received_10_deposit','received_liability') then
    v_bank_at := (p_evidence ->> 'bankReceivedAt')::timestamptz;
    if v_bank_at is null then
      raise exception 'a received deposit needs an evidenced bank receipt time'
        using errcode = '22023';
    end if;
    insert into public.booking_financial_ledger
      (human_id, visit_id, event_kind, amount_pence, reason, idempotency_key, recorded_by)
    values (v.human_id, p_visit_id, 'deposit_received', 1000,
            'Legacy opening deposit: ' || p_reason,
            'legacy-open:' || p_idempotency_key::text, auth.uid())
    returning id into v_event_id;

    v_state := case when p_classification = 'received_10_deposit'
                    then 'received' else 'received_liability' end;

    if v_state = 'received_liability' then
      insert into public.booking_deposit_money_reconciliations
        (visit_id, human_id, amount_pence, state, opened_reason)
      values (p_visit_id, v.human_id, 1000, 'open',
              'Legacy money found without a confirmable visit');
    end if;

    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, satisfaction_source,
       satisfaction_event_id, bank_received_at, recorded_at, recorded_by,
       customer_payment_reference)
    values (p_visit_id, 'legacy_import', v_state, now(),
            case when v_state = 'received_liability' then 'bank' else 'legacy_import' end,
            v_event_id, v_bank_at, now(), auth.uid(),
            p_evidence ->> 'depositReference')
    on conflict (visit_id) do update set state = v_state,
      satisfaction_source = case when v_state = 'received_liability' then 'bank' else 'legacy_import' end,
      satisfaction_event_id = v_event_id,
      bank_received_at = v_bank_at,
      recorded_at = now(), recorded_by = auth.uid();

  elsif p_classification = 'service_prepayment' then
    v_amount := (p_evidence ->> 'amountPence')::int;
    if v_amount is null or v_amount <= 0 then
      raise exception 'service prepayment needs its evidenced amount' using errcode = '22023';
    end if;
    insert into public.booking_service_prepayment_reconciliations
      (visit_id, human_id, amount_pence, evidence, state, opened_reason)
    values (p_visit_id, v.human_id, v_amount, p_evidence, 'open',
            'Legacy service prepayment needs a staff decision');
    insert into public.booking_visit_deposits
      (visit_id, origin, state, requirement_decided_at, exemption_reason)
    values (p_visit_id, 'legacy_import', 'not_required', now(),
            'Legacy money was service prepayment, not a deposit')
    on conflict (visit_id) do nothing;
  end if;

  -- Opening-money reconciliation changes the externally visible visit
  -- aggregate even though its facts live in child tables.
  update public.booking_visits
     set row_revision = row_revision + 1
   where id = p_visit_id;

  v_after := to_jsonb((select d from public.booking_visit_deposits d where d.visit_id = p_visit_id));

  insert into public.booking_legacy_money_audit
    (visit_id, classification, evidence, reason, row_set_hash,
     before_state, after_state, actor, idempotency_key)
  values (p_visit_id, p_classification, coalesce(p_evidence,'{}'::jsonb), p_reason, v_hash,
          coalesce(v_before,'null'::jsonb), coalesce(v_after,'null'::jsonb),
          current_user, p_idempotency_key);

  return jsonb_build_object('replayed', false, 'after', v_after);
end;
$$;
revoke all on function public.record_legacy_visit_opening_money(uuid, text, text, jsonb, text, uuid) from public;
revoke all on function public.record_legacy_visit_opening_money(uuid, text, text, jsonb, text, uuid) from anon;
revoke all on function public.record_legacy_visit_opening_money(uuid, text, text, jsonb, text, uuid) from authenticated;
grant execute on function public.record_legacy_visit_opening_money(uuid, text, text, jsonb, text, uuid) to authenticated;

-- ── 14. Migrate legacy deposit tags into audited overrides ──────────

insert into public.customer_booking_rule_overrides
  (human_id, mode, reason, recorded_by, idempotency_key)
select h.id, 'required', 'Legacy deposit requirement migrated', null,
       'legacy-deposit-tag:' || h.id::text
  from public.humans h
 where coalesce(h.deposit_required, false)
on conflict (idempotency_key) do nothing;

-- ── 15. Runtime-aware legacy deposit compatibility ──────────────────
--
-- The deployed stamping/mirroring/sweep behaviour is preserved exactly for
-- legacy_compat visits while the runtime is inactive or scheduled. It never
-- touches a visit_v1 aggregate, and at/after activation it does nothing.

create or replace function public.stamp_booking_deposit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required boolean;
  v_owner uuid;
  v_generation text;
begin
  -- v1 deposits are owned by the visit command layer, never by this trigger.
  if new.visit_id is not null then
    select runtime_generation into v_generation
      from public.booking_visits where id = new.visit_id;
    if v_generation = 'visit_v1' then
      return new;
    end if;
  end if;
  if public.booking_policy_runtime() = 'active' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(h.deposit_required, false), h.id
      into v_required, v_owner
      from public.dogs d
      join public.humans h on h.id = d.human_id
     where d.id = new.dog_id;

    if not coalesce(v_required, false) then
      return new;
    end if;

    new.deposit_required := true;
    new.deposit_reference := public.deposit_reference_for(v_owner, new.booking_date);
    -- Column defaults are applied before BEFORE-ROW triggers, so created_at
    -- is already set; coalesce is a safety net only.
    new.deposit_due_by := public.deposit_due_by_for(
      coalesce(new.created_at, now()), new.booking_date, new.slot);
    return new;
  end if;

  -- UPDATE: a still-awaiting booking moved to a new date/slot gets a fresh
  -- due-by against the new appointment (keeps the original created_at base
  -- and the original reference; never touches received/paid rows).
  if new.deposit_required
     and new.deposit_received_at is null
     and coalesce(new.payment, 'Due at Pick-up') not in ('Deposit Paid', 'Paid in Full')
     and (new.booking_date is distinct from old.booking_date
          or new.slot is distinct from old.slot)
  then
    new.deposit_due_by := public.deposit_due_by_for(
      coalesce(new.created_at, old.created_at, now()), new.booking_date, new.slot);
  end if;
  return new;
end;
$$;

comment on function public.stamp_booking_deposit() is
  'BEFORE INSERT on bookings: when the dog''s owner is deposit-tagged, stamps deposit_required + deposit_reference + deposit_due_by. BEFORE UPDATE OF booking_date, slot: recomputes due-by for still-awaiting rows. Since the visit foundation it is a compatibility path only: it never touches a visit_v1 aggregate and does nothing once previous_day_1500_v1 is active.';
revoke all on function public.stamp_booking_deposit() from public, anon, authenticated;

create or replace function public.set_booking_deposit_received_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation text;
begin
  if new.visit_id is not null then
    select runtime_generation into v_generation
      from public.booking_visits where id = new.visit_id;
    if v_generation = 'visit_v1' then
      return new;
    end if;
  end if;
  if public.booking_policy_runtime() = 'active' then
    return new;
  end if;
  if new.deposit_required then
    if new.payment in ('Deposit Paid', 'Paid in Full') then
      new.deposit_received_at := coalesce(new.deposit_received_at, now());
    else
      new.deposit_received_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.set_booking_deposit_received_at() from public, anon, authenticated;

-- The hourly sweep becomes a guarded function so the schedule can stay put.
-- Only legacy_compat visits are ever affected, and never once v1 is active.
create or replace function public.run_legacy_deposit_auto_release()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
begin
  if public.booking_policy_runtime() = 'active' then
    return 0;
  end if;
  with released as (
    update public.bookings b
       set status = 'Cancelled',
           cancel_reason = 'Deposit not received'
     where b.deposit_required
       and b.deposit_received_at is null
       and coalesce(b.payment, 'Due at Pick-up') not in ('Deposit Paid', 'Paid in Full')
       and b.status = 'Booked'
       and b.deposit_due_by is not null
       and now() > b.deposit_due_by
       and exists (
         select 1 from public.booking_visits v
          where v.id = b.visit_id and v.runtime_generation = 'legacy_compat')
    returning 1)
  select count(*) into v_count from released;
  return v_count;
end;
$$;
revoke all on function public.run_legacy_deposit_auto_release() from public, anon, authenticated;

-- Production already has pg_cron from the legacy deposit migration. Declare
-- the dependency here as well so schema-only restore environments (including
-- disposable database CI) can recreate the guarded schedule independently.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'deposit-auto-release';
select cron.schedule(
  'deposit-auto-release',
  '20 * * * *',
  $$ select public.run_legacy_deposit_auto_release() $$
);

comment on table public.booking_visit_deposits is
  'One deposit record per visit. received means the £10 obligation is satisfied (bank, credit, transfer or audited legacy import), never simply that cash arrived. Deposit check due is derived, never a timer-driven mutation.';
comment on table public.booking_financial_ledger is
  'Immutable money events in integer pence. Credit gross = credit_issued - credit_applied - account-credit refunds paid; credit_reserved/credit_released are audit only.';
