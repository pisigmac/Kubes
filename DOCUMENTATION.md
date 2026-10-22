# Kubes

> **Core Concept:** **Kubes are AI Agents**, not tasks. Each Cube is an autonomous, persistent AI specialist with its own persona, instructions, reasoning models, and sandboxed workspace. **Tasks** are the specific instructions, goals, or recurring scheduled routines that users assign to these AI agents.

**Kubes** is a local multi-agent intelligence app. In standalone mode, one person uses it in a browser with no account or shared server. In DeskID mode, protected requests require cryptographically verified identity and organization scope.


**Maestro** is the coordinator Cube (AI Agent) you start in. It routes work, and it can create or retune the others. The specialist AI agents are Focus, Money, Work, Job hunt, Body, Learn, Write, Life admin, and Calm. You can talk to any of them directly. Any Cube can hand one task or workflow to one other Cube. That handoff stops there: the receiver does not hand it on.


Each Cube remembers its own name, pain point, instructions, and model. The next message uses whatever was saved.

There is one workspace computer, not one machine per Cube, and not your desktop. Files are separated by organization and Cube directory. Browser profiles and screenshots are organization-scoped; the browser and terminal still share one seat per running process.

This file documents current behavior. Proposed product-quality follow-up work is tracked in `CUBES_PRODUCT_QUALITY_REVIEW.md`.

## Run it

```bash
cp .env.example .env.local
npm run dev
```

Open the URL printed by `make start`. Kubes prefers host port 23000 and uses `port-alloc` to select another free port when needed.

The key and the base URL must belong to the same provider. The model list can look healthy when chat will fail: some hosts, including OpenRouter, publish `GET /models` with no key. A chat call then returns 401. Use an OpenRouter key with an OpenRouter base URL, or an OpenAI key with `https://api.openai.com/v1`. Do not mix them.

| Variable | Role |
| --- | --- |
| `OPENAI_BASE_URL` | Chat endpoint. Default `https://api.x.ai/v1`. The app calls `/chat/completions`, not the Responses API. |
| `OPENAI_API_KEY` | Key sent on chat. If this is empty, `XAI_API_KEY` then `OPEN_API_KEY` is used. |
| `OPENAI_MODEL` | Model stored on a Cube that has no other choice, and the fallback when a requested id is rejected. Default `grok-4.7`. |
| `CUBES_CHROME` | Browser binary. Default `/usr/bin/google-chrome`. |
| `CUBES_COMPUTER_ROOT` | Workspace root. Default `data/computer`. |
| `CUBES_SEAT_WAIT_MS` | How long a Cube waits for the browser or terminal. Default 35000. |

`data/` is gitignored. It holds `cubes.db` and the computer directories. Deleting it reseeds the catalog and drops chats, files, and schedules.

Chrome has to be installed for pages. Chat, files, and schedules do not need it until a Cube opens a page.

## Using it

The left column is the roster. Maestro is first. Specialists are under that. **New Cube** adds one. Selecting a Cube opens its latest chat. **New chat** starts a fresh thread and leaves the old one in the database.

**Tune**, on the right from a wide window and behind a button on a narrow one, edits name, pain point, instructions, and model. **Save** applies on the next message. **Reset seed** restores a built-in Cube's name, pain point, instructions, and model. It does not exist for a Cube you created. Renaming does not change the slug, so existing files stay put.

The model control is a dropdown in Tune and, on a wide window, a second row in the chat header. The header change saves immediately. The list comes from `GET /api/models`, cached for five minutes. If that call fails, the list is the default model plus `grok-4.7`, `grok-4`, and `grok-3`.

**Computer** opens the workspace pane: idle or who holds the seat, the latest screenshot, files, and the recent terminal log. On a wide window it is a column. On a narrow window it covers the chat. Maestro sees every directory. Any other Cube sees only its own. While a handoff is in progress the pane follows the receiver.

**Schedules** live at the bottom of Tune. Three presets are offered: every hour (`0 * * * *`), every day at 08:00 (`0 8 * * *`), and every Monday at 08:00 (`0 8 * * 1`). A custom five-field expression is allowed when the gap is at least five minutes. Times use the machine's clock. Nothing runs unless this Next process is running. Pause and delete are on the row. A run is skipped when that Cube is already answering a chat. The reply is appended to one thread per schedule.

