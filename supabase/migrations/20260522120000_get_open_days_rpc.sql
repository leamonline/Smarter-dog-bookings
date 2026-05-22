-- ============================================================
-- Customer read path for day closures
--
-- Customers need to know which upcoming days the salon is closed so
-- the booking wizard can dim them out, but day_settings is staff-only
-- via the staff_all_day_settings RLS policy and also carries internal
-- fields (overrides, extra_slots) we don't want to expose to customers.
--
-- This function bridges the gap: security definer, returns only the
-- (setting_date, is_open) pair, and is locked to short forward-looking
-- ranges so it can't be used to harvest the full closure calendar.
-- ============================================================

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
  -- 28-day wizard window + headroom for grouped multi-dog flows.
  -- Anything bigger smells like scraping the closure calendar.
  if p_end - p_start > 92 then
    raise exception 'get_open_days: range too wide (max 92 days)';
  end if;

  return query
  select d.setting_date, d.is_open
  from   day_settings d
  where  d.setting_date between p_start and p_end;
end;
$$;

comment on function public.get_open_days(date, date) is
  'Customer-safe read of day_settings closures within a short forward window. Returns only (setting_date, is_open) so overrides/extra_slots stay staff-only. Security definer so it bypasses the staff_all_day_settings RLS policy.';

revoke all on function public.get_open_days(date, date) from public;
grant execute on function public.get_open_days(date, date) to authenticated;
