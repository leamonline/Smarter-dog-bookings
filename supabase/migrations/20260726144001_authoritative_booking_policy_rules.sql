-- ============================================================
-- Authoritative booking policy rules (previous_day_1500_v1 programme, phase 1)
--
-- Centralises behaviour-critical booking settings in one typed singleton,
-- adds the immutable Terms-publication and bank-instruction version ledgers,
-- creates the policy runtime seam (inactive / scheduled / active) and the
-- fixed previous-day-15:00 deadline calculation, and makes the customer
-- availability RPCs runtime-aware.
--
-- Nothing here activates previous_day_1500_v1: its effective instant stays
-- null and only the future audited activation latch may ever set it.
--
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 2)
-- ============================================================

-- ── 1. Private schema + strict URL validation ───────────────────────

create schema if not exists smarter_dog_private;
revoke all on schema smarter_dog_private from public;
revoke all on schema smarter_dog_private from anon, authenticated;

-- Strict https-URL validator. Returns false — never null — for anything
-- malformed: only a trimmed absolute https URL of at most 2,048 characters
-- with a non-empty DNS/IPv4 host, no userinfo, no whitespace or control
-- characters and a syntactically valid optional port, path, query and
-- fragment. The host match is case-insensitive; storage paths normalise it.
create or replace function smarter_dog_private.is_valid_booking_terms_url(p_url text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_port text;
begin
  if p_url is null or p_url <> trim(p_url) or length(p_url) > 2048 then
    return false;
  end if;
  if p_url ~ '[[:space:][:cntrl:]]' then
    return false;
  end if;
  if p_url !~* ('^https://'
      || '([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*'
      || '|((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]))'
      || '(:[0-9]{1,5})?'
      || '(/[^[:space:][:cntrl:]?#]*)*'
      || '(\?[^[:space:][:cntrl:]#]*)?'
      || '(#[^[:space:][:cntrl:]]*)?$') then
    return false;
  end if;
  -- Userinfo is already impossible (the host charset excludes '@'), but a
  -- port, when present, must be in range.
  v_port := substring(p_url from '^https://[^/:?#]+:([0-9]{1,5})');
  if v_port is not null and (v_port::int < 1 or v_port::int > 65535) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function smarter_dog_private.is_valid_booking_terms_url(text) from public, anon, authenticated;

-- Lowercase the scheme and host and drop an explicit default :443 port so
-- equal URLs compare equal when stored.
create or replace function smarter_dog_private.normalise_booking_terms_url(p_url text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_authority text;
  v_rest text;
begin
  if not smarter_dog_private.is_valid_booking_terms_url(p_url) then
    return null;
  end if;
  v_authority := substring(p_url from '^https://([^/?#]*)');
  v_rest := coalesce(substring(p_url from '^https://[^/?#]*(.*)$'), '');
  v_authority := lower(v_authority);
  v_authority := regexp_replace(v_authority, ':443$', '');
  return 'https://' || v_authority || v_rest;
end;
$$;
revoke all on function smarter_dog_private.normalise_booking_terms_url(text) from public, anon, authenticated;

create or replace function smarter_dog_private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_profiles
     where user_id = (select auth.uid()) and role = 'owner'
  );
$$;
revoke all on function smarter_dog_private.is_owner() from public, anon, authenticated;

-- ── 2. Immutable publication + bank-instruction ledgers ─────────────

create table public.booking_terms_publication_versions (
  id uuid primary key default gen_random_uuid(),
  public_url text not null
    check (smarter_dog_private.is_valid_booking_terms_url(public_url)),
  version_label text not null check (nullif(trim(version_label),'') is not null),
  approved_content_sha256 text not null
    check (approved_content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  unique (public_url, version_label, approved_content_sha256)
);

alter table public.booking_terms_publication_versions enable row level security;
revoke all on public.booking_terms_publication_versions from public;
revoke all on public.booking_terms_publication_versions from anon, authenticated;

create table public.booking_deposit_bank_instruction_versions (
  id uuid primary key default gen_random_uuid(),
  account_name text not null check (nullif(trim(account_name),'') is not null),
  sort_code text not null check (sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  account_number text not null check (account_number ~ '^[0-9]{8}$'),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  unique (account_name, sort_code, account_number)
);

alter table public.booking_deposit_bank_instruction_versions enable row level security;
revoke all on public.booking_deposit_bank_instruction_versions from public;
revoke all on public.booking_deposit_bank_instruction_versions from anon, authenticated;

create or replace function public.guard_booking_policy_ledger_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_guard_terms_publications on public.booking_terms_publication_versions;
create trigger trg_guard_terms_publications
  before update or delete on public.booking_terms_publication_versions
  for each row execute function public.guard_booking_policy_ledger_rows();

drop trigger if exists trg_guard_bank_instructions on public.booking_deposit_bank_instruction_versions;
create trigger trg_guard_bank_instructions
  before update or delete on public.booking_deposit_bank_instruction_versions
  for each row execute function public.guard_booking_policy_ledger_rows();

-- Every v1 visit snapshots the Terms publication it was sold under.
alter table public.booking_visits
  add column if not exists terms_publication_id uuid
    references public.booking_terms_publication_versions(id);

create or replace function public.guard_booking_visit_terms_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.terms_publication_id is not null
     and new.terms_publication_id is distinct from old.terms_publication_id then
    raise exception 'visit %: the Terms publication snapshot is immutable', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_visit_terms_snapshot on public.booking_visits;
create trigger trg_guard_booking_visit_terms_snapshot
  before update on public.booking_visits
  for each row execute function public.guard_booking_visit_terms_snapshot();

-- ── 3. The authoritative settings singleton ─────────────────────────

create table public.booking_policy_settings (
  singleton boolean primary key default true check (singleton),
  booking_horizon_days integer not null default 180 check (booking_horizon_days between 1 and 730),
  customer_intake_enabled boolean not null default true,
  auto_confirm boolean not null default true,
  allow_customer_cancellations boolean not null default true,
  allow_customer_rescheduling boolean not null default true,
  allow_repeat_booking boolean not null default false,
  show_customer_history boolean not null default true,
  deposit_hold_hours smallint not null default 12 check (deposit_hold_hours in (6,12,24,36,48)),
  bank_account_name text,
  bank_sort_code text,
  bank_account_number text,
  current_bank_instruction_id uuid
    references public.booking_deposit_bank_instruction_versions(id),
  current_terms_publication_id uuid references public.booking_terms_publication_versions(id),
  terms_url text not null default 'https://smarterdog.co.uk/terms'
    check (smarter_dog_private.is_valid_booking_terms_url(terms_url)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (
    (bank_account_name is null and bank_sort_code is null and bank_account_number is null)
    or (bank_account_name is not null
        and bank_sort_code is not null
        and bank_account_number is not null
        and nullif(trim(bank_account_name),'') is not null
        and bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'
        and bank_account_number ~ '^[0-9]{8}$')
  )
);
insert into public.booking_policy_settings(singleton) values (true)
on conflict (singleton) do nothing;

alter table public.booking_policy_settings enable row level security;
revoke all on public.booking_policy_settings from public;
revoke all on public.booking_policy_settings from anon, authenticated;

drop trigger if exists booking_policy_settings_updated on public.booking_policy_settings;
-- `updated_at` is the review-token settings version. The two audited command
-- writers below advance it once at the end with clock_timestamp(); the generic
-- update_modified_column() trigger uses transaction-stable now() and cannot
-- distinguish two settings saves in one transaction.

create table public.booking_policy_settings_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('update_booking_rules','set_customer_booking_intake_enabled')),
  actor_id uuid references auth.users(id),
  reason text,
  before_state jsonb not null,
  after_state jsonb not null,
  occurred_at timestamptz not null default now()
);

alter table public.booking_policy_settings_audit enable row level security;
revoke all on public.booking_policy_settings_audit from public;
revoke all on public.booking_policy_settings_audit from anon, authenticated;

drop trigger if exists trg_guard_booking_policy_settings_audit on public.booking_policy_settings_audit;
create trigger trg_guard_booking_policy_settings_audit
  before update or delete on public.booking_policy_settings_audit
  for each row execute function public.guard_booking_policy_ledger_rows();

-- One-time copy of compatible legacy values out of salon_config.settings.
-- The legacy JSON keys stay in place for old readers, but no new policy code
-- may read them; this singleton is now the authority.
do $$
declare
  s jsonb;
  v_hours smallint;
  v_name text;
  v_sort text;
  v_acct text;
  v_bank_id uuid;
begin
  select coalesce(sc.settings, '{}'::jsonb) into s
    from public.salon_config sc
   order by sc.updated_at desc nulls last
   limit 1;
  if s is null then
    return;
  end if;

  update public.booking_policy_settings
     set auto_confirm = coalesce((s->>'autoConfirm')::boolean, auto_confirm),
         allow_customer_cancellations =
           coalesce((s->'customerPortal'->>'allowCancellations')::boolean,
                    allow_customer_cancellations),
         allow_repeat_booking =
           coalesce((s->'customerPortal'->>'allowRebooking')::boolean,
                    allow_repeat_booking),
         show_customer_history =
           coalesce((s->'customerPortal'->>'showHistory')::boolean,
                    show_customer_history)
   where singleton;

  v_hours := case
    when (s->>'depositReleaseHours') ~ '^[0-9]+$'
         and (s->>'depositReleaseHours')::int in (6,12,24,36,48)
    then (s->>'depositReleaseHours')::smallint
    else null end;
  if v_hours is not null then
    update public.booking_policy_settings set deposit_hold_hours = v_hours where singleton;
  end if;

  v_name := nullif(trim(coalesce(s->'depositBank'->>'accountName','')), '');
  v_sort := nullif(trim(coalesce(s->'depositBank'->>'sortCode','')), '');
  v_acct := nullif(trim(coalesce(s->'depositBank'->>'accountNumber','')), '');
  if v_name is not null
     and v_sort ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'
     and v_acct ~ '^[0-9]{8}$' then
    insert into public.booking_deposit_bank_instruction_versions
      (account_name, sort_code, account_number, recorded_by)
    values (v_name, v_sort, v_acct, null)
    on conflict (account_name, sort_code, account_number) do nothing;
    select id into v_bank_id
      from public.booking_deposit_bank_instruction_versions
     where account_name = v_name and sort_code = v_sort and account_number = v_acct;
    update public.booking_policy_settings
       set bank_account_name = v_name,
           bank_sort_code = v_sort,
           bank_account_number = v_acct,
           current_bank_instruction_id = v_bank_id
     where singleton;
  end if;
end;
$$;

-- ── 4. Runtime seam ─────────────────────────────────────────────────
--
-- The scalar enforcement predicate. Every v1 command and projection must
-- gate on booking_policy_runtime() = 'active' — never on a date comparison
-- or a non-null policy row.

create or replace function public.booking_policy_runtime_at(p_at timestamptz)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when v.effective_at is null then 'inactive'
    when v.effective_at > p_at then 'scheduled'
    else 'active'
  end
  from public.booking_policy_versions v
  where v.code = 'previous_day_1500_v1';
$$;
revoke all on function public.booking_policy_runtime_at(timestamptz) from public, anon, authenticated, service_role;

create or replace function public.booking_policy_runtime()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.booking_policy_runtime_at(statement_timestamp());
$$;
revoke all on function public.booking_policy_runtime() from public;
revoke all on function public.booking_policy_runtime() from anon;
revoke all on function public.booking_policy_runtime() from authenticated;
grant execute on function public.booking_policy_runtime() to authenticated, anon, service_role;

-- Customer-safe status: exactly { state, scheduledEffectiveAt } and nothing
-- else. The rollout plan later replaces this body to read the persisted
-- schedule/latch (adding the 'failed' state); browser time never authorises
-- a mutation — clients use this only to know when to refetch.
create or replace function public.booking_policy_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'state', public.booking_policy_runtime_at(statement_timestamp()),
    'scheduledEffectiveAt',
    (select case when v.effective_at is not null and v.effective_at > statement_timestamp()
                 then to_jsonb(v.effective_at) else 'null'::jsonb end
       from public.booking_policy_versions v
      where v.code = 'previous_day_1500_v1')
  );
$$;
revoke all on function public.booking_policy_runtime_status() from public;
revoke all on function public.booking_policy_runtime_status() from anon;
revoke all on function public.booking_policy_runtime_status() from authenticated;
grant execute on function public.booking_policy_runtime_status() to authenticated, anon, service_role;

-- ── 5. Policy assignment + the fixed deadline rule ──────────────────

create or replace function public.policy_for_confirmation(p_confirmed_at timestamptz)
returns text language sql stable set search_path = public, pg_temp
security definer
as $$
  select coalesce(
    (select code from public.booking_policy_versions
      where effective_at is not null and effective_at <= p_confirmed_at
      order by effective_at desc limit 1),
    'legacy_24h'
  );
$$;
revoke all on function public.policy_for_confirmation(timestamptz) from public, anon, authenticated;

create or replace function public.change_deadline_for(
  p_policy_code text,
  p_booking_date date,
  p_start_slot text
) returns timestamptz language plpgsql stable set search_path = public, pg_temp
as $$
declare
  v_start_local timestamp := (p_booking_date::text || ' ' || p_start_slot)::timestamp;
begin
  if p_policy_code = 'legacy_24h' then
    -- Preserve the deployed rule's London wall-clock subtraction across DST.
    return (v_start_local - interval '24 hours') at time zone 'Europe/London';
  end if;
  if p_policy_code = 'previous_day_1500_v1' then
    return ((p_booking_date - 1)::text || ' 15:00')::timestamp at time zone 'Europe/London';
  end if;
  raise exception 'unknown_booking_policy' using errcode='22023';
end;
$$;
revoke all on function public.change_deadline_for(text, date, text) from public, anon, authenticated;

-- ── 6. Rules projections and the audited write path ─────────────────

create or replace function public.current_booking_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  pub record;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  select * into s from public.booking_policy_settings where singleton;
  select * into pub from public.booking_terms_publication_versions
   where id = s.current_terms_publication_id;
  return jsonb_build_object(
    'bookingHorizonDays', s.booking_horizon_days,
    'autoConfirm', s.auto_confirm,
    'depositHoldHours', s.deposit_hold_hours,
    'depositBank', jsonb_build_object(
      'accountName', coalesce(s.bank_account_name, ''),
      'sortCode', coalesce(s.bank_sort_code, ''),
      'accountNumber', coalesce(s.bank_account_number, '')
    ),
    'termsUrl', s.terms_url,
    'depositTermsVersion', pub.version_label,
    'depositTermsContentHash', pub.approved_content_sha256,
    'customerPortal', jsonb_build_object(
      'allowCancellations', s.allow_customer_cancellations,
      'allowRescheduling', s.allow_customer_rescheduling,
      'allowRepeatBooking', s.allow_repeat_booking,
      'showHistory', s.show_customer_history
    )
  );
end;
$$;
revoke all on function public.current_booking_rules() from public;
revoke all on function public.current_booking_rules() from anon;
revoke all on function public.current_booking_rules() from authenticated;
grant execute on function public.current_booking_rules() to authenticated;

-- Customer-safe: intake availability, horizon, the customer switches, the
-- generic Terms link and a read-only deadline description. Never bank
-- details, publication internals or auto-confirm configuration.
create or replace function public.current_customer_booking_rules()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'intakeEnabled', s.customer_intake_enabled,
    'bookingHorizonDays', s.booking_horizon_days,
    'termsUrl', s.terms_url,
    'changeDeadline', case
      when public.booking_policy_runtime() = 'active'
        then jsonb_build_object(
          'rule', 'previous_day_1500',
          'description', 'Changes close at 3:00 pm the day before your appointment.')
        else jsonb_build_object(
          'rule', 'rolling_24h',
          'description', 'Changes close 24 hours before your appointment.')
    end,
    'customerPortal', jsonb_build_object(
      'allowCancellations', s.allow_customer_cancellations,
      'allowRescheduling', s.allow_customer_rescheduling,
      'allowRepeatBooking', s.allow_repeat_booking,
      'showHistory', s.show_customer_history
    )
  )
  from public.booking_policy_settings s
  where s.singleton;
