import type { ColumnSummary, EventSum } from "../connector/types";

/** Variants of the Figma `Status` component, except the repeating-event one. */
export type StatusType = "nominal" | "review-requested" | "merged" | "new-pr" | "task-created";

export const STATUS_LABELS: Record<StatusType, string> = {
  nominal: "Nominal",
  "review-requested": "Review Requested",
  merged: "Merged",
  "new-pr": "Pull Request Created",
  "task-created": "task created",
};

/** Most important first: a review request outranks a newly opened PR. */
const PRIORITY: StatusType[] = ["review-requested", "new-pr", "merged", "task-created"];

/** How long a status stays, flashing, on the CRT after the change that raised it. */
export const STATUS_HOLD_MS = 5 * 60_000;

export interface StatusEvent {
  type: StatusType;
  at: number;
}

/** Status changes implied by two consecutive `CRTBOARD_EVENT_SUM` payloads. */
export function detectStatusEvents(previous: EventSum, next: EventSum, at: number): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (const [name, repo] of Object.entries(next.gitRepos)) {
    const before = previous.gitRepos[name];
    if (!before) continue;
    if (repo.reviewRequested > before.reviewRequested) events.push({ type: "review-requested", at });
    if (repo.PRs > before.PRs) events.push({ type: "new-pr", at });
    // The count restarts every day, so only a rise means a merge.
    if (repo.todaysMergedPRs > before.todaysMergedPRs) events.push({ type: "merged", at });
  }
  // Matching a different column changes the count without anyone adding a task.
  const before = column(previous, "TO_DO");
  const after = column(next, "TO_DO");
  if (before && after && before.matchedColumnName === after.matchedColumnName && after.tasks > before.tasks) {
    events.push({ type: "task-created", at });
  }
  return events;
}

/** The most important status raised within the hold time, or nominal. */
export function currentStatus(events: StatusEvent[], now: number): StatusType {
  const live = new Set(events.filter((e) => now - e.at < STATUS_HOLD_MS).map((e) => e.type));
  return PRIORITY.find((type) => live.has(type)) ?? "nominal";
}

/**
 * Task count for a column. `crtboardd` keys columns loosely (`todo`,
 * `TO_DO`, `inProgress`...), so keys are compared without case or separators.
 */
export function columnTasks(sum: EventSum | null, kind: string): number {
  return (sum && column(sum, kind)?.tasks) ?? 0;
}

function column(sum: EventSum, kind: string): ColumnSummary | undefined {
  const key = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");
  return Object.entries(sum.asanaBoards).find(([k]) => key(k) === key(kind))?.[1];
}
