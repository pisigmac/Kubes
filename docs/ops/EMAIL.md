# Operational Runbook: Email Notifications & Digest Delivery

## Delivery Channels & Providers

Kubes supports scheduled executive digests via email using standard SMTP or modern transactional API providers (Resend, SendGrid, Amazon SES).

### Configuration Options (`config/digest.json`)
```json
{
  "channels": {
    "desktop": true,
    "file": true,
    "webhook": true,
    "email": false
  },
  "webhookUrl": "https://hooks.slack.com/services/...",
  "emailRecipient": "executive@example.com",
  "minLevel": "info"
}
```

---

## Email Template Structure

- **Subject Line**: `[Kubes Digest] ✅ Morning Specialist Intelligence Briefing`
- **Header**: Organization branding and execution timestamp.
- **Body**: Bulleted executive outcome highlights per active scheduled task.
- **Footer**: Link to web canvas and unsubscribe preferences.
