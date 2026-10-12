# 🚀 Kubes: Complete Developer Onboarding & Use Cases Guide

Welcome to the **Kubes** engineering ecosystem! This guide provides a comprehensive walkthrough for new developers: architectural concepts, environment setup, developer workflows, real-world use cases, tool extension recipes, and testing playbooks.

---

## Table of Contents
1. [Mental Model & Architecture](#1-mental-model--architecture)
2. [Prerequisites & Development Setup](#2-prerequisites--development-setup)
3. [Stack Lifecycle Management](#3-stack-lifecycle-management)
4. [Codebase Architecture & Directory Map](#4-codebase-architecture--directory-map)
5. [End-to-End Developer Use Cases](#5-end-to-end-developer-use-cases)
6. [Developer Recipes & How-To Guides](#6-developer-recipes--how-to-guides)
7. [Testing, UI Playbooks & Verification](#7-testing-ui-playbooks--verification)
8. [Troubleshooting & Best Practices](#8-troubleshooting--best-practices)

---

## 1. Mental Model & Architecture

### What is Kubes?
**Kubes** is a local-first, privacy-centric autonomous AI intelligence workstation. Instead of a monolithic chatbot, Kubes structures intelligence as a **persistent team of specialized agents** sharing a unified runtime:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   👑 MAESTRO                                    │
│                     (Orchestrator, Coordinator & Dispatcher)                    │
└────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────────┘
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
    🎯 FOCUS        🛠️ WORK        💰 MONEY       📚 LEARN     💼 JOB HUNT
   (Priorities)    (Coding/Git)   (Ledger/CSV)   (Diagrams)   (Applications)
         │              │              │              │              │
   ┌─────┴──────────────┴──────────────┴──────────────┴──────────────┴────────────┐
   │                        SHARED RUNTIME & STATE ENGINES                        │
   │  🧠 Vector Memory Store   │  💻 Computer Sandbox   │  ⏰ In-Stream Scheduler │
   │  📂 File Workspace        │  🌐 Port Allocator     │  🛡️ DeskID IAM Auth     │
   └──────────────────────────────────────────────────────────────────────────────┘
```

### Core Architectural Invariants
1. **Zero Information Leakage:** Never expose host usernames, home paths, or private IP addresses in code, logs, or artifacts. Always use relative paths or generic placeholders.
2. **Kubes are Autonomous Agents, NOT Tasks:** A Cube is a persistent entity with its own persona, reasoning model, and workspace. Tasks and schedules are concrete units of work assigned *to* them.
3. **In-Stream Task Execution:** When scheduled tasks run, they execute under their parent Cube and stream output directly into that Cube's conversation thread tagged with `⏰ [Scheduled Task]`.
4. **Deterministic Toolchains:** Exclusively use `pnpm` for Node packages and `uv` for Python environments.

---

## 2. Prerequisites & Development Setup

### System Dependencies
- **Node.js:** v20.x or v22.x LTS
- **pnpm:** v9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Python:** v3.10+ with `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Google Chrome / Chromium:** Located at `/usr/bin/google-chrome` (required for headless browser tool execution & Puppeteer UI tests).

### Initial Clone & Installation
```bash
# 1. Clone repository and switch to dev branch
git clone https://github.com/pisigmac/Kubes.git
cd Kubes
git checkout dev

# 2. Install TypeScript dependencies
pnpm install

# 3. Setup Python Agent Core virtualenv
cd services/agent-core
uv sync
cd ../..

# 4. Install Universal Port Allocator
bash tools/port-allocator/install.sh
```

### Environment Configuration (`.env.local`)
Create or verify `.env.local` in the project root:
```ini
# OpenRouter / OpenAI Compatible Gateway
OPENROUTER_API_KEY=your_api_key_here
DEFAULT_MODEL=openai/gpt-4o-mini

# Live Web Search (Optional fallbacks: Tavily, Brave)
TAVILY_API_KEY=your_tavily_key_optional

# Local Agent Core Service URL
AGENT_CORE_URL=http://127.0.0.1:8001

# Headless Chrome Binary Path (Optional override)
CUBES_CHROME=/usr/bin/google-chrome
```

---

## 3. Stack Lifecycle Management

Kubes provides unified scripts to manage multi-process local orchestration:

```bash
# Start all services (Python Agent Core, Next.js Web UI, Scheduler Daemon)
./scripts/start-all.sh

# View live health status & global port allocations
./scripts/status.sh

# Run the automated E2E browser UI test playbook
pnpm test:ui

# Stop all services cleanly
./scripts/stop-all.sh
```

### Stack Status Dashboard
Running `./scripts/status.sh` displays real-time health:
```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Kubes Stack Status Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
web:               🟢 RUNNING (PID 3397334) [Port 3001 listening] ✓ Health 200 OK
agent-core:        🟢 RUNNING (PID 3397174) [Port 8001 listening] ✓ Health 200 OK
scheduler:         🟢 RUNNING (PID 3397729) 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 4. Codebase Architecture & Directory Map

```text
bots/
├── app/                        # Next.js App Router (UI & API Gateway)
│   ├── api/
│   │   ├── chat/               # Streaming chat SSE endpoints (Vercel AI SDK)
│   │   ├── cubes/              # Cube CRUD & persona tuning
│   │   ├── memories/           # Persistent Memory Store REST API
│   │   ├── schedules/          # In-stream cron scheduler API
│   │   ├── computer/           # Sandboxed filesystem & terminal API
│   │   └── models/             # Model catalog & local provider discovery
│   └── page.tsx                # Main single-page application entrypoint
├── components/                 # React UI Component Library
│   ├── cubes-app.tsx           # Primary application layout & state container
│   ├── cube-chat.tsx           # Multi-turn streaming chat interface
│   ├── cube-editor.tsx         # Persona tuning & schedule configuration drawer
│   ├── memory-view.tsx         # Visual Memory Explorer modal
│   ├── computer-pane.tsx       # Sandboxed terminal & workspace file explorer
│   └── markdown.tsx            # Rich markdown & code highlight renderer
├── lib/                        # Core TypeScript Services
│   ├── computer/               # Sandboxed execution, live search, specialist tools
│   │   ├── runner.ts           # Terminal & browser tool execution engine
│   │   ├── schedule.ts         # In-stream cron scheduling & atomic SQLite claiming
│   │   ├── search.ts           # Real-time search engine with citations
│   │   ├── specialist_tools.ts # Tool dispatch for Job Hunt, Money, and Learn
│   │   └── jail.ts             # Filesystem scoping & security sandboxing
│   ├── memory/                 # Long-term cross-thread memory store
│   │   └── store.ts            # SQLite memory CRUD & keyword relevance scoring
│   ├── specialist/             # Domain engines
│   │   ├── job_hunt.ts         # Markdown table parser & application tracker
│   │   ├── money_ledger.ts     # CSV transaction parser & budget calculator
│   │   └── diagrams.ts         # Mermaid diagram & mind-map generator
│   └── cubes/                  # Cube persistence & roster store
│       └── store.ts            # SQLite queries for Cubes, threads, and messages
├── services/
│   └── agent-core/             # Python FastAPI + LangGraph Agent StateGraph
│       ├── main.py             # FastAPI entrypoint & health routes
│       ├── graph.py            # LangGraph multi-step StateGraph
│       └── tests/              # Pytest test suite (17/17 passing)
├── tools/
│   └── port-allocator/         # Standalone Universal Dynamic Port Allocator
│       ├── src/port_alloc/     # Python CLI & core allocation engine
│       ├── ts/client.ts        # TypeScript client SDK
│       └── tests/              # Pytest & Node test suites (6/6 passing)
├── scripts/                    # Operational Scripts & Test Harness
│   ├── start-all.sh            # Stack bootstrap script
│   ├── stop-all.sh             # Graceful stack termination
│   ├── status.sh               # Live status dashboard
│   ├── verify.sh               # Comprehensive test verification gate
│   └── test-ui-play.ts         # Puppeteer E2E browser UI test playbook
└── data/                       # Local SQLite Database & Workspace Sandbox
    ├── cubes.db                # SQLite WAL database (Cubes, threads, memories)
    ├── computer/               # Shared workspace directories (notes/, artifacts/)
    └── logs/                   # Process stdout/stderr logs
```

---

## 5. End-to-End Developer Use Cases

### 🛠️ Use Case 1: Engineering & Architecture Review with `Work Kube`
- **Objective:** Plan a feature, inspect Git repositories, and generate system architecture diagrams.
- **Workflow:**
  1. Select **`Work`** in the sidebar roster.
  2. Prompt:
     > *"We are implementing an OAuth2 PKCE flow with JWT validation. Analyze the security requirements and generate a Mermaid sequence diagram in notes/diagram.mmd."*
  3. The agent executes `concept_diagram_create` and writes the Mermaid diagram directly to your workspace.
  4. Open the **`Computer`** pane in the top navigation bar to inspect the generated diagram file.

---

### 📚 Use Case 2: Deep Technical Learning with `Learn Kube`
- **Objective:** Rapidly understand complex distributed systems concepts.
- **Workflow:**
  1. Select **`Learn`** in the sidebar roster.
  2. Prompt:
     > *"Explain the difference between Optimistic Concurrency Control (OCC) and Two-Phase Locking (2PL) in distributed databases. Provide concrete trade-offs."*
  3. The agent breaks down the theory using the Feynman technique, structured tables, and concrete code examples.

---

### 💰 Use Case 3: Expense Tracking & Runway Planning with `Money Kube`
- **Objective:** Track development infrastructure costs and compute monthly run-rates.
- **Workflow:**
  1. Select **`Money`** in the sidebar.
  2. Prompt:
     > *"Add two expenses to ledger.csv: $120 for AWS GPU instance under 'infra', and $20 for GitHub Copilot under 'tools'. What is our net monthly spend?"*
  3. The agent executes `money_ledger_record`, updates `notes/ledger.csv`, and returns categorized expense totals and net budget metrics.

---

### 💼 Use Case 4: Career & Job Search Tracking with `Job Hunt Kube`
- **Objective:** Manage interview pipelines, follow-ups, and resume revisions.
- **Workflow:**
  1. Select **`Job hunt`** in the sidebar.
  2. Prompt:
     > *"Add a new role: Staff AI Engineer at DeepMind, remote, stage 'Technical Interview', next step 'Prepare system design review for Wednesday'."*
  3. The agent parses `notes/applications.md`, updates the Markdown table row, and sets up your next action.

---

### 🎯 Use Case 5: Cognitive Prioritization with `Focus Kube`
- **Objective:** Break down overwhelming workloads into high-leverage atomic tasks.
- **Workflow:**
  1. Select **`Focus`** in the sidebar.
  2. Prompt:
     > *"Here are 7 tasks I need to do today: [paste tasks]. Use the Eisenhower matrix to identify the top 2 non-negotiable items and generate a time-blocked schedule."*
  3. The agent produces an actionable, distraction-free execution plan.

---

### ⏰ Use Case 6: Autonomous In-Stream Scheduled Routines
- **Objective:** Automatically receive daily morning briefings without manual prompting.
- **Workflow:**
  1. Open the right-side **`Tune Cube`** drawer for **Focus Kube**.
  2. Under **Schedule**, add:
     - **Cron:** `0 9 * * 1-5` (9:00 AM weekdays)
     - **Instruction:** *"Review notes/applications.md and notes/ledger.csv, then generate a daily 3-bullet priority briefing."*
  3. When 9:00 AM arrives, the scheduler daemon claims the task and streams the briefing directly into the **Focus Kube thread** prefixed with `⏰ [Scheduled Task]`.

---

## 6. Developer Recipes & How-To Guides

### Recipe 1: Adding a New Domain Tool
To equip agents with a new tool (e.g. `docker_container_inspect`):

1. Define the tool handler in `lib/computer/`:
   ```typescript
   // lib/computer/my_tool.ts
   export async function inspectDockerContainer(name: string): Promise<string> {
     // Execute sandboxed inspection
     return JSON.stringify({ container: name, status: "running" });
   }
   ```
2. Register the tool in `lib/computer/specialist_tools.ts`:
   ```typescript
   export const myCustomTools = {
     docker_inspect: tool({
       description: "Inspect local container health status",
       parameters: z.object({ name: z.string() }),
       execute: async ({ name }) => inspectDockerContainer(name),
     }),
   };
   ```
3. Expose the tool to the AI runtime in `lib/computer/runner.ts`.

---

### Recipe 2: Curating Agent Memory Programmatically
To save durable facts that persist across conversations:

```typescript
import { saveMemory, queryMemories } from "@/lib/memory/store";

// Save a project constraint
saveMemory({
  cubeSlug: "work", // or "global"
  category: "preference",
  content: "Always run TypeScript verification with pnpm verify before commits.",
  keywords: ["typescript", "pnpm", "verify", "commit"],
});

// Search relevant memories for a prompt
const relevantFacts = queryMemories({
  query: "How should I run commits?",
  cubeSlug: "work",
  limit: 5,
});
```

---

### Recipe 3: Creating a Custom Specialist Kube
To create a specialized agent (e.g. *DevOps Engineer*):
1. Click **`New Cube`** in the web UI sidebar (or call `POST /api/cubes`).
2. Fill in:
   - **Name:** `DevOps Specialist`
   - **Pain Point:** `CI/CD pipelines, Docker containerization, and cloud deployment`
   - **Instructions:** `You are an expert DevOps engineer. Always write production-grade Dockerfiles, GitHub Actions workflows, and health check scripts.`
   - **Model:** `openai/gpt-4o`
3. Click **`Create`**. The agent is instantly available in your roster!

---

## 7. Testing, UI Playbooks & Verification

### Running the Multi-Language Verification Gate
Before opening a PR or committing changes, run the automated verification suite:

```bash
# Run all tests, linting, typechecks, and security audits
pnpm run verify
```

This command executes:
1. **Node.js Test Runner:** 30 unit tests (`lib/computer/*.test.ts`, `lib/memory/*.test.ts`, `lib/auth/*.test.ts`).
2. **Python LangGraph Tests:** 17 Pytest tests in `services/agent-core/`.
3. **Port Allocator Tests:** 6 Pytest tests and TypeScript client tests in `tools/port-allocator/`.
4. **Static Typecheck:** Strict `tsc --noEmit`.
5. **ESLint:** Code quality checks.
6. **Security Audit:** `pnpm audit`.

### Automated E2E Browser UI Testing
Simulate real user journeys (specialist switching, Memory Explorer CRUD, Tune drawer, New Cube flow, Computer terminal pane):

```bash
pnpm test:ui
```

---

## 8. Troubleshooting & Best Practices

### Q1: `start-all.sh` started on port 3001 instead of 3000?
**Reason:** Port 3000 on your host is bound by an existing service (e.g. an external auth proxy). The Port Allocator detects port collisions and automatically assigns the next free port (`3001`).

### Q2: How do I cleanly reset a seeded Kube?
In the right-side **Tune Cube** drawer, click the **`Reset seed`** button. This reverts that Kube's instructions and model configuration back to the factory defaults without deleting chat threads.

### Q3: How do I wipe the local database for a fresh start?
```bash
./scripts/stop-all.sh
rm -f data/cubes.db data/cubes.db-wal data/cubes.db-shm
./scripts/start-all.sh
```
*(Kubes will automatically run migrations and re-seed default specialists on the next launch).*

---

### Summary Checklist for New Contributors
- [ ] Ensure `pnpm` and `uv` are installed.
- [ ] Run `./scripts/start-all.sh` and verify green dashboard in `./scripts/status.sh`.
- [ ] Run `pnpm test:ui` to verify browser interaction tests pass.
- [ ] Adhere to the Zero Information Leakage policy on all commits.
