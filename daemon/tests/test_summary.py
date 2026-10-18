import asyncio
from datetime import datetime, timedelta, timezone

from conftest import FakeGh, git

from crtboard.config import Config
from crtboard.sources.asana import Asana
from crtboard.sources.github import GitHub
from crtboard.store import Store
from crtboard.summary import Poller

NOW = datetime(2026, 10, 18, 14, 30, tzinfo=timezone(timedelta(hours=3)))


def poller(tmp_path, repos, gh=None, asana=None):
    config = Config(git_repositories=list(repos.values()), github_usernames=["octocat"])
    store = Store(tmp_path / "db")
    github = GitHub(["octocat"], runner=gh) if gh else None
    return Poller(config, store, github=github, asana=asana, now=lambda: NOW), store


def refresh(p: Poller):
    async def all():
        await p.refresh_branches()
        await p.refresh_pull_requests()
        await p.refresh_boards()
        await p.refresh_tasks()

    asyncio.run(all())


def test_lists_configured_repositories(tmp_path, repos):
    p, _ = poller(tmp_path, repos)
    assert [r["name"] for r in p.available()["gitRepos"]] == ["beemu", "local-only"]


def test_a_repository_appears_only_once_its_counts_are_known(tmp_path, repos):
    gh = FakeGh({"open": 7, "reviewOpen": 1, "today": 1})
    p, store = poller(tmp_path, repos, gh)
    store.track_repo("beemu")
    store.track_repo("local-only")
    store.track_repo("not-configured")
    assert p.summary()["gitRepos"] == {}

    asyncio.run(p.refresh_branches())
    assert p.summary()["gitRepos"] == {}, "branch alone must not publish placeholder PR counts"

    asyncio.run(p.refresh_pull_requests())
    assert p.summary()["gitRepos"] == {
        "beemu": {"PRs": 7, "todaysMergedPRs": 1, "branch": "feat/tokenizer/add-ld", "reviewRequested": 1},
        "local-only": {"PRs": 0, "todaysMergedPRs": 0, "branch": "main", "reviewRequested": 0},
    }
    assert len(gh.calls) == 1, "a repository without a GitHub remote is not searched"


def test_github_failures_keep_the_last_counts(tmp_path, repos):
    gh = FakeGh({"open": 4})
    p, store = poller(tmp_path, repos, gh)
    store.track_repo("beemu")
    refresh(p)
    gh.fail = True
    gh.counts["open"] = 9
    asyncio.run(p.refresh_pull_requests())
    assert p.summary()["gitRepos"]["beemu"]["PRs"] == 4


def test_branch_changes_show_up(tmp_path, repos):
    p, store = poller(tmp_path, repos, FakeGh({}))
    store.track_repo("beemu")
    refresh(p)
    git(repos["beemu"], "checkout", "-q", "-b", "fix/serial/reconnect")
    asyncio.run(p.refresh_branches())
    assert p.summary()["gitRepos"]["beemu"]["branch"] == "fix/serial/reconnect"


def test_board_columns_are_counted_and_recounted_on_events(tmp_path, repos, fake_asana):
    fake_asana.tasks["s1"] = [{"completed": False}] * 3
    fake_asana.tasks["s3"] = [{"completed": True, "completed_at": "2026-10-18T08:00:00Z"}]
    p, store = poller(tmp_path, repos, asana=Asana("secret-token", transport=fake_asana.transport()))
    store.track_board(
        "Team Board", {"TO_DO": "Will Do", "BLOCKED": None, "IN_PROGRESS": None, "DONE": "Done"}
    )
    refresh(p)
    assert p.summary()["asanaBoards"] == {
        "todo": {"matchedColumnName": "Will Do", "tasks": 3, "todaysCreatedTasks": 0},
        "done": {"matchedColumnName": "Done", "tasks": 1, "todaysCreatedTasks": 0},
    }

    fake_asana.tasks["s1"].append({"completed": False})
    asyncio.run(p.refresh_tasks())
    assert p.summary()["asanaBoards"]["todo"]["tasks"] == 3, "no event, no recount"

    fake_asana.pending_events["p1"] = [{"action": "added"}]
    asyncio.run(p.refresh_tasks())
    assert p.summary()["asanaBoards"]["todo"]["tasks"] == 4


def test_rematching_a_column_recounts_at_once(tmp_path, repos, fake_asana):
    fake_asana.tasks["s1"] = [{"completed": False}] * 3
    fake_asana.tasks["s2"] = [{"completed": False}] * 8
    p, store = poller(tmp_path, repos, asana=Asana("secret-token", transport=fake_asana.transport()))
    board = store.track_board("Team Board", {"TO_DO": "Will Do"})
    refresh(p)
    store.update_board(board, "Team Board", {"TO_DO": "Ongoing"})
    asyncio.run(p.refresh_tasks())
    assert p.summary()["asanaBoards"]["todo"] == {
        "matchedColumnName": "Ongoing",
        "tasks": 8,
        "todaysCreatedTasks": 0,
    }


def test_a_task_created_outside_to_do_is_still_reported(tmp_path, repos, fake_asana):
    """What happened on a real board: a task was added to In progress while
    another moved from In progress to Done, so no column count went up."""
    fake_asana.tasks["s1"] = [{"completed": False, "created_at": "2026-10-18T08:00:00Z"}] * 3
    fake_asana.tasks["s2"] = [{"completed": False, "created_at": "2026-10-18T08:00:00Z"}] * 2
    p, store = poller(tmp_path, repos, asana=Asana("secret-token", transport=fake_asana.transport()))
    columns = {"TO_DO": "Will Do", "BLOCKED": None, "IN_PROGRESS": "Ongoing", "DONE": "Done"}
    store.track_board("Team Board", columns)
    refresh(p)
    before = p.summary()["asanaBoards"]

    finished = fake_asana.tasks["s2"].pop()
    fake_asana.tasks["s3"].append({**finished, "completed": True, "completed_at": "2026-10-18T11:54:00Z"})
    fake_asana.tasks["s2"].append({"completed": False, "created_at": "2026-10-18T11:54:00Z"})
    fake_asana.pending_events["p1"] = [{"action": "added"}, {"action": "changed"}]
    asyncio.run(p.refresh_tasks())
    after = p.summary()["asanaBoards"]

    assert [after[k]["tasks"] for k in ("todo", "inProgress")] == [
        before[k]["tasks"] for k in ("todo", "inProgress")
    ]
    created = sum(c["todaysCreatedTasks"] for c in after.values())
    assert created == sum(c["todaysCreatedTasks"] for c in before.values()) + 1
