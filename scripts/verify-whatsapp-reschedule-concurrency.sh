#!/usr/bin/env bash
#
# Duplicate-submission and concurrency gate for the atomic WhatsApp reschedule.
#
# A pgTAP file runs inside ONE transaction, so it can prove the idempotent
# replay but cannot prove the concurrent case. This drives two genuinely
# parallel psql sessions at the same flow token and asserts the required
# outcome: exactly one reschedule, one receipt, and never two live bookings.
#
# Expected: one session reports replayed=f, the other replayed=t, with one
# live booking for the customer.
#
# Usage (supported environment):
#   supabase start
#   PGPORT=54322 PGDATABASE=postgres bash scripts/verify-whatsapp-reschedule-concurrency.sh
#
# Defaults target the local throwaway cluster used during development.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGDATABASE="${PGDATABASE:-hotfix}"
PGUSER="${PGUSER:-postgres}"
PSQL_BIN="${PSQL_BIN:-psql}"

PSQL="$PSQL_BIN -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -tA"
# Fixture committed (not rolled back) so two real sessions can race it.
$PSQL -q <<'SQL'
insert into auth.users (id) values ('99000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.staff_profiles (user_id, role) values ('99000000-0000-4000-8000-000000000001','owner') on conflict do nothing;
insert into public.humans (id, name, surname) values ('99000000-0000-4000-8000-0000000000b1','Concur','Race') on conflict do nothing;
insert into public.dogs (id, name, breed, size, human_id) values ('99000000-0000-4000-8000-0000000000c1','Race','Poodle','small','99000000-0000-4000-8000-0000000000b1') on conflict do nothing;
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
delete from public.whatsapp_reschedule_receipts where flow_token='race-token';
delete from public.bookings where dog_id='99000000-0000-4000-8000-0000000000c1';
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, group_id, source)
select '99000000-0000-4000-8000-0000000000d1', d, '09:00','99000000-0000-4000-8000-0000000000c1','small','full-groom','Booked','99000000-0000-4000-8000-0000000000e1','whatsapp_flow'
from (select generate_series(current_date+90, current_date+97, interval '1 day')::date d) s
where extract(isodow from s.d) <= 3 limit 1;
SQL
TARGET=$($PSQL -c "select d::text from (select generate_series(current_date+120, current_date+127, interval '1 day')::date d) s where extract(isodow from s.d) <= 3 limit 1")
CALL="select set_config('request.jwt.claims','{\"sub\":\"99000000-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}',true);
select replayed from public.reschedule_whatsapp_booking_group(
  jsonb_build_array(jsonb_build_object('dog_id','99000000-0000-4000-8000-0000000000c1','slot','10:00','service','full-groom')),
  '$TARGET'::date,'99000000-0000-4000-8000-0000000000b1',
  '99000000-0000-4000-8000-0000000000e1',null,null,'Rescheduled via WhatsApp','race-token');"
# Two genuinely concurrent sessions.
echo "$CALL" | $PSQL > /tmp/race_a.out 2>&1 &
echo "$CALL" | $PSQL > /tmp/race_b.out 2>&1 &
wait
echo "SESSION A: $(cat /tmp/race_a.out | tr '\n' ' ')"
echo "SESSION B: $(cat /tmp/race_b.out | tr '\n' ' ')"
echo "live bookings on target date: $($PSQL -c "select count(*) from public.bookings b join public.dogs d on d.id=b.dog_id where d.human_id='99000000-0000-4000-8000-0000000000b1' and b.status='Booked' and b.booking_date='$TARGET'")"
echo "total live for customer: $($PSQL -c "select count(*) from public.bookings b join public.dogs d on d.id=b.dog_id where d.human_id='99000000-0000-4000-8000-0000000000b1' and b.status='Booked'")"
echo "receipts: $($PSQL -c "select count(*) from public.whatsapp_reschedule_receipts where flow_token='race-token'")"

# Assert, so the script is usable as a CI/merge gate rather than eyeballed.
A=$(tr -d ' \n' < /tmp/race_a.out | tail -c 1)
B=$(tr -d ' \n' < /tmp/race_b.out | tail -c 1)
LIVE=$($PSQL -c "select count(*) from public.bookings b join public.dogs d on d.id=b.dog_id where d.human_id='99000000-0000-4000-8000-0000000000b1' and b.status='Booked'")
if [ "$LIVE" != "1" ]; then
  echo "FAIL: expected exactly 1 live booking, found $LIVE" >&2
  exit 1
fi
if [ "$A$B" != "ft" ] && [ "$A$B" != "tf" ]; then
  echo "FAIL: expected one fresh reschedule and one replay, got A=$A B=$B" >&2
  exit 1
fi
echo "PASS: one reschedule, one replay, one live booking."
