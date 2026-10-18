"""Asana boards (projects), their columns (sections) and task counts.

Uses the REST API with a personal access token. The Events API tells us when
a tracked project changed, so its sections are only recounted then.
"""

from dataclasses import dataclass
from datetime import datetime

import httpx

BASE_URL = "https://app.asana.com/api/1.0"
PAGE_SIZE = 100


@dataclass(frozen=True)
class Section:
    gid: str
    name: str


@dataclass(frozen=True)
class SectionCounts:
    open: int
    completed: int
    created: int


@dataclass(frozen=True)
class Board:
    gid: str
    name: str
    sections: list[Section]


class Asana:
    def __init__(
        self, token: str, transport: httpx.AsyncBaseTransport | None = None, base_url: str = BASE_URL
    ):
        self._client = httpx.AsyncClient(
            base_url=base_url, headers={"Authorization": f"Bearer {token}"}, transport=transport, timeout=30
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _pages(self, path: str, params: dict[str, str]) -> list[dict]:
        items: list[dict] = []
        params = {**params, "limit": str(PAGE_SIZE)}
        while True:
            response = await self._client.get(path, params=params)
            response.raise_for_status()
            body = response.json()
            items += body["data"]
            offset = (body.get("next_page") or {}).get("offset")
            if not offset:
                return items
            params = {**params, "offset": offset}

    async def boards(self) -> list[Board]:
        """Every unarchived project the token can see, with its sections."""
        boards = []
        for workspace in await self._pages("/workspaces", {}):
            projects = await self._pages("/projects", {"workspace": workspace["gid"], "archived": "false"})
            for project in projects:
                sections = await self._pages(f"/projects/{project['gid']}/sections", {})
                boards.append(
                    Board(
                        gid=project["gid"],
                        name=project["name"],
                        sections=[Section(gid=s["gid"], name=s["name"]) for s in sections],
                    )
                )
        return boards

    async def changed_since(self, project_gid: str, sync: str | None) -> tuple[bool, str]:
        """Whether the project changed since `sync`, and the token to pass next time.

        Without a token, or with an expired one, Asana answers 412 with a fresh
        token; that is reported as a change so the caller recounts.
        """
        params = {"resource": project_gid}
        if sync:
            params["sync"] = sync
        changed = False
        while True:
            response = await self._client.get("/events", params=params)
            if response.status_code == 412:
                return True, response.json()["sync"]
            response.raise_for_status()
            body = response.json()
            changed = changed or bool(body.get("data"))
            if not body.get("has_more"):
                return changed, body["sync"]
            params = {**params, "sync": body["sync"]}

    async def section_counts(self, section_gid: str, since: datetime) -> SectionCounts:
        """Counts for the tasks now in the section; `since` is local midnight, timezone-aware.

        Asana only returns tasks that are open or were completed since `since`,
        so older finished tasks are never fetched.
        """
        tasks = await self._pages(
            f"/sections/{section_gid}/tasks",
            {"opt_fields": "completed,completed_at,created_at", "completed_since": since.isoformat()},
        )

        def at_or_after(field: str, task: dict) -> bool:
            return bool(task.get(field)) and _parse(task[field]) >= since

        return SectionCounts(
            open=sum(not task.get("completed") for task in tasks),
            completed=sum(
                bool(task.get("completed")) and at_or_after("completed_at", task) for task in tasks
            ),
            created=sum(at_or_after("created_at", task) for task in tasks),
        )


def _parse(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
