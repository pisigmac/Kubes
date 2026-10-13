#!/usr/bin/env bash
set -euo pipefail

# Kubes: Centralized Log Streamer / Viewer

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "${LOG_DIR}"

FOLLOW=""
LINES="50"
SERVICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--follow)
      FOLLOW="-f"
      shift
      ;;
    -n|--lines|--tail)
      LINES="$2"
      shift 2
      ;;
    web|agent-core|scheduler|deskid|keymint|kubemind)
      SERVICE="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "${SERVICE}" ]]; then
  LOG_FILE="${LOG_DIR}/${SERVICE}.log"
  if [[ ! -f "${LOG_FILE}" ]]; then
    touch "${LOG_FILE}"
  fi
  echo "📜 Viewing logs for ${SERVICE} (${LOG_FILE})..."
  if [[ -n "${FOLLOW}" ]]; then
    tail -n "${LINES}" -f "${LOG_FILE}"
  else
    tail -n "${LINES}" "${LOG_FILE}"
  fi
else
  echo "📜 Viewing aggregated Kubes logs..."
  LOG_FILES=()
  for f in "${LOG_DIR}"/*.log; do
    if [[ -f "$f" ]]; then
      LOG_FILES+=("$f")
    fi
  done

  if [[ ${#LOG_FILES[@]} -eq 0 ]]; then
    echo "ℹ  No log files found in ${LOG_DIR}."
    exit 0
  fi

  if [[ -n "${FOLLOW}" ]]; then
    tail -n "${LINES}" -f "${LOG_FILES[@]}"
  else
    tail -n "${LINES}" "${LOG_FILES[@]}"
  fi
fi
