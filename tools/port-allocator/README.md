# Port Allocator (`port-alloc` / `port-status`)

**Universal Dynamic Port Allocator and Service Registry for Multi-Product & Multi-Agent Workspaces.**

---

## 🚀 Overview

When building multiple microservices, Next.js applications, FastAPI backends, and AI agent orchestrators on the same machine, hardcoding port numbers leads to constant `EADDRINUSE` port collision errors.

**Port Allocator** provides a unified global registry across all projects:
1. **Dynamic Port Discovery & Reservation**: Checks if preferred ports (e.g. `3000`, `8000`) are free. If occupied, it automatically reserves and leases the next available open port.
2. **Automatic Stale PID Harvesting**: Whenever a service terminates or crashes, its port lease is immediately reclaimed.
3. **Cross-Language Support**: Standalone CLI (Python 3 standard library with zero third-party dependencies) + TypeScript/Node.js client bindings.
4. **Shared State**: Atomic persistent registry stored at `~/.local/share/port-registry/ports.json`.

---

## 📦 Installation

To install globally into `~/.local/bin`:

```bash
bash tools/port-allocator/install.sh
```

Or install in editable Python mode:

```bash
pip install -e tools/port-allocator
```

---

## 🛠 CLI Usage

### 1. Allocate a Port
```bash
# Allocate preferred port 3000, or next free port
PORT=$(port-alloc allocate --service my-app --preferred 3000)

# Allocate within a specific port range
PORT=$(port-alloc allocate --service worker --preferred 8000 --range 8000-8050)
```

### 2. View Active Port Dashboard
```bash
port-status
# or
port-alloc list
```

Output:
```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 GLOBAL PORT REGISTRY DASHBOARD
📁 Registry File: ~/.local/share/port-registry/ports.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVICE                PORT     PID      STATUS       URL
───────────────────────────────────────────────────────────────────────────
kubes-web              3000     10801    🟢 Active     http://127.0.0.1:3000
kubes-agent-core       8000     10802    🟢 Active     http://127.0.0.1:8000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3. Query Service Info
```bash
port-alloc get kubes-web --field port
port-alloc get kubes-web --field url
port-alloc get kubes-web --field all
```

### 4. Release a Port
```bash
port-alloc release my-app
```

### 5. Check If Port is Free
```bash
port-alloc check 3000
```

---

## 💻 TypeScript / Node.js SDK

```typescript
import { allocatePort, getService, releasePort } from "./tools/port-allocator/ts/client";

// Allocate dynamic port
const port = allocatePort({
  service: "my-node-service",
  preferred: 3000,
});

console.log(`Starting service on port ${port}`);

// Query service info
const info = getService("my-node-service");

// Release port on shutdown
process.on("SIGTERM", () => {
  releasePort("my-node-service");
});
```

---

## 🐍 Python SDK

```python
import port_alloc

port = port_alloc.allocate_port("my-fastapi-service", preferred=8000)
print(f"Allocated port: {port}")

services = port_alloc.list_services()
port_alloc.release_port("my-fastapi-service")
```

---

## 🧪 Testing

```bash
# Run Python tests
cd tools/port-allocator && uv run --with pytest pytest tests/

# Run TypeScript tests
node --experimental-strip-types --test tools/port-allocator/tests/test_ts_client.test.ts
```
