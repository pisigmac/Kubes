# Changelog

All notable changes to the Kubes Autonomous AI Platform are documented in this file.

## [1.2.0] - 2026-10-06

### Added
- **Multi-Tenant Chromium Process Pool**: Partitioned headless browser instances per organization in `lib/computer/browser.ts`, preventing session cross-contamination.
- **Enterprise RBAC Gating**: Added `assertRole` checks across all sensitive mutation routes (Cubes, Schedules, Memories, Digests, Providers).
- **Standard Operational Scripts**: Added `scripts/restart_all.sh`, `scripts/logs.sh`, `scripts/doctor.sh`, `scripts/seed_data.sh`, and root `Makefile`.
- **Structured Documentation Suite**: Added comprehensive `docs/` specifications and `docs/ops/` operational runbooks.

### Fixed
- **Fail-Closed Store APIs**: Removed unscoped fallback queries in `getCube`, `getThread`, `listThreads`, and `getMessages`.
- **Global Port Registry**: Fixed dynamic auto-registration of companion services in `status.sh`.
- **Node Test Runner Path Resolution**: Resolved ESM path alias resolution by standardizing on relative import references.

---

## [1.1.0] - 2026-10-04

### Added
- **Autonomous Digest Engine**: Added structured summary generation, markdown daily file logs, and webhook notification triggers.
- **Multi-Provider AI Gateway**: Integrated OpenRouter, Anthropic, OpenAI, and Ollama with dynamic latency testing.
- **Specialist Domain Tools**: Added CSV ledger parsing (Money), career tracking (Job Hunt), and Mermaid chart generation (Learn/Work).

---

## [1.0.0] - 2026-09-30

### Initial Release
- **Specialist Cubes Architecture**: Multi-cube orchestration powered by autonomous Maestro coordinator.
- **Computer Jail & Bwrap Sandboxing**: Secure execution environment for agent commands and bash scripting.
- **SQLite Persistence**: Thread and message storage in WAL mode.
