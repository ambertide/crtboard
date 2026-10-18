import pytest

from crtboard.config import DEFAULT_PORT, ConfigError, load_config
from crtboard.store import Store


def test_loads_the_documented_keys(tmp_path):
    path = tmp_path / ".crtboard.yaml"
    path.write_text(
        "git-repositories: [/src/beemu, ~/src/crtboard]\n"
        "asana-api-key: secret\n"
        "githubUsernames: [octocat, hubot]\n"
        "port: 8000\n"
    )
    config = load_config(path)
    assert [str(p) for p in config.git_repositories][0] == "/src/beemu"
    assert config.git_repositories[1].is_absolute()
    assert config.asana_api_key == "secret"
    assert config.github_usernames == ["octocat", "hubot"]
    assert config.port == 8000


def test_everything_is_optional(tmp_path):
    path = tmp_path / ".crtboard.yaml"
    path.write_text("")
    config = load_config(path)
    assert config.port == DEFAULT_PORT
    assert config.asana_api_key is None
    assert config.git_repositories == []


@pytest.mark.parametrize(
    "text, message",
    [
        ("git-repositories: [relative/path]", "absolute"),
        ("port: 70000", "port"),
        ("githubUsernames: octocat", "githubUsernames"),
        ("- a list", "mapping"),
    ],
)
def test_rejects_bad_values(tmp_path, text, message):
    path = tmp_path / ".crtboard.yaml"
    path.write_text(text)
    with pytest.raises(ConfigError, match=message):
        load_config(path)


def test_missing_file(tmp_path):
    with pytest.raises(ConfigError, match="does not exist"):
        load_config(tmp_path / "nope.yaml")


def test_repos_are_tracked_once_and_survive_a_restart(tmp_path):
    store = Store(tmp_path / "db")
    first = store.track_repo("beemu")
    assert store.track_repo("beemu") == first
    store.track_repo("crtboard")
    assert store.update_repo(first, "basehieroglpyh")
    assert not store.update_repo("999", "x")
    assert Store(tmp_path / "db").tracked_repos() == ["basehieroglpyh", "crtboard"]
    store.untrack_repo(first)
    assert store.tracked_repos() == ["crtboard"]


def test_tracking_a_board_replaces_the_previous_one(tmp_path):
    store = Store(tmp_path / "db")
    old = store.track_board("Bugs", {"TO_DO": "Reported"})
    new = store.track_board("Team Board", {"TO_DO": "Will Do", "DONE": None})
    assert not store.update_board(old, "Bugs", {})
    assert store.update_board(new, "Team Board", {"TO_DO": "Will Do", "DONE": "Done"})
    board = store.tracked_board()
    assert (board.id, board.name, board.columns) == (new, "Team Board", {"TO_DO": "Will Do", "DONE": "Done"})
    store.untrack_board(new)
    assert store.tracked_board() is None
