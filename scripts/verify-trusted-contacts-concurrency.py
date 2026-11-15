"""Real competing PostgreSQL sessions; launched only by the local guard.

save_customer_trusted_contact caps a customer at six contacts by counting
inside the transaction after taking the owner's humans row FOR UPDATE. This
proves the lock is what makes the cap hold: with five contacts stored, two
sessions add one each at the same time. The second must wait for the first,
then see six and refuse, so exactly six are stored.
"""
import os
import subprocess
import time

if os.environ.get('CONCURRENCY_LOCAL_STACK_CONFIRMED') != '1' or os.environ.get('PGHOST') != '127.0.0.1':
    raise SystemExit('Local-only test requires the guarded shell entry point')
psql = [os.environ['TRUSTED_CONTACTS_PSQL_BIN'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']

USER_ID = '26500000-0000-4000-8000-000000000001'
HUMAN_ID = '26500000-0000-4000-8000-000000000010'


def sql(query):
    return subprocess.check_output(psql + ['-c', query], text=True).strip()


claims = (
    "select set_config('request.jwt.claims','{\"sub\":\"" + USER_ID + "\",\"role\":\"authenticated\"}',true);"
    " set local role authenticated;"
)
processes = []
owned = False


def start(name, query):
    proc = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc.stdin.write("set application_name='" + name + "'; set statement_timeout='15s'; begin;" + claims + query + '\n')
    proc.stdin.flush()
    processes.append(proc)
    return proc


def until(query, expected='t'):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql(query) == expected:
            return
        time.sleep(0.05)
    raise AssertionError('Expected PostgreSQL state was not observed: ' + query)


def add(label, phone):
    return "select id from public.save_customer_trusted_contact(null,'" + label + "',null,'" + phone + "',null);"


try:
    if sql("select exists(select 1 from auth.users where id='" + USER_ID + "')") == 't':
        raise SystemExit('Reserved trusted-contacts fixture exists; refusing to overwrite')
    sql("insert into auth.users(id) values('" + USER_ID + "');"
        " insert into public.humans(id,name,surname,phone,customer_user_id)"
        " values('" + HUMAN_ID + "','Synthetic','Contacts','+447700900265','" + USER_ID + "');"
        " insert into public.customer_trusted_contacts(owner_human_id,name,phone)"
        " select '" + HUMAN_ID + "','Existing ' || n,'+4477009009' || lpad(n::text,2,'0') from generate_series(1,5) n;")
    owned = True
    assert sql("select count(*) from public.customer_trusted_contacts where owner_human_id='" + HUMAN_ID + "'") == '5'

    first = start('trusted_contacts_first', add('Race One', '07700900971'))
    until("select exists(select 1 from pg_stat_activity where application_name='trusted_contacts_first' and state='idle in transaction')")
    second = start('trusted_contacts_second', add('Race Two', '07700900972') + 'commit;')
    # The second session must be blocked on the owner's row, not racing past it.
    until("select exists(select 1 from pg_stat_activity where application_name='trusted_contacts_second' and wait_event_type='Lock')")

    first.stdin.write('commit;\n'); first.stdin.close(); first.stdin = None
    _, err = first.communicate(timeout=15)
    assert first.returncode == 0, err
    second.stdin.close(); second.stdin = None
    _, err = second.communicate(timeout=15)
    assert second.returncode != 0 and 'too_many_contacts' in err, err

    assert sql("select count(*) from public.customer_trusted_contacts where owner_human_id='" + HUMAN_ID + "'") == '6'
    assert sql("select count(*) from public.customer_trusted_contacts where owner_human_id='" + HUMAN_ID + "' and name like 'Race %'") == '1'
    print('PASS: two concurrent additions at five contacts commit exactly one; the cap of six holds')
finally:
    for proc in processes:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
    # This script owns only fixed synthetic identifiers. No broad data cleanup.
    if owned:
        sql("begin; set local session_replication_role=replica;"
            " delete from public.customer_trusted_contacts where owner_human_id='" + HUMAN_ID + "';"
            " delete from public.humans where id='" + HUMAN_ID + "';"
            " delete from auth.users where id='" + USER_ID + "'; commit;")
