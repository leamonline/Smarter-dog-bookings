"""Real competing PostgreSQL sessions; launched only by the local guard."""
import os
import subprocess
import time

if os.environ.get('CONCURRENCY_LOCAL_STACK_CONFIRMED') != '1' or os.environ.get('PGHOST') != '127.0.0.1':
    raise SystemExit('Local-only test requires the guarded shell entry point')
psql = [os.environ['HOLIDAY_PSQL_BIN'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']

def sql(query):
    return subprocess.check_output(psql + ['-c', query], text=True).strip()

claims = "select set_config('request.jwt.claims','{\"sub\":\"22100000-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}',true);"
create_booking = """select public.create_staff_booking_group('[{"id":"22100000-0000-4000-8000-000000000101","dog_id":"22100000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,current_date+45);"""
save = "select public.save_salon_holiday('22100000-0000-4000-8000-000000000020',0,current_date,current_date+45,current_date+47,true);"
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

try:
    if sql("select exists(select 1 from auth.users where id='22100000-0000-4000-8000-000000000001')") == 't':
        raise SystemExit('Reserved holiday fixture exists; refusing to overwrite')
    previous_days = sql("select coalesce(json_agg(d),'[]'::json) from public.day_settings d where setting_date between current_date+45 and current_date+47")
    sql("""insert into auth.users(id) values('22100000-0000-4000-8000-000000000001');
    insert into public.staff_profiles(user_id,role,display_name) values('22100000-0000-4000-8000-000000000001','owner','Synthetic Holiday');
    insert into public.humans(id,name,surname) values('22100000-0000-4000-8000-000000000010','Synthetic','Holiday');
    insert into public.dogs(id,name,breed,size,human_id) values('22100000-0000-4000-8000-000000000011','Synthetic Holiday','Poodle','small','22100000-0000-4000-8000-000000000010');
    insert into public.day_settings(setting_date,is_open) values(current_date+45,true),(current_date+47,true) on conflict(setting_date) do update set is_open=true;
    """)
    owned = True
    lock_holder = start('holiday_guard_lock', "select pg_advisory_xact_lock(hashtextextended('smarter_dog|close_day|' || (current_date+45)::text,0));")
    until("select exists(select 1 from pg_stat_activity where application_name='holiday_guard_lock' and state='idle in transaction')")
    edit = start('holiday_concurrent_edit', 'update public.day_settings set is_open=true where setting_date=current_date+45;commit;')
    edit.stdin.close(); edit.stdin = None
    _, err = edit.communicate(timeout=15)
    assert edit.returncode != 0 and 'holiday_diary_busy_retry' in err, err
    lock_holder.stdin.write('rollback;\n'); lock_holder.stdin.close(); lock_holder.stdin = None
    _, err = lock_holder.communicate(timeout=15)
    assert lock_holder.returncode == 0, err
    print('PASS: concurrent diary edit fails safely without waiting with its row lock')
    a = start('holiday_booking_winner' , create_booking)
    until("select exists(select 1 from pg_stat_activity where application_name='holiday_booking_winner' and state='idle in transaction')")
    b = start('holiday_closure_waiter', save + 'commit;')
    until("select exists(select 1 from pg_stat_activity where application_name='holiday_closure_waiter' and wait_event_type='Lock')")
    a.stdin.write('commit;\n'); a.stdin.close(); a.stdin = None
    out, err = a.communicate(timeout=15)
    assert a.returncode == 0, err
    b.stdin.close(); b.stdin = None
    out, err = b.communicate(timeout=15)
    assert b.returncode == 0, err
    assert sql("select count(*) from public.salon_todos where closure_date=current_date+45 and kind='closure_rearrangement' and not done") == '1'
    assert sql("select count(*) from public.day_settings where setting_date between current_date+45 and current_date+46 and is_open=false") == '2'
    # Direct reopening after the committed holiday must fail without changing state.
    c = start('holiday_reopen_loser', 'update public.day_settings set is_open=true where setting_date=current_date+45;commit;')
    c.stdin.close(); c.stdin = None
    out, err = c.communicate(timeout=15)
    assert c.returncode != 0 and 'holiday_dates_managed_in_settings' in err, err
    print('PASS: competing booking/holiday commits retain one linked rearrangement task; direct reopening rejected')
finally:
    for proc in processes:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
    # This script owns only fixed synthetic identifiers. No broad data cleanup.
    if owned:
      sql("""begin; set local session_replication_role=replica;
    delete from public.salon_holidays where id='22100000-0000-4000-8000-000000000020';

    delete from public.salon_todos where human_id='22100000-0000-4000-8000-000000000010';

    delete from public.notification_log where booking_id='22100000-0000-4000-8000-000000000101';
    delete from public.booking_events where booking_id='22100000-0000-4000-8000-000000000101';
    delete from public.booking_capacity_audit where booking_id='22100000-0000-4000-8000-000000000101';
    delete from public.bookings where dog_id='22100000-0000-4000-8000-000000000011';
    delete from public.booking_visits where human_id='22100000-0000-4000-8000-000000000010';
    delete from public.booking_lineages where human_id='22100000-0000-4000-8000-000000000010';
    delete from public.dogs where id='22100000-0000-4000-8000-000000000011';
    delete from public.humans where id='22100000-0000-4000-8000-000000000010';
    delete from public.staff_profiles where user_id='22100000-0000-4000-8000-000000000001';
    delete from auth.users where id='22100000-0000-4000-8000-000000000001';
    delete from public.day_settings where setting_date between current_date+45 and current_date+47;
    insert into public.day_settings select * from json_populate_recordset(null::public.day_settings, '""" + previous_days.replace("'", "''") + """');commit;""")
