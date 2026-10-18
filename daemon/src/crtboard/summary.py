"""Keeps the latest `CRTBOARD_EVENT_SUM` up to date by polling each source on
its own schedule, so slow GitHub or Asana calls never hold up the heartbeat.

A repository or column only appears once its numbers are known: crtboard-web
treats a rise between two sums as news, so a placeholder 0 followed by the
real count would raise a false "Pull Request Created" or "Task Created".
"""

import asyncio
import contextlib
import logging
from collections.abc import Callable
from datetime import datetime

from .config import Config
from .sources import git
from .sources.asana import Asana, Board
from .sources.github import GitHub, PullRequestCounts
from .store import Store

log = logging.getLogger(__name__)

BRANCH_INTERVAL_S = 2
GITHUB_INTERVAL_S = 60
BOARDS_INTERVAL_S = 600
TASKS_INTERVAL_S = 30
# Recount even without Asana events, in case one was missed.
RECOUNT_INTERVAL_S = 300
READY_TIMEOUT_S = 20

# Keys of `asanaBoards` in the sum, by System.md's column enums.
COLUMN_KEYS = {"TO_DO": "todo", "BLOCKED": "blocked", "IN_PROGRESS": "inProgress", "DONE": "done"}


def local_now() -> datetime:
    return datetime.now().astimezone()


class Poller:
    def __init__(
        self,
        config: Config,
        store: Store,
        *,
        github: GitHub | None,
        asana: Asana | None,
        now: Callable[[], datetime] = local_now,
    ):
        self.store = store
        self.github = github
        self.asana = asana
        self.now = now
        self.repos = {repo.name: repo for repo in git.discover(config.git_repositories)}
        self._slugs = {name: git.github_slug(repo.path) for name, repo in self.repos.items()}
        self._branches: dict[str, str] = {}
        self._prs: dict[str, PullRequestCounts] = {}
        self._boards: list[Board] = []
        self._tasks: dict[str, tuple[int, int]] = {}
        self._counted_board: tuple[str, str] | None = None
        self._sync: str | None = None
        self._recounted_at = 0.0
        self._ready = asyncio.Event()
        self._wake_github = asyncio.Event()
        self._wake_tasks = asyncio.Event()
        self._errors: dict[str, str] = {}

    def tracked_changed(self) -> None:
        """Called after tracked resources change so their numbers are fetched now."""
        self._wake_github.set()
        self._wake_tasks.set()

    async def wait_ready(self) -> None:
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._ready.wait(), READY_TIMEOUT_S)

    def available(self) -> dict:
        return {
            "gitRepos": [{"name": name, "path": str(repo.path)} for name, repo in self.repos.items()],
            "asanaBoards": [
                {"id": b.gid, "name": b.name, "availableColumns": [s.name for s in b.sections]}
                for b in self._boards
            ],
        }

    def summary(self) -> dict:
        repos = {}
        for name in self.store.tracked_repos():
            if name not in self.repos or name not in self._branches:
                continue
            counts = self._prs.get(name) if self.github else PullRequestCounts()
            if counts is None:
                continue
            repos[name] = {
                "PRs": counts.prs,
                "todaysMergedPRs": counts.todays_merged,
                "branch": self._branches[name],
                "reviewRequested": counts.review_requested,
            }
        columns = {}
        board = self.store.tracked_board()
        if board:
            for kind, column in board.columns.items():
                if column and kind in COLUMN_KEYS and kind in self._tasks:
                    tasks, created = self._tasks[kind]
                    columns[COLUMN_KEYS[kind]] = {
                        "matchedColumnName": column,
                        "tasks": tasks,
                        "todaysCreatedTasks": created,
                    }
        return {"gitRepos": repos, "asanaBoards": columns}

    async def run(self) -> None:
        await asyncio.gather(
            self.refresh_branches(),
            self.refresh_boards(),
            self.refresh_pull_requests(),
            return_exceptions=True,
        )
        await self.refresh_tasks()
        self._ready.set()
        await asyncio.gather(
            self._every(BRANCH_INTERVAL_S, self.refresh_branches),
            self._every(GITHUB_INTERVAL_S, self.refresh_pull_requests, self._wake_github),
            self._every(BOARDS_INTERVAL_S, self.refresh_boards),
            self._every(TASKS_INTERVAL_S, self.refresh_tasks, self._wake_tasks),
        )

    async def _every(self, seconds: float, refresh: Callable, wake: asyncio.Event | None = None) -> None:
        while True:
            if wake:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(wake.wait(), seconds)
                wake.clear()
            else:
                await asyncio.sleep(seconds)
            await refresh()

    def _report(self, source: str, error: Exception | None) -> None:
        """Logs a source's failure once, and its recovery, instead of on every poll."""
        message = str(error) if error else ""
        if self._errors.get(source, "") != message:
            if error:
                log.warning("%s: %s", source, message)
            else:
                log.info("%s: working again", source)
            self._errors[source] = message

    async def refresh_branches(self) -> None:
        for name in self.store.tracked_repos():
            repo = self.repos.get(name)
            if not repo:
                continue
            try:
                self._branches[name] = await asyncio.to_thread(git.current_branch, repo.path)
                self._report(f"git {name}", None)
            except Exception as error:
                self._report(f"git {name}", error)

    async def refresh_pull_requests(self) -> None:
        if not self.github:
            return
        day_start = self.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for name in self.store.tracked_repos():
            slug = self._slugs.get(name)
            if name not in self.repos:
                continue
            if not slug:
                self._prs[name] = PullRequestCounts()
                continue
            try:
                self._prs[name] = await asyncio.to_thread(self.github.counts, slug, day_start)
                self._report(f"github {slug}", None)
            except Exception as error:
                self._report(f"github {slug}", error)
                # Show the repository rather than hide it while GitHub is unreachable.
                self._prs.setdefault(name, PullRequestCounts())

    async def refresh_boards(self) -> None:
        if not self.asana:
            return
        try:
            self._boards = await self.asana.boards()
            self._report("asana boards", None)
        except Exception as error:
            self._report("asana boards", error)

    async def refresh_tasks(self) -> None:
        tracked = self.store.tracked_board()
        if not self.asana or not tracked:
            self._tasks = {}
            self._counted_board = None
            return
        board = next((b for b in self._boards if b.name == tracked.name), None)
        if not board:
            self._tasks = {}
            return

        key = (board.gid, repr(sorted(tracked.columns.items())))
        loop_time = asyncio.get_running_loop().time()
        try:
            if key != self._counted_board:
                self._tasks, self._sync = {}, None
            changed, self._sync = await self.asana.changed_since(board.gid, self._sync)
            stale = loop_time - self._recounted_at >= RECOUNT_INTERVAL_S
            if changed or stale or key != self._counted_board:
                self._tasks = await self._count(board, tracked.columns)
                self._counted_board = key
                self._recounted_at = loop_time
            self._report("asana tasks", None)
        except Exception as error:
            self._report("asana tasks", error)

    async def _count(self, board: Board, columns: dict[str, str | None]) -> dict[str, tuple[int, int]]:
        """`(tasks, created today)` per matched column."""
        sections = {s.name: s.gid for s in board.sections}
        day_start = self.now().replace(hour=0, minute=0, second=0, microsecond=0)
        counts = {}
        for kind, column in columns.items():
            gid = sections.get(column) if column else None
            if not gid:
                continue
            section = await self.asana.section_counts(gid, day_start)
            # DONE only grows, so System.md counts the tasks finished today.
            tasks = section.completed if kind == "DONE" else section.open
            counts[kind] = (tasks, section.created)
        return counts
