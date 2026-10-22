#!/usr/bin/env bash
set -euo pipefail

# Kubes: Unified Quality Gate & Test Verification Script

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Running Unified Kubes Quality Assurance Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "1. Running TypeScript Unit & Integration Tests..."
pnpm test
node --experimental-strip-types --test tools/port-allocator/tests/test_ts_client.test.ts

echo "2. Running Python LangGraph Agent Core Tests..."
(cd "${ROOT_DIR}/services/agent-core" && uv run pytest)

echo "3. Running Port Allocator Python Tests..."
(cd "${ROOT_DIR}/tools/port-allocator" && uv run --with pytest pytest tests/)

echo "4. Running TypeScript Static Typecheck..."
pnpm exec tsc --noEmit

echo "5. Running ESLint Quality Checks..."
pnpm run lint

echo "6. Running Production Security Audit..."
pnpm audit --prod

echo "7. Running Automated E2E Browser Testing Suite..."
E2E_STATUS="SKIPPED"
E2E_SKIP_REASON=""
CHROME_BIN="$(which google-chrome 2>/dev/null || which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo "")"
if [ -n "${CHROME_BIN}" ]; then
  echo "✓ Found Chrome binary at ${CHROME_BIN}"
  # Dynamically resolve active web port using PID file, port-alloc registry, or dynamic scanning
  ACTIVE_WEB_PORT=""
  if [ -f "${ROOT_DIR}/.pids/web.port" ]; then
    CANDIDATE_PORT="$(cat "${ROOT_DIR}/.pids/web.port" 2>/dev/null || true)"
    if [ -n "${CANDIDATE_PORT}" ] && curl -s -f "http://127.0.0.1:${CANDIDATE_PORT}/api/models" >/dev/null 2>&1; then
      ACTIVE_WEB_PORT="${CANDIDATE_PORT}"
    fi
  fi

  if [ -z "${ACTIVE_WEB_PORT}" ]; then
    PORT_ALLOC_BIN="$(command -v port-alloc 2>/dev/null || ( [ -x "${HOME}/.local/bin/port-alloc" ] && echo "${HOME}/.local/bin/port-alloc" ) || true)"
    if [ -n "${PORT_ALLOC_BIN}" ]; then
      REG_PORT="$("${PORT_ALLOC_BIN}" get "kubes-web" --field port 2>/dev/null || true)"
      if [ -n "${REG_PORT}" ] && curl -s -f "http://127.0.0.1:${REG_PORT}/api/models" >/dev/null 2>&1; then
        ACTIVE_WEB_PORT="${REG_PORT}"
      fi
    fi
  fi

  if [ -z "${ACTIVE_WEB_PORT}" ]; then
    for P in {23000..23100}; do
      if curl -s -f "http://127.0.0.1:${P}/api/models" >/dev/null 2>&1; then
        ACTIVE_WEB_PORT="${P}"
        break
      fi
    done
  fi

  if [ -n "${ACTIVE_WEB_PORT}" ]; then
    echo "✓ Web server detected on dynamic port ${ACTIVE_WEB_PORT}. Executing Puppeteer E2E tests..."
    PORT="${ACTIVE_WEB_PORT}" pnpm run test:ui
    E2E_STATUS="PASS"
  else
    E2E_SKIP_REASON="web server is not running"
  fi
else
  E2E_SKIP_REASON="Chrome/Chromium is not installed"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "${E2E_STATUS}" = "PASS" ]; then
  echo "✅ All verification gates passed, including browser E2E."
else
  echo "✅ Core verification gates passed."
  echo "⚠️ Browser E2E: SKIPPED (${E2E_SKIP_REASON}). Run 'make start' and then 'make test-e2e' to verify it."
  echo "ℹ Overall status: INCOMPLETE (browser E2E was not run)."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
