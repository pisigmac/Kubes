# Provider Credential Service — Implementation Specification

**Status:** Approved for implementation; implementation in progress.
**Decision basis:** Personal credentials are tenant- and principal-owned; see the host repository's ADR-014 for the initial use case.
**Scope:** A separately deployable credential-management microservice. It must not depend on a particular application, identity provider, or deployment. Kubes is the first example client; KeyMint or another application can integrate through the same versioned HTTP/OpenAPI contract.

## 1. Goals

1. Let an authenticated user add, verify, select, replace, and remove their own AI-provider credentials.
2. Scope every credential and preference to a generic authenticated principal and tenant, derived from configurable identity claims (for example, OIDC `sub` and a tenant claim).
3. Persist settings on the server so they are available on the user's other authenticated devices.
4. Keep provider key values out of browser storage, client-to-application request payloads, API responses after save, logs, analytics, and audit records.
5. Keep the service independent of Kubes, DeskID, KeyMint, and any other product. Integrators use documented HTTP/OpenAPI contracts and standards-based identity and service authentication.
6. Preserve storage and provider adapters so deployments can use a local encrypted store or an external vault/gateway without changing the public contract.

## 2. Non-goals for the first implementation

- Organization-shared credentials or administrator-managed provider keys.
- Admin policy enforcement (provider allow-list, mandatory gateway, or restrictions on personal keys). The design must leave a policy extension point but must not imply these controls already exist.
- Replacing an integrating application's authentication or provider/model registry.
- Arbitrary user-supplied provider endpoints or credential sharing across principals.
- Automatically importing browser keys without user awareness.

## 3. Product and security invariants

- A credential belongs to exactly one `(tenant_id, principal_id, provider_id)` tuple. The caller cannot choose or override tenant/principal ownership fields; they come from a cryptographically verified identity token.
- Missing, malformed, expired, wrong-audience, wrong-issuer, or unscoped identity fails closed. Never fall back to a default user, default organization, process-global credential, or another user's credential.
- An organization administrator is not authorized to read a user's personal credential. Role claims do not grant access to another user's secret.
- The browser submits a key only during create/replace or one-time migration. The service never returns key material or decryptable ciphertext to the browser.
- Only the service's authenticated backend integration may resolve a credential for provider use. Every resolution is scoped to the verified user, organization, and provider.
- Secrets are encrypted before durable storage. Encryption keys are provided outside the database and versioned for rotation. Plaintext exists only transiently in process memory and on the outbound provider request path.
- Do not log request bodies, authorization headers, provider keys, ciphertext, or raw upstream error bodies that may echo sensitive data.
- Provider endpoint URLs must come from a trusted provider registry/configuration. Arbitrary user-supplied base URLs are excluded from the first release to avoid turning credential testing into an SSRF primitive.

## 4. Proposed service boundary and runtime

Create `services/provider-credentials/` as an independent Go module and executable service. The service must not import Kubes or KeyMint packages, depend on their databases, or require either product to run.

The service owns its persistence in PostgreSQL from the first release. Define a `CredentialRepository` interface so persistence implementation details remain behind the service boundary. Never share an integrating application's database or migration lifecycle.

The service listens only on a private service network by default. Browser clients reach it through their application backend. Production service-to-service traffic must use TLS and standard client authentication; local development may use a rotatable shared client token separate from end-user authentication.

### Suggested layout

```text
services/provider-credentials/
├── go.mod
├── cmd/server/main.go
├── internal/
│   ├── api/                 # HTTP handlers, middleware, OpenAPI contract
│   ├── auth/                # JWT/JWKS validation and claim mapping
│   ├── credentials/         # use cases, ownership checks, status model
│   ├── crypto/              # encryption/key-provider interfaces
│   ├── providers/           # trusted provider definitions and connectivity checks
│   └── store/               # repository interface and PostgreSQL migrations
├── openapi.yaml
├── Dockerfile
└── README.md
```

Exact package names may change during implementation, but the HTTP contract and separation between auth, storage, encryption, and provider adapters must remain explicit.

## 5. Identity and authorization contract (identity-provider agnostic)

The service independently verifies signed JWT access tokens using configured JWKS URL, issuer, and audience. Subject and tenant claim names are configurable; recommended defaults are OIDC `sub` and a deployment-configured tenant claim. Do not hardcode `org_id`, `user_id`, DeskID, Kubes, or any identity vendor into core storage or authorization logic. Validate signature, issuer, audience, expiry, and required claims; reject missing or empty principal/tenant values.

