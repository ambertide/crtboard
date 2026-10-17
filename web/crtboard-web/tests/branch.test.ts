import assert from "node:assert/strict";
import { test } from "node:test";
import { branchCandidates } from "../src/features/crt-screen/branch.ts";

test("collapses path segments to initials from the left, keeping the last", () => {
  assert.deepEqual(branchCandidates("feature/tokenizer/add-ld"), [
    "feature/tokenizer/add-ld",
    "f/tokenizer/add-ld",
    "f/t/add-ld",
  ]);
});

test("leaves single-segment and already-short segments alone", () => {
  assert.deepEqual(branchCandidates("main"), ["main"]);
  assert.deepEqual(branchCandidates("a/b/c"), ["a/b/c"]);
  assert.deepEqual(branchCandidates("x/feature/c"), ["x/feature/c", "x/f/c"]);
});
