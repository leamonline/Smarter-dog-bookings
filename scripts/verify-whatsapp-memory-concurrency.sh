#!/usr/bin/env bash
set -euo pipefail
# Local synthetic proof only. Never accept a hosted Supabase URL.
: "${DATABASE_URL:?Set DATABASE_URL to an isolated local migrated PostgreSQL database}"
python3 - <<'PY'
import os,urllib.parse
u=urllib.parse.urlparse(os.environ['DATABASE_URL'])
if u.scheme not in ('postgres','postgresql') or u.hostname not in ('localhost','127.0.0.1','::1'):
 raise SystemExit('Refusing non-local database target')
PY
command -v psql >/dev/null || { echo 'psql is required'; exit 1; }
task_tmp=$(mktemp -d)
fixture_id=93600000-0000-4000-8000-000000000002
cleanup() {
  if [[ -n "${worker_a:-}" ]]; then wait "$worker_a" 2>/dev/null || true; fi
  if [[ -n "${worker_b:-}" ]]; then wait "$worker_b" 2>/dev/null || true; fi
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "delete from public.whatsapp_conversations where id='$fixture_id' and phone_e164='+447700900937'" >/dev/null
  rm -rf "$task_tmp"
}
# Refuse a colliding fixture; never delete a pre-existing row.
[[ $(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.whatsapp_conversations where id='$fixture_id' or phone_e164='+447700900937'") == 0 ]]
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "insert into public.whatsapp_conversations(id,phone_e164,agent_state) values('$fixture_id','+447700900937','{}')" >/dev/null
trap cleanup EXIT
for value in A B; do
  psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "begin; select saved from public.compare_and_set_whatsapp_agent_state('$fixture_id',0,jsonb_build_object('preferredDay','$value')); select pg_sleep(1); commit;" > "$task_tmp/$value" &
  if [[ "$value" == A ]]; then worker_a=$!; else worker_b=$!; fi
done
wait "$worker_a"; worker_a=
wait "$worker_b"; worker_b=
[[ $(cat "$task_tmp/A" "$task_tmp/B" | grep -c '^t$') == 1 ]]
[[ $(cat "$task_tmp/A" "$task_tmp/B" | grep -c '^f$') == 1 ]]
[[ $(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "select agent_state_rev = 1 and agent_state->>'preferredDay' in ('A','B') from public.whatsapp_conversations where id='$fixture_id'") == t ]]
echo 'PASS: two concurrent snapshots, one saved update, one conflict, revision 1'
