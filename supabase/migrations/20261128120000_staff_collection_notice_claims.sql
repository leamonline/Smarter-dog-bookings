-- A ready-for-collection notice covers the owner's dogs on one London date.
-- Hold the same recipient's claim across routes, staff devices and restarts.
create table public.staff_collection_notice_claims (
  owner_id uuid not null,
  booking_date date not null,
  recipient_id uuid not null,
  attempt_id uuid not null unique default gen_random_uuid(),
  state text not null check (state in ('pending', 'accepted', 'not_sent', 'unknown')),
  channel text not null check (channel in ('whatsapp', 'sms')),
  provider_id text,
  recorded boolean not null default false,
  reconciliation_ref text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, booking_date, recipient_id),
  check (state <> 'accepted' or nullif(provider_id, '') is not null),
  check (not recorded or state = 'accepted')
);

alter table public.staff_collection_notice_claims enable row level security;
revoke all on public.staff_collection_notice_claims from public, anon, authenticated;
grant select, insert, update on public.staff_collection_notice_claims to service_role;

create function public.claim_staff_collection_notice(
  p_booking_id uuid, p_recipient_id uuid, p_phone text, p_channel text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_date date;
  v_phone text;
  v_status text;
  v_claim public.staff_collection_notice_claims%rowtype;
begin
  select d.human_id, b.booking_date, b.status
    into v_owner, v_date, v_status
  from public.bookings b join public.dogs d on d.id = b.dog_id
  where b.id = p_booking_id;

  if v_owner is null then
    return jsonb_build_object('state', 'ineligible');
  end if;

  select h.phone into v_phone from public.humans h
  where h.id = p_recipient_id
    and (h.id = v_owner or exists (
      select 1 from public.human_trusted_contacts t
      where t.human_id = v_owner and t.trusted_id = h.id
    ));

  if public.whatsapp_phone_key(v_phone) is null
     or public.whatsapp_phone_key(v_phone) is distinct from public.whatsapp_phone_key(p_phone) then
    return jsonb_build_object('state', 'ineligible');
  end if;

  if v_status = 'Ready for collection' and not exists (
    select 1 from public.bookings b join public.dogs d on d.id = b.dog_id
    where d.human_id = v_owner and b.booking_date = v_date
      and coalesce(b.status, '') not in ('Ready for collection', 'Completed', 'Cancelled', 'No-show')
  ) then
    insert into public.staff_collection_notice_claims as claims
      (owner_id, booking_date, recipient_id, state, channel)
    values (v_owner, v_date, p_recipient_id, 'pending', p_channel)
    on conflict (owner_id, booking_date, recipient_id) do update
      set attempt_id = excluded.attempt_id, state = 'pending', channel = excluded.channel,
          reconciliation_ref = null, provider_id = null, recorded = false,
          updated_at = clock_timestamp()
      where claims.state = 'not_sent'
    returning * into v_claim;

    if found then
      return jsonb_build_object('state', 'claimed', 'attempt_id', v_claim.attempt_id);
    end if;
  end if;

  select * into v_claim from public.staff_collection_notice_claims
  where owner_id = v_owner and booking_date = v_date and recipient_id = p_recipient_id;

  if v_claim.state = 'accepted' then
    return jsonb_build_object('state', 'accepted', 'recorded', v_claim.recorded);
  end if;
  if v_claim.state in ('pending', 'unknown') then
    return jsonb_build_object('state', v_claim.state);
  end if;
  return jsonb_build_object('state', 'ineligible');
end;
$$;

create function public.settle_staff_collection_notice(
  p_attempt_id uuid, p_state text, p_provider_id text, p_recorded boolean
) returns boolean
language sql
set search_path = ''
as $$
  with settled as (
    update public.staff_collection_notice_claims
      set state = p_state, provider_id = p_provider_id, recorded = p_recorded,
          updated_at = clock_timestamp()
    where attempt_id = p_attempt_id and (
      (state = 'pending' and p_state in ('accepted', 'not_sent', 'unknown'))
      or (state = 'accepted' and p_state = 'accepted' and p_recorded and provider_id = p_provider_id)
    )
    returning 1
  )
  select exists (select from settled);
$$;

revoke execute on function public.claim_staff_collection_notice(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.settle_staff_collection_notice(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_staff_collection_notice(uuid, uuid, text, text),
  public.settle_staff_collection_notice(uuid, text, text, boolean) to service_role;

-- Operator-only recovery. Evidence must confirm the exact provider attempt or
-- confirm that it did not send and can no longer send. Time alone is not proof.
create function public.reconcile_staff_collection_notice(
  p_attempt_id uuid, p_state text, p_provider_id text, p_evidence text
) returns boolean
language sql
set search_path = ''
as $$
  with reconciled as (
    update public.staff_collection_notice_claims
      set state = p_state, provider_id = p_provider_id,
          reconciliation_ref = btrim(p_evidence), updated_at = clock_timestamp()
    where attempt_id = p_attempt_id and state in ('pending', 'unknown')
      and p_state in ('accepted', 'not_sent')
      and length(btrim(p_evidence)) between 1 and 256
      and (p_state = 'accepted' or p_provider_id is null)
    returning 1
  )
  select exists (select from reconciled);
$$;
revoke execute on function public.reconcile_staff_collection_notice(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_staff_collection_notice(uuid, text, text, text) to service_role;
