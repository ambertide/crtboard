"""The HTTP contract crtboard-web relies on (web/crtboard-web/src/features/connector)."""

import json
import time

import pytest
from conftest import FakeGh
from fastapi.testclient import TestClient

from crtboard import summary
from crtboard.api import create_app
from crtboard.config import Config
from crtboard.sources.asana import Asana
from crtboard.sources.github import GitHub
from crtboard.store import Store
from crtboard.summary import Poller


@pytest.fixture
def client(tmp_path, repos, fake_asana, monkeypatch):
    monkeypatch.setattr(summary, "BRANCH_INTERVAL_S", 0.05)
    fake_asana.tasks["s1"] = [{"completed": False}] * 7
    config = Config(git_repositories=list(repos.values()), github_usernames=["octocat"])
    store = Store(tmp_path / "db")
    poller = Poller(
        config,
        store,
        github=GitHub(["octocat"], runner=FakeGh({"open": 2, "reviewOpen": 1})),
        asana=Asana("secret-token", transport=fake_asana.transport()),
    )
    with TestClient(create_app(poller, store, sum_interval=0.01, max_sums=1)) as client:
        yield client


def first_sum(client) -> dict:
    response = client.get("/events")
    assert response.headers["content-type"].startswith("text/event-stream")
    event, data = response.text.strip().split("\n")
    assert event == "event: CRTBOARD_EVENT_SUM"
    return json.loads(data.removeprefix("data: "))


def wait_for(client, check, timeout=5.0) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        sum = first_sum(client)
        if check(sum) or time.monotonic() > deadline:
            return sum
        time.sleep(0.05)


def test_available_resources(client):
    body = client.get("/resources/available").json()
    assert body["gitRepos"][0]["name"] == "beemu"
    assert body["gitRepos"][0]["path"].endswith("beemu")
    assert body["asanaBoards"] == [
        {"id": "p1", "name": "Team Board", "availableColumns": ["Will Do", "Ongoing", "Done"]}
    ]


def test_tracking_flows_into_the_event_sum(client):
    assert first_sum(client) == {"gitRepos": {}, "asanaBoards": {}}

    response = client.post("/resources/git/tracked", json={"name": "beemu"})
    assert response.status_code == 201
    repo_id = response.json()["id"]
    board = {
        "name": "Team Board",
        "columns": {"TO_DO": "Will Do", "BLOCKED": None, "IN_PROGRESS": None, "DONE": None},
    }
    assert client.post("/resources/asana/tracked", json=board).status_code == 201

    sum = wait_for(client, lambda s: "beemu" in s["gitRepos"] and "todo" in s["asanaBoards"])
    assert sum == {
        "gitRepos": {
            "beemu": {"PRs": 2, "todaysMergedPRs": 0, "branch": "feat/tokenizer/add-ld", "reviewRequested": 1}
        },
        "asanaBoards": {"todo": {"matchedColumnName": "Will Do", "tasks": 7}},
    }

    assert client.put(f"/resources/git/tracked/{repo_id}", json={"name": "local-only"}).json() == {
        "id": repo_id
    }
    sum = wait_for(client, lambda s: "local-only" in s["gitRepos"])
    assert list(sum["gitRepos"]) == ["local-only"]

    assert client.delete(f"/resources/git/tracked/{repo_id}").status_code == 204
    assert first_sum(client)["gitRepos"] == {}


def test_unknown_ids_are_404_so_the_web_app_tracks_again(client):
    assert client.put("/resources/git/tracked/42", json={"name": "beemu"}).status_code == 404
    assert (
        client.put("/resources/asana/tracked/42", json={"name": "Team Board", "columns": {}}).status_code
        == 404
    )


def test_cors_and_private_network_access(client):
    preflight = client.options(
        "/resources/git/tracked",
        headers={"Origin": "https://crtboard.example", "Access-Control-Request-Private-Network": "true"},
    )
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-private-network"] == "true"
    response = client.get("/resources/available")
    assert response.headers["access-control-allow-origin"] == "*"
    assert first_sum(client) is not None
