/** A five-field crontab schedule: minute, hour, day of month, month, day of week. */
export interface CronSchedule {
  matches(date: Date): boolean;
}

const MINUTE_MS = 60_000;

const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const;

/** Parses a crontab expression such as `30 10 * * 1-5`; returns null when it is invalid. */
export function parseCron(expression: string): CronSchedule | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== FIELDS.length) return null;
  const sets = parts.map((part, i) => parseField(part, FIELDS[i].min, FIELDS[i].max));
  if (sets.some((set) => set === null)) return null;
  const [minutes, hours, days, months, weekdays] = sets as Set<number>[];
  if (weekdays.has(7)) weekdays.add(0);

  // Cron matches either day field when both are restricted.
  const anyDay = parts[2] === "*";
  const anyWeekday = parts[4] === "*";
  return {
    matches(date) {
      const day = days.has(date.getDate());
      const weekday = weekdays.has(date.getDay());
      const dayMatches = anyDay || anyWeekday ? day && weekday : day || weekday;
      return (
        minutes.has(date.getMinutes()) &&
        hours.has(date.getHours()) &&
        months.has(date.getMonth() + 1) &&
        dayMatches
      );
    },
  };
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();
  for (const item of field.split(",")) {
    const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(item);
    if (!match) return null;
    const [, range, start, end, step] = match;
    const from = range === "*" ? min : Number(start);
    const to = range === "*" ? max : end !== undefined ? Number(end) : step ? max : from;
    const by = step ? Number(step) : 1;
    if (from < min || to > max || from > to || by < 1) return null;
    for (let v = from; v <= to; v += by) values.add(v);
  }
  return values;
}

/**
 * The occurrence nearest to `now`: the next one if it starts within `ahead`
 * milliseconds, otherwise the latest one that started within `behind`.
 */
export function nearestOccurrence(
  schedule: CronSchedule,
  now: number,
  ahead: number,
  behind: number,
): number | null {
  const thisMinute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  for (let t = thisMinute; t <= now + ahead; t += MINUTE_MS) {
    if (t > now && schedule.matches(new Date(t))) return t;
  }
  for (let t = thisMinute; t >= now - behind; t -= MINUTE_MS) {
    if (schedule.matches(new Date(t))) return t;
  }
  return null;
}
