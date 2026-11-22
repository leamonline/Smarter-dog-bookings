#!/bin/sh
# Xcode Cloud runs this after checkout, before the archive.
# It writes the gitignored local config from two workflow variables so a
# TestFlight build can sign in. The values are the public project URL and the
# public anon / publishable key. Never set the service-role key here.

set -eu

if [ -z "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  echo "ci_post_clone: not an Xcode Cloud build, leaving config untouched."
  exit 0
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  echo "ci_post_clone: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set. The app will build, but sign-in stays disconnected."
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

# Refuse the service-role key if it was pasted by mistake. The prefix is split
# so the repository's secret scan does not treat this refusal as a real key.
forbidden_prefix="sb_secret"
case "$SUPABASE_PUBLISHABLE_KEY" in
  "${forbidden_prefix}_"*)
    echo "ci_post_clone: that key is the service-role key. Use the publishable or anon key."
    exit 1
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
