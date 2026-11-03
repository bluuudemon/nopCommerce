import { fill } from "./fill.mjs";
import { isTerminalStatus } from "./cursor-api.mjs";
import { pullFromText } from "./actions.mjs";

export function createOrchestrator({ config, getCursor, getGitHub, log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = 8000, maxWaitMs = 45 * 60 * 1000 }) {
  const state = {
    phase: "idle",
    busy: false,
    error: null,
    simulated: false,
    alert: null,
    names: null,
    agents: [],
    outcome: null,
    alertAt: null,
    prAt: null,
  };

  function snapshot() {
    const end = state.prAt ? Date.parse(state.prAt) : Date.now();
    const start = state.alertAt ? Date.parse(state.alertAt) : null;
    return {
      phase: state.phase,
      busy: state.busy,
      error: state.error,
      simulated: false,
      alert: state.alert,
      agents: state.agents.map(publicAgent),
      outcome: state.outcome,
      elapsedMs: start == null ? 0 : Math.max(0, end - start),
      log: log.entries,
    };
  }

  function guard() {
    if (state.busy) {
      const error = new Error("A demo action is already running.");
      error.status = 409;
      throw error;
    }
  }

  async function run(phase, fn) {
    guard();
    state.busy = true;
    state.error = null;
    state.phase = phase;
    try {
      return await fn();
    } catch (err) {
      state.phase = "error";
      state.error = err.message || String(err);
      throw err;
    } finally {
      state.busy = false;
    }
  }

  return {
    snapshot,
    reset(work) {
      return run("resetting", async () => {
        state.alert = null;
        state.names = null;
        state.agents = [];
        state.outcome = null;
        state.alertAt = null;
        state.prAt = null;
        state.error = null;
        log.clear();
        const result = await work();
        state.phase = "idle";
        return result;
      });
    },
    async beginIncident(builder) {
      return run("introducing", async () => {
        const incident = await builder();
        state.names = incident;
        state.alert = incident.alert;
        state.alertAt = new Date().toISOString();
        state.outcome = null;
        state.prAt = null;
        state.agents = [];
        state.phase = "incident";
        return incident;
      });
    },
    remediate() {
      guard();
      const cursor = getCursor();
      const github = getGitHub();
      if (!cursor) {
        const error = new Error("CURSOR_API_KEY is not set.");
        error.status = 409;
        throw error;
      }
      state.busy = true;
      state.error = null;
      state.phase = "remediating";
      remediateLive({ state, config, cursor, github, sleep, pollMs, maxWaitMs })
        .catch((err) => {
          state.phase = "error";
          state.error = err.message || String(err);
        })
        .finally(() => {
          state.busy = false;
        });
    },
  };
}

function publicAgent(agent) {
  return {
    key: agent.key,
    number: agent.number,
    title: agent.title,
    role: agent.role,
    branch: agent.branch,
    readOnly: agent.readOnly,
    status: agent.status,
    agentId: agent.agentId,
    runId: agent.runId,
    launchedAt: agent.launchedAt,
    finishedAt: agent.finishedAt,
    output: agent.output || "",
    changes: agent.readOnly ? "read-only" : null,
  };
}