For each request, establish an immutable identity context containing `principal_id`, `tenant_id`, issuer, and granted scopes. Normalize external claim names at the auth adapter boundary. Ignore principal/tenant identifiers in JSON, query parameters, and headers for ownership decisions.

The initial integration pattern is an application backend forwarding the user's verifiable access token and authenticating separately with a service-client credential. The service scopes every operation to the principal and tenant claims in the validated user token. Application route handlers enforce their own viewer/editor roles before making service calls; organization administrator roles never override personal ownership. Client credentials stay on the backend and are not product-specific to the service contract.

Support OIDC/JWKS and OAuth 2.0 conventions with configurable claim mapping, issuer/audience, scopes, and client authentication. Identity-provider-specific mapping belongs in configuration or an adapter module, never in core credential/storage packages.

## 6. Credential data and encryption

### Logical records

Credential metadata should include:

- opaque credential ID;
- tenant ID and principal ID;
- provider ID;
- encrypted key material (never serialized by public API handlers);
- encryption key version / algorithm metadata;
- status: `unverified`, `verified`, or `disabled`;
- safe display metadata (for example, provider name and optional last four characters only if explicitly approved; never return a prefix that could reveal the key);
- created, updated, and last-verified timestamps.

Provider selection is a separate non-secret preference scoped by `(tenant_id, principal_id)`, containing provider ID and optional model ID. Selection must reference an existing usable credential or a configured keyless provider.

### Encryption requirements

- Use authenticated encryption (AES-256-GCM or an equally reviewed AEAD implementation) with unique nonces and associated data binding ciphertext to tenant, principal, provider, and credential ID.
- Keep the encryption key outside PostgreSQL and source control. Load an externally supplied 32-byte master key from deployment secrets; validate configuration at startup and fail closed if unavailable.
- Store an explicit encryption key version with each record. Support a documented rotation procedure before production use.
- Define a `SecretProtector` interface and use the externally supplied master key in the first release; external vault/KMS implementations can be added behind the interface.
- Do not claim HSM/KMS protection unless the selected backend actually implements it and has been verified.
- Clear transient byte buffers on a best-effort basis after use. Do not overstate guarantees against runtime copies or garbage-collected strings.

### PostgreSQL schema outline

Use service-owned PostgreSQL migrations creating a credentials table with a composite uniqueness constraint on `(tenant_id, principal_id, provider_id)` and an index on `(tenant_id, principal_id)`. Add a separate provider-preferences table keyed by `(tenant_id, principal_id)`. Do not expose a raw database row as an API response. Store only ciphertext, never plaintext.

## 7. Versioned HTTP API

All routes are under `/v1`. The OpenAPI document is the canonical contract. User routes require a cryptographically verified access token and trusted backend client authentication. Route naming and error shapes must not assume a particular client or identity provider.

| Method and path | Purpose | Response secret policy |
|---|---|---|
| `GET /health` | Liveness | No auth; no dependency or secret details |
| `GET /ready` | Readiness for identity config and store | No secret/config values |
| `GET /v1/me/providers` | List configured provider metadata and user's selected provider/model | Metadata only; no key or ciphertext |
| `PUT /v1/me/providers/{providerId}/credential` | Create or replace the caller's provider key | Returns saved status and safe metadata only |
| `POST /v1/me/providers/{providerId}/test` | Test a supplied unsaved key or saved credential | Returns success/failure category, latency, and safe model metadata only |
| `DELETE /v1/me/providers/{providerId}/credential` | Remove the caller's credential | No key material |
| `PUT /v1/me/provider-selection` | Select provider and optional model | Non-secret selection only |
| `POST /v1/proxy/{providerId}/chat/completions` | An authorized integration streams an OpenAI-compatible request through the service to the selected provider | Credential remains inside this service and is never returned |

All mutations are idempotent where practical, size-limited, rate-limited, and protected from CSRF when cookie-based auth is used. Prefer bearer tokens for service calls. Responses use `Cache-Control: no-store` where they contain sensitive or account-specific state. Errors use stable machine-readable codes and sanitized messages.

### Provider proxy safeguards

