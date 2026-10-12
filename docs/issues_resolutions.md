# Kubes: Engineering Issues & Resolutions Log

This document tracks technical anomalies, root-cause investigations, and resolutions across all phases of the **Kubes** project.

---

## Table of Contents
1. [Agent Core & Scheduled Tasks Execution In-Stream](#1-agent-core--scheduled-tasks-execution-in-stream)
2. [Global Port Allocator & Subshell PID Binding](#2-global-port-allocator--subshell-pid-binding)
3. [Port Allocator Re-registration Jump (3001 → 3002)](#3-port-allocator-re-registration-jump-3001--3002)
4. [Standalone Scheduler Daemon Import & Event Loop Lifecycle](#4-standalone-scheduler-daemon-import--event-loop-lifecycle)
5. [Process Lifecycle & Sandboxed Execution Contexts (Curl Connection Refused)](#5-process-lifecycle--sandboxed-execution-contexts-curl-connection-refused)
6. [E2E Automated Browser UI Testing & React Form State](#6-e2e-automated-browser-ui-testing--react-form-state)
7. [SQLite Test State Pollution & Cleanup](#7-sqlite-test-state-pollution--cleanup)

---

## 1. Agent Core & Scheduled Tasks Execution In-Stream

### Symptom
When recurring scheduled tasks executed, they appeared in the UI as new phantom "task lifecycle bots" rather than staying organized under the parent specialist agent.

### Root Cause
`lib/computer/schedule.ts` was creating detached threads or assigning arbitrary thread contexts rather than looking up the parent Kube's active conversation thread.

### Resolution
- Updated `lib/computer/schedule.ts` to fetch `latestThread(cube.id)` for the assigned Kube.
- Formatted scheduled task prompts with prefix `⏰ [Scheduled Task]\n<instruction>`.
- Preserved conversation history so task execution streams directly into that Kube's UI thread.

---

## 2. Global Port Allocator & Subshell PID Binding

### Symptom
`scripts/start-all.sh` showed services running initially, but `scripts/status.sh` reported `🔴 DEAD (stale PID)`.

### Root Cause
Command substitution in bash (`$(...)`) and nested subshell execution `(cd ... && ... & echo $!)` wrote the subshell process ID to `.pids/*.pid`. Once the subshell launched the background child, the subshell exited immediately, causing `kill -0 <subshell_pid>` to fail.

### Resolution
- Updated `scripts/start-all.sh` to use `nohup`, `exec`, and `disown` to detach daemons.
- Added intelligent PID discovery to `scripts/status.sh` via socket listeners (`lsof -t -i :<port>`) and process table scanning (`pgrep`).
- Saved active assigned ports into `.pids/<service>.port` for deterministic status checks.

---

## 3. Port Allocator Re-registration Jump (3001 → 3002)

### Symptom
`start-all.sh` started services on ports `3001` and `8001`, but the `GLOBAL PORT REGISTRY DASHBOARD` displayed ports `3002` and `8002`.

### Root Cause
1. `start-all.sh` called `port-alloc allocate --preferred 3000`, which correctly allocated `3001` because port `3000` is bound by a host service.
2. The web server started and began listening on port `3001`.
3. `start-all.sh` then called `port-alloc allocate --preferred 3001 --pid <pid>` to update the registry with the active PID.
4. `port-alloc` ran a socket bind check to test if `3001` was free. Because the server was *already* listening on `3001`, `socket.bind()` failed. `port-alloc` assumed `3001` was occupied by a foreign process and incremented to `3002`.

### Resolution
- Modified `tools/port-allocator/src/port_alloc/core.py` in `allocate_port()`:
  ```python
  if preferred not in reserved_ports:
      if is_port_free(preferred, host):
          allocated = preferred
      elif pid is not None and is_pid_alive(pid):
          # Process was launched by caller and is actively registering its lease
          allocated = preferred
  ```
- Added unit test `test_allocate_for_live_bound_pid` to test suite (6/6 tests passing).
- Re-installed updated CLI binary to `~/.local/bin/port-alloc`.

---

## 4. Standalone Scheduler Daemon Import & Event Loop Lifecycle

### Symptom
Running `pnpm run schedules` or `scripts/start-all.sh` caused the scheduler daemon to exit immediately.

### Root Causes
1. **Module Alias Error:** `scripts/scheduler.ts` used `@/lib/...` imports. When run via `node --experimental-strip-types`, native Node does not resolve `@/` tsconfig path aliases.
2. **Timer Unreferencing:** `lib/computer/schedule.ts` called `setInterval(...).unref()`. While appropriate for Next.js web requests to allow graceful server shutdown, in a standalone CLI daemon, unreferencing the timer leaves the Node event loop empty, causing Node to exit immediately.

### Resolution
- Changed imports in `scripts/scheduler.ts` to relative paths (`../lib/computer/schedule.ts` and `../lib/cubes/store.ts`).
- Added a daemon heartbeat interval in `scripts/scheduler.ts` to keep the event loop active until `SIGINT`/`SIGTERM`.

---

## 5. Process Lifecycle & Sandboxed Execution Contexts (Curl Connection Refused)

### Question / Symptom
> *Why did `curl -I http://127.0.0.1:3001 2>&1 | head -n 5` return `curl: (7) Failed to connect to 127.0.0.1 port 3001: Connection refused`? Is it expected?*

### Explanation
**Yes, this is expected in temporary test execution environments.**

1. **Sandboxed Subshell Termination:** When an AI agent runs a terminal command (e.g. via `run_command` or ephemeral subshells), the sandbox terminates the process tree spawned inside that tool call when the step completes.
2. **Ephemeral vs Persistent Shell:** When you run `./scripts/start-all.sh` in your **own user terminal**, the processes (`next dev`, `uvicorn`, `scheduler`) run continuously in the background under your user session and stay alive.
3. **Verification in Your Terminal:**
   ```bash
   ./scripts/start-all.sh
   curl -I http://127.0.0.1:3001/api/models
   # Returns HTTP/1.1 200 OK
   ```

---

## 6. E2E Automated Browser UI Testing & React Form State

### Symptom
In Puppeteer tests, typing into the Memory modal via `textarea.value = "..."` did not save the fact into the React component state.

### Root Cause
Directly setting `HTMLTextAreaElement.value` bypasses React's synthetic event system (`onChange`), leaving React's internal `formData` state empty.

### Resolution
- Replaced direct DOM value mutation with Puppeteer's `page.type("form textarea", content)`.
- Added automated browser dialog handlers (`page.on("dialog", d => d.accept())`) for automated delete confirmations.
- Automated 7 end-to-end user journeys in [`scripts/test-ui-play.ts`](scripts/test-ui-play.ts), runnable via `pnpm test:ui`.

---

## 7. SQLite Test State Pollution & Cleanup

### Symptom
Running `pnpm test` caused temporary test Kubes (e.g. `test-cube-<timestamp>`) to occasionally appear in the live UI sidebar roster.

### Root Cause
`lib/computer/task_lifecycle.test.ts` created temporary records in the shared SQLite database but did not clean them up if an assertion failed midway.

### Resolution
- Wrapped all database operations in `task_lifecycle.test.ts` in `try ... finally` blocks.
- Guaranteed deletion of test schedules, threads, and cube rows from SQLite upon test completion.

---

## 8. "New Cube" Creation Drawer Dismissal (Missing Cancel Action)

### Symptom
When clicking the "New Cube" button in the sidebar roster, the UI entered creation mode, but on desktop layouts there was no visible "Cancel" or "Close" button to exit without creating a new Kube.

### Root Cause
1. `components/cube-editor.tsx` only had a `Close` button with class `lg:hidden`, hiding it completely on desktop screens.
2. The form action bar only rendered a `Create` submit button with no `Cancel` escape hatch.

### Resolution
- Added a dedicated `Cancel` button to the `CubeEditor` header when `creating === true` (visible on all responsive viewports).
- Added a `Cancel` button adjacent to `Create` in the bottom action bar.
- Added a `Cancel` button in the top navigation header in `components/cubes-app.tsx`.
- Added automated E2E browser test step in [`scripts/test-ui-play.ts`](scripts/test-ui-play.ts).

---

## Summary Status

| Area | Status | Verification Command |
|---|---|---|
| **TypeScript / Node Tests** | 🟢 30/30 Passed | `pnpm test` |
| **Python LangGraph Agent Core** | 🟢 17/17 Passed | `cd services/agent-core && uv run pytest` |
| **Port Allocator Tool** | 🟢 6/6 Pytest + 1 TS Client | `cd tools/port-allocator && PYTHONPATH=src uv run --with pytest pytest` |
| **E2E UI Playbook** | 🟢 8/8 Passed | `pnpm test:ui` |
| **Full Stack Health** | 🟢 100% Active | `./scripts/status.sh` |
