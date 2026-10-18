"""Shared fakes: real throwaway git repositories, a stand-in for `gh`, and an
Asana API that serves only the endpoints crtboardd uses."""

import json
import re
import subprocess
from pathlib import Path

import httpx
import pytest


def git(path: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True).stdout


def make_repo(root: Path, name: str, branch: str = "main", origin: str | None = None) -> Path:
    path = root / name
    path.mkdir(parents=True)
    git(path, "init", "-q", "-b", "main")
    git(
        path,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init",
    )
    if branch != "main":
        git(path, "checkout", "-q", "-b", branch)
    if origin:
        git(path, "remote", "add", "origin", origin)
    return path


@pytest.fixture
def repos(tmp_path):
    """Two repositories: beemu on a feature branch with a GitHub remote, and one without a remote."""
    return {
        "beemu": make_repo(tmp_path, "beemu", "feat/tokenizer/add-ld", "git@github.com:octo/beemu.git"),
        "local-only": make_repo(tmp_path, "local-only"),
    }


@pytest.fixture(autouse=True)
def crtboard_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setenv("CRTBOARD_HOME", str(home))
    # Keep the developer's git settings (commit signing, hooks) out of the fake repositories.
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", "/dev/null")
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    return home


class FakeGh:
    """Answers `gh api graphql` with `issueCount`s chosen by the test, keyed by query alias."""

    def __init__(self, counts: dict[str, int]):
        self.counts = counts
        self.calls: list[dict[str, str]] = []
        self.fail = False

    def __call__(self, args: list[str]) -> str:
        assert args[:2] == ["api", "graphql"]
        fields = dict(arg.split("=", 1) for arg in args[3::2])
        self.calls.append(fields)
        if self.fail:
            raise RuntimeError("gh: could not reach api.github.com")
        aliases = re.findall(r"(\w+): search\(", fields["query"])
        return json.dumps({"data": {alias: {"issueCount": self.counts.get(alias, 0)} for alias in aliases}})


class FakeAsana:
    """In-memory Asana: one workspace, projects with sections, tasks and an event log."""

    def __init__(self):
        self.projects = {
            "p1": {"name": "Team Board", "sections": {"s1": "Will Do", "s2": "Ongoing", "s3": "Done"}}
        }
        self.tasks: dict[str, list[dict]] = {"s1": [], "s2": [], "s3": []}
        self.pending_events: dict[str, list[dict]] = {}
        self.requests: list[httpx.Request] = []

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def _page(self, request: httpx.Request, items: list[dict]) -> httpx.Response:
        limit = int(request.url.params.get("limit", 100))
        offset = int(request.url.params.get("offset", 0))
        page = items[offset : offset + limit]
        more = offset + limit < len(items)
        return httpx.Response(
            200, json={"data": page, "next_page": {"offset": str(offset + limit)} if more else None}
        )

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["Authorization"] == "Bearer secret-token"
        path = request.url.path.removeprefix("/api/1.0")
        if path == "/workspaces":
            return self._page(request, [{"gid": "w1", "name": "Work"}])
        if path == "/projects":
            assert request.url.params["workspace"] == "w1"
            return self._page(request, [{"gid": gid, "name": p["name"]} for gid, p in self.projects.items()])
        if match := re.fullmatch(r"/projects/(\w+)/sections", path):
            sections = self.projects[match[1]]["sections"]
            return self._page(request, [{"gid": gid, "name": name} for gid, name in sections.items()])
        if match := re.fullmatch(r"/sections/(\w+)/tasks", path):
            return self._page(request, self.tasks[match[1]])
        if path == "/events":
            resource = request.url.params["resource"]
            sync = request.url.params.get("sync")
            if not sync:
                return httpx.Response(
                    412, json={"sync": f"{resource}-sync-0", "errors": [{"message": "Sync token invalid"}]}
                )
            events = self.pending_events.pop(resource, [])
            n = int(sync.rsplit("-", 1)[1]) + 1
            return httpx.Response(
                200, json={"data": events, "sync": f"{resource}-sync-{n}", "has_more": False}
            )
        return httpx.Response(404, json={"errors": [{"message": f"no route {path}"}]})


@pytest.fixture
def fake_asana():
    return FakeAsana()