- Require both client authentication and a valid user token; validate principal/tenant claims independently.
- Resolve only the active provider credential for the exact authenticated `(tenant_id, principal_id)` tuple.
- Do not accept an arbitrary credential ID or tenant/principal scope from the request body.
- Inject the decrypted credential only into the outbound provider request. Never return it to the integrating backend or browser.
- Support streaming, cancellation, bounded request/response sizes, sanitized errors, and provider-specific auth headers through trusted provider adapters.
- Record a redacted audit event (principal, provider, timestamp, result category); never record secret values.
- Set short timeouts and prevent response caching, retries that duplicate credential exposure, and body logging.

## 8. Provider verification behavior

Provider testing must prove chat-completion capability, not only `/models` access. Use a small, bounded, non-streaming request with a minimal prompt and low output token limit to a selected or documented safe model. A provider adapter defines the correct protocol and endpoint. Do not silently send an actual user prompt during “Test”.

Return clear categories such as `invalid_credential`, `quota_or_billing`, `provider_unavailable`, `unsupported_model`, and `timeout`; sanitize raw provider responses. Persist `verified` only after the test succeeds. A key change resets verification status.

## 9. Example integration: Kubes with DeskID

This section is an integration example, not a dependency of the credential service. Kubes remains the browser-facing application and owner of its provider/model registry. Its server-side adapter maps verified DeskID subject and `org_id` claims to the service's configured principal and tenant claims. The credential service itself knows neither DeskID nor Kubes.

1. Add configuration for the internal service URL and service identity. Validate it at startup when credential-service mode is enabled.
2. Add a server-side client adapter in Kubes that sends the verifiable user access token plus standard client authentication, applies strict timeouts, and maps stable service error codes to user-facing errors.
3. Refactor `app/api/providers/route.ts` to return metadata from the service and proxy save/test/delete/selection operations. Never return a key.
4. Refactor `components/provider-modal.tsx` to remove provider-key and verification values from localStorage. Keep only non-secret transient UI state. Add configured/verified/active distinctions and replace/remove flows.
5. Refactor chat and swarm requests so browser payloads contain no provider key. Route model requests through the authenticated credential-service proxy rather than process-global provider state.
6. Ensure specialist handoff and swarm execution reuse the initiating authenticated user's provider selection without passing credentials through client-visible stream events or logs.
7. Update `docker-compose.yml`, startup/status/doctor scripts, environment docs, API docs/OpenAPI, and service runbook for local development and production operation.
8. Keep integration behind a Kubes adapter so another conforming service or future KeyMint-backed implementation can replace it without rewriting UI/runtime code.

The host application's identity adapter maps its verified identity-provider claims to the service's configured principal/tenant claims. For the initial deployment, Kubes maps DeskID `sub` to `principal_id` and `org_id` to `tenant_id`. This mapping exists only in Kubes configuration/adapter code; it is not a service default or a requirement for other clients.

Do not use the existing KeyMint provider-key API as a drop-in backend until it implements this contract's tenant/principal ownership, compatible OIDC/JWKS identity mapping, per-principal authorization, and tested secret-resolution controls. This is guidance for the Kubes integration, not a dependency of the service.

Environment variables must be documented with generic names and safe defaults, for example `PROVIDER_CREDENTIALS_URL`, `SERVICE_CLIENT_TOKEN`, `IDENTITY_JWKS_URL`, `IDENTITY_ISSUER`, `IDENTITY_AUDIENCE`, `IDENTITY_SUBJECT_CLAIM`, `IDENTITY_TENANT_CLAIM`, `DATABASE_URL`, and `CREDENTIALS_MASTER_KEY`. Do not include real values in docs, fixtures, logs, or commands.

## 10. Existing browser-key migration

Do not silently upload an existing localStorage key. After the user authenticates, the UI may offer an explicit one-time import for each detected legacy key:

1. Explain that the key will be sent to the authenticated server and stored encrypted for this user and organization.
2. On explicit confirmation, submit it over TLS through the integrating application's server to the credential service.
3. The service verifies it and persists it; responses contain only status/metadata.
4. Delete that specific localStorage key and verification marker only after confirmed save.
5. If import fails or is declined, explain how to retry or remove the legacy key locally. Never log or analytics-capture the key.

## 11. Deployment and operations

