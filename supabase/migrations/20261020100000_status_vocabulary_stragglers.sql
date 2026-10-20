-- Migration 20261020100000 (#1005): two functions the September status split
-- missed.
--
-- 1. recompute_legacy_booking_visit counted a No-show booking as still open
--    (`status not in ('Cancelled','Completed')`), so a visit whose only dog
--    did not show stayed `active` for ever. It now uses the shared occupancy
--    predicate booking_occupies_seat() (false for Cancelled and No-show), so
--    an all-No-show visit falls through to `cancelled`, like a cancelled one,
--    and a No-show row no longer counts towards the deposit anomaly.
-- 2. suggest_conversation_closures matched the retired 'Checked in',
--    'In bath' and 'Ready for pick-up', so its booking_confirmed_quiet pass
--    missed Reconfirmed, Arrived and Ready for collection. It now asks the
--    same predicate: any booking that still holds its seat, Completed included,
--    exactly the old intent ("a live or finished booking").
--
-- Both are CREATE OR REPLACE of the latest definitions (20260726144000 and
-- 20260520200000), unchanged apart from those predicates and a pinned
-- `pg_temp` on the second. Neither is the capacity gate, and neither changes a
-- booking row. Idempotent. Grants are kept by CREATE OR REPLACE; they are
-- restated below anyway so a fresh project ends in the same place.

begin;

create or replace function public.recompute_legacy_booking_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  c record;
  v_lifecycle text;
  v_confirm boolean;
begin
  if p_visit_id is null then
    return;
  end if;
  select * into v from public.booking_visits
   where id = p_visit_id and runtime_generation = 'legacy_compat'
   for update;
  if not found then
    return;
  end if;
  -- Only recompute states the legacy engine owns; never touch a visit that a
  -- v1 command has already moved into a v1-only shape.
  if v.lifecycle_state in ('superseded','withdrawn','declined') then
    return;
  end if;

  select
    count(*) filter (where visit_membership_state = 'included') as n_total,
    count(*) filter (where visit_membership_state = 'included' and status = 'Cancelled') as n_cancelled,
    count(*) filter (where visit_membership_state = 'included' and status = 'Completed') as n_completed,
    count(*) filter (where visit_membership_state = 'included'
                       and public.booking_occupies_seat(status)
                       and status is distinct from 'Completed') as n_open,
    bool_or(visit_membership_state = 'included'
            and deposit_required
            and deposit_received_at is null
            and coalesce(payment, '') not in ('Deposit Paid','Paid in Full')
            and public.booking_occupies_seat(status)
            and status is distinct from 'Completed') as anomaly,
    min(slot) filter (where visit_membership_state = 'included') as min_slot,
    max(updated_at) as max_updated
  into c
  from public.bookings
  where visit_id = p_visit_id;

  if c.n_total = 0 then
    v_lifecycle := 'cancelled'; -- every row moved away or was excluded
  elsif c.n_open > 0 then
    v_lifecycle := 'active';
  elsif c.n_completed > 0 then
    v_lifecycle := 'completed'; -- mixed terminal favours the visit that happened
  else
    v_lifecycle := 'cancelled';
  end if;

  -- Confirmation only ever moves forward for legacy visits.
  v_confirm := v.confirmation_state = 'confirmed'
    or v_lifecycle = 'completed'
    or (v_lifecycle in ('active','cancelled') and c.n_total > 0 and not coalesce(c.anomaly, false));

  update public.booking_visits
     set lifecycle_state = v_lifecycle,
         cancelled_at = case when v_lifecycle = 'cancelled'
                             then coalesce(cancelled_at, coalesce(c.max_updated, now()))
                             else null end,
         completed_at = case when v_lifecycle = 'completed'
                             then coalesce(completed_at, coalesce(c.max_updated, now()))
                             else null end,
         confirmation_state = case when v_confirm then 'confirmed' else 'unconfirmed' end,
         confirmed_at = case when v_confirm then coalesce(confirmed_at, now()) else null end,
         policy_code = case when v_confirm then coalesce(policy_code, 'legacy_24h') else null end,
         customer_change_deadline_at = case
           when v_confirm then coalesce(
             customer_change_deadline_at,
             public.legacy_visit_change_deadline(v.booking_date, c.min_slot))
           else null end
   where id = p_visit_id;
end;
$$;

revoke all on function public.recompute_legacy_booking_visit(uuid) from public, anon, authenticated;

create or replace function public.suggest_conversation_closures()
returns table(conversation_id uuid, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  -- Trigger 1: confirmed booking + 7 days of customer silence
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'booking_confirmed_quiet'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and exists (
       select 1 from bookings b
        where b.whatsapp_conversation_id = c.id
          and public.booking_occupies_seat(b.status)
     )
     and c.last_inbound_at is not null
     and c.last_inbound_at < v_now - interval '7 days'
   returning c.id::uuid, 'booking_confirmed_quiet'::text;

  -- Trigger 2: stale_30d (no customer reply for 30 days)
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'stale_30d'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and c.last_inbound_at is not null
     and c.last_inbound_at < v_now - interval '30 days'
   returning c.id::uuid, 'stale_30d'::text;

  -- Trigger 3: any linked booking has status='Cancelled' and the
  -- customer hasn't messaged in the last 24h (gives them time to ack).
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'customer_cancelled'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and exists (
       select 1 from bookings b
        where b.whatsapp_conversation_id = c.id
          and b.status = 'Cancelled'
     )
     and (c.last_inbound_at is null or c.last_inbound_at < v_now - interval '24 hours')
   returning c.id::uuid, 'customer_cancelled'::text;
end;
$$;

revoke all on function public.suggest_conversation_closures() from public, anon, authenticated;
grant execute on function public.suggest_conversation_closures() to service_role;

-- Post-condition: no function in `public` names a retired status any more.
do $post$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ '''(Checked in|In bath|Ready for pick-up|Not Arrived)''';
  if v_bad is not null then
    raise exception '#1005 post-condition: retired status literal still in %', v_bad;
  end if;
  if (select prosrc from pg_proc where oid = 'public.recompute_legacy_booking_visit(uuid)'::regprocedure)
       like '%not in (''Cancelled'',''Completed'')%' then
    raise exception '#1005 post-condition: recompute_legacy_booking_visit still ignores No-show';
  end if;
end
$post$;

commit;
