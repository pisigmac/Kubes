# Cubes — Product Quality Review & QA Audit

**Audit Date:** October 2026  
**Auditor:** Quality Assurance & Systems Reliability Reviewer  
**Scope:** End-to-end audit of Cubes (Multi-agent chat, Tool execution, Sandbox jail, Scheduling ticker, SQLite storage layer, and Next.js UI/UX).

---

## Executive Summary

Cubes has a lean, elegant architectural core focused on local, single-user multi-agent workflows with specialized persona separation and a shared computer workspace (`data/computer`).

This rigorous QA audit examined functionality correctness, security/jail boundaries, concurrency and race condition resilience, error propagation, and UI/UX responsiveness across devices.

---

## 1. Functional Defects & Non-Working Flows

### 1.1 [Critical] Tablet Breakpoint Drawer Lockout (768px – 1023px)
* **Files:** [`components/cube-editor.tsx`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/components/cube-editor.tsx#L100-L105) & [`components/cubes-app.tsx`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/components/cubes-app.tsx#L290-L293)
* **Problem:** On tablet screens (768px to 1023px), clicking "Tune" opens the editor modal overlay, but:
  1. The close button in `cube-editor.tsx` has `md:hidden` (`display: none` at $\ge 768\text{px}$).
  2. The backdrop wrapper in `cubes-app.tsx` does not have an `onClick` dismiss handler.
  3. The editor only converts to inline static flow at `lg` ($1024\text{px}$).
* **Impact:** Tablet users cannot close the Tune drawer once opened without reloading the browser.

### 1.2 [Defect] Header Model Selector Bypasses Coercion & Validation
* **Files:** [`components/cubes-app.tsx`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/components/cubes-app.tsx#L101-L113), [`app/api/cubes/[id]/route.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/app/api/cubes/%5Bid%5D/route.ts), and [`lib/cubes/store.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/cubes/store.ts#L177)
* **Problem:** The agent's `update_cube` tool in `runtime.ts` passes model names through `coerceModel()`, but the REST API route `PATCH /api/cubes/:id` and `updateCube()` in `store.ts` save the raw string directly without verifying model availability against the provider.
* **Impact:** Saving an unavailable model from the UI breaks subsequent chat requests with provider 400/404 errors.

### 1.3 [Data Loss] Blind Thread Overwrite on Concurrent Operations
* **Files:** [`lib/cubes/store.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/cubes/store.ts#L250-L277)
* **Problem:** `saveThreadMessages` executes `DELETE FROM messages WHERE thread_id = ?` and re-inserts the entire passed array.
* **Impact:** If a user submits a prompt while another message is streaming or when a background scheduled run writes to the thread, the slower transaction wipes out messages written by the concurrent turn.

### 1.4 [Missing Transparency] Scheduled Runs Drop Tool Execution Logs
* **Files:** [`lib/computer/schedule.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/schedule.ts#L161-L168)
* **Problem:** Scheduled cron executions run via `runCubeInstruction`, which calls `agent.generate()` and saves only `result.text`.
* **Impact:** Any file reads/writes, bash commands, or browser navigations executed by the scheduled agent are discarded and never recorded in the thread transcript.

---

## 2. Security & Jail Weak Spots

### 2.1 SSRF Bypass in Puppeteer via DNS Rebinding & HTTP Redirects
* **Files:** [`lib/computer/url.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/url.ts#L4-L29) & [`lib/computer/browser.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/browser.ts#L43-L53)
* **Vulnerability:** `assertPublicUrl` checks the IP address before `current.goto()`.
  1. A domain with 0 TTL can rebind to `127.0.0.1` after the check passes.
  2. Public URLs that respond with HTTP 302 redirects to local/private services (e.g., `http://127.0.0.1:3000/api/...` or AWS `http://169.254.169.254`) are followed without validation by Puppeteer.
* **Remediation:** Use `page.setRequestInterception(true)` to inspect and validate target IP addresses on every individual request and redirect hop.

### 2.2 Shell Jail Filter Bypasses
* **Files:** [`lib/computer/jail.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/jail.ts#L105-L123)
* **Vulnerability:** String token filtering (`.env`, `cubes.db`, `/proc/`, etc.) is easily bypassed in `bash -c` via shell variables (e.g. `X=/et; cat ${X}c/passwd`), base64 decoding, globbing (`data/cu*.db`), or symlinks.
* **Remediation:** Transition from substring filtering to OS-level sandboxing (such as Linux `bubblewrap` with read-only root mounts and isolated `/tmp`).

---

## 3. Concurrency, Race Conditions & Timing Issues

### 3.1 Unprotected Concurrent Chat Streaming
* **Files:** [`lib/cubes/busy.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/cubes/busy.ts) & [`app/api/chat/route.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/app/api/chat/route.ts#L50)
* **Finding:** While scheduler ticks verify `isCubeBusy`, `POST /api/chat` invokes `trackCube` without verifying whether the cube is already busy.
* **Remediation:** Return `409 Conflict` or queue requests if a Cube turn is actively streaming.

### 3.2 Seat Wait Timeout Inversion
* **Files:** [`lib/computer/jail.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/jail.ts#L6) (`EXEC_MS = 30_000`) vs [`lib/computer/jail.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/jail.ts#L40) (`seatWaitMs = 20_000`)
* **Finding:** Seat wait timeout (20s) is shorter than bash command timeout (30s). A legitimate 25s command will cause waiting agents to time out prematurely.
* **Remediation:** Increase default `seatWaitMs` to `35_000ms`.

### 3.3 Synchronous 527k-Iteration Loop on Invalid Cron
* **Files:** [`lib/computer/cron.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/cron.ts#L39-L43)
* **Finding:** `nextCron` iterates minute-by-minute across 366 days ($527,040$ iterations) synchronously. An unmatchable cron expression blocks the single Node.js event loop during validation.
* **Remediation:** Implement field-level day/month bounds checking prior to date traversal.

---

## 4. UI / UX Quality Review

| Component | Issue | Recommended Fix |
| :--- | :--- | :--- |
| **Transcript** | Messages rendered as raw `<p>` tags with whitespace styling; Markdown tables, code syntax highlighting, bold/italic, and bullet lists are unrendered. | Integrate `react-markdown` and code syntax highlighting. |
| **Layout Real Estate** | On desktop $\ge 1024\text{px}$, opening Computer pane keeps Sidebar ($260\text{px}$), Computer ($340\text{px}$), and Tune ($340\text{px}$) active simultaneously ($940\text{px}$ total), compressing chat to ~300px. | Make Computer and Tune mutually exclusive or collapsible sidebars on desktop viewports. |
| **Model Dropdown Cache** | Client `models` state is initialized once and never refreshed if environment configuration changes. | Add client-side SWR/fetch or refresh mechanism. |

---

## 5. Quality Improvement Roadmap

1. **Phase 1 (Immediate Stability):**
   - Fix tablet Close button visibility (`lg:hidden`) and backdrop dismiss.
   - Run `coerceModel` in `PATCH /api/cubes/:id` route.
   - Safeguard `POST /api/chat` against concurrent sends using `isCubeBusy`.
   - Update `saveThreadMessages` to use append/upsert semantics.
2. **Phase 2 (Security Hardening):**
   - Implement Puppeteer request interception for SSRF & redirect prevention.
   - Adjust `seatWaitMs` to `35_000ms`.
   - Implement Linux `bubblewrap` command jail.
3. **Phase 3 (Observability & Rich UX):**
   - Persist terminal logs in SQLite database.
   - Capture and display tool execution summaries for scheduled runs.
   - Add Markdown rendering in chat transcript.
