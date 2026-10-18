import { untrack } from "svelte";
import { clock } from "../../lib/clock.svelte";
import { connector } from "../connector/connector.svelte";
import { COLUMN_KINDS, type ColumnKind, type EventSum } from "../connector/types";
import { repeatingEvents } from "../repeating-events/repeating-events.svelte";
import { deploymentAdvice, type DeploymentAdvice } from "./deployment";
import { continuousFlashPhase, flashPhase, type FlashPhase } from "./flash";
import {
  STATUS_HOLD_MS,
  columnTasks,
  currentStatus,
  detectStatusEvents,
  type StatusEvent,
  type StatusType,
} from "./status";

export interface TaskCount {
  kind: ColumnKind;
  count: number;
  flash: FlashPhase | null;
}

export interface RepoRow {
  name: string;
  branch: string;
  /** Open PRs opened by, or awaiting review from, the tracked users. */
  openPRs: number;
  openPRsFlash: FlashPhase | null;
  branchFlash: FlashPhase | null;
}

export type CenterView =
  | { kind: "normal"; status: StatusType; advice: DeploymentAdvice; statusFlash: FlashPhase | null; adviceFlash: FlashPhase | null }
  | { kind: "time"; name: string; remainingMs: number; statusFlash: FlashPhase | null };

/** Everything the CRT shows, derived from `crtboardd`, the clock and repeating events. */
class Dashboard {
  #statusEvents = $state<StatusEvent[]>([]);
  /** When each flashable value last changed. */
  #changedAt = $state<Record<string, number>>({});
  #previousSum: EventSum | null = null;
  #previousValues = new Map<string, unknown>();

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const sum = connector.sum;
        untrack(() => this.#receive(sum));
      });
      $effect(() => {
        const values = this.#flashableValues;
        untrack(() => this.#recordChanges(values));
      });
    });
  }

  readonly teamName = $derived(connector.settings.value.teamName);

  readonly time = $derived(
    new Date(clock.now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
  );

  readonly tasks: TaskCount[] = $derived(
    COLUMN_KINDS.map((kind) => ({
      kind,
      count: columnTasks(connector.sum, kind),
      flash: this.#flash(`tasks:${kind}`),
    })),
  );

  readonly repos: RepoRow[] = $derived(
    connector.settings.value.repos
      .filter((repo) => repo !== null)
      .map(({ name }) => {
        const summary = connector.sum?.gitRepos[name];
        return {
          name,
          branch: summary?.branch ?? "",
          openPRs: summary?.PRs ?? 0,
          openPRsFlash: this.#flash(`prs:${name}`),
          branchFlash: this.#flash(`branch:${name}`),
        };
      }),
  );

  readonly #tracker = $derived(repeatingEvents.tracker(clock.now));
  readonly #status = $derived(currentStatus(this.#statusEvents, clock.now));
  readonly #advice = $derived(deploymentAdvice(new Date(clock.now)));

  readonly center: CenterView = $derived.by(() => {
    const tracker = this.#tracker;
    if (tracker) {
      return {
        kind: "time",
        name: tracker.name,
        remainingMs: Math.max(0, tracker.at - clock.now),
        // Upcoming events flash until they start, then hold steady.
        statusFlash: tracker.arrived ? null : continuousFlashPhase(clock.now),
      };
    }
    const status = this.#status;
    return {
      kind: "normal",
      status,
      advice: this.#advice,
      // Raised statuses flash for as long as they are held; Nominal only when it returns.
      statusFlash: status === "nominal" ? this.#flash("status") : continuousFlashPhase(clock.now),
      adviceFlash: this.#flash("advice"),
    };
  });

  /** Values whose changes make their part of the screen flash; the clock and countdown never do. */
  readonly #flashableValues = $derived.by(() => {
    // Nothing flashes for the first payload after (re)connecting.
    if (!connector.sum) return null;
    const values: Record<string, unknown> = {
      status: this.#tracker ? `event:${this.#tracker.name}` : this.#status,
      advice: this.#advice,
    };
    for (const kind of COLUMN_KINDS) values[`tasks:${kind}`] = columnTasks(connector.sum, kind);
    for (const [name, repo] of Object.entries(connector.sum.gitRepos)) {
      values[`prs:${name}`] = repo.PRs;
      values[`branch:${name}`] = repo.branch;
    }
    return values;
  });

  #flash(key: string): FlashPhase | null {
    return flashPhase(this.#changedAt[key], clock.now);
  }

  #receive(sum: EventSum | null): void {
    const now = clock.now;
    if (sum && this.#previousSum) {
      const fresh = detectStatusEvents(this.#previousSum, sum, now);
      const live = this.#statusEvents.filter((event) => now - event.at < STATUS_HOLD_MS);
      if (fresh.length || live.length !== this.#statusEvents.length) this.#statusEvents = [...live, ...fresh];
    }
    this.#previousSum = sum;
  }

  #recordChanges(values: Record<string, unknown> | null): void {
    if (!values) {
      this.#previousValues.clear();
      return;
    }
    for (const [key, value] of Object.entries(values)) {
      const seen = this.#previousValues.has(key);
      if (seen && this.#previousValues.get(key) !== value) this.#changedAt[key] = clock.now;
      this.#previousValues.set(key, value);
    }
  }
}

export const dashboard = new Dashboard();
