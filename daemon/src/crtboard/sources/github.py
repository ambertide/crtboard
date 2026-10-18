"""Pull request counts for a repository, from GitHub search through the `gh` CLI.

Counts come from `issueCount`, so nothing is paginated. Searches use GitHub's
advanced issue syntax, which allows `(a OR b)`; a PR matching several
qualifiers is still counted once.
"""

import json
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

GH_TIMEOUT_S = 30

Runner = Callable[[list[str]], str]

_QUERY = """
query($open: String!, $merged: String!, $reviewOpen: String!, $reviewMerged: String!, $today: String!) {
  open: search(query: $open, type: ISSUE_ADVANCED, first: 0) { issueCount }
  merged: search(query: $merged, type: ISSUE_ADVANCED, first: 0) { issueCount }
  reviewOpen: search(query: $reviewOpen, type: ISSUE_ADVANCED, first: 0) { issueCount }
  reviewMerged: search(query: $reviewMerged, type: ISSUE_ADVANCED, first: 0) { issueCount }
  today: search(query: $today, type: ISSUE_ADVANCED, first: 0) { issueCount }
}
"""


@dataclass(frozen=True)
class PullRequestCounts:
    prs: int = 0
    review_requested: int = 0
    todays_merged: int = 0


def run_gh(args: list[str]) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=GH_TIMEOUT_S)
    if result.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:2])} failed: {result.stderr.strip()}")
    return result.stdout


def _any_of(qualifier: str, users: list[str]) -> str:
    return "(" + " OR ".join(f"{qualifier}:{user}" for user in users) + ")"


class GitHub:
    """Counts PRs opened by, or awaiting review from, `users` (System.md's `githubUsernames`)."""

    def __init__(self, users: list[str], runner: Runner = run_gh):
        self.users = users
        self._run = runner

    def queries(self, slug: str, day_start: datetime) -> dict[str, str]:
        involved = "(" + " OR ".join(f"author:{u} OR review-requested:{u}" for u in self.users) + ")"
        reviews = _any_of("review-requested", self.users)
        base = f"repo:{slug} is:pr"
        return {
            # Open covers drafts; with merged ones this is "open, merged or draft".
            "open": f"{base} is:open {involved}",
            "merged": f"{base} is:merged {involved}",
            "reviewOpen": f"{base} is:open {reviews}",
            "reviewMerged": f"{base} is:merged {reviews}",
            "today": f"{base} is:merged merged:>={day_start.isoformat(timespec='seconds')} {involved}",
        }

    def counts(self, slug: str, day_start: datetime) -> PullRequestCounts:
        """Counts for `owner/repo`; `day_start` is local midnight, with its UTC offset."""
        if not self.users:
            return PullRequestCounts()
        args = ["api", "graphql", "-f", f"query={_QUERY}"]
        for name, value in self.queries(slug, day_start).items():
            args += ["-f", f"{name}={value}"]
        data = json.loads(self._run(args))["data"]
        count = {name: result["issueCount"] for name, result in data.items()}
        return PullRequestCounts(
            prs=count["open"] + count["merged"],
            review_requested=count["reviewOpen"] + count["reviewMerged"],
            todays_merged=count["today"],
        )
