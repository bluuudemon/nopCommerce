import test from "node:test";
import assert from "node:assert/strict";
import { createCursorClient, readLaunch, readRun } from "./cursor-api.mjs";
import { createLog } from "./log.mjs";

test("launch reads the documented agent and run envelope", () => {
  const launch = readLaunch({
    agent: { id: "bc-123" },
    run: { id: "run-9", status: "CREATING" },
  });
  assert.equal(launch.agentId, "bc-123");
  assert.equal(launch.runId, "run-9");
  assert.equal(launch.status, "CREATING");
});

test("run reader keeps result text and a pull request url from git.branches", () => {
  const run = readRun({
    id: "run-9",
    status: "FINISHED",
    result: "PR opened: https://github.com/bluuudemon/nopCommerce/pull/40",
    git: { branches: [{ prUrl: "https://github.com/bluuudemon/nopCommerce/pull/40" }] },
  });
  assert.equal(run.status, "FINISHED");
  assert.match(run.result, /pull\/40/);
  assert.match(run.prUrl, /pull\/40/);
});

test("the call log records the body and never the Authorization header", async () => {
  const log = createLog();
  let seenAuth = null;
  const fetchImpl = async (url, options) => {
    seenAuth = options.headers.Authorization;
    assert.equal(Object.prototype.hasOwnProperty.call(options, "headers"), true);
    return new Response(JSON.stringify({
      agent: { id: "bc-1" },
      run: { id: "run-1", status: "CREATING" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createCursorClient({
    apiKey: "crsr_secret_value",
    fetchImpl,
    log,
  });
  await client.launch({
    name: "Agent 1",
    prompt: "Create branch demo-run/example/fix",
    repoUrl: "https://github.com/bluuudemon/nopCommerce",
    startingRef: "demo-run/example-incident",
    workOnCurrentBranch: true,
  });
  assert.match(seenAuth, /^Basic /);
  assert.equal(log.entries.length, 1);
  const entry = log.entries[0];
  assert.equal(entry.url, "https://api.cursor.com/v1/agents");
  assert.equal(entry.request.autoCreatePR, false);
  assert.equal(entry.request.repos[0].startingRef, "demo-run/example-incident");
  assert.equal(JSON.stringify(entry).includes("crsr_secret_value"), false);
  assert.equal(JSON.stringify(entry).includes("Authorization"), false);
  assert.throws(() => log.add({ headers: { Authorization: "Bearer crsr_secret_value" } }));
});
