#!/bin/bash
# SessionStart hook — provision the local database-test stack.
#
# WHY THIS EXISTS
#
# The repository's database tests are pgTAP suites run through the Supabase CLI
# against a real PostgreSQL rebuilt from the committed migrations:
#
#   node scripts/prepare-db-test-project.mjs "$DIR"
#   supabase --workdir "$DIR" start
#   supabase --workdir "$DIR" test db
#
# A fresh web container has none of what that needs — no Docker daemon running,
# no Supabase CLI, and therefore no pgTAP (it ships inside the Supabase Postgres
# image, not as a host package). Without this hook an agent cannot run
# supabase/tests/*.test.sql at all and has to fall back to a hosted project,
# which is slower, less reproducible and touches a shared environment.
#
# It also puts Node 24 on PATH. The container default is Node 22, while the
# repository pins 24 (.nvmrc, engines.node ">=24"), so `npm ci` hard-fails
# before doing anything useful.
#
# Safe to re-run: every step checks before acting.
set -euo pipefail

# Local machines already have their own toolchains; only provision the
# ephemeral web container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

log() { echo "[session-start] $*"; }

# ---------------------------------------------------------------------------
# 1. Node 24 — the version CI uses and package.json requires.
# ---------------------------------------------------------------------------
NODE24_BIN="$(ls -d /root/.nvm/versions/node/v24*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$NODE24_BIN" ] && [ -x "$NODE24_BIN/node" ]; then
  export PATH="$NODE24_BIN:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE24_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
  log "node $("$NODE24_BIN/node" -v) on PATH"
else
  log "WARNING: no Node 24 found; npm ci will fail on engines.node"
fi

# ---------------------------------------------------------------------------
# 2. JavaScript dependencies.
# ---------------------------------------------------------------------------
if [ ! -d "$CLAUDE_PROJECT_DIR/node_modules" ]; then
  log "installing npm dependencies"
  (cd "$CLAUDE_PROJECT_DIR" && npm install --no-audit --no-fund)
else
  log "node_modules present, skipping npm install"
fi

# ---------------------------------------------------------------------------
# 3. Docker daemon. Processes do not survive container caching, so this starts
#    on every session even when the image layers are already warm.
# ---------------------------------------------------------------------------
if docker info >/dev/null 2>&1; then
  log "docker already running"
elif command -v dockerd >/dev/null 2>&1; then
  log "starting docker daemon"
  mkdir -p /var/log

  # dockerd must start its OWN containerd. Starting one here instead looks
  # tidier and breaks container startup: a containerd launched from this shell
  # inherits its rlimit context, and runc then fails with "error setting rlimit
  # type 7: operation not permitted" because cap_sys_resource is dropped in this
  # sandbox. Verified both ways — dockerd-managed works, shell-started does not.
  #
  # What DOES need handling is a stale containerd left by an earlier session:
  # dockerd finds the process, cannot use it, and gives up with "timeout waiting
  # for containerd to start". Clear it so dockerd can manage a fresh one.
  #
  # pkill/pgrep use -x (exact process name), never -f: with -f the pattern
  # matches this script's own command line and the hook kills itself.
  if pgrep -x containerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
    log "clearing stale containerd from a previous session"
    pkill -x containerd 2>/dev/null || true
    sleep 3
  fi

  nohup dockerd >/var/log/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then break; fi
    sleep 1
  done

  # One retry: a dockerd that lost the containerd race exits rather than
  # recovering, so a clean second attempt is worth more than a longer wait.
  if ! docker info >/dev/null 2>&1; then
    log "docker did not come up; retrying once"
    pkill -x dockerd 2>/dev/null || true
    sleep 2
    nohup dockerd >/var/log/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      if docker info >/dev/null 2>&1; then break; fi
      sleep 1
    done
  fi
  if docker info >/dev/null 2>&1; then
    log "docker ready ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown))"
  else
    log "WARNING: docker daemon did not become ready; see /var/log/dockerd.log"
  fi
else
  log "WARNING: dockerd not installed; database tests unavailable"
fi

# ---------------------------------------------------------------------------
# 4. Supabase CLI. Installed from npm because the agent proxy blocks
#    api.github.com, so the usual release-tarball route returns 403.
# ---------------------------------------------------------------------------
if command -v supabase >/dev/null 2>&1; then
  log "supabase CLI present ($(supabase --version 2>/dev/null | head -1))"
else
  log "installing supabase CLI from npm"
  SB_PREFIX=/opt/supabase-cli
  mkdir -p "$SB_PREFIX"
  if npm install --no-save --no-audit --no-fund --prefix "$SB_PREFIX" supabase >/dev/null 2>&1 \
     && [ -x "$SB_PREFIX/node_modules/.bin/supabase" ]; then
    ln -sf "$SB_PREFIX/node_modules/.bin/supabase" /usr/local/bin/supabase
    log "supabase CLI installed ($(supabase --version 2>/dev/null | head -1))"
  else
    log "WARNING: supabase CLI install failed; database tests unavailable"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Pre-pull the two images the pgTAP path needs, so the first `supabase start`
#    of a session is not a multi-gigabyte download. Best effort: a failure here
#    costs time later, it does not break the session.
# ---------------------------------------------------------------------------
if docker info >/dev/null 2>&1 && [ -f "$CLAUDE_PROJECT_DIR/supabase/config.toml" ]; then
  # The repository does not pin the image, so this usually finds nothing and
  # falls back to the default. `|| true` matters: grep exits 1 on no match, and
  # under `set -o pipefail` that would abort the hook.
  PG_IMAGE="$(grep -ohrE 'public\.ecr\.aws/supabase/postgres:[0-9.]+' "$CLAUDE_PROJECT_DIR/supabase" 2>/dev/null | head -1 | cut -d: -f2- || true)"
  for image in \
    "public.ecr.aws/supabase/postgres:${PG_IMAGE:-17.6.1.159}" \
    "public.ecr.aws/supabase/pg_prove:3.36"
  do
    if docker image inspect "$image" >/dev/null 2>&1; then
      log "image cached: $image"
    else
      log "pulling $image"
      docker pull --quiet "$image" >/dev/null 2>&1 || log "WARNING: pull failed for $image"
    fi
  done
fi

log "ready — database tests: node scripts/prepare-db-test-project.mjs DIR && supabase --workdir DIR start && supabase --workdir DIR test db"
