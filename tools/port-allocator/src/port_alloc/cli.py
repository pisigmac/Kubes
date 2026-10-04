"""
Command-line interface for port-alloc and port-status tools.
"""

from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

from .core import (
    allocate_port,
    get_service,
    release_port,
    list_services,
    is_port_free,
    get_registry_path,
    is_pid_alive,
)


def cmd_allocate(args) -> None:
    port_range = None
    if args.range:
        parts = args.range.split("-")
        if len(parts) == 2:
            try:
                port_range = (int(parts[0]), int(parts[1]))
            except ValueError:
                sys.stderr.write(f"Error: Invalid range format '{args.range}'. Expected e.g. 8000-8050\n")
                sys.exit(2)

    meta = {}
    if getattr(args, "meta", None):
        try:
            meta = json.loads(args.meta)
        except Exception:
            meta = {"note": args.meta}

    try:
        port = allocate_port(
            service=args.service,
            preferred=args.preferred,
            port_range=port_range,
            host=args.host,
            url=args.url,
            metadata=meta,
        )
        print(port)
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        sys.exit(1)


def cmd_get(args) -> None:
    entry = get_service(args.service)
    if entry:
        if args.field == "port":
            print(entry.get("port", ""))
        elif args.field == "url":
            print(entry.get("url", ""))
        else:
            print(json.dumps(entry, indent=2))
    else:
        sys.stderr.write(f"Service '{args.service}' not found or inactive.\n")
        sys.exit(1)


def cmd_release(args) -> None:
    released = release_port(args.service)
    if released:
        print(f"Released port for service '{args.service}'")
    else:
        print(f"Service '{args.service}' was not registered")


def cmd_list(args) -> None:
    services = list_services()

    if args and getattr(args, "json", False):
        print(json.dumps({"version": "1.0", "services": services}, indent=2))
        return

    display_path = str(get_registry_path()).replace(str(Path.home()), "~")
    print("━" * 75)
    print("🌐 GLOBAL PORT REGISTRY DASHBOARD")
    print(f"📁 Registry File: {display_path}")
    print("━" * 75)
    print(f"{'SERVICE':<22} {'PORT':<8} {'PID':<8} {'STATUS':<12} {'URL'}")
    print("─" * 75)

    if not services:
        print("  (No active services registered)")
    else:
        for name, entry in sorted(services.items(), key=lambda x: x[1].get("port", 0)):
            pid = entry.get("pid", 0)
            alive = is_pid_alive(pid)
            status = "🟢 Active" if alive else "🔴 Dead"
            port = entry.get("port", 0)
            url = entry.get("url", f"http://{entry.get('host', '127.0.0.1')}:{port}")
            print(f"{name:<22} {port:<8} {pid:<8} {status:<12} {url}")

    print("━" * 75)


def cmd_check(args) -> None:
    free = is_port_free(args.port, args.host)
    if free:
        print(f"Port {args.port} is FREE on {args.host}")
        sys.exit(0)
    else:
        print(f"Port {args.port} is OCCUPIED on {args.host}")
        sys.exit(1)


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="port-alloc",
        description="Global dynamic port registry and allocator for multi-tool development.",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Allocate
    p_alloc = subparsers.add_parser("allocate", help="Allocate a free port for a service")
    p_alloc.add_argument("--service", "-s", required=True, help="Unique service identifier")
    p_alloc.add_argument("--preferred", "-p", type=int, default=3000, help="Preferred port number")
    p_alloc.add_argument("--range", "-r", help="Port range scan (e.g. 8000-8050)")
    p_alloc.add_argument("--host", default="127.0.0.1", help="Host interface (default 127.0.0.1)")
    p_alloc.add_argument("--url", help="Optional health / service URL")
    p_alloc.add_argument("--meta", help="Optional JSON or text metadata")
    p_alloc.set_defaults(func=cmd_allocate)

    # Get
    p_get = subparsers.add_parser("get", help="Get port or URL for a registered service")
    p_get.add_argument("service", help="Service name")
    p_get.add_argument("--field", "-f", choices=["port", "url", "all"], default="port", help="Output field")
    p_get.set_defaults(func=cmd_get)

    # Release
    p_rel = subparsers.add_parser("release", help="Release a service allocation")
    p_rel.add_argument("service", help="Service name to release")
    p_rel.set_defaults(func=cmd_release)

    # List / Status
    p_list = subparsers.add_parser("list", help="List all active registered service ports")
    p_list.add_argument("--json", action="store_true", help="Output raw JSON format")
    p_list.set_defaults(func=cmd_list)

    # Check
    p_check = subparsers.add_parser("check", help="Check if a specific port is free")
    p_check.add_argument("port", type=int, help="Port number")
    p_check.add_argument("--host", default="127.0.0.1", help="Host interface")
    p_check.set_defaults(func=cmd_check)

    return parser


def main() -> None:
    prog_name = Path(sys.argv[0]).name
    if prog_name == "port-status":
        cmd_list(None)
        return

    parser = create_parser()
    args = parser.parse_args()
    if not hasattr(args, "func"):
        cmd_list(None)
    else:
        args.func(args)


def main_status() -> None:
    cmd_list(None)


if __name__ == "__main__":
    main()
