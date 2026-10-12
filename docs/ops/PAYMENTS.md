# Operational Runbook: Payments, Billing & Quota Models

## Commercial Tiers & Feature Gates

| Tier | Price | Active Cubes | Cron Schedules | Browser Seats | Support |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Developer / Free** | $0 | 5 | 5 | 1 | Community / Docs |
| **Team** | $49 / mo | 25 | 50 | 5 | Standard Email |
| **Enterprise** | $299 / mo | Unlimited | Unlimited | 20 | Dedicated 24/7 SLA |

---

## Integration Architecture

- **Billing Gateway**: Stripe Customer Portal / Webhooks.
- **Quota Tracking**: In-memory token counters with SQLite persistence.
- **Over-Quota Behavior**: Graceful degradation (chat remains active with rate throttling; scheduled tasks execute at lowered frequency).
