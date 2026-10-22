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

  local pid=""
  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
  fi

  local is_running=0
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    is_running=1
    printf "🟢 RUNNING (PID %s) " "${pid}"
  elif [[ "$name" == "scheduler" ]]; then
    local sched_pid
    sched_pid="$(pgrep -f "scripts/scheduler.ts" 2>/dev/null | grep -v "$$" | head -n 1 || true)"
    if [[ -n "${sched_pid}" ]]; then
      is_running=1
      printf "🟢 RUNNING (PID %s) " "${sched_pid}"
      echo "${sched_pid}" > "${pid_file}" 2>/dev/null || true
    elif [[ -n "${pid}" ]]; then
      printf "🔴 DEAD (stale PID) "
    else
      printf "⚪ STOPPED "
    fi
  elif [[ "$name" == "deskid" || "$name" == "keymint" || "$name" == "kubemind" || "$name" == "kuberoute" ]]; then
    if [[ -n "${endpoint}" ]] && curl -s -f -m 2 "${endpoint}" >/dev/null 2>&1; then
      is_running=1
      printf "🟢 RUNNING (active) "
    else
      printf "⚪ STOPPED "
    fi
  elif [[ -n "${pid}" ]]; then
    printf "🔴 DEAD (stale PID) "
  else
    printf "⚪ STOPPED "
  fi

  if [[ -n "${port}" ]]; then
    if nc -z 127.0.0.1 "${port}" 2>/dev/null || lsof -i ":${port}" >/dev/null 2>&1; then
      if [[ ${is_running} -eq 1 ]]; then
        printf "[Port %s listening] " "${port}"
      else
        printf "[Port %s in use by external process] " "${port}"
      fi
    else
      printf "[Port %s offline] " "${port}"
    fi
  fi

  if [[ -n "${endpoint}" ]] && [[ ${is_running} -eq 1 ]]; then
    if curl -s -f -m 2 "${endpoint}" >/dev/null 2>&1; then
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
  local short_name="${service#kubes-}"
  if [[ -f "${PID_DIR}/${short_name}.port" ]]; then
    local p
    p="$(cat "${PID_DIR}/${short_name}.port" 2>/dev/null || true)"
    if [[ -n "${p}" ]]; then
      echo "${p}"
      return
    fi
  fi
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

WEB_PORT=$(get_service_port "kubes-web" "23000")
AGENT_PORT=$(get_service_port "kubes-agent-core" "28000")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Kubes Stack & Companion Services Dashboard"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_service "web" "${WEB_PORT}" "http://localhost:${WEB_PORT}/api/models"
check_service "agent-core" "${AGENT_PORT}" "http://localhost:${AGENT_PORT}/health"
check_service "scheduler" "" ""

echo "─── Companion Ecosystem Services ───────────────────"
check_service "deskid" "8090" "http://localhost:8090/.well-known/jwks.json"
check_service "keymint" "8080" "http://localhost:8080/v1/models"
check_service "kubemind" "9090" "http://localhost:9090/health"
check_service "kuberoute" "9080" "http://localhost:9080/health"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -x "${HOME}/.local/bin/port-status" ]] || command -v port-status >/dev/null 2>&1; then
  echo ""
  "${HOME}/.local/bin/port-status"
fi
