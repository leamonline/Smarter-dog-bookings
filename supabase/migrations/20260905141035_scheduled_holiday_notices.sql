-- Holiday notices and operational closures commit together. No holiday is seeded.
-- Idempotent: safe to re-run (see docs/migrations.md).
create table if not exists public.salon_holidays (
  id uuid primary key,
  notice_from date not null,
  closed_from date not null,
  reopens_on date not null,
  enabled boolean not null default true,
  revision integer not null default 1,
  constraint holiday_dates check (notice_from <= closed_from and closed_from < reopens_on and reopens_on - closed_from <= 90),
  constraint holiday_revision check (revision > 0)
);
alter table public.salon_holidays enable row level security;
revoke all on public.salon_holidays from public, anon, authenticated;
-- Explicit projections/commands are the only application access paths.

create or replace function public.get_staff_holidays()
returns setof public.salon_holidays
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_staff(), false) then raise exception 'Staff only' using errcode = '42501'; end if;
  return query select h.* from public.salon_holidays h order by h.closed_from desc;
end;
$$;

create or replace function public.save_salon_holiday(p_id uuid, p_revision integer, p_notice_from date, p_closed_from date, p_reopens_on date, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.salon_holidays%rowtype;
  v_day date;
  v_revision integer;
  v_tasks integer := 0;
  v_result jsonb;
begin
  if not coalesce(public.is_staff(), false) then raise exception 'Staff only' using errcode = '42501'; end if;
  if p_id is null or p_revision is null or p_revision < 0 or p_enabled is null or p_notice_from is null or p_closed_from is null or p_reopens_on is null
     or p_notice_from > p_closed_from or p_closed_from >= p_reopens_on or p_reopens_on - p_closed_from > 90 then
    raise exception 'holiday_invalid_dates' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('smarter_dog|holidays', 0));
  select * into v_old from public.salon_holidays where id = p_id;
  -- Replaying an identical save is harmless, including after an ambiguous response.
  if found and v_old.revision = p_revision + 1 and
     (v_old.notice_from, v_old.closed_from, v_old.reopens_on, v_old.enabled) = (p_notice_from, p_closed_from, p_reopens_on, p_enabled) then
    return jsonb_build_object('id', p_id, 'revision', v_old.revision, 'replayed', true);
  end if;
  if coalesce(v_old.revision, 0) <> p_revision then raise exception 'holiday_changed_reload' using errcode = '40001'; end if;
  if p_enabled and p_reopens_on <= (now() at time zone 'Europe/London')::date then
    raise exception 'holiday_reopening_must_be_future' using errcode = '22023';
  end if;
  if p_enabled and exists (select 1 from public.salon_holidays h where h.enabled and h.id <> p_id
      and daterange(h.closed_from, h.reopens_on, '[]') && daterange(p_closed_from, p_reopens_on, '[]')) then
    raise exception 'holiday_overlaps_existing' using errcode = '22023';
  end if;
  -- Same date lock as booking writes and close_day_with_rearrangement_tasks.
  -- Include the previous range so retirement/edit and direct diary edits serialise.
  for v_day in select d::date from generate_series(least(p_closed_from, coalesce(v_old.closed_from,p_closed_from))::timestamp,
      greatest(p_reopens_on, coalesce(v_old.reopens_on,p_reopens_on))::timestamp, interval '1 day') d loop
    perform pg_advisory_xact_lock(hashtextextended('smarter_dog|close_day|' || v_day::text, 0));
  end loop;
  if p_enabled and not exists (select 1 from public.day_settings where setting_date = p_reopens_on and is_open) then
    raise exception 'holiday_reopening_must_be_open_in_diary' using errcode = '22023';
  end if;
  -- Retire our old assertion inside this transaction, before extending closures.
  update public.salon_holidays set enabled = false where id = p_id;
  if p_enabled then
    for v_day in select d::date from generate_series(p_closed_from::timestamp, (p_reopens_on - 1)::timestamp, interval '1 day') d loop
      v_result := public.close_day_with_rearrangement_tasks(v_day);
      v_tasks := v_tasks + coalesce((v_result->>'open_tasks')::integer, 0);
    end loop;
  end if;
  v_revision := p_revision + 1;
  insert into public.salon_holidays(id,notice_from,closed_from,reopens_on,enabled,revision)
    values(p_id,p_notice_from,p_closed_from,p_reopens_on,p_enabled,v_revision)
    on conflict(id) do update set notice_from=excluded.notice_from, closed_from=excluded.closed_from,
      reopens_on=excluded.reopens_on, enabled=excluded.enabled, revision=excluded.revision;
  return jsonb_build_object('id',p_id,'revision',v_revision,'openTasks',v_tasks,'replayed',false);
