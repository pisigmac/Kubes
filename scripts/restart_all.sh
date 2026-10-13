#!/usr/bin/env bash
set -euo pipefail

# Kubes: Restart All Services Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔄 Restarting Kubes stack..."
"${SCRIPT_DIR}/stop_all.sh" "$@" || true
sleep 1
"${SCRIPT_DIR}/start_all.sh" "$@"
