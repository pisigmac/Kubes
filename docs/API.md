# Kubes REST API Reference

All protected API endpoints require either:
1. `Authorization: Bearer <JWT_TOKEN>` header, or
2. `Cookie: deskid_session=<JWT_TOKEN>`

When `AUTH_MODE=deskid`, unauthenticated requests receive `HTTP 401 Unauthorized`. Insufficient role permissions return `HTTP 403 Forbidden`.

---

## Endpoint Summary

### 1. Cubes (Specialist Pods)
- **`GET /api/cubes`**: Lists all accessible Cubes for the authenticated tenant.
  - *Role Required*: `viewer`
  - *Response*: `{ "cubes": [ Cube ] }`
- **`POST /api/cubes`**: Creates a new custom specialist Cube.
  - *Role Required*: `editor`
  - *Body*: `{ "name": string, "painPoint": string, "instructions": string, "model"?: string }`
  - *Response*: `{ "cube": Cube }` (201 Created)
- **`GET /api/cubes/[id]`**: Retrieves details for a specific Cube.
  - *Role Required*: `viewer`
- **`PATCH /api/cubes/[id]`**: Updates an existing Cube's configuration.
  - *Role Required*: `editor`

### 2. Threads & Chat
- **`GET /api/threads?cubeId=<cubeId>`**: Lists conversation threads for a Cube.
  - *Role Required*: `viewer`
- **`POST /api/threads`**: Creates a new conversation thread.
  - *Role Required*: `editor`
- **`GET /api/threads/[id]`**: Retrieves thread metadata and full message history.
  - *Role Required*: `viewer`
- **`POST /api/chat`**: Initiates a streaming LLM session with specialist orchestration and multi-step tool calls.
  - *Role Required*: `editor`

### 3. Schedules & Background Automation
- **`GET /api/schedules?cubeId=<cubeId>`**: Lists scheduled tasks for a specialist.
  - *Role Required*: `viewer`
- **`POST /api/schedules`**: Creates a new cron-scheduled background task.
  - *Role Required*: `editor`
  - *Body*: `{ "cubeId": string, "cron": string, "instruction": string }`
- **`PATCH /api/schedules/[id]`**: Modifies schedule frequency or instruction.
  - *Role Required*: `editor`
- **`DELETE /api/schedules/[id]`**: Deletes a scheduled task.
  - *Role Required*: `editor`

### 4. Memories & Autonomous Digests
- **`GET /api/memories?cubeSlug=<slug>&q=<search>`**: Semantic & keyword memory search.
  - *Role Required*: `viewer`
- **`POST /api/memories`**: Stores a new memory record.
  - *Role Required*: `editor`
- **`GET /api/digests`**: Lists recent scheduled execution digest logs and configuration.
  - *Role Required*: `viewer`
- **`POST /api/digests`**: Dispatches manual digest notifications or updates notification channel settings.
  - *Role Required*: `editor`

### 5. Computer & Sandbox
- **`POST /api/computer`**: Executes bash commands or reads/writes workspace files in the tenant jail.
  - *Role Required*: `editor`
- **`GET /api/computer/screenshot`**: Streams the current headless browser viewport PNG.
  - *Role Required*: `viewer`
- **`GET /api/computer/download?path=<relative_path>&slug=<slug>`**: Downloads an artifact file securely from the jail workspace.
  - *Role Required*: `viewer`

### 6. Provider Credentials

When `PROVIDER_CREDENTIALS_URL` is configured, `/api/providers` reads user-scoped metadata from the private credential service. Mutations require `editor`; provider credentials are never returned after submission. Chat and swarm requests carry only provider selection metadata and are proxied server-to-server with the user's authenticated token. New keys are sent only for explicit save/verification. Legacy browser keys are migrated only after confirmation.
