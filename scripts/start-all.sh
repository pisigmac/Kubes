#!/usr/bin/env bash
set -euo pipefail

# Kubes: Start All Services Script (Local or Docker mode)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.pids"
LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "${PID_DIR}" "${LOG_DIR}"

if [[ "${1:-}" == "--docker" ]]; then
  echo "🚀 Starting Kubes stack via Docker Compose..."
  docker compose up -d
  echo "✅ Kubes stack started."
  echo "🌐 Web UI: http://localhost:3000"
  echo "🤖 Agent Core: http://localhost:8000"
  exit 0
fi

# Resolve port-alloc CLI helper
PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [[ -x "${HOME}/.local/bin/port-alloc" ]] && echo "${HOME}/.local/bin/port-alloc" ) || true)"

allocate_service_port() {
  local service="$1"
  local preferred="$2"
  if [[ -n "${PORT_ALLOC_BIN}" ]]; then
    "${PORT_ALLOC_BIN}" allocate --service "${service}" --preferred "${preferred}"
  else
    echo "${preferred}"
  fi
}

WEB_PORT=$(allocate_service_port "kubes-web" 3000)
AGENT_CORE_PORT=$(allocate_service_port "kubes-agent-core" 8000)

echo "🚀 Starting Kubes local multi-process stack..."

# 1. Start Python Agent Core
if [[ -f "${PID_DIR}/agent-core.pid" ]] && kill -0 "$(cat "${PID_DIR}/agent-core.pid")" 2>/dev/null; then
  echo "⚠️  Agent Core is already running (PID: $(cat "${PID_DIR}/agent-core.pid"))"
else
  echo "▶ Starting Python Agent Core (port ${AGENT_CORE_PORT})..."
  (cd "${ROOT_DIR}/services/agent-core" && uv run uvicorn main:app --host 127.0.0.1 --port "${AGENT_CORE_PORT}" > "${LOG_DIR}/agent-core.log" 2>&1 & echo $! > "${PID_DIR}/agent-core.pid")
  sleep 1
fi

# 2. Start Next.js Web Server
if [[ -f "${PID_DIR}/web.pid" ]] && kill -0 "$(cat "${PID_DIR}/web.pid")" 2>/dev/null; then
  echo "⚠️  Next.js Web is already running (PID: $(cat "${PID_DIR}/web.pid"))"
else
  echo "▶ Starting Next.js Web App (port ${WEB_PORT})..."
  (cd "${ROOT_DIR}" && PORT="${WEB_PORT}" AGENT_CORE_URL="http://127.0.0.1:${AGENT_CORE_PORT}" pnpm dev -p "${WEB_PORT}" > "${LOG_DIR}/web.log" 2>&1 & echo $! > "${PID_DIR}/web.pid")
  sleep 1
fi

# 3. Start Scheduler Daemon
if [[ -f "${PID_DIR}/scheduler.pid" ]] && kill -0 "$(cat "${PID_DIR}/scheduler.pid")" 2>/dev/null; then
  echo "⚠️  Scheduler Daemon is already running (PID: $(cat "${PID_DIR}/scheduler.pid"))"
else
  echo "▶ Starting Scheduler Daemon..."
  (cd "${ROOT_DIR}" && pnpm run schedules > "${LOG_DIR}/scheduler.log" 2>&1 & echo $! > "${PID_DIR}/scheduler.pid")
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Kubes Stack is active!"
echo "🌐 Web UI:       http://localhost:${WEB_PORT}"
echo "🤖 Agent Core:   http://localhost:${AGENT_CORE_PORT}"
echo "📜 Logs:         ./data/logs/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
