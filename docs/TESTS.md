# Kubes Testing Strategy & Verification Guide

## Testing Architecture

Kubes utilizes Node's native ESM test runner (`node --test`) coupled with `--experimental-strip-types` for fast, zero-transpilation test execution.

```
Test coverage (counts vary as suites change)
├── TypeScript Tests (Node ESM --experimental-strip-types)
│   ├── lib/computer/*.test.ts   # Jail, sandbox drivers, browser, cron, search, specialists, digests
│   ├── lib/memory/*.test.ts     # Semantic & keyword memory persistence and scoring
│   ├── lib/auth/*.test.ts       # DeskID token validation, JWKS caching, tenant negative isolation
│   ├── lib/ai/*.test.ts         # Multi-model routing and AI provider gateways
│   └── app/api/*.test.ts        # HTTP route authentication, RBAC gates, and cross-tenant API isolation
├── Port Allocator TS Client (1 passing)
│   └── tools/port-allocator/tests/test_ts_client.test.ts
├── Python LangGraph Agent Core (uv run pytest)
│   └── services/agent-core/tests/
├── Port Allocator Python Core (uv run pytest)
│   └── tools/port-allocator/tests/
└── End-to-End Headless Browser Playbook (result depends on an available app server and Chrome)
    └── scripts/test-ui-play.ts (See docs/UI-TESTING.md)
```

---

## Test Execution Commands

`make verify` labels browser E2E as **PASS** when it runs successfully. If Chrome or the web server is unavailable, it labels E2E **SKIPPED** and the overall run **INCOMPLETE**, even when the core gates pass. The current verification snapshot is recorded in [END-TO-END-VERIFICATION.md](END-TO-END-VERIFICATION.md).

The 2026-10-21 verification run reported 138 tests passing across the TypeScript and Python runners; typecheck, lint, and the production audit passed. The live-server browser E2E run passed, and a separate simulated no-server run confirmed skip reporting. See [END-TO-END-VERIFICATION.md](END-TO-END-VERIFICATION.md) for the gate-by-gate record.

```bash
# Run entire TypeScript unit test suite
pnpm test

# Run End-to-End Headless Browser UI Playbook
pnpm run test:ui

# Run specific test file
node --experimental-strip-types app/api/route_auth.test.ts

# Run TypeScript static typecheck
pnpm exec tsc --noEmit

# Run ESLint static analysis
pnpm lint

# Run unified full product verification suite
make verify
# or: bash ./scripts/verify.sh
```

---

## Key Test Scenarios Covered

1. **Cryptographic Authentication**:
   - RS256 / ES256 / EdDSA signature validation.
   - Rejection of expired, malformed, or missing tokens (HTTP 401).
   - Invalidation of tampered claims.
2. **RBAC Mutation Gating**:
   - `viewer` role rejected from mutating cubes, schedules, and memories (HTTP 403).
   - `editor` and `admin` roles authorized to create and modify resources.
3. **Cross-Tenant Negative Isolation**:
   - Org Beta cannot access Org Alpha's cubes, threads, schedules, or memories (HTTP 404 / 0 records returned).
4. **Filesystem & Jail Sandboxing**:
   - Cube restricted to its own workspace directory.
   - Symlinks attempting to escape workspace boundary are rejected.
5. **Headless Browser Isolation**:
   - Separate Chromium processes per organization preventing cookie and session bleeding.
