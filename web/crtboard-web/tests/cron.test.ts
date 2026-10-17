import assert from "node:assert/strict";
import { test } from "node:test";
import { nearestOccurrence, parseCron } from "../src/features/repeating-events/cron.ts";

const at = (iso: string) => new Date(iso);
const MINUTE = 60_000;

test("rejects malformed expressions", () => {
  for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "5-1 * * * *", "*/0 * * * *", "a * * * *"]) {
    assert.equal(parseCron(bad), null, bad);
  }
});

test("matches fixed times, ranges, lists and steps", () => {
  const weekdays = parseCron("30 10 * * 1-5")!;
  assert.ok(weekdays.matches(at("2026-10-16T10:30:00"))); // Friday
  assert.ok(!weekdays.matches(at("2026-10-17T10:30:00"))); // Saturday
  assert.ok(!weekdays.matches(at("2026-10-16T10:31:00")));

  const quarters = parseCron("*/15 9,17 * * *")!;
  assert.ok(quarters.matches(at("2026-10-17T09:45:00")));
  assert.ok(quarters.matches(at("2026-10-17T17:00:00")));
  assert.ok(!quarters.matches(at("2026-10-17T12:00:00")));
});

test("treats 7 as Sunday and ORs restricted day fields", () => {
  assert.ok(parseCron("0 12 * * 7")!.matches(at("2026-10-18T12:00:00")));
  const firstOrMonday = parseCron("0 9 1 * 1")!;
  assert.ok(firstOrMonday.matches(at("2026-10-01T09:00:00"))); // Thursday the 1st
  assert.ok(firstOrMonday.matches(at("2026-10-19T09:00:00"))); // Monday the 19th
  assert.ok(!firstOrMonday.matches(at("2026-10-20T09:00:00")));
});

test("finds the upcoming occurrence, then a recent one", () => {
  const daily = parseCron("30 10 * * *")!;
  const before = at("2026-10-17T10:21:54").getTime();
  assert.equal(nearestOccurrence(daily, before, 10 * MINUTE, 10 * MINUTE), at("2026-10-17T10:30:00").getTime());

  const after = at("2026-10-17T10:35:00").getTime();
  assert.equal(nearestOccurrence(daily, after, 10 * MINUTE, 10 * MINUTE), at("2026-10-17T10:30:00").getTime());

  const later = at("2026-10-17T10:41:00").getTime();
  assert.equal(nearestOccurrence(daily, later, 10 * MINUTE, 10 * MINUTE), null);
});
