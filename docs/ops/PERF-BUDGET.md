# Operational Runbook: Performance Budgets & Resource Constraints

## Resource Limits & Latency Budgets

| Component | Target Metric | Limit / Budget | Action on Breach |
| :--- | :--- | :--- | :--- |
| **Next.js Client Bundle** | Total Gzipped JS | $< 250\text{ KB}$ | Fail CI build |
| **First Contentful Paint (FCP)** | Client Load | $< 1.2\text{ s}$ | Log warning to Sentry/Grafana |
| **Time to First Byte (TTFB)** | API Endpoints | $< 150\text{ ms}$ | Review SQLite indexes & WAL mode |
| **SQLite Connection Pool** | Busy Timeout | $5000\text{ ms}$ | Log database lock contention error |
| **Chromium Memory Footprint** | Per Process RAM | $< 350\text{ MB}$ | Terminate idle browser context |
| **Task Execution Timeout** | Schedule Run | $120\text{ s}$ | Abort run, update status='error' |
