# Database Schema & Data Models

Kubes utilizes SQLite in **WAL (Write-Ahead Logging)** mode via `better-sqlite3`. All primary entity tables incorporate compound indexes and foreign key relationships enforcing strict multi-tenant isolation.

```mermaid
erDiagram
    CUBES ||--o{ THREADS : contains
    THREADS ||--o{ MESSAGES : stores
    CUBES ||--o{ SCHEDULES : schedules
    CUBES ||--o{ DIGESTS : summarizes

    CUBES {
        string id PK
        string slug UK
        string name
        string pain_point
        string instructions
        string model
        int is_maestro
        string seed_key UK
        string org_id
        string user_id
        string created_at
        string updated_at
    }

    THREADS {
        string id PK
        string cube_id FK
        string title
        string org_id
        string user_id
        string created_at
        string updated_at
    }

    MESSAGES {
        string id PK
        string thread_id FK
        int position
        string role
        string body
        string org_id
        string user_id
    }

    SCHEDULES {
        string id PK
        string cube_id FK
        string cron
        string instruction
        int enabled
        string last_run_at
        string next_run_at
        string last_status
        string last_error
        string thread_id FK
        string org_id
        string user_id
        string created_at
        string updated_at
    }

    COMMAND_LOGS {
        string id PK
        string slug
        string command
        int exit_code
        string stdout
        string stderr
        string driver
        string org_id
        string user_id
        string created_at
    }

    MEMORIES {
        string id PK
        string cube_slug
        string category
        string content
        string keywords
        string org_id
        string user_id
        string created_at
        string updated_at
    }

    DIGESTS {
        string id PK
        string cube_id
        string cube_slug
        string title
        string summary
        string status
        string channels
        string details
        string org_id
        string user_id
        string created_at
    }
```

---

## Performance Indexes

- `threads_cube_updated`: `(cube_id, updated_at DESC)`
- `threads_org_updated`: `(org_id, updated_at DESC)`
- `messages_thread_position`: `(thread_id, position)`
- `schedules_org`: `(org_id, next_run_at ASC)`
- `command_logs_slug_created`: `(slug, created_at DESC)`
- `command_logs_org_created`: `(org_id, created_at DESC)`
- `memories_slug_category`: `(cube_slug, category)`
- `memories_org_category`: `(org_id, category)`
- `digests_created`: `(created_at DESC)`
- `digests_org_created`: `(org_id, created_at DESC)`
- `digests_cube`: `(cube_id, created_at DESC)`
