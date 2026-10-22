# Kubes Debugging & Incident Resolution Log

## [DEBUG-005] DeskID Login Route Returned 404

- **Incident ID & Title**: `[DEBUG-005] DeskID Login Route Returned 404`
- **Symptoms & Error Messages**: Unauthenticated browser navigation to `/login?redirect=%2F` returned the Next.js 404 page.
- **Root Cause**: The auth proxy redirected to `/login`, but no App Router page existed for that path.
- **Diagnostic Steps**: Confirmed `/login` was excluded from auth enforcement and checked the `app/` route tree; only the main page existed.
- **Resolution & Fix**: Added the login page and server-side DeskID login, refresh, and logout handlers. Credentials are exchanged by Kubes, JWTs are validated against configured issuer, audience, and JWKS, and tokens are stored in HttpOnly cookies.
- **Verification**: Run the project test/typecheck/lint checks and verify DeskID sign-in and session refresh in the local Compose environment.

## [DEBUG-006] DeskID Login Succeeded but Home Page Returned a Server Error

- **Incident ID & Title**: `[DEBUG-006] DeskID Home Page Missing Tenant Scope`
- **Symptoms & Error Messages**: After signing in successfully, navigating to `/` displayed “A server error occurred.”
- **Root Cause**: The server-rendered home page called tenant-scoped Cube, thread, message, and schedule stores without an authenticated scope. These stores intentionally reject unscoped access in DeskID mode.
- **Diagnostic Steps**: Traced `app/page.tsx` data-loading calls to `resolveScope`, which throws when DeskID mode receives no scope.
- **Resolution & Fix**: Read the request cookies on the server, validate the session with `requireAuth`, pass the resulting user and organization scope to each store read, and create that organization’s starter Cube catalog idempotently.
- **Verification**: Run project checks and verify the home page loads after DeskID sign-in with the expected organization data.

## [DEBUG-007] Provider Selector Returned 403 for a Valid DeskID Viewer

- **Incident ID & Title**: `[DEBUG-007] Provider Selector Returned 403 for a Valid DeskID Viewer`
- **Symptoms & Error Messages**: The provider setup modal opened, but the provider selector contained no choices and gave no indication of a failed request.
- **Root Cause**: The provider modal initially hid request failures, but the confirmed HTTP 403 came from a claim-format mismatch. DeskID emitted the Kubes organization role as a string (for example, `"viewer"`), while Kubes expected `roles.kubes` to be an array. Spreading that string produced individual characters, so the viewer role check failed.
- **Diagnostic Steps**: Inspected the signed token's organization-scoped Kubes role and traced `/api/providers` through `requireAuth` and `assertRole`. The issuer, audience, subject, and organization claims were present; role normalization was the failing step.
- **Resolution & Fix**: The modal now displays a safe status-specific error and retry action. Normalize the Kubes role claim to an array whether DeskID sends a string or an array. Provider listing remains available to viewers; creating or testing credentials requires an organization-scoped editor or admin role.
- **Verification**: Confirm `/api/providers` succeeds with a string-form viewer role and the existing array-form role remains supported; verify editor/admin-only mutations remain gated. Run the project checks and retest after rebuilding the running application.

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

## [DEBUG-008] Provider Service Verification Environment Limits

- **Incident ID & Title**: `[DEBUG-008] Provider Service Verification Environment Limits`
- **Symptoms & Error Messages**: The initial Go module command could not write its default build cache and could not resolve `proxy.golang.org` from the restricted shell. Moving the Go cache into `/tmp` and allowing the module download resolved those constraints; Go unit tests and `go vet` then passed. The repository TypeScript check could not start because a non-Codex Node.js executable was not available in this shell (`node: not found`). Docker was not invoked from this environment, per the user's instruction to run Docker commands themselves.
- **Root Cause**: The execution shell has a restricted writable filesystem and network, and does not expose the user's standalone Node.js runtime. Docker access is unavailable through this shell.
- **Diagnostic Steps**:
  1. Ran the standalone Go toolchain with the default Go cache; cache writes failed outside writable paths.
  2. Re-ran with a temporary Go cache and fetched the PostgreSQL driver modules; Go tests and vet passed.
  3. An initial JWT test tried to bind a loopback HTTP server, which the sandbox disallowed; changed the test to validate signed tokens against an in-memory JWKS key set instead.
  4. Ran `pnpm exec tsc --noEmit`; the command wrapper could not locate Node.js and exited before type checking.
  5. Did not invoke Docker; Compose and PostgreSQL runtime checks are waiting for the user's run.
- **Resolution & Fix**: No repository workaround was added for the restricted shell. The Go verification passed after using `/tmp`. TypeScript and Compose verification require the user's local Node.js and Docker environment.
- **Verification**: Go unit tests and `go vet` pass. TypeScript check, Compose config/build, PostgreSQL migration, persistence, DeskID token validation, and provider proxy verification remain incomplete pending local commands.

