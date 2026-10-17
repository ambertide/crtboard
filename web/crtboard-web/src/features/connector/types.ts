/** The four board columns shown on the CRT, as `crtboardd` names them. */
export const COLUMN_KINDS = ["TO_DO", "BLOCKED", "IN_PROGRESS", "DONE"] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

export interface AsanaBoard {
  id: string;
  name: string;
  availableColumns: string[];
}

export interface GitRepo {
  name: string;
  path: string;
}

/** `GET /resources/available` */
export interface AvailableResources {
  asanaBoards: AsanaBoard[];
  gitRepos: GitRepo[];
}

/** Response of `POST /resources/{git,asana}/tracked`. */
export interface TrackedResource {
  id: string;
}

export interface TrackedRepoBody {
  name: string;
}

export interface TrackedBoardBody {
  name: string;
  columns: Record<ColumnKind, string | null>;
}

export interface RepoSummary {
  PRs: number;
  todaysMergedPRs: number;
  branch: string;
  reviewRequested: number;
}

export interface ColumnSummary {
  matchedColumnName: string;
  tasks: number;
}

/** Payload of the `CRTBOARD_EVENT_SUM` server-sent event. */
export interface EventSum {
  gitRepos: Record<string, RepoSummary>;
  asanaBoards: Record<string, ColumnSummary>;
}
