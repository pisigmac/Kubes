"""
Port Allocator: Universal Dynamic Port Allocator and Cross-Product Registry.
Zero-dependency, thread-safe, and multi-process safe port coordinator.
"""

from .core import (
    allocate_port,
    get_service,
    release_port,
    list_services,
    is_port_free,
    get_registry_path,
    is_pid_alive,
)

__version__ = "0.1.0"
__all__ = [
    "allocate_port",
    "get_service",
    "release_port",
    "list_services",
    "is_port_free",
    "get_registry_path",
    "is_pid_alive",
]