end;
$$;

-- This assertion applies to every diary writer, including direct staff edits.
create schema if not exists smarter_dog_private;
create or replace function smarter_dog_private.guard_holiday_diary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_date date;
begin
  for v_date in select distinct d from unnest(case when tg_op = 'DELETE' then array[old.setting_date]
      when tg_op = 'INSERT' then array[new.setting_date] else array[old.setting_date,new.setting_date] end) d order by d loop
    -- A direct UPDATE already owns its row lock. Never wait for the command's
    -- advisory lock here: that would invert lock order and risk a deadlock.
    if not pg_try_advisory_xact_lock(hashtextextended('smarter_dog|close_day|' || v_date::text, 0)) then
      raise exception 'holiday_diary_busy_retry' using errcode = '40001';
    end if;
  end loop;
  if exists (select 1 from public.salon_holidays h where h.enabled and (
    (tg_op <> 'INSERT' and old.setting_date between h.closed_from and h.reopens_on and
      (tg_op = 'DELETE' or old.setting_date is distinct from new.setting_date)) or
    (tg_op <> 'DELETE' and ((new.setting_date >= h.closed_from and new.setting_date < h.reopens_on and new.is_open is distinct from false)
      or (new.setting_date = h.reopens_on and new.is_open is distinct from true)))
  )) then raise exception 'holiday_dates_managed_in_settings' using errcode = '23514'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists aa_guard_holiday_diary on public.day_settings;
create trigger aa_guard_holiday_diary before insert or update of is_open, setting_date or delete on public.day_settings
for each row execute function smarter_dog_private.guard_holiday_diary();

create or replace function public.get_public_holiday_notices()
returns table(id uuid, notice_from date, closed_from date, reopens_on date, phase text)
language sql stable security definer set search_path = '' as $$
  select h.id,h.notice_from,h.closed_from,h.reopens_on,
    case when (now() at time zone 'Europe/London')::date < h.closed_from then 'upcoming' else 'away' end
  from public.salon_holidays h
  where h.enabled and (now() at time zone 'Europe/London')::date >= h.notice_from
    and (now() at time zone 'Europe/London')::date < h.reopens_on
    and exists(select 1 from public.day_settings d where d.setting_date=h.reopens_on and d.is_open)
    and not exists(select 1 from generate_series(h.closed_from::timestamp,(h.reopens_on-1)::timestamp,interval '1 day') d
      where not exists(select 1 from public.day_settings s where s.setting_date=d::date and not s.is_open))
  order by h.closed_from limit 12;
$$;
revoke all on function public.get_staff_holidays() from public,anon,authenticated;
revoke all on function public.save_salon_holiday(uuid,integer,date,date,date,boolean) from public,anon,authenticated;
revoke all on function public.get_public_holiday_notices() from public,anon,authenticated;
revoke all on function smarter_dog_private.guard_holiday_diary() from public,anon,authenticated,service_role;
grant execute on function public.get_staff_holidays() to authenticated;
grant execute on function public.save_salon_holiday(uuid,integer,date,date,date,boolean) to authenticated;
grant execute on function public.get_public_holiday_notices() to anon,authenticated,service_role;
comment on function public.get_public_holiday_notices() is 'Public holiday dates only, validated against operational closures; London date-based schedule. No private settings or customer data.';
