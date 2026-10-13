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
npx tsc --noEmit

echo "5. Running ESLint Quality Checks..."
pnpm run lint

echo "6. Running Production Security Audit..."
pnpm audit --prod

echo "7. Running Automated E2E Browser Testing Suite..."
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
    for P in 3000 3001 3002 3003 3004; do
      if curl -s -f "http://127.0.0.1:${P}/api/models" >/dev/null 2>&1; then
        ACTIVE_WEB_PORT="${P}"
        break
      fi
    done
  fi

  if [ -n "${ACTIVE_WEB_PORT}" ]; then
    echo "✓ Web server detected on dynamic port ${ACTIVE_WEB_PORT}. Executing Puppeteer E2E tests..."
    PORT="${ACTIVE_WEB_PORT}" pnpm run test:ui
  else
    echo "ℹ Web server is not running on an active port. Skipping live browser interaction pass (run 'make start' then 'make test-e2e')."
  fi
else
  echo "ℹ Chrome binary not detected on host. Skipping browser UI interaction pass."
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All Quality Verification Gates Passed (100% Green)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
