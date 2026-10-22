# Deployment & Infrastructure Guide

## Deployment Modes

Kubes can be deployed in two primary operational topologies:

### 1. Local / Bare-Metal Multi-Process Stack
Ideal for single-developer, air-gapped desktop, or edge server environments.

```bash
# Verify environment dependencies
make doctor

# Start all companion services and Kubes stack
make start

# Check active health dashboard & port bindings
make status

# Stream aggregate logs
make logs
```

### 2. Enterprise Docker Compose Stack
Ideal for multi-tenant internal deployments and team collaboration.

```bash
# Start Docker stack in detached mode
./scripts/start_all.sh --docker

# Stop Docker stack
./scripts/stop_all.sh --docker
```

Kubes prefers host ports `23000` (web) and `28000` (agent core). The startup script asks `port-alloc` to reserve these ports and uses the allocator's chosen ports in Docker Compose. Use the startup script instead of invoking `docker compose up` directly when you want allocator-managed ports. Container-internal ports remain `3000` and `8000`.

---

## Production Readiness Checklist

1. **Identity & Auth**: Set `AUTH_MODE=deskid` and point `DESKID_JWKS_URL` to your production IAM cluster.
2. **Storage Volume**: Mount a persistent SSD volume at `/workspace/data` for SQLite WAL durability.
3. **Sandbox Isolation**: Install Linux `bubblewrap` (`bwrap`) on host for kernel-isolated command execution.
4. **Browser Dependencies**: Ensure `google-chrome` or `chromium-browser` is installed in container images with required font and rendering packages.
5. **Reverse Proxy / TLS**: Deploy NGINX or Caddy reverse proxy terminating TLS on port 443 with WebSocket streaming enabled for `/api/chat`.
