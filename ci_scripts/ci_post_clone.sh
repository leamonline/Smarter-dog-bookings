#!/bin/sh
# Xcode Cloud runs this after checkout, before the archive.
# It writes the gitignored local config from two workflow variables so a
# TestFlight build can sign in. The values are the public project URL and the
# public anon / publishable key. Never set the service-role key here.

set -eu

# True when the middle part of a JWT says this is the service-role key.
# The public anon key is also a JWT; its role is anon, so it is kept.
jwt_payload_has_service_role() {
  payload=$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')
  case $((${#payload} % 4)) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  # macOS base64 uses -D. GNU base64 uses -d. Xcode Cloud is macOS.
  decoded=$(printf '%s' "$payload" | base64 -d 2>/dev/null || printf '%s' "$payload" | base64 -D 2>/dev/null || true)
  case "$decoded" in
    *service_role*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -z "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  echo "ci_post_clone: not an Xcode Cloud build, leaving config untouched."
  exit 0
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  echo "ci_post_clone: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set. Using the public values already in Config.xcconfig."
  exit 0
fi

case "$SUPABASE_URL" in
  *[![:alnum:]:/._-]*)
    echo "ci_post_clone: SUPABASE_URL has a character this settings file cannot store safely."
    exit 1
    ;;
esac

case "$SUPABASE_PUBLISHABLE_KEY" in
  *[![:alnum:]._-]*)
    echo "ci_post_clone: SUPABASE_PUBLISHABLE_KEY has a character this settings file cannot store safely."
    exit 1
    ;;
esac

# Refuse the service-role key if it was pasted by mistake.
# New keys start with a secret prefix. Old ones are JWTs whose payload says
# role service_role. The public anon key is also a JWT, with role anon, and
# must still be accepted. The prefix is split so a secret scan does not treat
# this refusal as a real key.
forbidden_prefix="sb_secret"
case "$SUPABASE_PUBLISHABLE_KEY" in
  "${forbidden_prefix}_"*)
    echo "ci_post_clone: that key is the service-role key. Use the publishable or anon key."
    exit 1
    ;;
  eyJ*.*.*)
    if jwt_payload_has_service_role "$SUPABASE_PUBLISHABLE_KEY"; then
      echo "ci_post_clone: that key is the service-role key. Use the publishable or anon key."
      exit 1
    fi
    ;;
esac

# This settings file treats // as a comment. :/$()/ is an empty expansion.
escaped=$(printf '%s' "$SUPABASE_URL" | sed 's#://#:/\$()/#')
dest="$CI_PRIMARY_REPOSITORY_PATH/ios/Config/Config.local.xcconfig"

cat > "$dest" <<EOF
SUPABASE_URL = ${escaped}
SUPABASE_PUBLISHABLE_KEY = ${SUPABASE_PUBLISHABLE_KEY}
EOF

echo "ci_post_clone: wrote the local Supabase config for this build."