Job hunt is listings, applications, and follow-ups. Work is the job you already have. Job hunt is expected to keep a tracker at `notes/applications.md` when a real application is discussed. That file is not created in advance.

## What a Cube may do

Maestro, in a direct chat:

- `list_cubes`, `create_cube`, `update_cube`
- `handoff` to exactly one other Cube
- the computer tools below

A specialist, in a direct chat, has the computer tools and `handoff`. It cannot list, create, or retune Cubes.

The Cube that receives a handoff has the computer tools only. A scheduled run is the same: computer tools, no handoff, no roster edits. Maestro is not given a tool that creates schedules. You add those in Tune.

Computer tools:

| Tool | What it does |
| --- | --- |
| `live_search` | Real-time web search for live events, documentation, and market data with citation URLs. |
| `computer_list` | List a directory. Maestro may pass another Cube's slug. |
| `computer_read` | Read a text file. Maestro may read another Cube. |
| `computer_write` | Write a text file in this Cube's own directory. |
| `computer_exec` | One `bash -c` command, working directory set to this Cube. |
| `computer_browse` | Open a public http(s) page and read the visible text. |
| `computer_click` | Click visible text, or a CSS selector that starts with `#`, `.`, or `[`. |
| `computer_type` | Type into the open page. |

### Live Web Search vs. Computer Browse

Kubes provides two distinct ways for AI agents to interact with the internet:

1. **`live_search` (Information Discovery & Grounding):**
   - Takes a natural language search query (e.g., *"Next.js 16 breaking changes"* or *"remote TypeScript job openings"*).
   - Returns top 5–10 structured snippets with verified source URLs, publication timestamps, and domain badges.
   - Ideal for breaking news, current events, library documentation, and market trends.
   - Pluggable provider support: xAI Live Search, Tavily AI, Brave Search, and zero-config DuckDuckGo fallback.

2. **`computer_browse` (Targeted Page Interaction):**
   - Navigates headless Chromium/Puppeteer to a specific known URL.
   - Reads full DOM text, takes UI screenshots, clicks interactive elements (`computer_click`), and fills forms (`computer_type`).
   - Scoped strictly to public URLs (private/localhost IPs are blocked).

A direct Maestro turn stops after 16 steps. A specialist turn, a handoff receiver, and a scheduled run stop after 12. A scheduled run is aborted after two minutes.


The transcript shows a "handed to {name}" chip, then the receiver's reply. Computer tool lines in that handoff are shown with the chip. Maestro is told not to paste the reply again.

## The workspace computer

```
data/computer/
  orgs/<org-id>/
    home/            Maestro. TOOLS.md and notes/ appear on first use.
    cubes/<slug>/    Every other Cube, same shape.
    chrome/          Organization-scoped Chrome profile.
    shots/latest.png Organization-scoped latest screenshot.
```

There is no shared drop folder. Maestro can read every directory and cannot write or execute in anyone else's. File reads and Maestro's reads do not take the seat. The browser and the terminal do. If the seat is still busy after the wait, the tool returns "Computer is in use by {Name}."

Exec uses a clean environment: `PATH`, `HOME` set to that Cube's directory, `LANG`, and `TERM`. API keys are not passed in. Output is kept to about 32KB. The command is refused when it contains `..`, `~`, `.env`, `cubes.db`, `/proc/`, `/etc/`, `/home/`, `/root/`, `/var/`, or a path into another Cube's directory. The terminal log is the last 20 commands in this process. Restarting Next clears it.

Pages must be public `http` or `https`. Localhost, `.local`, link-local, and private addresses are refused, including a name that resolves to one.

This is a policy check around a normal shell and a normal Chrome, not a virtual machine. A command that does not trip those strings still runs as the user who started Next. Do not point it at a machine you do not trust the Cubes to touch.

The footer line in the pane is the reminder: "One workspace computer. Not your computer."

## Data

SQLite is `data/cubes.db` (WAL, foreign keys).

| Table | Holds |
| --- | --- |
| `cubes` | Slug, name, pain point, instructions, model, whether it is Maestro, and `seed_key` for built-ins. |
| `threads` | One chat. The newest thread opens when you select a Cube. |
| `messages` | The UI message JSON, in order. |
| `schedules` | Cron, instruction, enabled, next run, last status, and the thread that run writes. |

