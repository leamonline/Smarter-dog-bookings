-- Partial-day closures: the day_settings.closures column.
--
-- A closure is the staff-facing record of "we're shut for part of this day"
-- -- {id, from, to, reason}, `from` inclusive and `to` exclusive. It does not
-- enforce anything on its own. Saving one also blocks both seats on every
-- covered slot in day_settings.overrides, and those blocks are what the gates
-- already honour. So this suite checks two things: the column's own shape
-- (present, NOT NULL, defaults to an empty array, refuses a non-array), and
-- that the blocks a closure writes alongside it are still visible to the
-- customer read path that actually stops the booking.
--
-- Nothing here touches validate_booking_calendar, validate_booking_capacity
-- or get_blocked_seats -- enforcement is deliberately unchanged by this
-- feature. Synthetic fixtures are rolled back.
--
-- Not to be confused with 177_closure_integrity.test.sql, which is about
-- closing off tasks, not closing the salon.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- 1-3. The column exists, is NOT NULL, and defaults to an empty array.
select has_column('public', 'day_settings', 'closures', 'day_settings has a closures column');
select col_not_null('public', 'day_settings', 'closures', 'closures is NOT NULL');

insert into public.day_settings (setting_date, is_open) values ('2031-01-06', true);
select is(
  (select closures from public.day_settings where setting_date = '2031-01-06'),
  '[]'::jsonb,
  'closures defaults to an empty array'
);

-- 4. A non-array is refused by the check constraint.
select throws_ok(
  $$update public.day_settings set closures = '{"a":1}'::jsonb where setting_date = '2031-01-06'$$,
  '23514',
  null,
  'a non-array closures value is refused'
);

-- 5. A well-formed closure list is accepted.
select lives_ok(
  $$update public.day_settings
       set closures = '[{"id":"11111111-1111-4111-8111-111111111111","from":"09:00","to":"10:30","reason":"doctor''s appointment"}]'::jsonb
     where setting_date = '2031-01-06'$$,
  'a well-formed closure list is accepted'
);

-- 6. The blocks a closure writes are still visible to the customer read path,
--    which is what actually stops the booking.
update public.day_settings
   set overrides = '{"09:00":{"0":"blocked","1":"blocked"},"09:30":{"0":"blocked","1":"blocked"},"10:00":{"0":"blocked","1":"blocked"}}'::jsonb
 where setting_date = '2031-01-06';
select is(
  (select count(*)::int from public.get_blocked_seats('2031-01-06', '2031-01-06')),
  6,
  'get_blocked_seats still reports the six seats a 3-slot closure blocks'
);

select * from finish();
rollback;
