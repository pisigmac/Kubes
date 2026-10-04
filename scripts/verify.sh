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

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All Quality Verification Gates Passed (100% Green)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
