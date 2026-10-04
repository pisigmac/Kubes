# Kubes

> **Core Concept:** **Kubes are AI Agents**, not tasks. Each Cube is an autonomous, persistent AI specialist with its own persona, instructions, reasoning models, and sandboxed workspace. **Tasks** are the specific instructions, goals, or recurring scheduled routines that users assign to these AI agents.

**Kubes** is a local multi-agent intelligence app. One person uses it in a browser. There is no account and no shared server.


**Maestro** is the coordinator Cube (AI Agent) you start in. It routes work, and it can create or retune the others. The specialist AI agents are Focus, Money, Work, Job hunt, Body, Learn, Write, Life admin, and Calm. You can talk to any of them directly. Any Cube can hand one task or workflow to one other Cube. That handoff stops there: the receiver does not hand it on.


Each Cube remembers its own name, pain point, instructions, and model. The next message uses whatever was saved.

There is one workspace computer, not one machine per Cube, and not your desktop. Files are separated by directory. The browser and the terminal share one seat.

`plan.md` is the original build spec. It still says the computer is later work. This file is the current behavior. Proposed next work is in `future_plan.md`.

## Run it

```bash
cp .env.example .env.local
npm run dev
```

Open the URL Next prints. If port 3000 is already taken, start with `npm run dev -- --port 3010`.

The key and the base URL must belong to the same provider. The model list can look healthy when chat will fail: some hosts, including OpenRouter, publish `GET /models` with no key. A chat call then returns 401. Use an OpenRouter key with an OpenRouter base URL, or an OpenAI key with `https://api.openai.com/v1`. Do not mix them.

| Variable | Role |
| --- | --- |
| `OPENAI_BASE_URL` | Chat endpoint. Default `https://api.x.ai/v1`. The app calls `/chat/completions`, not the Responses API. |
| `OPENAI_API_KEY` | Key sent on chat. If this is empty, `XAI_API_KEY` then `OPEN_API_KEY` is used. |
| `OPENAI_MODEL` | Model stored on a Cube that has no other choice, and the fallback when a requested id is rejected. Default `grok-4.7`. |
| `CUBES_CHROME` | Browser binary. Default `/usr/bin/google-chrome`. |
| `CUBES_COMPUTER_ROOT` | Workspace root. Default `data/computer`. |
| `CUBES_SEAT_WAIT_MS` | How long a Cube waits for the browser or terminal. Default 20000. |

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
  home/            Maestro. TOOLS.md and notes/ appear on first use.
  cubes/<slug>/    Every other Cube, same shape.
  chrome/          One Chrome profile.
  shots/latest.png One screenshot, replaced each time a page is opened.
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

All of these are local and unauthenticated.

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
| **`DeskID`** | **Identity, Auth & Multi-Tenancy**: RS256 JWKS authentication, OAuth, role-based Cube access control, and organization tenancy. | Next.js `middleware.ts` stateless token verification when `AUTH_MODE=deskid`. |
| **`capsule`** | **Local Atomic Fact Memory**: Stores facts as Git-traceable Markdown files with SQLite FTS5 index. | Mounted in `data/computer/notes/` for sub-millisecond local recall without heavy vector databases. |
| **`tracelens`** | **Agent Observability & Cost Tracking**: Tracks token consumption, latency per tool step, and costs. | Integrated in `lib/cubes/runtime.ts` via the `tracelens-ai` npm SDK. |
| **`keymint`** | **Zero-Trust API Key Gateway**: Protects master provider keys, enforces budgets, and rate-limits agents. | Kubes points `OPENAI_BASE_URL` to KeyMint Go proxy (`http://localhost:8080/v1`). |
| **`kubemind`** | **Enterprise Governance & Control Plane**: Zero-egress PII masking (ONNX BERT NER), Sentinel audit ledger. | Enterprise mode backend via `@kubemind/sdk` and native Model Context Protocol (MCP) server. |

## Limits that are on purpose

- Money is not financial advice. Body is not medical care. Calm is not therapy. Job hunt does not invent employers or salaries. Work does not invent legal rights.
- In default standalone mode (`AUTH_MODE=none`), no sign-in or multi-tenancy is active; enterprise mode enables DeskID authentication. No voice, no image generation in core.
- No control of your real desktop, and no listener on your keyboard.
- No chained handoff, and Maestro cannot write another Cube's files.
- Schedules do not use the system crontab. They die when the Next process dies.
- The jail is not a container.

