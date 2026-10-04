"""
Core implementation of dynamic port allocation and registry persistence.
"""

from __future__ import annotations
import json
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def get_registry_path() -> Path:
    """Returns path to global registry file (respecting PORT_REGISTRY_PATH override)."""
    override = os.getenv("PORT_REGISTRY_PATH")
    if override:
        path = Path(override).expanduser().resolve()
    else:
        path = Path.home() / ".local" / "share" / "port-registry" / "ports.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def is_pid_alive(pid: int) -> bool:
    """Check if process with given PID is actively running."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def is_port_free(port: int, host: str = "127.0.0.1") -> bool:
    """Test if a TCP port is currently free to bind on host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
        except OSError:
            return False


def read_registry() -> dict:
    """Read registry data and automatically reap deceased PIDs."""
    path = get_registry_path()
    if not path.exists():
        return {"version": "1.0", "services": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            services = data.get("services", {})
            active = {}
            for k, v in services.items():
                pid = v.get("pid", 0)
                if is_pid_alive(pid):
                    active[k] = v
            data["services"] = active
            return data
    except Exception:
        return {"version": "1.0", "services": {}}


def write_registry(data: dict) -> None:
    """Atomically write registry data to disk."""
    path = get_registry_path()
    tmp_path = path.with_suffix(f".tmp.{os.getpid()}.{time.time_ns()}")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
    except Exception as e:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise e


def allocate_port(
    service: str,
    preferred: int = 3000,
    port_range: Optional[Tuple[int, int]] = None,
    host: str = "127.0.0.1",
    url: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    pid: Optional[int] = None,
) -> int:
    """
    Allocate a free port for a service, register it in the global registry, and return the port.
    """
    registry = read_registry()
    services = registry.get("services", {})

    # Reserved ports from active services (excluding this service itself)
    reserved_ports = {
        v["port"]
        for k, v in services.items()
        if k != service and is_pid_alive(v.get("pid", 0))
    }

    start = port_range[0] if port_range else preferred
    end = port_range[1] if port_range else preferred + 100

    allocated = None

    # Check if this service is already registered with a live PID and free/active port
    existing = services.get(service)
    if existing and is_pid_alive(existing.get("pid", 0)):
        existing_port = existing.get("port")
        if existing_port and existing_port not in reserved_ports:
            return existing_port

    # Try preferred port first if in range
    if preferred not in reserved_ports and is_port_free(preferred, host):
        allocated = preferred
    else:
        # Scan range
        for p in range(start, end + 1):
            if p not in reserved_ports and is_port_free(p, host):
                allocated = p
                break

    if allocated is None:
        raise RuntimeError(f"No free port available for service '{service}' in range {start}-{end}")

    assigned_pid = pid if pid is not None else (os.getppid() if os.getppid() > 1 else os.getpid())

    services[service] = {
        "service": service,
        "port": allocated,
        "host": host,
        "pid": assigned_pid,
        "url": url or f"http://{host}:{allocated}",
        "metadata": metadata or {},
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    registry["services"] = services
    write_registry(registry)

    return allocated


def get_service(service: str) -> Optional[dict]:
    """Fetch service registration if alive."""
    registry = read_registry()
    entry = registry.get("services", {}).get(service)
    if entry and is_pid_alive(entry.get("pid", 0)):
        return entry
    return None


def release_port(service: str) -> bool:
    """Release port allocation for a service."""
    registry = read_registry()
    services = registry.get("services", {})
    if service in services:
        del services[service]
        registry["services"] = services
        write_registry(registry)
        return True
    return False


def list_services() -> dict[str, dict]:
    """List all currently active services."""
    registry = read_registry()
    return registry.get("services", {})
