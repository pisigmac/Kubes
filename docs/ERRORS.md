# Standardized Error Code Dictionary

| Error Code | HTTP Status | Description | Remediation |
| :--- | :--- | :--- | :--- |
| `KUBES-AUTH-001` | 401 | Missing authentication header or session cookie in `AUTH_MODE=deskid`. | Include a valid `Authorization: Bearer <token>` or login via DeskID. |
| `KUBES-AUTH-002` | 401 | Cryptographic token signature verification failed or token is expired. | Re-authenticate with DeskID to obtain a fresh token signed by an active JWKS key. |
| `KUBES-AUTH-003` | 401 | Token is missing mandatory `org_id` claim in DeskID enterprise mode. | Ensure DeskID user directory has an assigned organization mapping. |
| `KUBES-RBAC-001` | 403 | User role is insufficient for the requested mutation (e.g. `viewer` role attempting `POST /api/cubes`). | Request `editor` or `admin` permissions for the `kubes` application in DeskID. |
| `KUBES-STORE-001` | 404 | Resource not found or belongs to a different tenant organization. | Verify that the resource ID exists within the authenticated user's organization. |
| `KUBES-STORE-002` | 409 | Cube name produces a slug conflict that could not be automatically resolved. | Choose a distinct, unique name for the Cube. |
| `KUBES-CRON-001` | 400 | Invalid cron pattern or interval frequency less than minimum threshold (5 minutes). | Provide a valid standard 5-field cron expression scheduled for $\ge$ 5 minutes. |
| `KUBES-JAIL-001` | 400 | Path traversal attempt outside of the tenant's workspace boundary. | Use relative workspace paths only; path traversal (`../`) is prohibited. |
| `KUBES-JAIL-002` | 403 | Attempt to connect to private or loopback IP from automated browser tool. | Only public HTTP/HTTPS URLs are allowed for web browsing tools. |
