import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from conftest import FakeGh, git

from crtboard.sources import git as gitsource
from crtboard.sources.asana import Asana
from crtboard.sources.github import GitHub

TZ = timezone(timedelta(hours=3))
DAY_START = datetime(2026, 10, 18, tzinfo=TZ)


def test_discovers_repositories_by_directory_name(repos, tmp_path):
    (tmp_path / "not-a-repo").mkdir()
    found = gitsource.discover(
        [repos["beemu"], repos["local-only"], tmp_path / "not-a-repo", tmp_path / "gone"]
    )
    assert [r.name for r in found] == ["beemu", "local-only"]


def test_reads_the_branch_and_follows_checkouts(repos):
    assert gitsource.current_branch(repos["beemu"]) == "feat/tokenizer/add-ld"
    git(repos["beemu"], "checkout", "-q", "main")
    assert gitsource.current_branch(repos["beemu"]) == "main"


def test_detached_head_shows_the_short_commit(repos):
    git(repos["local-only"], "checkout", "-q", "--detach")
    sha = git(repos["local-only"], "rev-parse", "--short", "HEAD").strip()
    assert gitsource.current_branch(repos["local-only"]) == sha


@pytest.mark.parametrize(
    "url",
    [
        "git@github.com:octo/beemu.git",
        "https://github.com/octo/beemu.git",
        "https://github.com/octo/beemu",
        "ssh://git@github.com/octo/beemu",
    ],
)
def test_github_slug_from_remote(repos, url):
    git(repos["beemu"], "remote", "set-url", "origin", url)
    assert gitsource.github_slug(repos["beemu"]) == "octo/beemu"


def test_no_slug_without_a_github_remote(repos):
    assert gitsource.github_slug(repos["local-only"]) is None
    git(repos["local-only"], "remote", "add", "origin", "https://gitlab.com/octo/x.git")
    assert gitsource.github_slug(repos["local-only"]) is None


def test_pull_request_counts_combine_the_searches():
    gh = FakeGh({"open": 3, "reviewOpen": 2, "reviewMerged": 3, "today": 1})
    counts = GitHub(["octocat", "hubot"], runner=gh).counts("octo/beemu", DAY_START)
    assert (counts.prs, counts.review_requested, counts.todays_merged) == (3, 5, 1)

    fields = gh.calls[0]
    involved = "(author:octocat OR review-requested:octocat OR author:hubot OR review-requested:hubot)"
    assert fields["open"] == f"repo:octo/beemu is:pr is:open {involved}"
    assert "merged" not in fields, "merged PRs are not waiting for anything"
    assert (
        fields["reviewOpen"]
        == "repo:octo/beemu is:pr is:open (review-requested:octocat OR review-requested:hubot)"
    )
    assert fields["today"] == f"repo:octo/beemu is:pr is:merged merged:>=2026-10-18T00:00:00+03:00 {involved}"
    assert "ISSUE_ADVANCED" in fields["query"]


def test_no_users_means_no_github_calls():
    gh = FakeGh({})
    assert GitHub([], runner=gh).counts("octo/beemu", DAY_START).prs == 0
    assert gh.calls == []


def test_asana_lists_boards_with_their_columns(fake_asana):
    fake_asana.projects["p2"] = {"name": "Bugs", "sections": {f"b{i}": f"Column {i}" for i in range(150)}}
    asana = Asana("secret-token", transport=fake_asana.transport())
    boards = asyncio.run(asana.boards())
    assert [(b.gid, b.name) for b in boards] == [("p1", "Team Board"), ("p2", "Bugs")]
    assert [s.name for s in boards[0].sections] == ["Will Do", "Ongoing", "Done"]
    assert len(boards[1].sections) == 150  # paginated


def test_asana_counts_open_done_today_and_created_today(fake_asana):
    old, yesterday, today = "2026-01-01T09:00:00Z", "2026-10-17T20:59:59.000Z", "2026-10-17T21:00:00.000Z"
    fake_asana.tasks["s1"] = [{"completed": False, "created_at": old}] * 120 + [
        {"completed": False, "created_at": today},  # created at local midnight (UTC+3)
        {"completed": False, "created_at": yesterday},  # 23:59 the day before
    ]
    fake_asana.tasks["s3"] = [
        {"completed": True, "completed_at": "2026-10-18T06:00:00.000Z", "created_at": "2026-10-18T05:00:00Z"},
        {"completed": True, "completed_at": yesterday, "created_at": old},
        {"completed": True, "completed_at": today, "created_at": old},
        {"completed": False, "completed_at": None, "created_at": old},
    ]
    asana = Asana("secret-token", transport=fake_asana.transport())
    todo = asyncio.run(asana.section_counts("s1", DAY_START))
    assert (todo.open, todo.created) == (122, 1)
    done = asyncio.run(asana.section_counts("s3", DAY_START))
    assert (done.completed, done.created) == (2, 1)
    assert fake_asana.requests[-1].url.params["completed_since"] == "2026-10-18T00:00:00+03:00"


def test_asana_events_report_changes_through_sync_tokens(fake_asana):
    asana = Asana("secret-token", transport=fake_asana.transport())
    changed, sync = asyncio.run(asana.changed_since("p1", None))
    assert changed and sync == "p1-sync-0"
    changed, sync = asyncio.run(asana.changed_since("p1", sync))
    assert not changed and sync == "p1-sync-1"
    fake_asana.pending_events["p1"] = [{"action": "added", "resource": {"gid": "t9"}}]
    changed, sync = asyncio.run(asana.changed_since("p1", sync))
    assert changed and sync == "p1-sync-2"
