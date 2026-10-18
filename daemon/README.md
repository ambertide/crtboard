# crtboard (crtboardd and crtboardctl)

`crtboardd` is the local daemon from [docs/System.md](../docs/System.md): it
reads your git repositories, GitHub and Asana, and serves them to
[crtboard-web](../web/crtboard-web/README.md) over HTTP on `localhost`.
`crtboardctl` starts it in the background, stops it and shows its logs. Both
ship in one wheel.

## Install

From a [release](https://github.com/ambertide/crtboard/releases):

```sh
pipx install https://github.com/ambertide/crtboard/releases/download/crtboard-v0.1.0/crtboard-0.1.0-py3-none-any.whl
```

or from a checkout: `cd daemon && uv build && pipx install dist/crtboard-*.whl`.

`git` must be installed, and `gh` logged in (`gh auth login`) if
`githubUsernames` is set. macOS and Linux are supported.

## Configure

`~/.crtboard.yaml` (or pass `--config <file>`):

```yaml
git-repositories:          # absolute paths; each repository is named after its directory
  - /Users/me/src/beemu
  - /Users/me/src/basehieroglpyh
githubUsernames: [octocat] # whose PRs and review requests to count
asana-api-key: 1/12345...  # an Asana personal access token
port: 7777                 # optional; crtboard-web expects 7777 by default
```

The Asana token can stay out of the YAML: when `asana-api-key` is missing,
`ASANA_API_KEY` is read from the environment, then from
`~/.crtboard/secrets.env` (`ASANA_API_KEY=...`, readable only by you).

Every key is optional: without `githubUsernames` PR counts stay 0, without
`asana-api-key` no boards are offered.

## Run

```sh
crtboardctl start            # in the background; prints the URL once it answers
crtboardctl status
crtboardctl logs [-n 50] [-f]
crtboardctl stop
crtboardctl start --foreground   # attached to the terminal, logging there too
```

No service manager is involved. Only one `crtboardd` can run at a time: it
holds an exclusive lock on `~/.crtboard/crtboardd.lock`, which the operating
system releases if the process dies. State lives in `~/.crtboard/`
(`crtboardd.log`, `crtboard.db` with the tracked resources, the lock and pid
files); set `CRTBOARD_HOME` to use another directory.

## API

What crtboard-web uses, all with permissive CORS and Private Network Access
headers so the GitHub Pages copy can reach it:

| Request | Answer |
| --- | --- |
| `GET /resources/available` | `{gitRepos: [{name, path}], asanaBoards: [{id, name, availableColumns}]}` |
| `POST /resources/git/tracked` `{name}` | `201 {id}` |
| `POST /resources/asana/tracked` `{name, columns: {TO_DO, BLOCKED, IN_PROGRESS, DONE}}` | `201 {id}`; replaces any previously tracked board |
| `PUT /resources/{git,asana}/tracked/{id}` | `200 {id}`, or `404` when the id is unknown |
| `DELETE /resources/{git,asana}/tracked/{id}` | `204` |
| `GET /events` | server-sent `CRTBOARD_EVENT_SUM` events, one every 2 seconds |

## How the numbers are found

- **Branch**: `git rev-parse --abbrev-ref HEAD` every 2 seconds; a detached
  HEAD shows its short commit id.
- **PRs**, **reviewRequested**, **todaysMergedPRs**: GitHub searches through
  `gh api graphql` every minute, for the `origin` remote's repository. PRs are
  open (including drafts) or merged ones opened by, or awaiting review from,
  a `githubUsernames` member, each counted once; review requests count open or
  merged PRs awaiting review from one of them; today's merges count from local
  midnight. A repository without a GitHub remote reports 0.
- **Tasks**: Asana's Events API is checked every 30 seconds and the matched
  sections are recounted when the board changed (and every 5 minutes anyway).
  Columns count their incomplete tasks; DONE counts tasks completed today.

A repository or column is left out of the event until its numbers are known,
so crtboard-web never mistakes a placeholder 0 for a change.

## Develop

```sh
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv build
```

The tests use throwaway git repositories, a stand-in for `gh` and an
in-memory Asana that answers only the endpoints above. CI builds the wheel on
every change; pushing a `crtboard-v<version>` tag that matches
`pyproject.toml` publishes it as a GitHub Release.
