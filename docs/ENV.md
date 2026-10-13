# Environment Variable Dictionary

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AUTH_MODE` | `string` | `none` | Authentication mode: `none` (single-user desktop mode) or `deskid` (enterprise multi-tenant cryptographic verification). |
| `DESKID_JWKS_URL` | `string` | `http://127.0.0.1:8090/.well-known/jwks.json` | Remote JWKS URL endpoint for verifying DeskID tokens. |
| `DESKID_PUBLIC_KEY` | `string` | `(empty)` | JSON string representation of JWK or PEM public key for direct offline cryptographic validation. |
| `DESKID_ISSUER` | `string` | `(optional)` | Expected JWT issuer claim (`iss`). |
| `DESKID_AUDIENCE` | `string` | `kubes` | Expected JWT audience claim (`aud`). |
| `AGENT_CORE_URL` | `string` | `http://127.0.0.1:8000` | Base URL for the Python Agent Core service. |
| `OPENAI_API_KEY` | `string` | `(empty)` | API key for OpenAI LLM inference. |
| `OPENROUTER_API_KEY` | `string` | `(empty)` | API key for OpenRouter multi-model gateway. |
| `ANTHROPIC_API_KEY` | `string` | `(empty)` | API key for Anthropic Claude inference. |
| `GEMINI_API_KEY` | `string` | `(empty)` | API key for Google Gemini models. |
| `OLLAMA_BASE_URL` | `string` | `http://127.0.0.1:11434` | Base URL for local Ollama instances. |
| `CUBES_CHROME` | `string` | `/usr/bin/google-chrome` | Path to Google Chrome or Chromium binary for headless browser automation. |
| `PORT` | `number` | `3000` | Port for the Next.js Web server. |
| `DIGEST_WEBHOOK_URL` | `string` | `(empty)` | Default webhook endpoint for autonomous executive digest notifications. |
| `DIGEST_EMAIL_TO` | `string` | `(empty)` | Recipient address for scheduled task email summaries. |