$$;
revoke all on function public.current_customer_booking_rules() from public;
revoke all on function public.current_customer_booking_rules() from anon;
revoke all on function public.current_customer_booking_rules() from authenticated;
grant execute on function public.current_customer_booking_rules() to authenticated;

create or replace function public.update_booking_rules(p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  k text;
  pk text;
  v_before jsonb;
  v_after jsonb;
  v_url text;
  v_version text;
  v_hash text;
  v_has_version boolean;
  v_has_hash boolean;
  v_name text;
  v_sort text;
  v_acct text;
  v_bank_count int;
  v_bank_id uuid;
  v_pub_id uuid;
  v_horizon int;
  v_hours int;
begin
  if not smarter_dog_private.is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    raise exception 'booking rules payload must be a JSON object' using errcode = '22023';
  end if;

  for k in select jsonb_object_keys(p_rules) loop
    if k not in ('bookingHorizonDays','autoConfirm','depositHoldHours','depositBank',
                 'termsUrl','depositTermsVersion','depositTermsContentHash','customerPortal') then
      raise exception 'unknown booking rules key: %', k using errcode = '22023';
    end if;
  end loop;
  if p_rules ? 'customerPortal' then
    if jsonb_typeof(p_rules->'customerPortal') <> 'object' then
      raise exception 'customerPortal must be a JSON object' using errcode = '22023';
    end if;
    for pk in select jsonb_object_keys(p_rules->'customerPortal') loop
      if pk not in ('allowCancellations','allowRescheduling','allowRepeatBooking','showHistory') then
        raise exception 'unknown customerPortal key: %', pk using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_rules ? 'depositBank' and jsonb_typeof(p_rules->'depositBank') <> 'object' then
    raise exception 'depositBank must be a JSON object' using errcode = '22023';
  end if;

  select * into s from public.booking_policy_settings where singleton for update;
  v_before := jsonb_build_object(
    'bookingHorizonDays', s.booking_horizon_days,
    'autoConfirm', s.auto_confirm,
    'depositHoldHours', s.deposit_hold_hours,
    'termsUrl', s.terms_url,
    'currentTermsPublicationId', s.current_terms_publication_id,
    'currentBankInstructionId', s.current_bank_instruction_id,
    'customerPortal', jsonb_build_object(
      'allowCancellations', s.allow_customer_cancellations,
      'allowRescheduling', s.allow_customer_rescheduling,
      'allowRepeatBooking', s.allow_repeat_booking,
      'showHistory', s.show_customer_history));

  -- Horizon: integer 1..730 only. 180 is the signed default; 730 is a
  -- technical guard, not a customer promise.
  if p_rules ? 'bookingHorizonDays' then
    if jsonb_typeof(p_rules->'bookingHorizonDays') <> 'number'
       or (p_rules->>'bookingHorizonDays') !~ '^[0-9]+$' then
      raise exception 'bookingHorizonDays must be a whole number' using errcode = '22023';
    end if;
    v_horizon := (p_rules->>'bookingHorizonDays')::int;
    if v_horizon < 1 or v_horizon > 730 then
      raise exception 'bookingHorizonDays must be between 1 and 730' using errcode = '22023';
    end if;
    update public.booking_policy_settings set booking_horizon_days = v_horizon where singleton;
  end if;

  if p_rules ? 'autoConfirm' then
    if jsonb_typeof(p_rules->'autoConfirm') <> 'boolean' then
      raise exception 'autoConfirm must be a boolean' using errcode = '22023';
    end if;
    update public.booking_policy_settings
       set auto_confirm = (p_rules->>'autoConfirm')::boolean where singleton;
  end if;

  if p_rules ? 'depositHoldHours' then
    if jsonb_typeof(p_rules->'depositHoldHours') <> 'number'
       or (p_rules->>'depositHoldHours') !~ '^[0-9]+$' then
      raise exception 'depositHoldHours must be a whole number' using errcode = '22023';
    end if;
    v_hours := (p_rules->>'depositHoldHours')::int;
    if v_hours not in (6,12,24,36,48) then
      raise exception 'depositHoldHours must be one of 6, 12, 24, 36 or 48' using errcode = '22023';
    end if;
    update public.booking_policy_settings set deposit_hold_hours = v_hours where singleton;
  end if;

  if p_rules ? 'customerPortal' then
    update public.booking_policy_settings
       set allow_customer_cancellations = coalesce(
             (p_rules->'customerPortal'->>'allowCancellations')::boolean,
             allow_customer_cancellations),
           allow_customer_rescheduling = coalesce(
             (p_rules->'customerPortal'->>'allowRescheduling')::boolean,
             allow_customer_rescheduling),
           allow_repeat_booking = coalesce(
             (p_rules->'customerPortal'->>'allowRepeatBooking')::boolean,
             allow_repeat_booking),
           show_customer_history = coalesce(
             (p_rules->'customerPortal'->>'showHistory')::boolean,
             show_customer_history)
     where singleton;
  end if;

  -- Bank details: complete set or an explicit full clear, never partial.
  if p_rules ? 'depositBank' then
    v_name := nullif(trim(coalesce(p_rules->'depositBank'->>'accountName','')), '');
    v_sort := nullif(trim(coalesce(p_rules->'depositBank'->>'sortCode','')), '');
    v_acct := nullif(trim(coalesce(p_rules->'depositBank'->>'accountNumber','')), '');
    v_bank_count := (v_name is not null)::int + (v_sort is not null)::int + (v_acct is not null)::int;
    if v_bank_count = 0 then
      update public.booking_policy_settings
         set bank_account_name = null, bank_sort_code = null, bank_account_number = null,
             current_bank_instruction_id = null
       where singleton;
    elsif v_bank_count < 3 then
      raise exception 'bank details must be complete: account name, sort code and account number'
        using errcode = '22023';
    else
      if v_sort !~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'sort code must look like 00-00-00' using errcode = '22023';
      end if;
      if v_acct !~ '^[0-9]{8}$' then
        raise exception 'account number must be exactly 8 digits' using errcode = '22023';
      end if;
      insert into public.booking_deposit_bank_instruction_versions
        (account_name, sort_code, account_number, recorded_by)
      values (v_name, v_sort, v_acct, auth.uid())
      on conflict (account_name, sort_code, account_number) do nothing;
      select id into v_bank_id
        from public.booking_deposit_bank_instruction_versions
       where account_name = v_name and sort_code = v_sort and account_number = v_acct;
      update public.booking_policy_settings
         set bank_account_name = v_name, bank_sort_code = v_sort,
             bank_account_number = v_acct, current_bank_instruction_id = v_bank_id
       where singleton;
    end if;
  end if;

  -- Terms: the generic URL may change alone; the deposit publication
  -- version/hash must arrive or clear together, and once the runtime is
  -- active the publication pointer can never be cleared or left incomplete.
  v_has_version := p_rules ? 'depositTermsVersion';
  v_has_hash := p_rules ? 'depositTermsContentHash';
  if v_has_version <> v_has_hash then
    raise exception 'depositTermsVersion and depositTermsContentHash must be supplied together'
      using errcode = '22023';
  end if;

  if p_rules ? 'termsUrl' then
    v_url := smarter_dog_private.normalise_booking_terms_url(p_rules->>'termsUrl');
    if v_url is null then
      raise exception 'termsUrl must be a valid https URL' using errcode = '22023';
    end if;
    update public.booking_policy_settings set terms_url = v_url where singleton;
  end if;

  if v_has_version then
    v_version := case when jsonb_typeof(p_rules->'depositTermsVersion') = 'null'
                      then null else p_rules->>'depositTermsVersion' end;
    v_hash := case when jsonb_typeof(p_rules->'depositTermsContentHash') = 'null'
                   then null else p_rules->>'depositTermsContentHash' end;
    if (v_version is null) <> (v_hash is null) then
      raise exception 'depositTermsVersion and depositTermsContentHash must be cleared together'
        using errcode = '22023';
    end if;
    if v_version is null then
      if public.booking_policy_runtime() = 'active' then
        raise exception 'terms_publication_required_active' using errcode = 'P0001';
      end if;
      update public.booking_policy_settings
         set current_terms_publication_id = null where singleton;
    else
      if nullif(trim(v_version),'') is null then
        raise exception 'depositTermsVersion must not be blank' using errcode = '22023';
      end if;
      if v_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'depositTermsContentHash must be 64 lowercase hex characters'
          using errcode = '22023';
      end if;
      select terms_url into v_url from public.booking_policy_settings where singleton;
      insert into public.booking_terms_publication_versions
        (public_url, version_label, approved_content_sha256, published_at, recorded_by)
      values (v_url, v_version, v_hash, now(), auth.uid())
      on conflict (public_url, version_label, approved_content_sha256) do nothing;
      select id into v_pub_id
        from public.booking_terms_publication_versions
       where public_url = v_url and version_label = v_version
         and approved_content_sha256 = v_hash;
      update public.booking_policy_settings
         set current_terms_publication_id = v_pub_id where singleton;
    end if;
  elsif public.booking_policy_runtime() = 'active'
        and (select current_terms_publication_id from public.booking_policy_settings where singleton) is null then
    -- A save that leaves active booking creation without Terms is invalid.
    raise exception 'terms_publication_required_active' using errcode = 'P0001';
  end if;

  select * into s from public.booking_policy_settings where singleton;
  v_after := jsonb_build_object(
    'bookingHorizonDays', s.booking_horizon_days,
    'autoConfirm', s.auto_confirm,
    'depositHoldHours', s.deposit_hold_hours,
    'termsUrl', s.terms_url,
    'currentTermsPublicationId', s.current_terms_publication_id,
    'currentBankInstructionId', s.current_bank_instruction_id,
    'customerPortal', jsonb_build_object(
      'allowCancellations', s.allow_customer_cancellations,
      'allowRescheduling', s.allow_customer_rescheduling,
      'allowRepeatBooking', s.allow_repeat_booking,
      'showHistory', s.show_customer_history));

  update public.booking_policy_settings
     set updated_by = auth.uid(), updated_at = clock_timestamp()
   where singleton;

  insert into public.booking_policy_settings_audit
    (action, actor_id, before_state, after_state)
  values ('update_booking_rules', auth.uid(), v_before, v_after);

  return public.current_booking_rules();
end;
$$;
revoke all on function public.update_booking_rules(jsonb) from public;
revoke all on function public.update_booking_rules(jsonb) from anon;
revoke all on function public.update_booking_rules(jsonb) from authenticated;
grant execute on function public.update_booking_rules(jsonb) to authenticated;

-- Emergency intake pause, separate from ordinary Booking Rules. Withdrawal
-- and existing-visit cancellation stay available under their own switches so
-- this can never trap a customer inside a booking.
create or replace function public.set_customer_booking_intake_enabled(
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before boolean;
begin
  if not smarter_dog_private.is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled flag is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'an audit reason is required' using errcode = '22023';
  end if;
  select customer_intake_enabled into v_before
    from public.booking_policy_settings where singleton for update;
  update public.booking_policy_settings
     set customer_intake_enabled = p_enabled, updated_by = auth.uid(),
         updated_at = clock_timestamp()
   where singleton;
  insert into public.booking_policy_settings_audit
    (action, actor_id, reason, before_state, after_state)
  values ('set_customer_booking_intake_enabled', auth.uid(), p_reason,
          jsonb_build_object('customerIntakeEnabled', v_before),
          jsonb_build_object('customerIntakeEnabled', p_enabled));
  return jsonb_build_object('customerIntakeEnabled', p_enabled);
end;
$$;
revoke all on function public.set_customer_booking_intake_enabled(boolean, text) from public;
revoke all on function public.set_customer_booking_intake_enabled(boolean, text) from anon;
revoke all on function public.set_customer_booking_intake_enabled(boolean, text) from authenticated;
grant execute on function public.set_customer_booking_intake_enabled(boolean, text) to authenticated;

-- ── 7. Visit actionability ──────────────────────────────────────────
--
-- Orthogonal facts plus one final decision. The timestamp argument exists
-- for service-role provider evidence and deterministic tests only, so the
-- helper is revoked from customer roles; the public capabilities RPC always
-- supplies statement_timestamp().

create or replace function public.visit_actionability(
  p_visit_id uuid,
  p_intent text,
  p_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_deadline timestamptz;
  v_deadline_passed boolean;
  v_switch boolean;
  v_state_eligible boolean;
  v_move_limit boolean;
  v_processing_safe boolean;
  v_remaining int;
  v_start timestamptz;
  v_allowed boolean;
  v_reason text;
begin
  if p_intent not in ('cancel','reschedule','withdraw') then
    raise exception 'unknown intent' using errcode = '22023';
  end if;
  select bv.*, bl.self_service_reschedule_count
    into v
    from public.booking_visits bv
    join public.booking_lineages bl on bl.id = bv.lineage_id
   where bv.id = p_visit_id;
  if not found then
    return jsonb_build_object('allowed', false, 'reasonCode', 'not_found');
  end if;

  v_deadline := v.customer_change_deadline_at;
  v_deadline_passed := v_deadline is not null and p_at > v_deadline;

  select case p_intent
    when 'cancel' then s.allow_customer_cancellations
    when 'reschedule' then s.allow_customer_rescheduling
    else true end
    into v_switch
    from public.booking_policy_settings s where s.singleton;

  v_remaining := greatest(0, 3 - v.self_service_reschedule_count);
  v_move_limit := p_intent = 'reschedule' and v_remaining = 0;

  if p_intent = 'withdraw' then
    -- An unconfirmed visit can be withdrawn at any time, deadline or not.
    v_state_eligible := v.lifecycle_state = 'active'
                        and v.confirmation_state = 'unconfirmed';
    v_deadline_passed := false;
  else
    v_state_eligible := v.lifecycle_state = 'active'
                        and v.confirmation_state = 'confirmed'
                        and not v.is_last_minute;
  end if;

  -- Once the visit has started (server clock, not provider evidence), no
  -- automatic mutation is safe even for an on-time request.
  v_start := public.visit_start_at(v.id);
  v_processing_safe := v.lifecycle_state = 'active'
    and (v_start is null or statement_timestamp() < v_start);

  v_allowed := v_state_eligible and not v_deadline_passed and v_switch
               and not v_move_limit and v_processing_safe;
  v_reason := case
    when not v_state_eligible then 'state_not_eligible'
    when v_deadline_passed then 'deadline_passed'
    when not v_switch then 'switch_disabled'
    when v_move_limit then 'move_limit_reached'
    when not v_processing_safe then 'visit_in_progress'
    else null end;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reasonCode', v_reason,
    'deadlinePassed', v_deadline_passed,
    'switchEnabled', v_switch,
    'stateEligible', v_state_eligible,
    'moveLimitReached', v_move_limit,
    'processingStateSafe', v_processing_safe,
    'deadlineAt', v_deadline,
    'lifecycleState', v.lifecycle_state,
    'approvalState', v.approval_state,
    'confirmationState', v.confirmation_state,
    'isLastMinute', v.is_last_minute,
    'remainingSelfServiceReschedules', v_remaining
  );
end;
$$;
revoke all on function public.visit_actionability(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.visit_actionability(uuid, text, timestamptz) to service_role;

-- Owner-derived, server-timed customer capabilities for one visit.
create or replace function public.get_customer_booking_visit_capabilities(p_visit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean;
begin
  select exists (
    select 1
      from public.booking_visits bv
      join public.humans h on h.id = bv.human_id
     where bv.id = p_visit_id
       and h.customer_user_id = (select auth.uid())
  ) into v_owner;
  if not v_owner then
    -- Non-disclosing: same shape whether the visit is missing or not owned.
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'visitId', p_visit_id,
    'cancel', public.visit_actionability(p_visit_id, 'cancel', statement_timestamp()),
    'reschedule', public.visit_actionability(p_visit_id, 'reschedule', statement_timestamp()),
    'withdraw', public.visit_actionability(p_visit_id, 'withdraw', statement_timestamp())
  );
end;
$$;
revoke all on function public.get_customer_booking_visit_capabilities(uuid) from public;
revoke all on function public.get_customer_booking_visit_capabilities(uuid) from anon;
revoke all on function public.get_customer_booking_visit_capabilities(uuid) from authenticated;
grant execute on function public.get_customer_booking_visit_capabilities(uuid) to authenticated;

-- ── 8. Runtime-aware customer availability RPC bodies ───────────────
--
-- Replaced here rather than editing their historical files. Inactive and
-- scheduled runtimes preserve today's limits byte-for-byte; the active
-- runtime enforces the authoritative inclusive horizon.

create or replace function smarter_dog_private.assert_customer_range(
  p_label text,
  p_start date,
  p_end date
) returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date;
  v_horizon int;
begin
  if public.booking_policy_runtime() = 'active' then
    v_today := (statement_timestamp() at time zone 'Europe/London')::date;
    select booking_horizon_days into v_horizon
      from public.booking_policy_settings where singleton;
    if p_start < v_today then
      raise exception '%: start must not be in the past', p_label using errcode = '22023';
    end if;
    if p_end > v_today + v_horizon then
      raise exception 'booking_horizon_exceeded' using errcode = 'P0001';
    end if;
  end if;
end;
$$;
revoke all on function smarter_dog_private.assert_customer_range(text, date, date) from public, anon, authenticated;

create or replace function public.get_open_days(p_start date, p_end date)
returns table(setting_date date, is_open boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_start is null or p_end is null then
    raise exception 'get_open_days: start and end are required';
  end if;
  if p_end < p_start then
    raise exception 'get_open_days: end must be on or after start';
  end if;
  if public.booking_policy_runtime() = 'active' then
    perform smarter_dog_private.assert_customer_range('get_open_days', p_start, p_end);
  else
    -- 28-day wizard window + headroom for grouped multi-dog flows.
    -- Anything bigger smells like scraping the closure calendar.
    if p_end - p_start > 92 then
      raise exception 'get_open_days: range too wide (max 92 days)';
    end if;
  end if;

  return query
  select d.setting_date, d.is_open
  from   day_settings d
  where  d.setting_date between p_start and p_end;
end;
$$;
revoke all on function public.get_open_days(date, date) from public;
revoke all on function public.get_open_days(date, date) from anon;
revoke all on function public.get_open_days(date, date) from authenticated;
grant execute on function public.get_open_days(date, date) to authenticated;

create or replace function public.get_blocked_seats(p_start date, p_end date)
returns table(setting_date date, slot text, seat_index int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null then
    raise exception 'get_blocked_seats: start and end are required';
  end if;
  if p_end < p_start then
    raise exception 'get_blocked_seats: end must be on or after start';
  end if;
  if public.booking_policy_runtime() = 'active' then
    perform smarter_dog_private.assert_customer_range('get_blocked_seats', p_start, p_end);
  else
    if p_end - p_start > 92 then
      raise exception 'get_blocked_seats: range too wide (max 92 days)';
    end if;
  end if;

  -- The seat.value = 'blocked' and numeric-key guards skip legacy malformed
  -- overrides rows that exist in prod (a handful were written date-keyed with
  -- numeric values). Without the seat.key ~ '^[0-9]+$' guard the cast could
  -- choke on a time-like key; with it those rows are simply ignored.
  return query
  select d.setting_date, kv.key as slot, (seat.key)::int as seat_index
  from   day_settings d,
         lateral jsonb_each(d.overrides)   as kv(key, value),
         lateral jsonb_each_text(kv.value) as seat(key, value)
  where  d.setting_date between p_start and p_end
    and  seat.value = 'blocked'
    and  seat.key ~ '^[0-9]+$';
end;
$$;
revoke all on function public.get_blocked_seats(date, date) from public;
revoke all on function public.get_blocked_seats(date, date) from anon;
revoke all on function public.get_blocked_seats(date, date) from authenticated;
grant execute on function public.get_blocked_seats(date, date) to authenticated;

create or replace function public.get_occupancy_range(p_from date, p_to date)
returns table(booking_date date, slot text, size text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_from is null or p_to is null then
    raise exception 'get_occupancy_range: p_from and p_to are required';
  end if;
  if p_to < p_from then
    raise exception 'get_occupancy_range: p_to must be on or after p_from';
  end if;
  if public.booking_policy_runtime() = 'active' then
    perform smarter_dog_private.assert_customer_range('get_occupancy_range', p_from, p_to);
  end if;

  return query
  select b.booking_date, b.slot, b.size
  from   bookings b
  where  b.booking_date between p_from and p_to
    and  b.status <> 'Cancelled';
end;
$$;
revoke all on function public.get_occupancy_range(date, date) from public;
revoke all on function public.get_occupancy_range(date, date) from anon;
revoke all on function public.get_occupancy_range(date, date) from authenticated;
grant execute on function public.get_occupancy_range(date, date) to authenticated;

comment on table public.booking_policy_settings is
  'Authoritative typed booking settings singleton. Written only through update_booking_rules / set_customer_booking_intake_enabled (audited). salon_config.settings keys remain compatibility data only.';
comment on function public.booking_policy_runtime() is
  'Scalar policy runtime predicate: inactive | scheduled | active. Every v1 enforcement gates on this equalling active.';
