"""`crtboardctl`: start, stop and inspect crtboardd without a service manager."""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import httpx

from . import paths
from .config import ConfigError, load_config
from .daemon import running_instance

START_TIMEOUT_S = 30
STOP_TIMEOUT_S = 10


def start(config_path: Path, foreground: bool) -> int:
    try:
        config = load_config(config_path)
    except ConfigError as error:
        print(f"crtboardctl: {error}", file=sys.stderr)
        return 2
    running = running_instance()
    if running:
        print(f"crtboardd is already running (pid {running['pid']}, port {running['port']})")
        return 1

    command = [sys.executable, "-m", "crtboard.daemon", "--config", str(config_path)]
    if foreground:
        return subprocess.call([*command, "--foreground"])

    with open(paths.log_file(), "ab") as log, open(os.devnull, "rb") as devnull:
        # A new session detaches it from this terminal, so it outlives the shell.
        child = subprocess.Popen(command, stdin=devnull, stdout=log, stderr=log, start_new_session=True)

    url = f"http://127.0.0.1:{config.port}/resources/available"
    deadline = time.monotonic() + START_TIMEOUT_S
    while time.monotonic() < deadline:
        if child.poll() is not None:
            print(f"crtboardd exited ({child.returncode}); see `crtboardctl logs`", file=sys.stderr)
            return 1
        try:
            httpx.get(url, timeout=START_TIMEOUT_S).raise_for_status()
        except httpx.HTTPError:
            time.sleep(0.2)
            continue
        print(f"crtboardd running on http://localhost:{config.port} (pid {child.pid})")
        return 0
    print("crtboardd did not answer in time; see `crtboardctl logs`", file=sys.stderr)
    return 1


def stop() -> int:
    running = running_instance()
    if not running:
        print("crtboardd is not running")
        return 0
    pid = running["pid"]
    if not pid:
        print("crtboardd holds its lock but its pid file is missing", file=sys.stderr)
        return 1
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + STOP_TIMEOUT_S
    while running_instance() and time.monotonic() < deadline:
        time.sleep(0.1)
    if running_instance():
        os.kill(pid, signal.SIGKILL)
        print(f"crtboardd (pid {pid}) did not stop in {STOP_TIMEOUT_S}s and was killed")
    else:
        print(f"crtboardd (pid {pid}) stopped")
    return 0


def status() -> int:
    running = running_instance()
    if running:
        print(f"crtboardd is running (pid {running['pid']}) on http://localhost:{running['port']}")
        return 0
    print("crtboardd is not running")
    return 3


def logs(lines: int, follow: bool) -> int:
    path = paths.log_file()
    if not path.exists():
        print("no logs yet")
        return 0
    with open(path, "rb") as log:
        for line in _tail(log, lines):
            sys.stdout.write(line.decode(errors="replace"))
        sys.stdout.flush()
        while follow:
            chunk = log.readline()
            if chunk:
                sys.stdout.write(chunk.decode(errors="replace"))
                sys.stdout.flush()
            else:
                time.sleep(0.3)
    return 0


def _tail(log, lines: int) -> list[bytes]:
    log.seek(0, os.SEEK_END)
    end = log.tell()
    size = min(end, 8192)
    while True:
        log.seek(end - size)
        chunk = log.read(size)
        if chunk.count(b"\n") > lines or size == end:
            log.seek(end)
            return chunk.splitlines(keepends=True)[-lines:] if lines else []
        size = min(end, size * 2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="crtboardctl", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    start_parser = commands.add_parser("start", help="start crtboardd in the background")
    start_parser.add_argument(
        "--config", type=Path, default=paths.DEFAULT_CONFIG, help="defaults to ~/.crtboard.yaml"
    )
    start_parser.add_argument("--foreground", action="store_true", help="run attached to this terminal")
    commands.add_parser("stop", help="stop the running crtboardd")
    commands.add_parser("status", help="show whether crtboardd is running")
    logs_parser = commands.add_parser("logs", help="show crtboardd's log")
    logs_parser.add_argument("-n", "--lines", type=int, default=50, help="lines to show (default 50)")
    logs_parser.add_argument("-f", "--follow", action="store_true", help="keep printing new lines")

    args = parser.parse_args(argv)
    try:
        if args.command == "start":
            return start(args.config.expanduser(), args.foreground)
        if args.command == "stop":
            return stop()
        if args.command == "status":
            return status()
        return logs(args.lines, args.follow)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
