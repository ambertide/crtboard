import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventSum } from "../src/features/connector/types.ts";
import { continuousFlashPhase, flashPhase } from "../src/features/crt-screen/flash.ts";
import { STATUS_HOLD_MS, currentStatus, detectStatusEvents } from "../src/features/crt-screen/status.ts";

function sum(reviewRequested: number, PRs: number, todo: number, todoColumn = "Will Do", todaysMergedPRs = 0): EventSum {
  return {
    gitRepos: { beemu: { PRs, todaysMergedPRs, branch: "main", reviewRequested } },
    asanaBoards: { todo: { matchedColumnName: todoColumn, tasks: todo, todaysCreatedTasks: 0 } },
  };
}

type Column = [name: string, tasks: number, createdToday: number];

function board(columns: Record<string, Column>): EventSum {
  const asanaBoards = Object.fromEntries(
    Object.entries(columns).map(([key, [name, tasks, created]]) => [
      key,
      { matchedColumnName: name, tasks, todaysCreatedTasks: created },
    ]),
  );
  return { gitRepos: {}, asanaBoards };
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

test("a task created in any column counts, even when no column count rises", () => {
  // A task added to In progress while another moved from In progress to Done.
  const before = board({ todo: ["To do", 3, 3], inProgress: ["In progress", 2, 2], done: ["Done", 0, 0] });
  const moved = board({ todo: ["To do", 3, 3], inProgress: ["In progress", 1, 1], done: ["Done", 1, 1] });
  assert.equal(currentStatus(detectStatusEvents(before, moved, 0), 1), "nominal", "moving a task is not creating one");
  // Both at once: In progress is back to 2 tasks, so only the created count shows it.
  const both = board({ todo: ["To do", 3, 3], inProgress: ["In progress", 2, 2], done: ["Done", 1, 1] });
  assert.equal(currentStatus(detectStatusEvents(before, both, 0), 1), "task-created");
});

test("rematching a column or the daily reset is not a created task", () => {
  const before = board({ todo: ["To do", 3, 0] });
  assert.equal(currentStatus(detectStatusEvents(before, board({ todo: ["Backlog", 9, 4] }), 0), 1), "nominal");
  assert.equal(currentStatus(detectStatusEvents(board({ todo: ["To do", 3, 5] }), before, 0), 1), "nominal");
});

test("a changed value flashes bright then dim each second, then settles", () => {
  const phases = [0, 1000, 2000, 3000, 4000, 5000, 6000].map((t) => flashPhase(10_000, 10_000 + t));
  assert.deepEqual(phases, ["bright", "dim", "bright", "dim", "bright", "dim", null]);
  assert.equal(flashPhase(undefined, 0), null);
  assert.notEqual(continuousFlashPhase(1000), continuousFlashPhase(2000));
});