## [DEBUG-009] Docker Host Port Collision on Agent Core

- **Incident ID & Title**: `[DEBUG-009] Docker Host Port Collision on Agent Core`
- **Symptoms & Error Messages**: Docker Compose failed to publish host port `8000` for `kubes-agent-core` because another process already held that port.
- **Root Cause**: Compose used fixed default host ports for Kubes services instead of consistently using the global port allocator.
- **Diagnostic Steps**:
  1. Reviewed the Docker daemon error identifying host port `8000` as already allocated.
  2. Traced Compose defaults and startup scripts; Docker defaults were `3000` and `8000`, while allocator preferences were also the same standard ports.
- **Resolution & Fix**: Set Kubes preferred host ports to `23000` (web) and `28000` (agent core), updated local/Docker startup to request those ports from `port-alloc`, and registered Docker container PIDs with the allocator. Container-internal ports remain unchanged. Use `./kubes start --docker` or `make start ARGS=--docker` for allocator-managed Docker startup.
- **Verification**: Shell syntax, Compose YAML parsing, and whitespace checks passed. A smoke check confirmed allocator fallback from an occupied `23000` to `23001` and allocation of agent core within `28000`–`28100`. The allocator pytest suite could not execute its socket-binding tests because this restricted environment denies socket creation (`PermissionError: Operation not permitted`). Docker Compose runtime verification remains pending a local Docker run.

## [DEBUG-010] Provider Verification Failure Had No Diagnostic Log

- **Incident ID & Title**: `[DEBUG-010] Provider Verification Failure Had No Diagnostic Log`
- **Symptoms & Error Messages**: A saved Gemini credential remained unverified and the UI reported that the provider could not be reached. A container request to the provider's HTTPS root resolved DNS and completed TLS but returned HTTP 404; the credential service logs contained no request-level failure details.
- **Root Cause**: Provider verification failures were returned to the caller as sanitized categories but were not written to service logs, leaving transport failures and upstream HTTP failures indistinguishable to operators.
- **Diagnostic Steps**: Confirmed the credential was saved but unverified in the provider modal, checked basic HTTPS reachability from the container, inspected the empty service logs, and traced test errors and HTTP status classification in the credential service.
- **Resolution & Fix**: Log provider ID, sanitized failure category, upstream HTTP status (zero when no HTTP response was received), and latency for failed provider tests. Never log credentials, response bodies, user identifiers, or raw upstream errors. Gemini's key check now uses `GET /v1beta/openai/models`, returns sanitized model IDs for the local provider model list, and reports key acceptance without claiming chat generation was tested.
- **Verification**: A focused Go test checks the Gemini models URL, GET method, bearer authentication, and filtering/deduplication of returned IDs. Run `go test ./...` and `go vet ./...` in `services/provider-credentials`, rebuild the provider-credentials container, and test with a saved Gemini key. Confirm the modal receives the model IDs and says chat generation was not tested. This does not establish that actual Gemini generation succeeds.

## [DEBUG-011] Gemini Chat Proxy Returned an Undifferentiated 502

- **Incident ID & Title**: `[DEBUG-011] Gemini Chat Proxy Returned an Undifferentiated 502`
- **Symptoms & Error Messages**: Chat requests through the provider-credentials proxy returned HTTP 502 with `provider_unavailable`. A previous log recorded only that the provider stream ended, so it did not identify an upstream HTTP status or distinguish connection, timeout, stream-read, and request-cancellation failures.
- **Root Cause**: The proxy discarded non-success upstream bodies and exposed only a generic error to the caller; its stream-copy warning omitted failure phase and category. The available evidence does not yet establish whether Gemini, the compatibility endpoint, or an intermediary caused the failure.
- **Diagnostic Steps**: Compare one short plain, non-streaming chat request with one streaming request that enables Kubes tools. Correlate the UI error with the provider service log by timestamp. Do not paste or log API keys, prompts, tool arguments, or raw provider response bodies.
- **Resolution & Fix**: Add structured warning fields for provider, failure phase, sanitized category, upstream HTTP status (zero when no response arrived), and latency. Transport errors distinguish cancellation, timeout, and connection failure; stream errors distinguish cancellation, timeout, and read failure. Logs intentionally exclude response headers, bodies, credentials, prompts, tool arguments, and user identifiers.
- **Verification**: Focused tests assert the safe diagnostic fields and category mapping. After rebuilding/restarting the credential service, retry both request shapes. An `upstream_response` log with a nonzero status means Gemini returned an HTTP error; an `upstream_request` log indicates failure before a response; a `response_stream` log indicates a failure while relaying a successful response. The native Gemini adapter decision remains pending those results.
