# Operational Runbook: Rate Limits & Quotas

## Rate Limiting Policy

| Tier | Chat Invocations | Tool Calls / Min | Schedules / Tenant | Max Browser Contexts |
| :--- | :--- | :--- | :--- | :--- |
| **Community / Local** | Unlimited | 60 | 10 | 2 |
| **Pro / Team** | 120 / min | 120 | 50 | 5 |
| **Enterprise** | Custom SLA | 500 | Unlimited | 20 |

---

## Headers & Enforcement

When limits are exceeded:
- **HTTP Status**: `429 Too Many Requests`
- **Response Headers**:
  - `Retry-After`: Seconds until quota window resets.
  - `X-RateLimit-Limit`: Request allowance per window.
  - `X-RateLimit-Remaining`: Remaining request allowance.
