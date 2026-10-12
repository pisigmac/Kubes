# Operational Runbook: Monitoring & Health Checks

## Health Check Endpoints

| Service | Check URL | Target SLA | Expected Response |
| :--- | :--- | :--- | :--- |
| `kubes-web` | `http://127.0.0.1:3000/api/models` | 99.9% | HTTP 200 / 401 |
| `kubes-agent-core` | `http://127.0.0.1:8000/health` | 99.9% | HTTP 200 `{"status": "ok"}` |
| `deskid` | `http://127.0.0.1:8090/health` | 99.99% | HTTP 200 `{"status": "ok"}` |
| `keymint` | `http://127.0.0.1:8080/health` | 99.99% | HTTP 200 `{"status": "ok"}` |
| `kubemind` | `http://127.0.0.1:9090/health` | 99.9% | HTTP 200 `{"status": "ok"}` |

---

## Metric Telemetry & Alerting Thresholds

- **API p95 Latency**: Alert when $> 800\text{ms}$ for non-streaming endpoints.
- **LLM First-Token Latency (TTFT)**: Alert when $> 2500\text{ms}$.
- **Scheduled Task Failure Rate**: Alert when failure rate $> 5\%$ in a 1-hour window.
- **Chromium Process Leaks**: Alert when active headless browser processes exceed active tenant count.
- **Disk Space**: Alert when `/workspace/data` utilization $> 80\%$.
