# Operational Runbook: Data Retention & Compliance

## SQLite WAL & Data Lifecycle

- **Message History**: Retained indefinitely by default; tenants may purge thread history via `DELETE /api/threads/[id]`.
- **Command Logs (`command_logs`)**: Automatically pruned after 90 days.
- **Daily Digest Archives (`data/digests/`)**: Retained for 365 days; archived annually to compressed tarballs.
- **Jail Filesystem Workspaces (`data/computer/orgs/<orgId>/`)**: Persisted during active tenant lifespan; hard-purged upon tenant deletion request.

---

## GDPR / Right to Erasure

To erase an entire organization's data footprint:
```sql
DELETE FROM messages WHERE org_id = 'target-org-id';
DELETE FROM threads WHERE org_id = 'target-org-id';
DELETE FROM schedules WHERE org_id = 'target-org-id';
DELETE FROM memories WHERE org_id = 'target-org-id';
DELETE FROM digests WHERE org_id = 'target-org-id';
DELETE FROM command_logs WHERE org_id = 'target-org-id';
DELETE FROM cubes WHERE org_id = 'target-org-id';
```
And purge the filesystem partition:
```bash
rm -rf data/computer/orgs/<target-org-id>
```