- Add a separate container/service and persistent volume for the credential microservice. Keep it on the private compose network and do not publish its port by default.
- Do not publish the service port by default. Host-specific port allocation and service supervision belong to the deployment/integration layer, not this service.
- Provide readiness checks, graceful shutdown, structured redacted logs, backup/restore guidance for ciphertext and key material, and a key-rotation runbook.
- The database backup and encryption-key backup must be coordinated: ciphertext without its matching key version is unrecoverable; a key backup alone does not restore credentials.
- PostgreSQL deployment supports a shared durable store; production should use managed PostgreSQL or an equivalently protected deployment.

## 12. Verification and acceptance criteria

### Functional

- An authenticated principal can save, test, select, replace, and delete a provider credential and sees state after authenticating from another device/browser.
- Chat, specialists, and swarm use the selected credential without the browser sending it on each request.
- Provider setup reports actual chat-test status and useful sanitized errors.
- Existing localStorage credentials are migrated only after explicit consent and removed only after successful save.

### Isolation and security

- Principal A cannot enumerate, resolve, replace, or delete Principal B's credential in the same tenant; test with direct API requests, not only UI.
- The same subject with a mismatched tenant cannot access the other tenant-scoped record.
- Missing or invalid identity, missing principal/tenant claims, wrong issuer/audience, and expired tokens are rejected.
- Admin role does not bypass ownership checks or reveal another user's personal key.
- Public and user-facing APIs never return keys/ciphertext. Chat/swarm browser requests and visible streams contain no key.
- Source, logs, errors, traces, audit events, test output, and persisted plaintext scans reveal no provider secrets.
- Encryption tampering fails authentication; key rotation/version handling is verified; unavailable master key prevents unsafe startup/use.
- SSRF protections reject untrusted base URLs, redirects to disallowed targets, and private-network destinations in provider test paths.
- Resolution rejects a valid user token without an authenticated client identity and required permission.

### Quality and operations

- Unit tests cover auth/claim mapping, crypto, repository scoping, lifecycle, provider protocol adapters, and safe errors.
- Integration tests exercise API + real test database and cross-user/tenant negative cases.
- Client integration tests prove no provider key is included in frontend request bodies and principal-specific resolution is used for model requests.
- Container health/readiness, persistence across restart, backup/restore, and graceful shutdown are verified.
- Run the repository's approved checks and service-specific checks; document any unavailable prerequisite as skipped/incomplete rather than passed.

## 13. Delivery sequence

1. Implement this approved specification with PostgreSQL persistence and provider proxying.
2. Implement the standalone service, migrations, OpenAPI, unit/integration tests, container, and service documentation.
3. Verify the service in isolation with generic OIDC test JWTs, configurable claim mapping, and negative tenant/principal tests.
4. Integrate the first client (Kubes/DeskID) through its adapter and provider proxy behind a feature/config switch; do not yet remove legacy key handling until the new path is proven.
5. Update provider UI and add the explicit legacy-key import flow.
6. Run full service and Kubes verification, then inspect network payloads, logs, and persisted storage for secret leakage.
7. Enable the new mode for local/dev usage; keep rollback and legacy-key removal behavior explicit. Record completed verification and limitations.

Implementation is in progress under the approved choices below.

### Current implementation status (2026-10-21)

Implemented: standalone Go service; PostgreSQL migrations/repository; RS256, ES256/384/512 and EdDSA JWT validation with configurable claims; AES-256-GCM ciphertext bound to tenant, principal, provider and credential ID; metadata/save/test/select/delete routes; OpenAI-compatible streaming proxy; generic Kubes adapter; consent-based browser-key import; provider settings, chat, specialist handoff and swarm integration; private Compose network and PostgreSQL volume.

Still requires verification or follow-up before production use: Compose/PostgreSQL startup and restart persistence; real DeskID JWKS claims and provider traffic; cross-principal and cross-tenant integration tests; encryption-key rotation procedure (the current record version is `1`); scheduled-job identity delegation; audit event persistence; and a production client-authentication/TLS deployment. The current Compose shared client token is a development integration credential. Do not mark these acceptance items passed until verified.

## 14. Approved implementation choices

1. **Persistence:** PostgreSQL from the first release.
2. **Provider traffic:** proxy provider requests through this service; plaintext credentials never leave it.
3. **Encryption:** externally supplied 32-byte master key behind a `SecretProtector` interface; no unimplemented KMS claims.
4. **Legacy keys:** explicit one-time consent-based migration; delete browser copies only after successful save.
5. **Verification:** bounded minimal chat-completion test; it may incur provider charges or rate-limit usage, so users receive clear confirmation before it runs.