The first time a process opens the database it inserts any missing built-in slug, so an older database gains Job hunt. Maestro's instructions are replaced only when they still equal the previous seed, word for word. Work's pain point and instructions are replaced only when both still equal the previous seed. Life admin's old "browse the web" sentence is replaced in place when that phrase is still there. Edits you already saved are left alone. Directories are created when the computer is first used, not at seed.

A new Cube's slug comes from its name and stays unique. The slug does not follow a later rename.

## HTTP

In standalone mode (`AUTH_MODE=none`), these local routes use the default local scope. In DeskID mode, protected routes require a Bearer token or `deskid_session` cookie; the server verifies the token and derives organization scope from it. Mutating routes require the `editor` role. Viewer access is read-only.

| Request | Body or query | Result |
| --- | --- | --- |
| `POST /api/chat` | `{ messages, cubeId, threadId }` | Stream of the Cube's turn. |
| `GET /api/cubes` | | Roster. |
| `POST /api/cubes` | name, pain point, instructions, optional model | New specialist. |
| `PATCH /api/cubes/:id` | any of those fields | Saved Cube. The header model control sends `{ model }`. |
| `POST /api/cubes/:id/reset` | | Built-in Cube restored. |
| `GET /api/models` | | `{ models, live }`. |
| `GET /api/threads?cubeId=` | | Threads. `latest=1` is what the UI opens. |
| `POST /api/threads` | `{ cubeId }` | New thread. |
| `GET /api/computer?cubeId=` | | Trees, command log, screenshot flag, seat. |
| `GET /api/computer/screenshot` | | PNG, or 404 when no page has been opened. |
| `GET /api/computer/download` | `cubeId`, `path`, optional `cube` | File, or 400 when the jail refuses. |
| `GET/POST /api/schedules` | `cubeId`; post also needs `cron` and `instruction` | List, or the saved row. |
| `PATCH/DELETE /api/schedules/:id` | `{ enabled }` to pause | Update or remove. |

## Where the code lives

| Path | Role |
| --- | --- |
| `app/page.tsx` | Loads the roster, models, and Maestro's schedules. |
| `components/cubes-app.tsx` | Sidebar, header, Tune, computer column. |
| `components/cube-chat.tsx` | Streaming chat. Follows a handoff in the computer pane. |
| `lib/cubes/catalog.ts` | Built-in instructions. |
| `lib/cubes/runtime.ts` | Agents, tools, one-hop handoff. |
| `lib/ai/provider.ts` | Base URL, key, and `.chat()` model. |
| `lib/ai/models.ts` | Model list and `coerceModel`. |
| `lib/computer/jail.ts` | Directories, seat, exec. |
| `lib/computer/browser.ts` | The one Chrome. |
| `lib/computer/url.ts` | Public-address check. |
| `lib/computer/schedule.ts` | Cron rows and the 30-second ticker. |
| `lib/db.ts` | Schema and seed. |

`npm test` runs the computer tests: cron gaps, directory jail, the seat, a schedule claim, and private URLs. `npx tsc --noEmit` and `npx eslint app components lib --max-warnings 0` are the other checks. Chat is not covered by those tests. It needs a key that matches the base URL.

## Ecosystem Integrations & Companion Projects

Kubes is designed to interface with complementary specialized modules in the ecosystem:

| Project | Role in Kubes Ecosystem | Integration Pattern |
| :--- | :--- | :--- |
| **`DeskID`** | **Identity adapter**: authentication-mode switch, JWKS-backed token verification, RBAC, and organization tenancy. | Server-side route authentication and scoped persistence/filesystem/browser access when `AUTH_MODE=deskid`; issuer/JWKS deployment configuration remains environment-specific. |
| **`capsule`** | **Planned local memory integration**. | No Capsule package or verified mounted FTS5 integration is present in the main application. |
| **`tracelens`** | **Planned observability integration**: token, latency, and cost tracking. | No `tracelens-ai` dependency or verified runtime integration is present in this repository. |
| **`keymint`** | **Optional gateway configuration**. | Provider definitions recognize KeyMint, but a KeyMint service is not included or required by the default local setup. |
| **`kubemind`** | **Optional companion service**. | A Python adapter exists under `services/agent-core`; the main Next.js chat runtime does not automatically provide the described enterprise governance guarantees. |

## Limits that are on purpose

