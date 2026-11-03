import test from "node:test";
import assert from "node:assert/strict";
import {
  isToolBranch,
  selectDemoPullRequests,
  selectDemoBranches,
  protectedHeadsFromUntouchedPulls,
} from "./reset-logic.mjs";
import { restoreAsymmetricRound, incidentNames } from "./incident-logic.mjs";

const OPTIONS = {
  branchPrefix: "demo-run/",
  label: "demo-run",
  protectedNumbers: [1, 2],
};

function pull(partial) {
  return {
    state: "open",
    labels: [{ name: "demo-run" }],
    head: { ref: "demo-run/20261103T120000Z-incident" },
    base: { ref: "develop" },
    ...partial,
  };
}

test("selects only open demo-run pull requests and never #1 or #2", () => {
  const selected = selectDemoPullRequests([
    pull({ number: 1, head: { ref: "demo-run/should-not-matter" } }),
    pull({ number: 2, head: { ref: "demo-run/visualizer-should-not-matter" } }),
    pull({ number: 9, head: { ref: "fix/8424-negative-cash-rounding" } }),
    pull({ number: 10, state: "closed", head: { ref: "demo-run/old" } }),
    pull({ number: 11, labels: [], head: { ref: "demo-run/unlabeled" } }),
    pull({ number: 12, labels: ["demo-run"], head: { ref: "demo-run/20261103T120000Z/fix/8424-negative-cash-rounding" } }),
    pull({ number: 13, head: { ref: "develop" } }),
    pull({ number: 14, head: { ref: "demo-run/../develop" } }),
    pull({ number: 15, head: { ref: "demo/agent-visualizer" } }),
    pull({ number: 16, base: { ref: "demo-run/20261103T120000Z-incident" } }),
  ], OPTIONS);

  assert.deepEqual(selected.map((item) => item.number), [12, 16]);
});

test("selects only tool branches and never develop or the visualizer branch", () => {
  const selected = selectDemoBranches([
    "develop",
    "main",
    "master",
    "demo/agent-visualizer",
    "fix/8424-negative-cash-rounding",
    "test/8424-negative-canround",
    "demo-run",
    "demo-run/../develop",
    "demo-run/./secret",
    "/demo-run/absolute",
    "demo-run/20261103T120000Z-incident",
    "demo-run/20261103T120000Z/fix/8424-negative-cash-rounding",
    "demo-run/20261103T120000Z/test/8424-negative-canround",
    "cursor/some-agent-branch",
  ], {
    branchPrefix: "demo-run/",
    protectedNames: ["develop", "demo-run/keep-because-pr-1"],
  });

  assert.deepEqual(selected, [
    "demo-run/20261103T120000Z-incident",
    "demo-run/20261103T120000Z/fix/8424-negative-cash-rounding",
    "demo-run/20261103T120000Z/test/8424-negative-canround",
  ]);
});

test("does not delete the head of a pull request that reset refused to close", () => {
  const pulls = [
    pull({ number: 1, head: { ref: "demo-run/owned-by-pr-1" } }),
    pull({ number: 40 }),
  ];
  const selected = selectDemoPullRequests(pulls, OPTIONS);
  const protectedNames = protectedHeadsFromUntouchedPulls(pulls, selected);
  const branches = selectDemoBranches([
    "demo-run/owned-by-pr-1",
    "demo-run/20261103T120000Z-incident",
    "develop",
  ], { branchPrefix: "demo-run/", protectedNames });

  assert.deepEqual(selected.map((item) => item.number), [40]);
  assert.deepEqual(branches, ["demo-run/20261103T120000Z-incident"]);
  assert.equal(isToolBranch("develop", "demo-run/"), false);
  assert.equal(isToolBranch("demo-run/owned-by-pr-1", "demo-run/"), true);
});

test("restores the asymmetric Round method only when the guard is present", () => {
  const guard = "if (value < 0) return -Round(-value, roundingType);";
  const original = [
    "public virtual decimal Round(decimal value, RoundingType roundingType)",
    "{",
    "    var rez = Math.Round(value, 2);",
    "}",
  ].join("\n");
  const fixed = [
    "public virtual decimal Round(decimal value, RoundingType roundingType)",
    "{",
    "    // nopSolutions/nopCommerce#8424 sign-symmetric",
    "    if (value < 0) return -Round(-value, roundingType);",
    "    var rez = Math.Round(value, 2);",
    "}",
  ].join("\n");

  const untouched = restoreAsymmetricRound(original, guard);
  assert.equal(untouched.changed, false);
  assert.equal(untouched.source, original);

  const restored = restoreAsymmetricRound(fixed, guard);
  assert.equal(restored.changed, true);
  assert.equal(restored.source.includes(guard), false);
  assert.equal(restored.source.includes("#8424"), false);
  assert.equal(restored.source.includes("var rez = Math.Round(value, 2);"), true);

  const names = incidentNames(new Date("2026-11-03T17:30:45.000Z"));
  assert.equal(names.incidentBranch, "demo-run/20261103T173045Z-incident");
  assert.equal(names.runPrefix, "demo-run/20261103T173045Z/");
  assert.equal(names.incidentBranch.startsWith("demo-run/"), true);
});
