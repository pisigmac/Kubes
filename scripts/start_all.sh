#!/usr/bin/env bash
set -euo pipefail

# Kubes: Start All Services Script (Local or Docker mode)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.pids"
LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "${PID_DIR}" "${LOG_DIR}"

# Resolve port-alloc CLI helper
PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [[ -x "${HOME}/.local/bin/port-alloc" ]] && echo "${HOME}/.local/bin/port-alloc" ) || true)"

allocate_service_port() {
  local service="$1"
  local preferred="$2"
  if [[ -z "${PORT_ALLOC_BIN}" ]]; then
    echo "❌ port-alloc is required to start Kubes without a fixed-port fallback." >&2
    return 1
  fi
  local last_port=$((preferred + 100))
  local allocated
  allocated="$("${PORT_ALLOC_BIN}" allocate --service "${service}" --preferred "${preferred}" --range "${preferred}-${last_port}")"
  if ! [[ "${allocated}" =~ ^[0-9]+$ ]] || (( allocated < preferred || allocated > last_port )); then
    echo "❌ port-alloc has an existing lease for ${service} outside ${preferred}-${last_port}; stop the old Kubes instance and release its lease." >&2
    return 1
  fi
  printf '%s\n' "${allocated}"
}

if [[ "${1:-}" == "--docker" ]]; then
  echo "🚀 Starting Kubes stack via Docker Compose..."
  DOCKER_WEB_PORT=$(allocate_service_port "kubes-web" 23000)
  DOCKER_AGENT_PORT=$(allocate_service_port "kubes-agent-core" 28000)
  COMPOSE_ENV_ARGS=()
  if [[ -f "${ROOT_DIR}/.env.provider-credentials" ]]; then
    COMPOSE_ENV_ARGS+=(--env-file "${ROOT_DIR}/.env.provider-credentials")
  fi
  KUBES_WEB_PORT="${DOCKER_WEB_PORT}" KUBES_AGENT_CORE_PORT="${DOCKER_AGENT_PORT}" \
    docker compose "${COMPOSE_ENV_ARGS[@]}" up -d --build
  if [[ -n "${PORT_ALLOC_BIN}" ]]; then
    WEB_CONTAINER_PID="$(docker inspect --format '{{.State.Pid}}' kubes-web 2>/dev/null || true)"
    AGENT_CONTAINER_PID="$(docker inspect --format '{{.State.Pid}}' kubes-agent-core 2>/dev/null || true)"
    if [[ "${WEB_CONTAINER_PID}" =~ ^[1-9][0-9]*$ ]]; then
      "${PORT_ALLOC_BIN}" register --service kubes-web --port "${DOCKER_WEB_PORT}" \
        --pid "${WEB_CONTAINER_PID}" --url "http://127.0.0.1:${DOCKER_WEB_PORT}" >/dev/null
    fi
    if [[ "${AGENT_CONTAINER_PID}" =~ ^[1-9][0-9]*$ ]]; then
      "${PORT_ALLOC_BIN}" register --service kubes-agent-core --port "${DOCKER_AGENT_PORT}" \
        --pid "${AGENT_CONTAINER_PID}" --url "http://127.0.0.1:${DOCKER_AGENT_PORT}" >/dev/null
    fi
  fi
  echo "✅ Kubes stack started."
  echo "🌐 Web UI: http://localhost:${DOCKER_WEB_PORT}"
  echo "🤖 Agent Core: http://localhost:${DOCKER_AGENT_PORT}"
  exit 0
fi

WEB_PORT=$(allocate_service_port "kubes-web" 23000)
AGENT_CORE_PORT=$(allocate_service_port "kubes-agent-core" 28000)

echo "🚀 Starting Kubes local multi-process stack..."

# 1. Start Python Agent Core
if [[ -f "${PID_DIR}/agent-core.pid" ]] && kill -0 "$(cat "${PID_DIR}/agent-core.pid")" 2>/dev/null; then
  echo "⚠️  Agent Core is already running (PID: $(cat "${PID_DIR}/agent-core.pid"))"
else
  echo "▶ Starting Python Agent Core (port ${AGENT_CORE_PORT})..."
  echo "${AGENT_CORE_PORT}" > "${PID_DIR}/agent-core.port"
  (cd "${ROOT_DIR}/services/agent-core" && exec uv run uvicorn main:app --host 127.0.0.1 --port "${AGENT_CORE_PORT}") > "${LOG_DIR}/agent-core.log" 2>&1 &
  echo $! > "${PID_DIR}/agent-core.pid"
  sleep 1.5
  if [[ -n "${PORT_ALLOC_BIN}" ]] && [[ -f "${PID_DIR}/agent-core.pid" ]]; then
    "${PORT_ALLOC_BIN}" register --service "kubes-agent-core" --port "${AGENT_CORE_PORT}" \
      --pid "$(cat "${PID_DIR}/agent-core.pid")" >/dev/null
  fi
fi

# 2. Start Next.js Web Server
if [[ -f "${PID_DIR}/web.pid" ]] && kill -0 "$(cat "${PID_DIR}/web.pid")" 2>/dev/null; then
  echo "⚠️  Next.js Web is already running (PID: $(cat "${PID_DIR}/web.pid"))"
else
  echo "▶ Starting Next.js Web App (port ${WEB_PORT})..."
  echo "${WEB_PORT}" > "${PID_DIR}/web.port"
  PORT="${WEB_PORT}" AGENT_CORE_URL="http://127.0.0.1:${AGENT_CORE_PORT}" pnpm dev -H 127.0.0.1 -p "${WEB_PORT}" > "${LOG_DIR}/web.log" 2>&1 &
  echo $! > "${PID_DIR}/web.pid"
  sleep 1.5
  if [[ -n "${PORT_ALLOC_BIN}" ]] && [[ -f "${PID_DIR}/web.pid" ]]; then
    "${PORT_ALLOC_BIN}" register --service "kubes-web" --port "${WEB_PORT}" \
      --pid "$(cat "${PID_DIR}/web.pid")" >/dev/null
  fi
fi

# 3. Start Scheduler Daemon
if [[ -f "${PID_DIR}/scheduler.pid" ]] && kill -0 "$(cat "${PID_DIR}/scheduler.pid")" 2>/dev/null; then
  echo "⚠️  Scheduler Daemon is already running (PID: $(cat "${PID_DIR}/scheduler.pid"))"
else
  echo "▶ Starting Scheduler Daemon..."
  node --experimental-strip-types "${ROOT_DIR}/scripts/scheduler.ts" > "${LOG_DIR}/scheduler.log" 2>&1 &
  echo $! > "${PID_DIR}/scheduler.pid"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Kubes Stack is active!"
echo "🌐 Web UI:       http://localhost:${WEB_PORT}"
echo "🤖 Agent Core:   http://localhost:${AGENT_CORE_PORT}"
echo "📜 Logs:         ./data/logs/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
