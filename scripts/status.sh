#!/usr/bin/env bash
set -euo pipefail

# Kubes: Service Status Dashboard

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.pids"

check_service() {
  local name="$1"
  local pid_file="${PID_DIR}/${name}.pid"
  local port="${2:-}"
  local endpoint="${3:-}"

  printf "%-18s " "$name:"

  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" 2>/dev/null; then
      printf "🟢 RUNNING (PID %s) " "${pid}"
    else
      printf "🔴 DEAD (stale PID) "
    fi
  else
    printf "⚪ STOPPED "
  fi

  if [[ -n "${port}" ]]; then
    if nc -z 127.0.0.1 "${port}" 2>/dev/null || ss -tulpn 2>/dev/null | grep -q ":${port} " || lsof -i ":${port}" >/dev/null 2>&1; then
      printf "[Port %s listening] " "${port}"
    else
      printf "[Port %s offline] " "${port}"
    fi
  fi

  if [[ -n "${endpoint}" ]]; then
    if curl -s -m 2 "${endpoint}" >/dev/null 2>&1; then
      printf "✓ Health 200 OK"
    fi
  fi

  echo ""
}

# Resolve port-alloc CLI helper
PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [[ -x "${HOME}/.local/bin/port-alloc" ]] && echo "${HOME}/.local/bin/port-alloc" ) || true)"

get_service_port() {
  local service="$1"
  local fallback="$2"
  if [[ -n "${PORT_ALLOC_BIN}" ]]; then
    local p
    p=$("${PORT_ALLOC_BIN}" get "${service}" --field port 2>/dev/null || true)
    if [[ -n "${p}" ]]; then
      echo "${p}"
      return
    fi
  fi
  echo "${fallback}"
}

WEB_PORT=$(get_service_port "kubes-web" "3000")
AGENT_PORT=$(get_service_port "kubes-agent-core" "8000")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Kubes Stack Status Dashboard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_service "web" "${WEB_PORT}" "http://localhost:${WEB_PORT}/api/models"
check_service "agent-core" "${AGENT_PORT}" "http://localhost:${AGENT_PORT}/health"
check_service "scheduler" "" ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -x "${HOME}/.local/bin/port-status" ]] || command -v port-status >/dev/null 2>&1; then
  echo ""
  "${HOME}/.local/bin/port-status"
fi
