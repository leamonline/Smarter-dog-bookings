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
# Advisory lock: the RPC takes pg_advisory_xact_lock(hashtextextended(
# 'wa_resched|' || flow_token, 0)). It is TRANSACTION-scoped, so PostgreSQL
# always releases it on commit or rollback — no explicit unlock, no leak on
# error. The key is derived solely from the flow_token, so two different
# tokens take two different locks and never serialise against each other in
# the normal case. A hash collision between two tokens is possible in theory
# and would cause the two to serialise unnecessarily (a harmless slowdown),
# but it can NEVER return one token'"'"'s receipt for another: the receipt lookup
# and the idempotency-hash check are both keyed on the exact flow_token text,
# not on the lock. The lock only orders the work; the token identifies it.
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

# ── Assertions — the five failure conditions, each fails non-zero ────
A=$(tr -d ' \n' < /tmp/race_a.out | tail -c 1)   # replayed flag: f or t
B=$(tr -d ' \n' < /tmp/race_b.out | tail -c 1)
FAIL=0

# 1. Both sessions must NOT both perform the reschedule (one f, one t).
if [ "$A$B" != "ft" ] && [ "$A$B" != "tf" ]; then
  echo "FAIL: both sessions performed the reschedule (A=$A B=$B)" >&2; FAIL=1
fi

# 2. Exactly one receipt.
RECEIPTS=$($PSQL -c "select count(*) from public.whatsapp_reschedule_receipts where flow_token='race-token'")
if [ "$RECEIPTS" != "1" ]; then
  echo "FAIL: expected 1 receipt, found $RECEIPTS" >&2; FAIL=1
fi

# 3. Exactly one replacement group (one live booking for the customer).
LIVE=$($PSQL -c "select count(*) from public.bookings b join public.dogs d on d.id=b.dog_id where d.human_id='99000000-0000-4000-8000-0000000000b1' and b.status='Booked'")
if [ "$LIVE" != "1" ]; then
  echo "FAIL: expected exactly 1 live booking, found $LIVE" >&2; FAIL=1
fi

# 4. The original must NOT remain active after a successful reschedule.
ORIG=$($PSQL -c "select count(*) from public.bookings where id='99000000-0000-4000-8000-0000000000d1' and status='Booked'")
if [ "$ORIG" != "0" ]; then
  echo "FAIL: the original booking is still active after the reschedule" >&2; FAIL=1
fi

# 5. The replay must return the SAME booking ids as the committed receipt.
STORED=$($PSQL -c "select array_to_string(new_booking_ids,',') from public.whatsapp_reschedule_receipts where flow_token='race-token'")
LIVEID=$($PSQL -c "select array_to_string(array_agg(b.id order by b.id),',') from public.bookings b join public.dogs d on d.id=b.dog_id where d.human_id='99000000-0000-4000-8000-0000000000b1' and b.status='Booked'")
if [ "$STORED" != "$LIVEID" ]; then
  echo "FAIL: replay/committed booking ids differ (receipt=$STORED live=$LIVEID)" >&2; FAIL=1
fi

if [ "$FAIL" != "0" ]; then
  echo "CONCURRENCY GATE FAILED" >&2; exit 1
fi
echo "PASS: one reschedule, one replay, one receipt, one live booking, original cancelled, ids match."
