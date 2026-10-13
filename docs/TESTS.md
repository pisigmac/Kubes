# Kubes Testing Strategy & Verification Guide

## Testing Architecture

Kubes utilizes Node's native ESM test runner (`node --test`) coupled with `--experimental-strip-types` for fast, zero-transpilation test execution.

```
Tests (75 Total Passing Tests across Stack)
├── TypeScript Tests (51 passing, Node 22 ESM --experimental-strip-types)
│   ├── lib/computer/*.test.ts   # Jail, sandbox drivers, browser, cron, search, specialists, digests
│   ├── lib/memory/*.test.ts     # Semantic & keyword memory persistence and scoring
│   ├── lib/auth/*.test.ts       # DeskID token validation, JWKS caching, tenant negative isolation
│   ├── lib/ai/*.test.ts         # Multi-model routing and AI provider gateways
│   └── app/api/*.test.ts        # HTTP route authentication, RBAC gates, and cross-tenant API isolation
├── Port Allocator TS Client (1 passing)
│   └── tools/port-allocator/tests/test_ts_client.test.ts
├── Python LangGraph Agent Core (17 passing, uv run pytest)
│   └── services/agent-core/tests/
├── Port Allocator Python Core (6 passing, uv run pytest)
│   └── tools/port-allocator/tests/
└── End-to-End Headless Browser Playbook (8 UI phases passing)
    └── scripts/test-ui-play.ts (See docs/UI-TESTING.md)
```

---

## Test Execution Commands

```bash
# Run entire TypeScript unit test suite
pnpm test

# Run End-to-End Headless Browser UI Playbook
pnpm run test:ui

# Run specific test file
node --experimental-strip-types app/api/route_auth.test.ts

# Run TypeScript static typecheck
npx tsc --noEmit

# Run ESLint static analysis
pnpm lint

# Run unified full product verification suite (All 6 Quality Gates)
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
