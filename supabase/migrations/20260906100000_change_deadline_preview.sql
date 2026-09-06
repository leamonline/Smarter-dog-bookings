-- Tell a customer, BEFORE they book, whether the slot they are about to take
-- is already past the point where they could change or cancel it online.
--
-- WHY IT EXISTS
--
-- On 2 September 2026 a customer booked a groom at 10:32 for 08:30 the next
-- morning — 22h58m ahead, so already inside the 24-hour change window at the
-- moment she confirmed. She tried to move it 2h47m later and was refused
-- (SDC02). The gate was right; nothing in the portal had told her. The confirm
-- step showed only the generic sentence "Changes close 24 hours before your
-- appointment", which is true and, for that booking, useless.
--
-- WHY IT IS A SERVER FUNCTION
--
-- src/engine/bookingPolicy.ts records the rule this obeys: the client never
-- recalculates a deadline, "because a client that re-derives a deadline will
-- eventually disagree with the database that actually enforces it". The
-- enforcing code is cancel_customer_booking (SDC02); reschedule inherits it,
-- because reschedule_customer_booking_direct_unchecked calls cancel. So this
-- reads exactly the settings that function reads and applies exactly its
-- comparison, rather than describing a second rule that could drift.
--
-- A DIVERGENCE IT DELIBERATELY DOES NOT PAPER OVER
--
-- current_customer_booking_rules() sources the customer-visible sentence from
-- booking_policy_settings, while the deadline is enforced from
-- salon_config.settings.minCancellationHours. Two tables. They agree today
-- (24 hours, cancellations on). This function answers from the ENFORCING
-- source, so the warning it drives stays true even if the sentence beside it
-- drifts. Making the two agree is a separate change.
--
-- Read-only: no booking write path, no new table, no policy change.

create or replace function public.customer_change_deadline_preview(
  p_booking_date date,
  p_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamp without time zone;
  v_settings jsonb := '{}'::jsonb;
  v_settings_count integer;
  v_allow_value jsonb;
  v_hours_value jsonb;
  v_allow_cancellations boolean := true;
  v_min_cancellation_hours numeric := 24;
  v_deadline timestamp without time zone;
begin
  if p_booking_date is null or p_slot is null then
    return null;
  end if;

  -- An unparseable slot means "unknown", not "fine". Null tells the caller to
  -- render nothing rather than promise something it cannot substantiate.
  begin
    v_start := p_booking_date + p_slot::time;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return null;
  end;

  select count(*)::integer,
         coalesce((array_agg(sc.settings order by sc.id))[1], '{}'::jsonb)
    into v_settings_count, v_settings
    from public.salon_config sc;

  if v_settings_count > 1 then
    -- cancel_customer_booking treats a non-singleton salon_config as online
    -- cancellation being off (SDC01, detail salon_config_not_singleton).
    -- Mirror that rather than guessing a deadline from an ambiguous row.
    v_allow_cancellations := false;
  else
    if v_settings_count = 0 or jsonb_typeof(v_settings) <> 'object' then
      v_settings := '{}'::jsonb;
    end if;

    -- Malformed or missing values fall back to the documented defaults, the
    -- same way the enforcing function does.
    v_allow_value := v_settings #> '{customerPortal,allowCancellations}';
    if jsonb_typeof(v_allow_value) = 'boolean' then
      v_allow_cancellations := v_allow_value = 'true'::jsonb;
    end if;

    v_hours_value := v_settings -> 'minCancellationHours';
    if jsonb_typeof(v_hours_value) = 'number'
       and (v_hours_value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' then
      begin
        v_min_cancellation_hours := (v_hours_value #>> '{}')::numeric;
        if v_min_cancellation_hours > 876000 then
          v_min_cancellation_hours := 24;
        end if;
      exception
        when numeric_value_out_of_range or invalid_text_representation then
          v_min_cancellation_hours := 24;
      end;
    end if;
  end if;

  v_deadline := v_start - (v_min_cancellation_hours * interval '1 hour');

  return jsonb_build_object(
    'allowCancellations', v_allow_cancellations,
    'minCancellationHours', v_min_cancellation_hours,
    -- Europe/London wall clock, the same frame the deadline is enforced in.
    'deadline', to_char(v_deadline, 'YYYY-MM-DD"T"HH24:MI:SS'),
    -- Byte-for-byte the enforcing comparison: London wall time on both sides,
    -- and exactly on the deadline is still allowed.
    'passed', (now() at time zone 'Europe/London') > v_deadline
  );
end;
$$;

-- Supabase grants EXECUTE on new functions to public/anon/authenticated
-- regardless of "revoke from public" — revoke all three explicitly, then grant
-- back only what is intended. Customers are authenticated; anon never sees it.
revoke all on function public.customer_change_deadline_preview(date, text) from public;
revoke all on function public.customer_change_deadline_preview(date, text) from anon;
revoke all on function public.customer_change_deadline_preview(date, text) from authenticated;
grant execute on function public.customer_change_deadline_preview(date, text) to authenticated;

comment on function public.customer_change_deadline_preview(date, text) is
  'Read-only preview of the online change/cancel deadline for a prospective '
  '(date, slot), answered from the same settings cancel_customer_booking '
  'enforces. Returns null when the inputs are unusable.';