- Money is not financial advice. Body is not medical care. Calm is not therapy. Job hunt does not invent employers or salaries. Work does not invent legal rights.
- In default standalone mode (`AUTH_MODE=none`), no sign-in or multi-tenancy is active; enterprise mode enables DeskID authentication. No voice, no image generation in core.
- No control of your real desktop, and no listener on your keyboard.
- No chained handoff, and Maestro cannot write another Cube's files.
- Schedules do not use the system crontab. They die when the Next process dies.
- The jail is not a container.

## Product Quality Review & QA Audit

### Executive Summary of the Review

| Issue # | Concern in Report | Verdict | Current Codebase Status |
| :---: | :--- | :---: | :--- |
| **1.1** | **Tablet UI Lockout (768px–1023px)** | **Likely fixed; browser verification required** | Editor cancel/backdrop controls were added in `components/cube-editor.tsx` and `components/cubes-app.tsx`. Confirm with a real tablet-width keyboard and touch test. |
| **1.2** | **Header Model Selector Bypass** | **Improved; not fully verified** | Model changes are persisted through the Cube API and provider routing supports model prefixes. Add an end-to-end test proving the selected model is used for the next chat. |
| **1.3** | **Blind Thread Overwrite (`saveThreadMessages`)** | **Open** | `lib/cubes/store.ts` still deletes and reinserts all messages for a thread. Rapid concurrent turns can overwrite messages. |
| **1.4** | **Scheduled Runs Lack Tool History / Transcripts** | **Partially addressed** | `lib/computer/schedule.ts` persists the scheduled prompt, assistant reply, status, and digest summary. It does not persist the complete tool-call/activity trace. |
| **2.1** | **SSRF Bypass in Browser Engine** | **Improved; not proven complete** | Request interception now checks `assertPublicUrl` for browser requests. DNS rebinding, redirects, browser downloads, and all network-capable paths still need dedicated tests. |
| **2.2** | **Shell Jail Regex/String Blacklist Bypass** | **Improved; deployment validation required** | Computer execution now fails closed when no usable Bubblewrap/Docker sandbox is available. Direct execution requires the explicit `CUBES_ALLOW_UNSAFE_DIRECT=true` override and is not a security sandbox. |
| **3.1** | **Concurrent Chat Stream Collisions** | **Open** | `app/api/chat/route.ts` tracks Cube busy state but does not reject or queue a second user request while one is streaming. |
| **3.2** | **Seat Waiter Timeout Inversion (20s vs 30s)** | **Fixed in code; documentation corrected** | The code default is `35_000ms`, which exceeds the `30_000ms` command timeout. Environment overrides can still change this behavior. |
| **3.3** | **Terminal Command History Lost on Reboot** | **Fixed in code** | Terminal commands are written to and read from the SQLite `command_logs` table. This does not make logs encrypted or tenant-scoped. |
| **4.1** | **Lack of Markdown Parser in Transcript** | **Implemented; browser verification required** | `components/transcript.tsx` uses the Markdown viewer and artifact rendering. Confirm code-copy, malformed markdown, long output, and mobile behavior in the browser. |
| **4.2** | **Sidebar Real Estate on 1080p Screens** | **Open** | When Sidebar, Computer Pane, and Tune Drawer are all open on a standard laptop, the chat area can become too narrow. |

---

### Detailed Technical Verification of the Top Concerns

