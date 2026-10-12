# Kubes: The Autonomous Specialist AI Platform

Kubes is an enterprise platform that coordinates autonomous AI specialists ("Cubes") for domain-specific work (finance, market research, engineering, career tracking) orchestrated by a central AI coordinator ("Maestro").

---

## Highlights

- 🤖 **Autonomous Multi-Cube Specialist Architecture**: Specialized pods with custom pain points and instructions.
- 🔒 **Enterprise Multi-Tenant DeskID Security**: Cryptographic JWKS RS256/ES256 verification and fail-closed RBAC gating.
- ⚡ **Process-Isolated Headless Chromium**: Dedicated browser instances per organization with request interception.
- ⏰ **Autonomous Cron Scheduler & Executive Digest**: Continuous background tasks with multi-channel digest broadcasts (webhooks, email, desktop, markdown).
- 🛡 **Bubblewrap Linux Namespace Sandboxing**: Unprivileged containerized bash and tool execution.

---

## Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Verify environment
make doctor

# 3. Seed demo tenants
make seed

# 4. Start all services
make start

# 5. Open Web UI
open http://localhost:3000
```
