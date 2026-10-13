#!/usr/bin/env bash
set -euo pipefail

# Kubes: Environment & Diagnostics Checker (Doctor)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🩺 Kubes Environment Diagnostic & Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ERRORS=0
WARNINGS=0

check_cmd() {
  local name="$1"
  local cmd="$2"
  local required="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    local ver
    ver="$("$cmd" --version 2>&1 | head -n 1 || echo "installed")"
    echo "  🟢 [OK] ${name}: ${ver}"
  else
    if [[ "$required" == "true" ]]; then
      echo "  🔴 [ERROR] ${name} ('${cmd}') is required but not found in PATH."
      ERRORS=$((ERRORS + 1))
    else
      echo "  🟡 [WARN] ${name} ('${cmd}') is optional / fallback only."
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
}

echo "1. Runtime Engines & Package Managers:"
check_cmd "Node.js" "node" "true"
check_cmd "pnpm" "pnpm" "true"
check_cmd "Python 3" "python3" "true"
check_cmd "uv (Python Package Manager)" "uv" "true"

echo ""
echo "2. Isolation & System Toolchains:"
check_cmd "Bubblewrap (bwrap sandbox)" "bwrap" "false"
check_cmd "Google Chrome / Chromium" "google-chrome" "false"
check_cmd "SQLite CLI" "sqlite3" "false"
check_cmd "curl" "curl" "true"
check_cmd "lsof" "lsof" "true"

echo ""
echo "3. Directory & Data Structure Permissions:"
check_dir() {
  local dir="$1"
  local path="${ROOT_DIR}/${dir}"
  if [[ -d "${path}" ]] && [[ -w "${path}" ]]; then
    echo "  🟢 [OK] Directory '${dir}' exists and is writable."
  else
    mkdir -p "${path}" 2>/dev/null || true
    if [[ -d "${path}" ]] && [[ -w "${path}" ]]; then
      echo "  🟢 [OK] Directory '${dir}' created and writable."
    else
      echo "  🔴 [ERROR] Directory '${dir}' is not writable."
      ERRORS=$((ERRORS + 1))
    fi
  fi
}

check_dir "data"
check_dir "data/logs"
check_dir "data/digests"
check_dir "data/computer"
check_dir ".pids"

echo ""
echo "4. SQLite Database Health:"
DB_PATH="${ROOT_DIR}/data/cubes.db"
if [[ -f "${DB_PATH}" ]]; then
  echo "  🟢 [OK] SQLite database found at data/cubes.db"
else
  echo "  ℹ  SQLite database will be automatically created on first boot."
fi

echo ""
echo "5. Global Port Registry & Tooling:"
PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [[ -x "${HOME}/.local/bin/port-alloc" ]] && echo "${HOME}/.local/bin/port-alloc" ) || true)"
if [[ -n "${PORT_ALLOC_BIN}" ]]; then
  echo "  🟢 [OK] port-alloc CLI active: ${PORT_ALLOC_BIN}"
else
  echo "  🟡 [WARN] port-alloc CLI not in PATH; falling back to static default ports."
  WARNINGS=$((WARNINGS + 1))
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ ${ERRORS} -eq 0 ]]; then
  echo "✅ Diagnostic Passed with ${WARNINGS} warning(s). Environment is ready!"
else
  echo "❌ Diagnostic Failed with ${ERRORS} error(s) and ${WARNINGS} warning(s)."
  exit 1
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
