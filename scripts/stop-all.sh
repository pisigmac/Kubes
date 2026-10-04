#!/usr/bin/env bash
set -euo pipefail

# Kubes: Stop All Services Script

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.pids"

if [[ "${1:-}" == "--docker" ]]; then
  echo "🛑 Stopping Kubes Docker Compose stack..."
  docker compose down
  echo "✅ Docker stack stopped."
  exit 0
fi

echo "🛑 Stopping all Kubes local services..."

stop_process() {
  local name="$1"
  local pid_file="${PID_DIR}/${name}.pid"

  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" 2>/dev/null; then
      echo "⏹ Stopping ${name} (PID: ${pid})..."
      kill "${pid}" 2>/dev/null || true
      sleep 0.5
      if kill -0 "${pid}" 2>/dev/null; then
        kill -9 "${pid}" 2>/dev/null || true
      fi
    else
      echo "ℹ  ${name} is not running."
    fi
    rm -f "${pid_file}"
  else
    echo "ℹ  No PID file for ${name}."
  fi
}

stop_process "scheduler"
stop_process "web"
stop_process "agent-core"

# Release ports from registry if port-alloc is available
PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [[ -x "${HOME}/.local/bin/port-alloc" ]] && echo "${HOME}/.local/bin/port-alloc" ) || true)"
if [[ -n "${PORT_ALLOC_BIN}" ]]; then
  "${PORT_ALLOC_BIN}" release "kubes-web" >/dev/null 2>&1 || true
  "${PORT_ALLOC_BIN}" release "kubes-agent-core" >/dev/null 2>&1 || true
fi

echo "✅ All Kubes services stopped."