#### ✅ 1. P0-1: DeskID JWT Signature Verification
* **Current implementation:** `lib/auth/deskid.ts` verifies the JWT signature against the configured JWKS endpoint and validates the required authentication claims.
* **Codebase Reality ([`lib/auth/deskid.ts:48-67`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/auth/deskid.ts#L48-L67)):**
  ```typescript
  const parts = token.split(".");
  // ...
  const payloadJson = decodeBase64Url(parts[1]); // Decodes payload only!
  const claims = JSON.parse(payloadJson) as DeskIDTokenClaims;
  // Signature in parts[2] is completely ignored!
  ```
* **Verdict:** **Resolved in code.** `lib/auth/deskid.ts` now verifies signatures through the configured JWKS endpoint and validates issuer, audience, expiration, not-before, subject, and `org_id`. Runtime validation still requires the repository tests and a real DeskID issuer/JWKS configuration.

---

#### ✅ 2. P0-2: Multi-Tenancy & Authorization
* **Current implementation:** Server-side authentication derives organization scope, tenant columns are migrated into persistence tables, and protected resource queries include `org_id` predicates.
* **Codebase Reality ([`lib/db.ts:11-85`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/db.ts#L11-L85)):**
  - Tables `cubes`, `threads`, `messages`, `schedules`, `memories`, `digests`, and `command_logs` have **no `user_id` or `org_id` columns**.
  - Any user can read/write any other user's threads or files simply by providing the ID.
* **Verdict:** **Resolved in code.** Tenant columns, migrations, scoped store queries, protected routes, and organization-partitioned filesystem/browser artifacts are implemented. Continue enforcing cross-tenant negative tests for new APIs; organization scope does not automatically provide user-level isolation within one organization.

---

#### 🔴 3. P0-3: The "Sandbox" Silently Falls Back to Direct Host Execution
* **Review Claim:** When `bwrap` (Bubblewrap) or Docker are absent, the system falls back to `DirectFallbackDriver`, running unconfined `bash -c` in the host account with only naive string filters in `jail.ts`.
* **Codebase Reality ([`lib/computer/sandbox.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/sandbox.ts) & [`lib/computer/jail.ts:111`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/jail.ts#L111)):**
  - `banned = [".env", "cubes.db", "/proc/", "/etc/", ...]` in `jail.ts` is easily bypassed using basic shell obfuscation (e.g. `base64 -d`, shell variables `$DIR/passwd`, wildcards, or symlinks).
* **Verdict:** **Fail-closed behavior resolved.** Direct execution remains unsafe by design and must stay disabled outside controlled developer environments. OS-level sandbox deployment and prompt-injection testing remain required before broad release.

---

#### ✅ 4. P0-4: Browser State & Cookies Across Organizations
* **Current implementation:** Browser processes, profiles, and screenshots are keyed by organization. The browser seat remains shared within one organization.
* **Codebase Reality ([`lib/computer/browser.ts:10-31`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/lib/computer/browser.ts#L10-L31)):**
  ```typescript
  let browser: Browser | null = null;
  let page: Page | null = null;
  // Uses chromeDir() for all cubes
  ```
* **Verdict:** **Resolved at organization boundary.** Browser processes, profiles, and screenshots are keyed by organization. Cubes and users within one organization still share that organization's browser seat and session; use per-user or per-task contexts if that isolation is required later.

---

#### 🟠 5. P1-1: Provider Modal "Verify" Does Not Activate or Persist Keys
* **Review Claim:** The 🔑 Providers modal allows pasting and verifying a key via `/api/providers`, but the key is never saved to runtime state or disk.
* **Codebase Reality ([`components/provider-modal.tsx`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/components/provider-modal.tsx) & [`app/api/providers/route.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/app/api/providers/route.ts)):**
  - The modal tests `/models` connectivity with the pasted key in-memory.
  - The chat route ([`app/api/chat/route.ts`](file:///home/oh20210736-ud/Documents/WorkSpace/bots/app/api/chat/route.ts)) still resolves keys from `process.env`. The user assumes they "switched providers", but subsequent chats fail with 401.
* **Verdict:** **Confirmed open.**

---

#### 🟠 6. P2-1: Brand Identity & Naming Inconsistencies
* **Review Claim:** Code, UI, tests, and documentation randomly switch between `Kubes`, `Cubes`, and `Kube`.
* **Codebase Reality:**
  - `package.json` $\rightarrow$ `"name": "kubes"`
  - `scripts/scheduler.ts` $\rightarrow$ `"Kubes Background Task Scheduler"`
  - `lib/db.ts` $\rightarrow$ `"cubes.db"`
  - `components/cubes-app.tsx` $\rightarrow$ `<title>Cubes</title>`
* **Verdict:** **Confirmed open.**

---

### Summary Recommendation

The review's release recommendation is spot-on:

1. **Positioning:** Standalone mode remains a **Single-User Local Desktop Beta** on the URL printed by startup (preferred host port `23000`). DeskID mode adds server-side authentication and organization scoping, but production deployment still requires environment-specific issuer/JWKS, sandbox, and operational validation.
2. **Sandbox Enforcement:** If `bwrap` / container isolation is unavailable on the host OS, **disable computer tool execution by default** rather than silently running raw `bash -c`.
3. **Provider Activation:** Separate key verification from activation. Provide an explicit, documented activation path using an encrypted local store or a deliberate `.env.local` configuration step; do not imply that verification changes the active chat provider.
4. **Browser Isolation:** Refactor `browser.ts` to use ephemeral incognito browser contexts (`browser.createBrowserContext()`) per task.
