"""crtboardctl and crtboardd as real processes, on a free port and a temporary state directory."""

import json
import os
import signal
import socket
import subprocess
import sys
import time

import httpx
import pytest

from crtboard import paths


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def config(tmp_path, repos):
    port = free_port()
    path = tmp_path / "crtboard.yaml"
    path.write_text(f"git-repositories: [{repos['beemu']}]\nport: {port}\n")
    return path, port


def ctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "crtboard.ctl", *args],
        capture_output=True,
        text=True,
        timeout=60,
        env=os.environ,
    )


@pytest.fixture
def started(config):
    path, port = config
    result = ctl("start", "--config", str(path))
    assert result.returncode == 0, result.stderr
    yield path, port
    ctl("stop")


def test_start_status_logs_stop(started):
    path, port = started
    assert f"http://localhost:{port}" in ctl("status").stdout
    body = httpx.get(f"http://localhost:{port}/resources/available").json()
    assert body["gitRepos"][0]["name"] == "beemu"
    assert "listening on" in ctl("logs", "-n", "5").stdout

    stopped = ctl("stop")
    assert "stopped" in stopped.stdout
    assert ctl("status").returncode == 3
    with pytest.raises(httpx.ConnectError):
        httpx.get(f"http://127.0.0.1:{port}/resources/available")


def test_only_one_instance_runs(started, tmp_path):
    path, port = started
    again = ctl("start", "--config", str(path))
    assert again.returncode == 1 and "already running" in again.stdout

    # Even straight through crtboardd, and even on another port.
    other = tmp_path / "other.yaml"
    other.write_text(f"port: {free_port()}\n")
    direct = subprocess.run(
        [sys.executable, "-m", "crtboard.daemon", "--config", str(other)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert direct.returncode == 1 and "already running" in direct.stderr


def test_a_killed_daemon_does_not_block_the_next_start(started):
    path, port = started
    pid = json.loads(paths.pid_file().read_text())["pid"]
    os.kill(pid, signal.SIGKILL)
    deadline = time.monotonic() + 10
    while ctl("status").returncode == 0 and time.monotonic() < deadline:
        time.sleep(0.1)
    restarted = ctl("start", "--config", str(path))
    assert restarted.returncode == 0, restarted.stderr


def test_a_bad_config_is_reported_before_starting(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("port: nope\n")
    result = ctl("start", "--config", str(bad))
    assert result.returncode == 2 and "port" in result.stderr
    assert ctl("status").returncode == 3
