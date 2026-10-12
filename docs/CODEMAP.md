# Kubes Code Map & Repository Architecture

## Directory Hierarchy & Component Ownership

```
bots/
├── app/                              # Next.js App Router (Frontend & REST API)
│   ├── api/                          # Backend REST API Routes
│   │   ├── chat/                     # Streaming LLM Chat API
│   │   ├── computer/                 # Computer jail actions, downloads, screenshots
│   │   ├── cubes/                    # Specialist Cube CRUD endpoints
│   │   ├── digests/                  # Executive digest listing & manual dispatches
│   │   ├── memories/                 # Semantic & keyword memory management
│   │   ├── models/                   # Live AI model listing
│   │   ├── providers/                # Provider diagnostics & connection tests
│   │   ├── schedules/                # Scheduled autonomous background tasks
│   │   └── threads/                  # Conversation threads & message history
│   ├── globals.css                   # Global Tailwind CSS styles
│   ├── layout.tsx                    # Root HTML layout & font configuration
│   └── page.tsx                      # Primary Single-Page Application container
├── components/                       # React 19 Client Components
│   ├── artifact-canvas.tsx           # Interactive Markdown / Mermaid / Code Canvas
│   ├── cube-editor.tsx               # Specialist Cube configuration modal
│   ├── cubes-app.tsx                 # Core App view state & sidebar navigation
│   ├── provider-modal.tsx            # AI Provider configuration & test dialog
│   └── transcript.tsx                # Real-time chat & tool execution stream
├── config/                           # Application Configurations
│   └── digest.json                   # Digest notification channel preferences
├── data/                             # Persistent Storage (SQLite, Logs, Workspaces)
│   ├── computer/orgs/<orgId>/        # Tenant-isolated filesystems & browser profiles
│   ├── digests/                      # Daily executive digest markdown archives
│   ├── logs/                         # Multi-process service logs
│   └── cubes.db                      # Primary SQLite database (WAL mode)
├── docs/                             # Engineering, Operational & GTM Documentation
│   └── ops/                          # Operational runbooks & production guidelines
├── lib/                              # Core Platform Libraries & Subsystems
│   ├── ai/                           # AI SDK providers, models, and fallback routing
│   ├── auth/                         # DeskID cryptographic JWT/JWKS verification & RBAC
│   ├── computer/                     # Jail isolation, sandbox drivers, browser, cron, digests
│   ├── cubes/                        # Cube store, thread persistence, runtime orchestration
│   ├── memory/                       # Keyword-scored memory store & retrieval
│   └── db.ts                         # SQLite connection pool, schema migrations & seeding
├── scripts/                          # Standard Operational Scripts
│   ├── start_all.sh                  # Starts all stack services with port allocation
│   ├── stop_all.sh                   # Graceful process and container shutdown
│   ├── restart_all.sh                # Clean restart utility
│   ├── status.sh                     # Service health & global port dashboard
│   ├── logs.sh                       # Multi-service log viewer & streamer
│   ├── doctor.sh                     # Environment & toolchain diagnostic checker
│   ├── seed_data.sh                  # Multi-tenant demo dataset populator
│   └── scheduler.ts                  # Autonomous cron scheduler runner
├── tools/                            # Developer Tooling & CLI Utilities
│   └── port-allocator/               # Python CLI for dynamic non-colliding port allocation
├── Makefile                          # Standardized operational command targets
├── package.json                      # Node dependencies & package scripts
└── pnpm-lock.yaml                    # PNPM deterministic dependency lockfile
```
