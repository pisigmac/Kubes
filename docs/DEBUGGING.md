# Kubes Debugging & Incident Resolution Log

## [DEBUG-001] Global Port Registry Empty Active Services on Status Check

- **Incident ID & Title**: `[DEBUG-001] Global Port Registry Empty Active Services`
- **Symptoms & Error Messages**: `./scripts/status.sh` reported 5 active processes (3000, 8000, 8080, 8090, 9090) but the Global Port Registry dashboard displayed `(No active services registered)`.
- **Root Cause**: `port-alloc` CLI was invoked in start scripts without passing the active PID (`--pid`), causing the port registry to not correlate the listening port with the live process. In addition, existing running companion services had started without prior registration.
- **Diagnostic Steps**:
  1. Inspected `~/.local/share/port-registry/ports.json` to verify JSON contents.
  2. Tested `port-alloc allocate` command syntax against running PIDs using `lsof -iTCP -sTCP:LISTEN -P -n`.
  3. Checked `scripts/status.sh` registration loop.
- **Resolution & Fix**:
  1. Updated `scripts/status.sh` to auto-discover running localhost companion processes (`keymint`, `deskid`, `kubemind`, `kubes-web`, `kubes-agent-core`) and dynamically register them into `~/.local/share/port-registry/ports.json`.
  2. Updated `scripts/start-all.sh` to pass `--pid "$(cat "${PID_DIR}/<service>.pid")"` upon launch.
- **Verification**: Ran `./scripts/status.sh` and confirmed all 5 services registered with active status and URLs.

---

## [DEBUG-002] ESM Route Module Resolution in Node Test Runner

