"""Run against an explicitly named, disposable local verification database only."""
import argparse
import pathlib
import subprocess
import concurrent.futures

parser = argparse.ArgumentParser()
parser.add_argument('--psql', default='psql')
parser.add_argument('--port', required=True)
parser.add_argument('--database', required=True)
args = parser.parse_args()
if not args.database.startswith('late_cancellation_'):
    raise SystemExit('Use a disposable local late_cancellation_* database.')
root = pathlib.Path(__file__).resolve().parents[2]
command = [args.psql, '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', args.port, '-d', args.database]
def sql(value):
    return subprocess.run(command, input=value, text=True, check=True, capture_output=True).stdout
fixture = (root / 'supabase/tests/fixtures/late_cancellation_cases.psql').read_text()
# Disposable database must be empty. Leave the committed evidence available for inspection.
sql("do $$begin if exists(select 1 from public.bookings) then raise exception 'verification database must be empty'; end if; end$$;\nbegin;\n" + fixture + '\ncommit;')
request = "begin; select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true); select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Concurrent cancellation'); select pg_sleep(0.2); commit;"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(sql, [request, request]))
sql("""do $$begin
 if (select count(*) from bookings where status='Cancelled') <> 2 then raise exception 'wrong cancelled rows'; end if;
 if (select count(*) from smarter_dog_private.late_cancellation_history) <> 1 then raise exception 'concurrent duplicate incident'; end if;
 if (select cardinality(booking_ids) from smarter_dog_private.late_cancellation_history) <> 2 then raise exception 'lost grouped row'; end if;
 if (select count(*) from smarter_dog_private.customer_cancellation_receipts) <> 1 then raise exception 'duplicate receipt'; end if;
end$$;""")
print('Concurrent requests: two cancelled rows, one incident, one receipt.')
