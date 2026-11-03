import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrchestrator } from "./orchestrator.mjs";
import { createLog } from "./log.mjs";

const config = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "config", "demo.json"), "utf8"));

test("remediate waits for agents 2 and 3, then labels only the incident pull request", async () => {
  const calls = [];
  const runs = {
    "run-1": { status: "FINISHED", result: "fixed" },
    "run-2": { status: "RUNNING", result: "" },
    "run-3": { status: "FINISHED", result: "paypal tests pass on the incident branch" },
    "run-4": { status: "FINISHED", result: "17 findings" },
    "run-follow": { status: "FINISHED", result: "Opened https://github.com/bluuudemon/nopCommerce/pull/44" },
  };
  let sawRunningAgent2 = false;
  const cursor = {
    async launch({ name }) {
      calls.push("launch:" + name);
      const key = config.agents.find((agent) => agent.title === name).key;
      return { agentId: "bc-" + key, runId: "run-" + key.slice(-1), status: "RUNNING" };
    },
    async getRun(_agentId, runId) {
      if (runId === "run-2" && sawRunningAgent2) runs["run-2"].status = "FINISHED";
      if (runId === "run-2") sawRunningAgent2 = true;
      return { runId, status: runs[runId].status, result: runs[runId].result };
    },
    async followUp(agentId) {
      calls.push("follow:" + agentId);
      return { runId: "run-follow", status: "RUNNING", result: "" };
    },
  };
  const head = "demo-run/TEST/fix/8424-negative-cash-rounding";
  const github = {
    async listOpenPulls() {
      return [
        { number: 1, html_url: "https://github.com/bluuudemon/nopCommerce/pull/1", head: { ref: head }, base: { ref: "demo-run/TEST-incident" } },
        { number: 44, html_url: "https://github.com/bluuudemon/nopCommerce/pull/44", head: { ref: head }, base: { ref: "demo-run/TEST-incident" } },
      ];
    },
    async ensureLabel(name) { calls.push("label-ensure:" + name); },
    async addLabel(number) { calls.push("label-add:" + number); },
  };
  const log = createLog();
  const orchestrator = createOrchestrator({
    config,
    getCursor: () => cursor,
    getGitHub: () => github,
    log,
    sleep: async () => {},
    pollMs: 0,
    maxWaitMs: 5000,
  });
  await orchestrator.beginIncident(async () => ({
    runPrefix: "demo-run/TEST/",
    incidentBranch: "demo-run/TEST-incident",
    alert: {
      example: true,
      title: "Customer reports discount displayed as a charge",
      detail: "Example",
      filePath: config.alert.filePath,
      fileUrl: "https://github.com/bluuudemon/nopCommerce/blob/demo-run/TEST-incident/" + config.alert.filePath,
      branch: "demo-run/TEST-incident",
    },
  }));
  orchestrator.remediate();
  const deadline = Date.now() + 4000;
  let snap = orchestrator.snapshot();
  while (snap.phase === "remediating" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    snap = orchestrator.snapshot();
  }
  assert.equal(snap.phase, "done");
  assert.equal(snap.outcome.number, 44);
  assert.equal(snap.outcome.pr.endsWith("/pull/44"), true);
  assert.equal(calls.includes("follow:bc-agent1"), true);
  assert.equal(calls.includes("label-add:1"), false);
  assert.equal(calls.includes("label-add:44"), true);
  assert.equal(calls.filter((call) => call.startsWith("launch:")).length, 4);
});
