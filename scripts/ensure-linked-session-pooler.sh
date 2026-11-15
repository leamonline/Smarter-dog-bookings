#!/usr/bin/env bash
# Give a linked project an IPv4 session-pooler address when `supabase link` did not.
#
# CLI 2.109.1 reads GET /v1/projects/{ref}/config/database/pooler while linking
# and writes supabase/.temp/pooler-url only when that call returns an entry it
# can unmarshal with database_type PRIMARY. LinkServices treats every other
# outcome as non-fatal and discards it unless --debug is on (and --debug also
# prints keys, so this script does not enable it). link still exits 0.
#
# The next linked command dials db.<ref>.supabase.co. On the Free plan that
# host is IPv6-only. GitHub-hosted runners have no IPv6 route, so the CLI
# stops with "IPv6 is not supported on your current network" whenever the
# pooler file is missing. That sentence names the symptom.
#
# This script calls the same Management API endpoint, prints only the HTTP
# status and the non-secret fields (host, port, pool mode, database user,
# database type, database name), and, when link saved no pooler URL, writes a
# password-less session URL on port 5432. The apply script's short-lived login
# still supplies the password. A transaction-pooler entry (port 6543) is
# rewritten to 5432, which is what the CLI itself does for migrations. The
# file written here never uses port 6543 and never contains a password.
set -euo pipefail
umask 077

project_ref="${1:?Usage: ensure-linked-session-pooler.sh <project-ref>}"

if [[ ! "$project_ref" =~ ^[a-z]{20}$ ]]; then
  echo "Refusing project ref: expected 20 lowercase letters." >&2
  exit 1
fi
if [ ! -s supabase/.temp/project-ref ]; then
  echo "Refusing to fetch a pooler: supabase/.temp/project-ref is missing. Link the project first." >&2
  exit 1
fi
linked_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
if [ "$linked_ref" != "$project_ref" ]; then
  echo "Refusing to fetch a pooler: linked project is '$linked_ref', not '$project_ref'." >&2
  exit 1
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Refusing to fetch a pooler: SUPABASE_ACCESS_TOKEN is empty." >&2
  exit 1
fi
command -v curl >/dev/null
command -v jq >/dev/null

body_file="$(mktemp)"
cleanup() {
  rm -f "$body_file"
}
trap cleanup EXIT

# Do not follow redirects: the bearer token must stay on api.supabase.com.
status="$(
  curl --proto '=https' --tlsv1.2 --silent --show-error --max-time 30 --max-redirs 0 \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    --header "Accept: application/json" \
    --output "$body_file" \
    --write-out '%{http_code}' \
    --url "https://api.supabase.com/v1/projects/${project_ref}/config/database/pooler"
)"
status="${status//$'\n'/}"
if [[ ! "$status" =~ ^[0-9]{3}$ ]]; then
  echo "Pooler API call did not return an HTTP status." >&2
  exit 1
fi

# Print only fields the operator asked to see. connection_string is omitted:
# some responses put a password there. A field that itself contains a
# credential-shaped value is replaced before it reaches the log.
jq -r '
  def field:
    if type == "number" then tostring
    elif type != "string" then ""
    elif test("password|secret|token|bearer|eyJ"; "i") then "[redacted]"
    elif test("[\\s:/@]") then "[redacted]"
    else .
    end;
  def rows:
    if type == "array" then .
    elif type == "object" and ((.db_host | type) == "string") then [.]
    else [] end;
  if type == "array" or (type == "object" and ((.db_host | type) == "string")) then
    "Pooler entries: \(rows | length)",
    (rows | to_entries[] |
      "pooler[\(.key)] host=\(.value.db_host | field) port=\(.value.db_port | field) pool_mode=\(.value.pool_mode | field) db_user=\(.value.db_user | field) database_type=\(.value.database_type | field) db_name=\(.value.db_name | field)")
  elif type == "object" and ((.message | type) == "string") then
    if (.message | test("password|secret|token|bearer|eyJ"; "i")) then
      "Pooler API message: [redacted]"
    elif (.message | length) > 180 then
      "Pooler API message: \(.message[0:180])"
    else
      "Pooler API message: \(.message)"
    end
  else
    "Pooler response shape: \(type)"
  end
' "$body_file" 2>/dev/null || echo "Pooler response was not JSON."
echo "Pooler API status: $status"

