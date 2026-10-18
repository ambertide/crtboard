"""Local repositories: their names, checked-out branches and GitHub remotes."""

import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)
GIT_TIMEOUT_S = 5

# git@github.com:owner/repo.git, https://github.com/owner/repo(.git), ssh://git@github.com/owner/repo
_GITHUB_REMOTE = re.compile(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")


@dataclass(frozen=True)
class GitRepo:
    name: str
    path: Path


def _git(path: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(path), *args], capture_output=True, text=True, timeout=GIT_TIMEOUT_S, check=True
    )
    return result.stdout.strip()


def discover(paths: list[Path]) -> list[GitRepo]:
    """The configured repositories that exist, named after their directories."""
    repos = []
    for path in paths:
        try:
            top = Path(_git(path, "rev-parse", "--show-toplevel"))
        except (
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
            FileNotFoundError,
            NotADirectoryError,
        ):
            log.warning("skipping %s: not a git repository", path)
            continue
        repos.append(GitRepo(name=top.name, path=top))
    return repos


def current_branch(path: Path) -> str:
    """The checked-out branch, or the short commit id when HEAD is detached."""
    branch = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
    return _git(path, "rev-parse", "--short", "HEAD") if branch == "HEAD" else branch


def github_slug(path: Path) -> str | None:
    """`owner/repo` of the `origin` remote when it is on GitHub."""
    try:
        url = _git(path, "remote", "get-url", "origin")
    except subprocess.CalledProcessError:
        return None
    match = _GITHUB_REMOTE.search(url)
    return f"{match['owner']}/{match['repo']}" if match else None
