"""The `.crtboard.yaml` file described in docs/System.md.

The Asana token may also be left out of the YAML and given as `ASANA_API_KEY`,
either in the environment or in `~/.crtboard/secrets.env`, so the
configuration can be shared without the secret.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from . import paths as state

DEFAULT_PORT = 7777
ASANA_KEY_VARIABLE = "ASANA_API_KEY"


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Config:
    git_repositories: list[Path] = field(default_factory=list)
    asana_api_key: str | None = None
    github_usernames: list[str] = field(default_factory=list)
    port: int = DEFAULT_PORT


def _dotenv_value(path: Path, name: str) -> str | None:
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        return None
    for line in lines:
        key, sep, value = line.strip().removeprefix("export ").partition("=")
        if sep and key.strip() == name:
            return value.strip().strip("'\"") or None
    return None


def load_config(path: Path, env: Mapping[str, str] = os.environ) -> Config:
    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except FileNotFoundError:
        raise ConfigError(f"{path} does not exist") from None
    except yaml.YAMLError as error:
        raise ConfigError(f"{path} is not valid YAML: {error}") from None
    if not isinstance(raw, dict):
        raise ConfigError(f"{path} must be a mapping")

    repos = raw.get("git-repositories") or []
    users = raw.get("githubUsernames") or []
    key = raw.get("asana-api-key")
    port = raw.get("port", DEFAULT_PORT)
    if not isinstance(repos, list) or not all(isinstance(r, str) for r in repos):
        raise ConfigError("git-repositories must be a list of paths")
    if not isinstance(users, list) or not all(isinstance(u, str) for u in users):
        raise ConfigError("githubUsernames must be a list of names")
    if key is not None and not isinstance(key, str):
        raise ConfigError("asana-api-key must be a string")
    if not isinstance(port, int) or not 0 < port < 65536:
        raise ConfigError("port must be a number from 1 to 65535")

    paths = [Path(r).expanduser() for r in repos]
    relative = [str(p) for p in paths if not p.is_absolute()]
    if relative:
        raise ConfigError(f"git-repositories must be absolute paths: {', '.join(relative)}")
    if not key:
        key = env.get(ASANA_KEY_VARIABLE) or _dotenv_value(state.secrets_file(), ASANA_KEY_VARIABLE)
    return Config(git_repositories=paths, asana_api_key=key or None, github_usernames=users, port=port)