if [ -s supabase/.temp/pooler-url ]; then
  echo "Pooler host already saved by link: $(sed -E 's#^[a-z]+://([^@/]*@)?([^:/?]+).*$#\2#' supabase/.temp/pooler-url)"
  if [ "$status" != "200" ]; then
    echo "::warning::Pooler API status is $status. Keeping the address link already saved."
  fi
  exit 0
fi

if [ "$status" = "403" ]; then
  echo "supabase link saved no pooler address, and the pooler endpoint returned 403." >&2
  echo "That endpoint requires the database:read scope (database_pooling_config_read). link hides this and the next command then reports that IPv6 is not supported." >&2
  echo "Recreate the access token with database:read as well as database:write. Do not store a database password." >&2
  exit 1
fi
if [ "$status" != "200" ]; then
  echo "supabase link saved no pooler address, and the pooler endpoint returned status $status. Nothing was written." >&2
  exit 1
fi

# Prefer an explicit session entry on 5432. Otherwise take PRIMARY and force
# session mode, including the CLI's 6543 -> 5432 rewrite. The user must be the
# shared-pooler user postgres.<ref>; the host must be a Supabase pooler host.
if ! selected="$(jq -er --arg ref "$project_ref" '
  def rows:
    if type == "array" then .
    elif type == "object" and ((.db_host | type) == "string") then [.]
    else [] end;
  def norm:
    {
      host: ((.db_host // "") | ascii_downcase),
      port: (.db_port | if type == "string" then (tonumber? // -1) else (tonumber? // -1) end),
      user: (.db_user // ""),
      name: (if (.db_name // "") == "" then "postgres" else .db_name end),
      mode: ((.pool_mode // "") | ascii_downcase),
      kind: ((.database_type // "") | ascii_upcase)
    };
  [rows[] | norm
    | select(.user == ("postgres." + $ref) and .name == "postgres")
    | select(.host | test("^[a-z0-9][a-z0-9.-]*\\.pooler\\.supabase\\.com$"))
    | select(.host | test("\\.\\.") | not)
    | select(.port == 5432 or .port == 6543)
    | select(.kind != "READ_REPLICA")]
  | (map(select(.mode == "session" and .port == 5432)) | .[0]) as $session
  | (map(select(.kind == "PRIMARY")) | .[0]) as $primary
  | (.[0]) as $any
  | if $session != null then $session | .original = .port
    elif $primary != null then $primary | .original = .port | .port = 5432 | .mode = "session"
    elif $any != null then $any | .original = .port | .port = 5432 | .mode = "session"
    else empty end
  | [.host, (.port | tostring), .user, .name, .mode, .kind, (.original | tostring)]
  | @tsv
' "$body_file" 2>/dev/null)"; then
  echo "supabase link saved no pooler address, and the pooler response had no usable session entry for postgres.${project_ref} on a *.pooler.supabase.com host. Nothing was written." >&2
  exit 1
fi

IFS=$'\t' read -r db_host db_port db_user db_name pool_mode database_type original_port <<<"$selected"

if [ "$db_port" != "5432" ] || [ "$pool_mode" != "session" ] || [ "$db_name" != "postgres" ]; then
  echo "Refusing to write a pooler URL that is not session mode on port 5432." >&2
  exit 1
fi
if [ "$db_user" != "postgres.${project_ref}" ]; then
  echo "Refusing pooler user: it is not postgres.${project_ref}." >&2
  exit 1
fi
if [[ ! "$db_host" =~ ^[a-z0-9][a-z0-9.-]*\.pooler\.supabase\.com$ ]] || [[ "$db_host" == *..* ]]; then
  echo "Refusing pooler host: it is not a Supabase pooler hostname." >&2
  exit 1
fi

pooler_url="postgresql://${db_user}@${db_host}:5432/postgres"
userinfo="${pooler_url#*://}"
userinfo="${userinfo%%@*}"
case "$userinfo" in
  *:*)
    echo "Refusing to write a pooler URL that contains a password." >&2
    exit 1
    ;;
esac

printf '%s' "$pooler_url" > supabase/.temp/pooler-url
if [ "$original_port" != "5432" ]; then
  echo "Wrote session pooler on port 5432 (API offered port ${original_port}, database_type=${database_type}). Host: ${db_host}"
else
  echo "Wrote session pooler on port 5432. Host: ${db_host}"
fi
