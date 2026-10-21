# Provider Credentials Service

Independent Go service for per-principal provider credentials. It persists only AES-256-GCM ciphertext in its own PostgreSQL database and proxies OpenAI-compatible chat requests so provider secrets never return to an integrating application.

## Configuration

Required environment variables:

- `DATABASE_URL`: service-owned PostgreSQL connection string.
- `IDENTITY_JWKS_URL`, `IDENTITY_ISSUER`, `IDENTITY_AUDIENCE`: identity token validation settings. The verifier accepts RS256/384/512, ES256/384/512, and EdDSA JWTs and requires expiry, issuer, audience, subject, and configured tenant claims.
- `IDENTITY_SUBJECT_CLAIM` (default `sub`) and `IDENTITY_TENANT_CLAIM` (default `tenant_id`).
- `SERVICE_CLIENT_TOKEN`: independent backend service authentication token.
- `CREDENTIALS_MASTER_KEY`: base64 encoded 32-byte encryption key. Keep it outside PostgreSQL and source control.
- `PROVIDER_REGISTRY_FILE` or `PROVIDER_REGISTRY_JSON` (optional): trusted provider definitions. URLs are server configuration and cannot be provided by a caller. Each endpoint must implement the OpenAI chat-completions protocol.
- `ALLOW_HTTP_PROVIDER_URLS` (optional, development only; default false), and `LISTEN_ADDR` (default `:8081`).

The service migrates its schema on startup. Configure a durable database volume and secure backups for both PostgreSQL ciphertext and encryption key material. Use coordinated key rotation and PostgreSQL backup procedures before production deployment.

## API

All `/v1` routes require both `Authorization: Bearer <user access token>` and `X-Service-Client-Token: Bearer <backend token>`. See `openapi.yaml`. Ownership always comes from validated token claims. Provider secrets are accepted only on save and test/proxy operations; responses expose status only.

- `GET /v1/me/providers`
- `PUT /v1/me/providers/{providerId}/credential` with `{ "api_key": "..." }`
- `POST /v1/me/providers/{providerId}/test`
- `DELETE /v1/me/providers/{providerId}/credential`
- `PUT /v1/me/provider-selection` with `{ "provider_id": "...", "model_id": "..." }`
- `POST /v1/proxy/{providerId}/chat/completions`

The proxy uses trusted registry URLs, rejects redirects, enforces bounded input/output, streams response bodies, and requires a verified credential. The verification chat sends a fixed minimal prompt to the configured test model and may incur provider charges. Tests are limited to once per principal/provider every 30 seconds per service instance.

## Kubes integration

Kubes is one client, not a dependency. Its adapter maps validated DeskID `sub` and `org_id` into this service's configured principal and tenant claim names and forwards the user token plus backend token. Keep this adapter behind `PROVIDER_CREDENTIALS_URL` configuration. The web UI must offer explicit one-time consent before importing any legacy browser key and remove that local key only after the service confirms persistence.

## Local verification

From the repository root, bring up the isolated database and service with Docker Compose. The database and service must remain on the private compose network; do not publish either port. Supply development-only credentials through an ignored local environment file. Never paste real provider keys, JWTs, client tokens, or encryption keys into logs or chat.
