"""`crtboardd`: serves the crtboard-web API on localhost.

Only one may run at a time: it holds an exclusive lock on
`~/.crtboard/crtboardd.lock` for as long as it lives, and the operating system
drops that lock if it dies, so a crash never leaves a stale claim behind.
"""

import argparse
import contextlib
import fcntl
import json
import logging
import os
import socket
import sys
from collections.abc import Iterator
from pathlib import Path

import uvicorn

from . import __version__, paths
from .api import create_app
from .config import ConfigError, load_config
from .sources.asana import Asana
from .sources.github import GitHub
from .store import Store
from .summary import Poller

log = logging.getLogger("crtboardd")


class AlreadyRunning(Exception):
    pass


@contextlib.contextmanager
def single_instance(port: int) -> Iterator[None]:
    """Holds the instance lock and publishes this process's pid and port."""
    lock = open(paths.lock_file(), "a+")  # noqa: SIM115 - held for the life of the process
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise AlreadyRunning(running_instance()) from None
    paths.pid_file().write_text(json.dumps({"pid": os.getpid(), "port": port}))
    try:
        yield
    finally:
        paths.pid_file().unlink(missing_ok=True)
        lock.close()


def running_instance() -> dict | None:
    """`{"pid", "port"}` of the running crtboardd, or None."""
    with open(paths.lock_file(), "a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            try:
                return json.loads(paths.pid_file().read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                return {"pid": None, "port": None}
        fcntl.flock(lock, fcntl.LOCK_UN)
        return None


def listen(port: int) -> list[socket.socket]:
    """Sockets on 127.0.0.1 and ::1, so `localhost` works whichever the browser picks."""
    sockets = []
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            sock = socket.socket(family, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if family == socket.AF_INET6:
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            sock.bind((host, port))
        except OSError as error:
            sock.close()
            if family == socket.AF_INET:
                raise OSError(f"cannot listen on {host}:{port}: {error.strerror}") from error
            continue
        sock.set_inheritable(True)
        sockets.append(sock)
    return sockets


def setup_logging(log_file: Path, foreground: bool) -> None:
    handlers: list[logging.Handler] = [logging.FileHandler(log_file)]
    if foreground:
        handlers.append(logging.StreamHandler(sys.stderr))
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="crtboardd", description=__doc__.splitlines()[0])
    parser.add_argument(
        "--config", type=Path, default=paths.DEFAULT_CONFIG, help="defaults to ~/.crtboard.yaml"
    )
    parser.add_argument("--foreground", action="store_true", help="also log to the terminal")
    args = parser.parse_args(argv)

    setup_logging(paths.log_file(), args.foreground)
    try:
        config = load_config(args.config.expanduser())
    except ConfigError as error:
        log.error("%s", error)
        print(f"crtboardd: {error}", file=sys.stderr)
        return 2

    try:
        with single_instance(config.port):
            sockets = listen(config.port)
            store = Store(paths.database())
            poller = Poller(
                config,
                store,
                github=GitHub(config.github_usernames) if config.github_usernames else None,
                asana=Asana(config.asana_api_key) if config.asana_api_key else None,
            )
            log.info(
                "crtboardd %s listening on http://localhost:%d (pid %d)",
                __version__,
                config.port,
                os.getpid(),
            )
            server = uvicorn.Server(
                uvicorn.Config(create_app(poller, store), log_config=None, access_log=False)
            )
            server.run(sockets=sockets)
            log.info("crtboardd stopped")
    except AlreadyRunning as error:
        running = error.args[0] or {}
        message = f"crtboardd is already running (pid {running.get('pid')}, port {running.get('port')})"
        print(message, file=sys.stderr)
        return 1
    except OSError as error:
        log.error("%s", error)
        print(f"crtboardd: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