- **Incident ID & Title**: `[DEBUG-002] Node Native Test Runner Route Alias Import Resolution Failure`
- **Symptoms & Error Messages**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '@/lib/...' imported from app/api/...` when running `node --experimental-strip-types app/api/route_auth.test.ts`.
- **Root Cause**: Next.js uses Webpack/Turbopack `@/` path alias resolution at build time, but Node's native ESM loader under `--experimental-strip-types` does not resolve Next.js path aliases without extra module loaders.
- **Diagnostic Steps**:
  1. Analyzed Node 22 ESM module resolution tree.
  2. Confirmed relative imports (`../../../lib/...` or `../../../../lib/...`) resolve natively in both Node ESM and Next.js bundler without configuration overhead.
- **Resolution & Fix**: Refactored route handler imports under `app/api/` to use explicit relative paths (`../../../lib/...` or `../../../../lib/...`).
- **Verification**: Ran `pnpm test` and `node --experimental-strip-types app/api/route_auth.test.ts`, passing all test suites with zero failures.

## [DEBUG-003] Gemini Chat Stream Did Not Complete

- **Incident ID & Title**: `[DEBUG-003] Gemini Chat Stream Did Not Complete`
- **Symptoms & Error Messages**: Provider verification succeeded, but the chat request returned an open event stream without a model response for several minutes.
- **Root Cause**: The chat route relied on the platform route duration and the browser request signal, but it did not impose an explicit provider-response deadline. Stream cleanup and Cube busy-state release were therefore not guaranteed when the upstream model stalled.
- **Diagnostic Steps**:
  1. Confirmed the provider key verification path succeeded.
  2. Confirmed the chat request returned an SSE response rather than an immediate HTTP error.
  3. Reviewed `app/api/chat/route.ts` and found no explicit upstream timeout or unified cleanup path.
- **Resolution & Fix**: Added a 45-second server-side abort controller that forwards client cancellation, aborts stalled provider calls, releases the Cube busy state exactly once, and returns a retryable timeout message. Failure logging now records only the error type and never the provider key or full exception object.
- **Verification**: Run the project test, typecheck, lint, service status, and diagnostics commands. A stalled provider request must terminate within the configured timeout and leave the Cube available for retry.

## [DEBUG-004] Production Build Blocked by Offline Google Fonts Fetch

- **Incident ID & Title**: `[DEBUG-004] Production Build Blocked by Offline Google Fonts Fetch`
- **Symptoms & Error Messages**: `pnpm build` reached the Next.js production build, then failed while fetching `Geist` and `Geist Mono` from Google Fonts.
- **Root Cause**: The validation environment could not establish an outbound connection to the Google Fonts host. This is an environment/network limitation, not a TypeScript or chat-route compilation error.
- **Diagnostic Steps**:
  1. Ran `pnpm build` with the configured workspace Node.js runtime.
  2. Confirmed the failure occurred in `next/font` while requesting the external font CSS.
  3. Confirmed tests, typecheck, and lint completed successfully.
- **Resolution & Fix**: No application change was made for this unrelated environment limitation. A network-enabled build or locally self-hosted fonts are required for a fully offline production build.
- **Verification**: `pnpm test`, `pnpm exec tsc --noEmit`, `make lint`, and `make doctor` pass. `make status` reports services stopped, so live browser verification remains pending until the stack is started.

## [DEBUG-005] Assistant Result Visible While Writing Indicator Remained Active

- **Incident ID & Title**: `[DEBUG-005] Assistant Result Visible While Writing Indicator Remained Active`
- **Symptoms & Error Messages**: The assistant response was visible in the transcript, but the composer continued to show `Maestro is writing…` and the Stop control remained active.
- **Root Cause**: The client derived its busy state directly from the AI SDK stream status. A provider or intermediary could deliver the final visible assistant text without delivering the terminal stream event, leaving the client status at `streaming`.
- **Diagnostic Steps**:
  1. Compared the visible transcript with the composer status.
  2. Reviewed `components/cube-chat.tsx` and confirmed no local completion recovery existed.
  3. Confirmed the server already had a bounded timeout, but that timeout did not guarantee immediate client status recovery.
- **Resolution & Fix**: Added SDK finish/error callbacks and a guarded two-second client recovery that stops only when the latest message is an assistant response with text and no tool call is pending.
- **Verification**: Run the UI test with a normal response and with a provider stream that omits its terminal event. The response remains visible and the composer returns to the ready state.

## [DEBUG-006] Verification Blocked While Corepack Resolves Pinned pnpm

- **Incident ID & Title**: `[DEBUG-006] Verification Blocked While Corepack Resolves Pinned pnpm`
- **Symptoms & Error Messages**: On 2026-10-21, `make verify` stopped before running tests. Corepack first failed to create its default cache directory (`EROFS: read-only file system`), and when directed to a writable temporary cache it could not download the repository-pinned pnpm 11.17.0 (`getaddrinfo EAI_AGAIN registry.npmjs.org`).
- **Root Cause**: The environment's default Corepack cache is read-only and outbound DNS/network access to the package registry is unavailable, while the pinned pnpm release is not cached for the installed Node.js runtime.
- **Diagnostic Steps**:
  1. Confirmed the installed Node.js runtime is v22.22.2 and the repository requests pnpm 11.17.0.
  2. Ran `make verify`; Corepack failed before the test runner started while creating its default cache.
  3. Retried the pnpm version resolution with `COREPACK_HOME` pointed at a writable temporary directory; Corepack then failed with `EAI_AGAIN` reaching the package registry.
- **Resolution & Fix**: The failure was specific to the assistant's execution shell. A subsequent user-run `make verify` resolved pnpm successfully and reached the production audit; see `[DEBUG-007]` for the remaining blocker.
- **Verification**: The user-provided run passed all four test runners, typecheck, and lint, then stopped at the production dependency audit. Browser E2E was not reached.

## [DEBUG-007] Production Audit Finds Vulnerable KaTeX Dependency

- **Incident ID & Title**: `[DEBUG-007] Production Audit Finds Vulnerable KaTeX Dependency`
- **Symptoms & Error Messages**: The user-provided `make verify` output on 2026-10-21 reported one low-severity production advisory, `GHSA-238p-pmpm-9mq7`, and exited non-zero during `pnpm audit --prod`.
- **Root Cause**: The dependency graph includes `katex@0.16.47` through Mermaid. The audit output identifies versions below `0.18.2` as vulnerable and `0.18.2` or later as patched.
- **Diagnostic Steps**:
  1. Reviewed the `pnpm audit --prod` output from the verification run.
  2. Confirmed `pnpm-lock.yaml` resolves KaTeX to `0.16.47` through Mermaid.
- **Resolution & Fix**: Added a pnpm workspace override for `katex@0.18.2` in `pnpm-workspace.yaml` and regenerated `pnpm-lock.yaml` with pnpm 11.17.0.
- **Verification**: `pnpm audit --prod` reports no known vulnerabilities. The full `make verify` run passed all 138 tests, typecheck, lint, and audit. Browser E2E was skipped because the web server was stopped.
