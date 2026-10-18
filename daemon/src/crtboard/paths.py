"""Where crtboardd keeps its state: `~/.crtboard/`, or `$CRTBOARD_HOME`."""

import os
from pathlib import Path

DEFAULT_CONFIG = Path.home() / ".crtboard.yaml"


def state_dir() -> Path:
    path = Path(os.environ.get("CRTBOARD_HOME", Path.home() / ".crtboard"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def lock_file() -> Path:
    return state_dir() / "crtboardd.lock"


def pid_file() -> Path:
    return state_dir() / "crtboardd.pid"


def log_file() -> Path:
    return state_dir() / "crtboardd.log"


def database() -> Path:
    return state_dir() / "crtboard.db"
