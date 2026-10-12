# Product Telemetry & Business Analytics

## Key Performance Indicators (KPIs)

1. **Daily Active Specialists (DAS)**: Number of unique Cube pods executing tasks or chat turns per day.
2. **Scheduled Sweep Success Rate**: Percentage of scheduled cron tasks completed with status `ok` vs `error`.
3. **Multi-Step Tool Depth**: Average number of computer/browser tool calls executed per specialist interaction.
4. **Digest Engagement Rate**: Clicks / views on executive digest summaries across email, webhook, and desktop channels.

---

## Event Tracking Taxonomy

| Event Name | Trigger | Properties |
| :--- | :--- | :--- |
| `cube_created` | User saves new Cube | `cube_slug`, `model`, `org_id` |
| `thread_started` | User initiates chat | `cube_id`, `org_id` |
| `tool_executed` | Agent executes tool | `tool_name`, `duration_ms`, `exit_code` |
| `schedule_triggered` | Cron daemon runs task | `schedule_id`, `cube_id`, `status` |
| `digest_dispatched` | Summary sent to channels | `channels`, `digest_id`, `status` |
