import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventSum } from "../src/features/connector/types.ts";
import { continuousFlashPhase, flashPhase } from "../src/features/crt-screen/flash.ts";
import { STATUS_HOLD_MS, currentStatus, detectStatusEvents } from "../src/features/crt-screen/status.ts";

function sum(reviewRequested: number, PRs: number, todo: number, todoColumn = "Will Do", todaysMergedPRs = 0): EventSum {
  return {
    gitRepos: { beemu: { PRs, todaysMergedPRs, branch: "main", reviewRequested } },
    asanaBoards: { todo: { matchedColumnName: todoColumn, tasks: todo } },
  };
}

test("a review request outranks a new pull request", () => {
  const events = detectStatusEvents(sum(0, 1, 3), sum(1, 2, 3), 1000);
  assert.deepEqual(events.map((e) => e.type).sort(), ["new-pr", "review-requested"]);
  assert.equal(currentStatus(events, 2000), "review-requested");
});

test("statuses expire after the hold time", () => {
  const events = detectStatusEvents(sum(0, 1, 3), sum(0, 2, 3), 0);
  assert.equal(currentStatus(events, STATUS_HOLD_MS - 1), "new-pr");
  assert.equal(currentStatus(events, STATUS_HOLD_MS), "nominal");
});

test("a rise in today's merged PRs is a merge; the daily reset is not", () => {
  assert.equal(currentStatus(detectStatusEvents(sum(0, 1, 3, "Will Do", 0), sum(0, 1, 3, "Will Do", 1), 0), 1), "merged");
  assert.equal(currentStatus(detectStatusEvents(sum(0, 1, 3, "Will Do", 4), sum(0, 1, 3, "Will Do", 0), 0), 1), "nominal");
});

test("only new tasks in the same column count as created", () => {
  assert.equal(currentStatus(detectStatusEvents(sum(0, 1, 3), sum(0, 1, 4), 0), 1), "task-created");
  assert.equal(currentStatus(detectStatusEvents(sum(0, 1, 3, "Backlog"), sum(0, 1, 9), 0), 1), "nominal");
});

test("a changed value flashes bright then dim each second, then settles", () => {
  const phases = [0, 1000, 2000, 3000, 4000, 5000, 6000].map((t) => flashPhase(10_000, 10_000 + t));
  assert.deepEqual(phases, ["bright", "dim", "bright", "dim", "bright", "dim", null]);
  assert.equal(flashPhase(undefined, 0), null);
  assert.notEqual(continuousFlashPhase(1000), continuousFlashPhase(2000));
});
