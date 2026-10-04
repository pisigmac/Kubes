# Kubes: Comprehensive End-to-End (E2E) Testing Guide

This guide provides a systematic, step-by-step manual and automated verification procedure to validate every feature and subsystem in **Kubes**.

---

## 📋 Table of Contents
1. [Environment & Prerequisites](#1-environment--prerequisites)
2. [Automated Quality Verification Gates](#2-automated-quality-verification-gates)
3. [Stack Startup & Lifecycle Validation](#3-stack-startup--lifecycle-validation)
4. [UI & Multi-Agent Orchestration Testing](#4-ui--multi-agent-orchestration-testing)
5. [Artifact Canvas & Visual Markdown Testing](#5-artifact-canvas--visual-markdown-testing)
6. [Pluggable Sandbox & Security Testing](#6-pluggable-sandbox--security-testing)
7. [Python LangGraph Agent Core & MCP Testing](#7-python-langgraph-agent-core--mcp-testing)
8. [Autonomous Scheduled Tasks & Stream Verification](#8-autonomous-scheduled-tasks--stream-verification)
9. [Live Web Search & Gateway Fallback Testing](#9-live-web-search--gateway-fallback-testing)
10. [Visual Memory Explorer Testing](#10-visual-memory-explorer-testing)
11. [Specialist Domain Toolkits Testing](#11-specialist-domain-toolkits-testing)
12. [Cross-Product Port Allocator Testing](#12-cross-product-port-allocator-testing)
13. [Stack Shutdown & Resource Cleanup](#13-stack-shutdown--resource-cleanup)

---

## 1. Environment & Prerequisites

Ensure the following tools are installed on your machine:
- **Node.js**: `v20+` (or `v22+`)
- **pnpm**: `v10+` (mandatory package manager)
- **Python**: `3.10+` with [`uv`](https://docs.astral.sh/uv/) installed
- **Chromium / Chrome**: For computer browser automation (`/usr/bin/chromium` or Google Chrome)
- **Bubblewrap (Optional/Recommended for Linux)**: `bwrap` for Linux namespace isolation

### Environment Setup
Create or verify `.env.local`:
```bash
# Model & Gateway Configuration
OPENAI_BASE_URL=https://api.x.ai/v1
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=grok-4.7
PRIMARY_MODEL=grok-4.7
FALLBACK_MODELS=grok-4,grok-3,gpt-4o

# Web Search API (Optional for live search)
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=

# Local Sandbox
CUBES_COMPUTER_ROOT=./data/computer
```

---

## 2. Automated Quality Verification Gates

Before manual UI testing, run the full automated verification suite to ensure all unit tests, integration tests, static type checks, ESLint rules, and security audits pass:

```bash
pnpm run verify
```

### Expected Output:
- ✅ **TypeScript Tests**: 30/30 tests passing (`lib/computer/*.test.ts`, `lib/memory/*.test.ts`, `lib/auth/*.test.ts`)
- ✅ **Port Allocator TS Client**: 1/1 test passing
- ✅ **Python LangGraph Agent Core**: 17/17 pytest tests passing (`services/agent-core/tests/`)
- ✅ **Port Allocator Python Tests**: 5/5 pytest tests passing (`tools/port-allocator/tests/`)
- ✅ **TypeScript Typecheck**: `tsc --noEmit` exits with `0` errors
- ✅ **ESLint**: `0` errors, `0` warnings
- ✅ **Security Audit**: `0` vulnerabilities found

---

## 3. Stack Startup & Lifecycle Validation

Kubes supports two deployment modes: **Local Multi-Process Stack** and **Docker Compose Stack**.

### Option A: Local Multi-Process Stack
```bash
# Start Next.js, Python LangGraph Agent Core, and Scheduler Daemon
pnpm run start:all
# or: bash scripts/start-all.sh
```

**Check Status:**
```bash
pnpm run status
# or: bash scripts/status.sh
```

**Expected Status Dashboard:**
```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Kubes Stack Status Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
web:               🟢 RUNNING (PID 12345) [Port 3000 listening] ✓ Health 200 OK
agent-core:        🟢 RUNNING (PID 12346) [Port 8000 listening] ✓ Health 200 OK
scheduler:         🟢 RUNNING (PID 12347)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Option B: Docker Compose Stack
```bash
bash scripts/start-all.sh --docker
```

Open your browser at [http://localhost:3000](http://localhost:3000).

---

## 4. UI & Multi-Agent Orchestration Testing

### Step 4.1: Specialist Roster & Routing
1. Open the web interface at `http://localhost:3000`.
2. Observe the sidebar:
   - **Maestro** (Default Orchestrator at the top).
   - **Specialist Kubes**: Focus, Money, Work, Body, Learn, Write, Life admin, Calm, Job hunt.
3. Select **Maestro** and send a cross-domain prompt:
   ```text
   I am applying for a Senior React Engineer job and need to track my application.
   ```
4. **Verification**:
   - Maestro analyzes the request and autonomously invokes `handoff` to **Job hunt**.
   - A handoff chip appears on screen with seamless transition to the Job hunt agent.

---

## 5. Artifact Canvas & Visual Markdown Testing

### Step 5.1: Markdown & Syntax Highlighting
1. In chat, ask any Cube (e.g. **Learn**):
   ```text
   Explain TypeScript Generics with a code snippet.
   ```
2. **Verification**:
   - The response renders with Markdown headings, lists, bold text, and a syntax-highlighted TypeScript code block.
   - Hover over the code block: A **"Copy Code"** button appears and copies the exact code when clicked.

### Step 5.2: Interactive Artifact Canvas
1. In chat, ask **Learn** or **Work**:
   ```text
   Create an architecture diagram of our multi-agent system.
   ```
2. **Verification**:
   - The agent calls `concept_diagram_create` and saves `notes/diagram.mmd`.
   - The **Artifact Canvas** slides out on the right-hand side, interactively rendering the live Mermaid flowchart/diagram.
   - You can toggle between Full-Screen, Code View, and Preview.

---

## 6. Pluggable Sandbox & Security Testing

### Step 6.1: Sandbox Command Isolation (`computer_exec`)
1. In chat with **Focus** or **Work**, ask:
   ```text
   List all files in your workspace directory using the computer.
   ```
2. **Verification**:
   - The agent executes `computer_exec` (or `computer_list`).
   - Click the **"Computer"** button in the header.
   - The terminal pane opens, displaying the exact command execution in SQLite-persisted logs.
   - Confirm the execution is jailed to `./data/computer/<cube-slug>/`.

### Step 6.2: SSRF & Private Network Interception (`computer_browse`)
1. In chat, ask **Job hunt**:
   ```text
   Browse the webpage http://127.0.0.1:8000/
   ```
2. **Verification**:
   - The security guard in [`lib/computer/browser.ts`](lib/computer/browser.ts) intercepts the request.
   - The browser refuses navigation with `SSRF Protection: Requests to private, localhost, or link-local IP addresses are blocked.`

---

## 7. Python LangGraph Agent Core & MCP Testing

### Step 7.1: Agent Core Health Endpoint
Test the FastAPI LangGraph service directly from your terminal:
```bash
curl -s http://127.0.0.1:8000/health | jq .
```
**Expected Output:**
```json
{
  "status": "ok",
  "service": "kubes-agent-core",
  "version": "0.1.0"
}
```

### Step 7.2: LangGraph State Machine Invocation
```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "cube_slug": "focus",
    "messages": [{"role": "user", "content": "Help me prioritize 3 tasks."}]
  }' | jq .
```
**Expected Output:** Returns structured response from the LangGraph StateGraph execution.

---

## 8. Autonomous Scheduled Tasks & Stream Verification

### Step 8.1: Create a Schedule in UI
1. Select **Focus** in the sidebar.
2. Click **"Tune"** in the header.
3. Scroll to the **Schedules** section.
4. Add a new task:
   - **Instruction:** `Give me a 15-minute focus checklist.`
   - **Cron Expression:** `*/5 * * * *` (Every 5 minutes).
5. Click **"Add Schedule"**.

### Step 8.2: Verify In-Stream Task Execution
1. Keep the **Focus** chat open.
2. When the cron schedule fires (or run `node --experimental-strip-types scripts/scheduler.ts --once`), observe the Focus chat stream:
   - A message card appears in the chat stream:
     ```markdown
     ⏰ [Scheduled Task]
     Give me a 15-minute focus checklist.
     ```
   - The agent's assistant response automatically streams and appends directly below the scheduled task badge in the same bot stream.

---

## 9. Live Web Search & Gateway Fallback Testing

### Step 9.1: Real-Time Web Search
1. In chat with **Job hunt** or **Maestro**, ask:
   ```text
   Search the web for the latest updates on TypeScript 5.9 release notes.
   ```
2. **Verification**:
   - The agent calls `live_search`.
   - The response includes verified source URLs and interactive citation chips `[1]`, `[2]`.

---

## 10. Visual Memory Explorer Testing

### Step 10.1: Open the Memory Explorer
1. Click the **`🧠 Memory`** button in the header.
2. The **Agent Memory Store** modal opens.

### Step 10.2: Filter & Manage Facts
1. **Filter by Category**: Click the pill buttons (`Preferences`, `Projects`, `Facts`, `Instructions`).
2. **Scope Toggle**: Switch between `🤖 <Current Cube>` and `🌐 All / Global`.
3. **Add Memory**:
   - Click **"+ Add Memory"**.
   - Select Category: `Preference`.
   - Content: `User always prefers pnpm and strict TypeScript`.
   - Click **"Save Fact"**.
4. **Search**: Type `pnpm` into the search box. Notice instant filtering.
5. **Edit / Delete**: Click `✏️` to modify the fact, or `🗑️` to purge it.

---

## 11. Specialist Domain Toolkits Testing

### Step 11.1: Job Hunt Application Tracker
1. In chat with **Job hunt**, send:
   ```text
   I applied for Staff AI Engineer at Google DeepMind today via https://deepmind.google/careers. Next step is technical phone screen.
   ```
2. **Verification**:
   - Job hunt invokes `job_application_track`.
   - Verify `data/computer/job-hunt/notes/applications.md` is populated with the structured markdown table.

### Step 11.2: Money Kube Transaction Ledger & Budget Summary
1. In chat with **Money**, send:
   ```text
   Record my monthly rent expense of $1800 to Landlord LLC and monthly salary of $5000 from Employer Inc.
   ```
2. **Verification**:
   - Money invokes `money_ledger_record`.
   - Verify `data/computer/money/notes/ledger.csv` records the transactions.
   - Money returns the calculated budget metrics (Total Income: $5000, Total Expenses: $1800, Net Savings: $3200, Savings Rate: 64%).

---

## 12. Cross-Product Port Allocator Testing

Test the standalone global port allocation utility installed in `~/.local/bin/port-alloc`:

```bash
# 1. Allocate a port for an arbitrary service
port-alloc allocate --service my-new-api --preferred 3000

# 2. View the Global Port Registry Dashboard
port-status

# 3. Query allocated port programmatically
port-alloc get my-new-api --field port

# 4. Check if port is free
port-alloc check 3000

# 5. Release service allocation
port-alloc release my-new-api
```

---

## 13. Stack Shutdown & Resource Cleanup

To stop all running services cleanly and release all allocated ports:

```bash
pnpm run stop:all
# or: bash scripts/stop-all.sh
```

**Verify Clean Shutdown:**
```bash
pnpm run status
```
Output confirms `web: ⚪ STOPPED`, `agent-core: ⚪ STOPPED`, `scheduler: ⚪ STOPPED`, and all ports released.
