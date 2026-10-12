# Operational Runbook: Staging Parity & Verification Workflows

## Staging Environment Architecture

Staging mirrors production with isolated database and companion services:

- **Database**: Ephemeral SQLite instance (`data/staging-cubes.db`) or staging branch.
- **Port Allocation**: Dynamic allocation via `port-alloc allocate --service kubes-staging-web`.
- **Identity Mock**: Local DeskID JWKS cluster running on port 8090 with predefined test public keys.

---

## Verification Pipeline

```bash
# 1. Run environment diagnostics
make doctor

# 2. Populate test data
make seed

# 3. Run full automated test suite
make test

# 4. Perform linting & type checks
make lint
npx tsc --noEmit

# 5. Run end-to-end UI Playwright simulation
pnpm run test:ui
```
