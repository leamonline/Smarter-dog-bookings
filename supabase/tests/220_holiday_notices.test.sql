begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Anchor the holiday to a Monday so the diary guard's weekly-default rule is
-- exercised the same way on every day of the week.
--
-- The guard judges a NULL is_open or a deleted row by the weekly default
-- (20260906080000): a closure day the salon is closed on anyway may drop its
-- row, because nothing reopens. That is correct, and it meant the "cannot
-- bypass" assertions below only held when today+10 happened to fall on
-- Mon–Wed — i.e. on a Fri/Sat/Sun run. Authored on a Saturday, merged on a
-- Sunday, this file was red every Monday to Thursday.
--
-- The holiday now always closes Monday to Wednesday and reopens on the
-- Thursday, so both halves of the guard's rule are exercised on every run:
-- the closure days are open by default, so NULL or delete on one would
-- genuinely reopen it and must be refused; the reopening day is closed by
-- default, so NULL on it would close the advertised reopening day and must be
-- refused too. Tests 18 and 27 count the Monday and Tuesday only.
create function pg_temp.holiday_mon() returns date language sql stable
  as $$ select current_date + 10 + ((1 - extract(isodow from current_date + 10)::int + 7) % 7) $$;
grant execute on function pg_temp.holiday_mon() to public;
\ir fixtures/ensure_local_vault_secrets.psql
insert into auth.users(id) values ('22000000-0000-4000-8000-000000000001'),('22000000-0000-4000-8000-000000000002');
insert into public.staff_profiles(user_id,role,display_name) values ('22000000-0000-4000-8000-000000000001','owner','Holiday Test');
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.day_settings(setting_date,is_open) values(pg_temp.holiday_mon()+3,true);
set local role authenticated;
select lives_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000010',0,current_date,pg_temp.holiday_mon(),pg_temp.holiday_mon()+3,true)$$,'staff saves holiday');
select is((select count(*)::int from public.get_public_holiday_notices()),1,'public projection includes verified upcoming holiday');
select is((select phase from public.get_public_holiday_notices()),'upcoming','phase is upcoming');
select is(public.save_salon_holiday('22000000-0000-4000-8000-000000000010',0,current_date,pg_temp.holiday_mon(),pg_temp.holiday_mon()+3,true)->>'replayed','true','retry is idempotent');
select throws_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000010',0,current_date,pg_temp.holiday_mon()-1,pg_temp.holiday_mon()+3,true)$$,'40001','holiday_changed_reload','stale edit rejected');
select throws_ok($$update public.day_settings set is_open=true where setting_date=pg_temp.holiday_mon()$$,'23514','holiday_dates_managed_in_settings','cannot reopen holiday day directly');
select throws_ok($$update public.day_settings set is_open=null where setting_date=pg_temp.holiday_mon()$$,'23514','holiday_dates_managed_in_settings','null cannot bypass holiday closure');
select throws_ok($$update public.day_settings set is_open=null where setting_date=pg_temp.holiday_mon()+3$$,'23514','holiday_dates_managed_in_settings','null cannot bypass reopening');
select throws_ok($$delete from public.day_settings where setting_date=pg_temp.holiday_mon()$$,'23514','holiday_dates_managed_in_settings','cannot delete closure');
select throws_ok($$update public.day_settings set is_open=false where setting_date=pg_temp.holiday_mon()+3$$,'23514','holiday_dates_managed_in_settings','cannot contradict reopening date');
select throws_ok($$select * from public.salon_holidays$$,'42501',null,'direct holiday table access denied');
select throws_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000011',0,current_date,pg_temp.holiday_mon()+1,pg_temp.holiday_mon()+3,true)$$,'22023','holiday_overlaps_existing','overlap rejected');
-- A reopening day closed by default (next Saturday, no row) is refused ...
select throws_ok(format($f$select public.save_salon_holiday('22000000-0000-4000-8000-000000000012',0,current_date,current_date+20,%L::date,true)$f$,
  current_date + 21 + ((6 - extract(isodow from current_date + 21)::int + 7) % 7)),'22023','holiday_reopening_must_be_open_in_diary','reopening closed by default is refused');
