# Changelog

All notable changes to the Kubes Autonomous AI Platform are documented in this file.

## [1.6.0] - 2026-10-13

### Added
- **Interactive Visual Mermaid Studio (`components/studios/mermaid-studio.tsx`, `lib/computer/diagram.ts`)**: Built pan-and-zoom diagram canvas with mouse dragging, wheel zoom, zoom level indicator, layout orientation toggle (Top-to-Down `TD` vs Left-to-Right `LR`), high-DPI PNG export with dark background, and 1-click SVG export; added pure utility functions `cleanMermaidSource`, `isMermaidDiagram`, and `toggleDiagramOrientation` with unit test suite (`lib/computer/diagram.test.ts`).
- **Interactive CSV Grid Studio & Financial Distribution Charts (`components/studios/csv-grid-studio.tsx`, `lib/computer/csv_grid.ts`)**: RFC-4180 compliant CSV parser with quote escaping; sortable table view with multi-column sorting indicators (`▲`/`▼`), real-time type-ahead search filter, and column totals footer (`Σ Sum`, `Avg`); dynamic native SVG bar distribution chart with category and value series selectors; 1-click CSV export; comprehensive unit tests (`lib/computer/csv_grid.test.ts`).
- **Live Sandboxed Iframe Code Preview Runner (`components/studios/preview-sandbox.tsx`, `lib/computer/sandbox_preview.ts`)**: Secure HTML/component preview runner isolated inside strict `sandbox="allow-scripts"` iframe with zero host DOM access; embedded postMessage logging harness intercepting `console.log`, `info`, `warn`, `error`, and unhandled promise rejections; expandable Console Inspector drawer with colored tags, timestamps, message counts, and error badges; multi-device viewport mode selector (100% Responsive, Desktop 1024px, Tablet 768px, Mobile 375px); unit tests (`lib/computer/sandbox_preview.test.ts`).
- **Unified Artifact Canvas Routing (`components/artifact-canvas.tsx`)**: Replaced static previews with automatic routing to specialized studios based on file extension and content heuristics (`.mmd` -> Mermaid Studio, `.csv` -> CSV Studio, `.html` -> Preview Sandbox, `.md` -> Markdown View, code -> CodeBlock) with contextual header badges.

---

## [1.5.0] - 2026-10-13

### Added
- **AI Provider Resilience & Exponential Backoff (`lib/ai/provider.ts`)**: Built `createResilientFetch` with randomized exponential backoff and jitter for transient `429`, `503`, `502`, and `529` provider responses; added RFC 7231 `Retry-After` header parsing; implemented provider rate limit formatting for specialist swarm tasks; enhanced `CubeChat` UI error banner with direct **"🔑 Switch Provider"** action button.
- **Swarm & Process Teardown Resilience (`lib/computer/sandbox.ts`, `lib/computer/jail.ts`, `lib/computer/browser.ts`)**: Active abort propagation across `SandboxExecutionOptions`, `BwrapDriver`, and `DirectFallbackDriver` with `AbortSignal.any()` combining execution timeouts and user cancellations (`SIGTERM` -> `SIGKILL`); automated seat deadlock prevention with `forceReleaseSeat()` and clean waiter unlinking; immediate active Chromium tab closure upon request abort.
- **First-Time Guided Onboarding & Composite Starter Pills (`components/transcript.tsx`, `components/cube-chat.tsx`)**: Empty state guided onboarding card when workspaces lack provider keys, explaining free Gemini/Groq options with one-click CTA; composite workflow starter pills for Maestro (Berlin Relocation Plan, Tech Stack Decision, Monthly Financial Audit) and domain-tailored prompts for specialists.
- **Operational & Container Deployment Hardening (`lib/db.ts`, `docker-compose.yml`, `scripts/start-all.sh`)**: Automated SQLite WAL checkpointing (`wal_autocheckpoint = 1000`, exported `checkpointWal()`, and periodic unreferenced WAL truncation timer); dynamic non-colliding host port mapping in `docker-compose.yml` (`KUBES_WEB_PORT`, `KUBES_AGENT_CORE_PORT`) and `scripts/start-all.sh --docker` via `port-alloc`.
- **Turbopack Build & Next.js 16 Framework Optimization (`lib/computer/sandbox.ts`, `proxy.ts`)**: Added `/*turbopackIgnore: true*/` annotations inside `getBwrapBaseArgs()` to eliminate filesystem root tracing warnings; migrated from deprecated `middleware.ts` to Next.js 16 `proxy.ts`.

---

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