async function remediateLive({ state, config, cursor, github, sleep, pollMs, maxWaitMs }) {
  if (!state.names || !state.alert) {
    throw new Error("Introduce the incident before remediating.");
  }
  const prefix = state.names.runPrefix;
  const startingRef = state.names.incidentBranch;
  state.agents = config.agents.map((agent) => ({
    key: agent.key,
    number: agent.number,
    title: agent.title,
    role: agent.role,
    readOnly: Boolean(agent.readOnly),
    gatesFollowUp: Boolean(agent.gatesFollowUp),
    opensPullRequest: Boolean(agent.opensPullRequest),
    branch: agent.branchTemplate ? fill(agent.branchTemplate, { prefix }) : null,
    status: "CREATING",
    agentId: null,
    runId: null,
    launchedAt: null,
    finishedAt: null,
    output: "",
  }));

  await Promise.all(state.agents.map(async (agent, index) => {
    const spec = config.agents[index];
    const prompt = fill(spec.prompt, { startingRef, branch: agent.branch || "" });
    try {
      const launch = await cursor.launch({
        name: spec.title,
        prompt,
        repoUrl: config.repo,
        startingRef,
        workOnCurrentBranch: true,
      });
      agent.agentId = launch.agentId;
      agent.runId = launch.runId;
      agent.status = launch.status || "CREATING";
      agent.launchedAt = new Date().toISOString();
    } catch (err) {
      agent.status = "ERROR";
      agent.finishedAt = new Date().toISOString();
      agent.output = err.message || String(err);
    }
  }));

  const started = Date.now();
  let followUpSent = false;
  let followUpRunId = null;
  while (Date.now() - started < maxWaitMs) {
    let pending = false;
    for (const agent of state.agents) {
      if (!agent.agentId || !agent.runId || isTerminalStatus(agent.status)) continue;
      pending = true;
      try {
        const run = await cursor.getRun(agent.agentId, agent.runId);
        agent.status = run.status || agent.status;
        if (run.result) agent.output = run.result;
        if (isTerminalStatus(agent.status)) agent.finishedAt = agent.finishedAt || new Date().toISOString();
      } catch (err) {
        agent.output = err.message || String(err);
      }
    }

    const gates = state.agents.filter((agent) => agent.gatesFollowUp);
    const gatesReady = gates.length > 0 && gates.every((agent) => agent.status === "FINISHED");
    const opener = state.agents.find((agent) => agent.opensPullRequest);
    if (!followUpSent && gatesReady && opener && opener.agentId && isTerminalStatus(opener.status)) {
      const branch2 = state.agents.find((agent) => agent.key === "agent2");
      const branch3 = state.agents.find((agent) => agent.key === "agent3");
      const prompt = fill(config.followUp, {
        startingRef,
        branch1: opener.branch,
        branch2: branch2.branch,
        branch3: branch3.branch,
        prTitle: config.prTitle,
        prBody: config.prBody,
      });
      const follow = await cursor.followUp(opener.agentId, prompt);
      followUpSent = true;
      followUpRunId = follow.runId;
      opener.runId = follow.runId || opener.runId;
      opener.status = follow.status || "CREATING";
      opener.finishedAt = null;
      opener.output = "";
      pending = true;
    }

    if (followUpSent && opener && followUpRunId && opener.runId === followUpRunId && isTerminalStatus(opener.status)) {
      await adoptPullRequest({ state, config, github, opener });
      state.phase = state.outcome ? "done" : "error";
      if (!state.outcome) state.error = state.error || "The follow-up finished without a demo-run pull request.";
      return state.outcome;
    }

    if (!pending && followUpSent) break;
    if (!pending && !gatesReady) {
      state.error = "Agents 2 and 3 did not both finish, so the consolidation follow-up was not sent.";
      state.phase = "error";
      return null;
    }
    if (!pending && gatesReady && opener && !isTerminalStatus(opener.status)) {
      pending = true;
    }
    if (!pending) break;
    await sleep(pollMs);
  }

  if (state.phase !== "done") {
    state.error = state.error || "Timed out waiting for the cloud agents.";
    state.phase = "error";
  }
  return state.outcome;
}

async function adoptPullRequest({ state, config, github, opener }) {
  const pulls = await github.listOpenPulls();
  const match = pulls.find((pull) => {
    const head = pull.head && pull.head.ref;
    const base = pull.base && pull.base.ref;
    return head === opener.branch
      && base === state.names.incidentBranch
      && !config.protectedPullRequests.includes(pull.number);
  });
  let chosen = match;
  if (!chosen) {
    const fromText = pullFromText(opener.output, config.repo);
    if (fromText && !config.protectedPullRequests.includes(fromText.number)) {
      chosen = pulls.find((pull) => pull.number === fromText.number && pull.head && pull.head.ref === opener.branch);
    }
  }
  if (!chosen) {
    state.error = "No open pull request was found whose head is the demo-run fix branch and whose base is the incident branch.";
    return;
  }
  await github.ensureLabel(config.demoLabel, "Opened by the cloud agent demo visualizer");
  await github.addLabel(chosen.number, config.demoLabel);
  state.prAt = new Date().toISOString();
  const elapsedMin = Math.max(1, Math.round((Date.parse(state.prAt) - Date.parse(state.alertAt)) / 60000));
  state.outcome = {
    pr: chosen.html_url || (config.repo + "/pull/" + chosen.number),
    number: chosen.number,
    alertToPr: elapsedMin + " min from the example alert to the pull request",
    simulated: false,
  };
  state.phase = "done";
}
