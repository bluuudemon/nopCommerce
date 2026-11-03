import test from "node:test";
import assert from "node:assert/strict";
import { resetDemo } from "./actions.mjs";

const config = {
  branchPrefix: "demo-run/",
  demoLabel: "demo-run",
  protectedPullRequests: [1, 2],
  baseBranch: "develop",
};

test("resetDemo closes only eligible pull requests and deletes only tool branches", async () => {
  const closed = [];
  const deleted = [];
  const github = {
    async listOpenPulls() {
      return [
        { number: 1, state: "open", labels: [{ name: "demo-run" }], head: { ref: "demo-run/owned-by-pr-1" }, base: { ref: "develop" } },
        { number: 2, state: "open", labels: [{ name: "bug" }], head: { ref: "demo/agent-visualizer" }, base: { ref: "develop" } },
        { number: 30, state: "open", labels: [{ name: "demo-run" }], head: { ref: "demo-run/20261103T120000Z/fix/8424-negative-cash-rounding" }, base: { ref: "demo-run/20261103T120000Z-incident" } },
        { number: 31, state: "open", labels: [{ name: "demo-run" }], head: { ref: "fix/8424-negative-cash-rounding" }, base: { ref: "develop" } },
      ];
    },
    async closePull(number) { closed.push(number); },
    async listDemoRefs() {
      return [
        { ref: "refs/heads/develop" },
        { ref: "refs/heads/demo/agent-visualizer" },
        { ref: "refs/heads/demo-run/owned-by-pr-1" },
        { ref: "refs/heads/demo-run/20261103T120000Z-incident" },
        { ref: "refs/heads/demo-run/20261103T120000Z/fix/8424-negative-cash-rounding" },
      ];
    },
    async deleteBranch(name) { deleted.push(name); },
  };

  const result = await resetDemo({ github, config });
  assert.deepEqual(closed, [30]);
  assert.deepEqual(result.closed, [30]);
  assert.deepEqual(deleted, [
    "demo-run/20261103T120000Z-incident",
    "demo-run/20261103T120000Z/fix/8424-negative-cash-rounding",
  ]);
  assert.equal(deleted.includes("develop"), false);
  assert.equal(deleted.includes("demo-run/owned-by-pr-1"), false);
  assert.equal(deleted.includes("demo/agent-visualizer"), false);
});
