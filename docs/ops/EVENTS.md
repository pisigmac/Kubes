# Operational Runbook: Scheduled Events & Digest Pipeline

## Autonomous Cron Pipeline

The Kubes scheduler daemon runs continuously every 30 seconds (`tick()` interval).

```mermaid
sequenceDiagram
    participant Daemon as Scheduler Daemon
    participant DB as SQLite DB
    participant Cube as Specialist Pod
    participant Digest as Digest Engine
    participant Channel as Webhook / File Log

    Daemon->>DB: Query due schedules (enabled=1, next_run_at <= NOW)
    DB-->>Daemon: Return due ScheduleRow
    Daemon->>DB: Atomically claim row (update last_status='running')
    Daemon->>Cube: Execute specialist instruction
    Cube-->>Daemon: Return generated output
    Daemon->>DB: Update next_run_at & last_status='ok'
    Daemon->>Digest: Generate executive summary
    Digest->>Channel: Dispatch webhook & append to data/digests/digest-YYYY-MM-DD.md
```

---

## Event Payload Formats

### Webhook Digest Payload
```json
{
  "text": "### ✅ [Acme Corp Finance] Task Completed\n\n• **Instruction**: Daily liquidity check\n• **Outcome**: Cash balance verified: $1.2M",
  "digestId": "e305e7c8-8888-4231-9f2b-8a21133a8c12",
  "cubeSlug": "finance",
  "title": "✅ [Acme Corp Finance] Task Completed",
  "summary": "• **Outcome**: Cash balance verified: $1.2M",
  "status": "ok",
  "timestamp": "2026-10-06T09:00:00.000Z"
}
```
