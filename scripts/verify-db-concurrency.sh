#!/usr/bin/env bash
# Run every local-only, genuine PostgreSQL multi-session gate.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/verify-whatsapp-reschedule-concurrency.sh"
bash "$SCRIPT_DIR/verify-capacity-concurrency.sh"

bash "$SCRIPT_DIR/verify-holiday-concurrency.sh"
