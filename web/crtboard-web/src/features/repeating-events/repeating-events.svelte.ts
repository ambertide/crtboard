import { persisted } from "../../lib/persisted.svelte";
import { nearestOccurrence, parseCron } from "./cron";

/** An event shows on the CRT this long before it starts... */
export const TRACK_AHEAD_MS = 10 * 60_000;
/** ...and stays this long after. */
export const LINGER_MS = 10 * 60_000;

export interface RepeatingEvent {
  id: string;
  name: string;
  cron: string;
}

/** The event the CRT should count down to, or show as arrived. */
export interface EventTracker {
  name: string;
  at: number;
  arrived: boolean;
}

/** Repeating events such as a daily meeting, owned by the browser rather than `crtboardd`. */
class RepeatingEvents {
  readonly store = persisted<{ items: RepeatingEvent[] }>("crtboard:repeating-events", { items: [] });
  /** The eye button runs an event as if it were starting in ten minutes. */
  preview = $state<{ id: string; at: number } | null>(null);

  get items(): RepeatingEvent[] {
    return this.store.value.items;
  }

  add(): void {
    this.items.push({ id: crypto.randomUUID(), name: "", cron: "" });
  }

  remove(id: string): void {
    this.store.value.items = this.items.filter((event) => event.id !== id);
    if (this.preview?.id === id) this.preview = null;
  }

  togglePreview(id: string): void {
    this.preview = this.preview?.id === id ? null : { id, at: Date.now() + TRACK_AHEAD_MS };
  }

  tracker(now: number): EventTracker | null {
    const preview = this.preview && this.items.find((event) => event.id === this.preview?.id);
    if (this.preview && preview && now < this.preview.at + LINGER_MS) {
      return { name: preview.name, at: this.preview.at, arrived: now >= this.preview.at };
    }

    let best: EventTracker | null = null;
    for (const event of this.items) {
      const schedule = event.name.trim() ? parseCron(event.cron) : null;
      const at = schedule && nearestOccurrence(schedule, now, TRACK_AHEAD_MS, LINGER_MS);
      if (at === null || at === undefined) continue;
      const candidate = { name: event.name, at, arrived: at <= now };
      // Upcoming events win over ones that already started; then the soonest.
      if (!best || (best.arrived && !candidate.arrived) || (best.arrived === candidate.arrived && at < best.at)) {
        best = candidate;
      }
    }
    return best;
  }
}

export const repeatingEvents = new RepeatingEvents();
