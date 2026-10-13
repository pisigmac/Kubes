# Kubes UI Functionality Testing Guide & Interactive Playbook

This document provides the complete specification, execution guide, and automated playbook for UI functionality testing on the **Kubes** platform.

---

## 1. UI Testing Architecture

Kubes implements a dual-layer UI testing strategy:
1. **Automated Headless Browser Harness**: Built with `puppeteer-core` driving system Google Chrome/Chromium (`scripts/test-ui-play.ts`). Executes fast, deterministic end-to-end user flows, testing real DOM state, async event handling, and HTTP API synchronization.
2. **Component Integration Verification**: Tests UI formatting, artifact parsing, and styling helpers using the native ESM test runner (`lib/computer/ui_formatting.test.ts`).

```
UI Testing Harness
├── scripts/test-ui-play.ts           # Puppeteer end-to-end interactive playbook
├── lib/computer/ui_formatting.test.ts # Artifact extraction & language badge unit tests
└── components/                       # Client components under test
    ├── cubes-app.tsx                 # Core layout, navigation & active specialist state
    ├── cube-chat.tsx                 # Streaming chat transcript & prompt form
    ├── cube-editor.tsx               # Specialist Tune drawer & schedule manager
    ├── memory-view.tsx               # Memory Explorer modal (CRUD & category pills)
    ├── provider-modal.tsx            # AI Provider diagnostic & KeyMint modal
    ├── computer-pane.tsx             # Sandboxed workspace filesystem & terminal
    └── artifact-canvas.tsx           # Interactive Markdown / Mermaid / Code canvas
```

---

## 2. Automated UI Playbook (`scripts/test-ui-play.ts`)

### Prerequisites & Running the Playbook

Ensure the Kubes web application is active (either via `make start` or `pnpm dev`):

```bash
# 1. Start the stack if not already running
make start

# 2. Execute the UI test playbook
pnpm run test:ui

# Or execute with custom target port and Chrome binary
PORT=3001 CUBES_CHROME=/usr/bin/google-chrome node --experimental-strip-types scripts/test-ui-play.ts
```

---

## 3. Verified UI Interaction Flows & Assertions

The automated playbook executes 8 critical user journeys in sequence:

### Phase 1: Navigation & Initial Hydration
- **Action**: Loads `http://127.0.0.1:<PORT>` with a `1400x900` viewport.
- **Assertions**:
  - HTTP response status is `200 OK`.
  - DOM `document.readyState === "complete"`.
  - Client component hydration finishes and `<nav>` is populated in `< 500ms`.

### Phase 2: Specialist Roster Listing
- **Action**: Inspects the sidebar roster navigation.
- **Assertions**:
  - Verifies presence of the orchestrator: **Maestro**.
  - Verifies all default specialist cards: **Focus**, **Money**, **Work**, **Learn**, **Job hunt**.

### Phase 3: Interactive Context Switching
- **Action**: Clicks on individual specialist buttons (**Focus**, **Money**, **Job hunt**).
- **Assertions**:
  - Header updates dynamically to display the selected specialist name.
  - Active conversation thread switches without race conditions or memory bleeding.

### Phase 3b: Cube Creation Flow & Cancel Dismissal
- **Action**: Clicks **"New Cube"** in the sidebar navigation, then clicks **"Cancel"**.
- **Assertions**:
  - Clicking "New Cube" sets the view state to creation mode (`<h1>New Cube</h1>`).
  - Clicking "Cancel" cleanly exits creation mode and restores the previous active Cube.

### Phase 4: Memory Explorer Modal (Full CRUD Lifecycle)
- **Action**:
  1. Clicks **"Memory"** button in header to open modal.
  2. Clicks **"+ Add Memory"** to reveal form.
  3. Enters test content (`E2E_AUTOMATED_TEST_FACT_VERIFICATION`) and submits.
  4. Clicks the delete icon on the newly created memory.
  5. Auto-accepts the browser confirmation dialog (`dialog.accept()`).
  6. Closes the modal.
- **Assertions**:
  - Modal heading `"Agent Memory Store"` is visible.
  - Filter pills (All, Context, Preferences, Decisions, System) render.
  - Newly inserted memory immediately appears in the list via optimistic or synced state.
  - Delete action cleanly removes the memory from DOM and database.

### Phase 4b: AI Providers & KeyMint Gateway
- **Action**: Clicks **"Providers"** button in header.
- **Assertions**:
  - Modal displays `"AI Provider & KeyMint Gateway"`.
  - Multi-provider cards render (Google Gemini, Groq, custom proxy endpoints).
  - Diagnostic health status indicators are displayed.
  - Modal dismisses cleanly via close button.

### Phase 5: Tune Drawer & Specialist Configuration
- **Action**: Inspects the right-hand Tune drawer.
- **Assertions**:
  - Model Selector dropdown is present and populated with valid model IDs.
  - Persona prompt and Instructions textarea are editable.
  - Schedule management list displays active cron rules.

### Phase 6: Computer Workspace & Terminal Pane
- **Action**: Clicks **"Computer"** button in header.
- **Assertions**:
  - Computer drawer opens displaying the **Files** browser and **Terminal** logs.
  - Status badge reports process state (**Idle** or active seat lock).
  - Close button dismisses the drawer cleanly.

### Phase 7: Chat Input & Streaming Form
- **Action**: Inspects `<main textarea>`.
- **Assertions**:
  - Textarea is present, enabled, and accepts user input.
  - Send button triggers streaming response mechanics without UI freeze.

### Phase 8: Agent Swarm Controls & Mode Toggle
- **Action**: Inspects the `⚡ Swarm` mode toggle button and submit action in Maestro.
- **Assertions**:
  - `⚡ Swarm` toggle button is present in chat controls.
  - Submit button dynamically displays `"Run Swarm"` in Swarm mode and switches to `"Send"` when toggled to Single mode.
  - Toggling mode updates styling and state seamlessly without reloading the thread.

---

## 4. Manual QA Test Matrix for Functional Verification

For human QA engineers and exploratory testing:

| Component | Test Action | Expected Result |
| :--- | :--- | :--- |
| **Theme & Layout** | Resize browser window from 1400px down to 375px mobile. | Sidebar collapses into a mobile hamburger menu; main chat pane remains fluid and responsive. |
| **Streaming Chat** | Type "Hello Maestro, summarize today's priorities" and press Enter. | Chat transcript appends user bubble immediately; assistant bubble streams tokens with animated cursor. |
| **Artifact Canvas** | Ask a Cube to output a Mermaid flowchart or CSV balance table. | Artifact Canvas opens in split-pane view; renders interactive SVG diagram or formatted table with syntax highlighting. |
| **Schedule Trigger** | Open Tune drawer, toggle a schedule switch, change cron to `*/10 * * * *`. | UI displays toast notification; database reflects updated schedule interval immediately. |
| **Jail Filesystem** | In Computer pane, click a file link (e.g. `report.md`). | File contents open in the file viewer; download button initiates browser download via `/api/computer/download`. |
| **Error Recovery** | Disconnect network or stop agent core, submit prompt. | UI displays red error alert banner with retry button; does not crash or unmount the chat pane. |

---

## 5. Continuous Integration (CI) Automation

To run the UI test suite in headless Linux environments (e.g. GitHub Actions, Docker):

```bash
# Install Chrome dependencies for headless running
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2

# Launch stack and run UI suite
make start
pnpm run test:ui
make stop
```
