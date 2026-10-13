# Changelog

All notable changes to the Kubes Autonomous AI Platform are documented in this file.

## [1.4.0] - 2026-10-13

### Added
- **Multi-Agent Swarm Collaboration Protocol (`lib/cubes/swarm.ts`)**: Structured schemas (`SwarmTask`, `SwarmPlan`), cycle detection DFS (`hasDependencyCycle`), topological stage batching (`getExecutionBatches`), and cascading failure isolation (`updateTaskStatus`).
- **Parallel Swarm Execution Engine & Next.js SSE Route (`lib/cubes/swarm_runner.ts`, `app/api/swarm/route.ts`)**: Concurrent batch execution via `Promise.allSettled`, context forwarding from upstream outputs, objective decomposition (`decomposeObjectiveToPlan`), and real-time SSE event streaming.
- **Live Visual Swarm DAG UI & Chat Integration (`components/swarm-dag.tsx`, `components/cube-chat.tsx`)**: Topological stage visualization, node status badges (running, completed, failed, skipped), duration metrics, modal task inspection (`role="dialog"`), and dedicated `⚡ Swarm` mode chat toggle.
- **Maestro Executive Synthesis Node (`lib/cubes/synthesizer.ts`)**: Multi-domain output collation, artifact parsing with categorization (diagrams, csv ledgers, code, markdown), action item checklists, and offline fallback briefings.

---

## [1.3.0] - 2026-10-12

### Added
- **Out-of-Band Egress Credential Proxying**: Redaction of API tokens from sandbox environments and outbound dynamic injection in `lib/computer/egress_proxy.ts` (NVIDIA OpenShell pattern).
- **Declarative Per-Cube Tool & Network Policies**: Declarative capability manifests in `config/cubes.json` with strict `--unshare-net` Bubblewrap namespace enforcement (`lib/cubes/policy.ts`).
- **Interactive Action Approvals & Safe Mode**: Human-in-the-loop interactive confirmation cards for destructive actions (`lib/computer/safety.ts`, `components/transcript.tsx`).
- **WebAssembly Shell Isolate Fallback**: In-memory POSIX isolate (`WasmShellDriver` in `lib/computer/wasi_shell.ts`) ensuring zero-ambient-authority execution without requiring root or kernel namespaces.
- **Hybrid Semantic Memory**: Reciprocal Rank Fusion (RRF) integrating companion `kubemind` (port 9090) with SQLite lexical keyword search (`lib/memory/kubemind.ts`).
- **Accessibility & Dialog Focus Trapping**: WAI-ARIA modal attributes, focus trapping, and Escape key dismissal across all dialogs (`ProviderModal`, `CubeEditor`, `ArtifactCanvas`).
- **Automated E2E Testing Harness**: Headless Chrome Puppeteer verification integrated into `scripts/verify.sh` and root `Makefile` (`make test-e2e`).

### Changed
- **Unified Branding to Kubes**: Harmonized platform naming, navigation, and error strings completely to **Kubes**.

---

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
