import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentAdvice } from "../src/features/crt-screen/deployment.ts";

// 2026-10-12 is a Monday, 2026-10-16 a Friday.
const cases: [string, string][] = [
  ["2026-10-12T03:59", "do-not-deploy"],
  ["2026-10-12T04:00", "avoid"],
  ["2026-10-12T05:59", "avoid"],
  ["2026-10-12T06:00", "go"],
  ["2026-10-15T16:29", "go"],
  ["2026-10-15T16:30", "avoid"],
  ["2026-10-15T20:29", "avoid"],
  ["2026-10-15T20:30", "do-not-deploy"],
  ["2026-10-16T03:59", "do-not-deploy"],
  ["2026-10-16T04:00", "avoid"],
  ["2026-10-16T09:00", "avoid"],
  ["2026-10-16T11:59", "avoid"],
  ["2026-10-16T12:00", "do-not-deploy"],
  ["2026-10-17T10:00", "do-not-deploy"],
  ["2026-10-18T10:00", "do-not-deploy"],
];

test("deployment advice follows the weekly schedule", () => {
  for (const [time, advice] of cases) assert.equal(deploymentAdvice(new Date(time)), advice, time);
});
