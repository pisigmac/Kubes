import os
import socket
import tempfile
from pathlib import Path
import pytest

from port_alloc.core import (
    allocate_port,
    get_service,
    release_port,
    list_services,
    is_port_free,
    read_registry,
    write_registry,
)


@pytest.fixture
def temp_registry(monkeypatch, tmp_path):
    reg_file = tmp_path / "ports.json"
    monkeypatch.setenv("PORT_REGISTRY_PATH", str(reg_file))
    return reg_file


def test_is_port_free():
    # Bind a temporary socket to check
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        assert is_port_free(port) is False


def test_allocate_and_get(temp_registry):
    port = allocate_port("svc-a", preferred=4100, pid=os.getpid())
    assert port == 4100

    svc = get_service("svc-a")
    assert svc is not None
    assert svc["port"] == 4100
    assert svc["pid"] == os.getpid()


def test_allocate_collision_resolution(temp_registry):
    port1 = allocate_port("svc-a", preferred=4200, pid=os.getpid())
    assert port1 == 4200

    # Second service wanting the same preferred port should get 4201 or next free port
    port2 = allocate_port("svc-b", preferred=4200, pid=os.getpid())
    assert port2 != 4200
    assert port2 >= 4201


def test_release_service(temp_registry):
    allocate_port("svc-c", preferred=4300, pid=os.getpid())
    assert get_service("svc-c") is not None

    released = release_port("svc-c")
    assert released is True
    assert get_service("svc-c") is None


def test_dead_pid_reaping(temp_registry):
    # Register with a fake dead PID
    dead_pid = 9999999
    allocate_port("svc-dead", preferred=4400, pid=dead_pid)

    # Calling read_registry or list_services should reap dead_pid
    services = list_services()
    assert "svc-dead" not in services