-- ... and a reopening day open by default (next Monday, no row) is accepted, then protected.
select lives_ok(format($f$select public.save_salon_holiday('22000000-0000-4000-8000-000000000016',0,current_date,current_date+40,%L::date,true)$f$,
  current_date + 41 + ((1 - extract(isodow from current_date + 41)::int + 7) % 7)),'reopening open by weekly default needs no diary row');
select throws_ok(format($f$insert into public.day_settings(setting_date,is_open) values(%L::date,false)$f$,
  current_date + 41 + ((1 - extract(isodow from current_date + 41)::int + 7) % 7)),'23514','holiday_dates_managed_in_settings','default-open reopening day cannot be closed later');
select lives_ok(format($f$insert into public.day_settings(setting_date,is_open) values(%L::date,null)$f$,
  current_date + 41 + ((1 - extract(isodow from current_date + 41)::int + 7) % 7)),'a NULL is_open row keeps the weekly default and is allowed on the reopening day');
select is((select count(*)::int from public.get_public_holiday_notices() where id='22000000-0000-4000-8000-000000000016'),1,'projection accepts a default-open reopening day');
select public.save_salon_holiday('22000000-0000-4000-8000-000000000016',1,current_date,current_date+40,current_date + 41 + ((1 - extract(isodow from current_date + 41)::int + 7) % 7),false);
reset role;
select is((select count(*)::int from public.day_settings where setting_date in(pg_temp.holiday_mon(),pg_temp.holiday_mon()+1) and not is_open),2,'every holiday day is closed');
select is((select count(*)::int from public.day_settings where setting_date=current_date+20),0,'failed save leaves no partial closure');
set local role anon;
select lives_ok($$select * from public.get_public_holiday_notices()$$,'anonymous notice read allowed');
select throws_ok($$select * from public.salon_holidays$$,'42501',null,'anonymous table read denied');
select throws_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000013',0,current_date,current_date+20,current_date+22,true)$$,'42501',null,'anonymous write denied');
reset role;
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select * from public.get_staff_holidays()$$,'42501','Staff only','customer cannot read staff holidays');
select throws_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000013',0,current_date,current_date+20,current_date+22,true)$$,'42501','Staff only','customer cannot write holidays');
reset role;
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.save_salon_holiday('22000000-0000-4000-8000-000000000010',1,current_date,pg_temp.holiday_mon(),pg_temp.holiday_mon()+3,false)$$,'retire notice');
select is((select count(*)::int from public.get_public_holiday_notices()),0,'retired notice hidden');
select is((select count(*)::int from public.day_settings where setting_date in(pg_temp.holiday_mon(),pg_temp.holiday_mon()+1) and not is_open),2,'retirement does not reopen dates');
select lives_ok($$update public.day_settings set is_open=true where setting_date=pg_temp.holiday_mon()$$,'explicit reopening allowed after retirement');
-- Database clock scheduling, independent of any browser or cron job.
insert into public.day_settings(setting_date,is_open) values(current_date+2,true);
select public.save_salon_holiday('22000000-0000-4000-8000-000000000014',0,current_date-1,current_date,current_date+2,true);
select is((select phase from public.get_public_holiday_notices()),'away','holiday start switches to away');
select public.save_salon_holiday('22000000-0000-4000-8000-000000000014',1,current_date-1,current_date,current_date+2,false);
insert into public.day_settings(setting_date,is_open) values(current_date+32,true);
select public.save_salon_holiday('22000000-0000-4000-8000-000000000015',0,current_date+5,current_date+30,current_date+32,true);
select is((select count(*)::int from public.get_public_holiday_notices()),0,'future announcement remains hidden');
select * from finish();
rollback;
