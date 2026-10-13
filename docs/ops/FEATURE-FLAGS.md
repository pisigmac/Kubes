# Operational Runbook: Feature Flags & Toggles

| Flag Name | Environment Variable | Options | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication Engine** | `AUTH_MODE` | `none`, `deskid` | `none` | Enables cryptographic JWT/JWKS token gating and enterprise tenant isolation. |
| **Sandbox Driver** | `CUBES_SANDBOX_DRIVER` | `auto`, `bwrap`, `direct` | `auto` | Forces a specific sandbox execution driver for bash tool calls. |
| **Chrome Binary Override** | `CUBES_CHROME` | Filepath | `/usr/bin/google-chrome` | Specifies custom Chromium executable path. |
| **Live Web Search** | `LIVE_SEARCH_ENABLED` | `true`, `false` | `true` | Toggles autonomous real-time web search tool availability. |
| **Digest Webhook** | `DIGEST_WEBHOOK_URL` | URL string | `(empty)` | Enables automatic external webhook broadcast on scheduled task completion. |
