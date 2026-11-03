/**
 * Cursor Cloud Agents API adapter.
 *
 * Documented surface used here, from https://cursor.com/docs/cloud-agent/api/endpoints
 * (v1, api.cursor.com; Basic auth with the key as the username and an empty password,
 * which the docs also describe as `curl -u KEY:`; Bearer is also accepted):
 *
 *   POST /v1/agents
 *     body: prompt.text, name, repos[{ url, startingRef }], workOnCurrentBranch, autoCreatePR
 *     creates the agent and its first run
 *   POST /v1/agents/{id}/runs
 *     follow-up run. Same prompt.text field. 409 agent_busy if a run is active.
 *   GET  /v1/agents/{id}/runs/{runId}
 *     status (CREATING | RUNNING | FINISHED | ERROR | CANCELLED | EXPIRED),
 *     result text, durationMs, git.branches[]
 *   GET  /v1/agents/{id}/runs
 *     used only if create does not return a run id
 *   GET  /v1/agents/{id}
 *     agent status ACTIVE | IDLE | ARCHIVED
 *
 * TODO(unconfirmed): those docs do not describe a conversation-history route on v1.
 * Legacy GET /v0/agents/{id}/conversation is intentionally not called. Run results
 * are read from GET /v1/agents/{id}/runs/{runId} `result`. If a conversation route
 * is confirmed later, add it here and nowhere else.
 */

const BASE = "https://api.cursor.com";
const TERMINAL = new Set(["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]);

export function isTerminalStatus(status) {
  return TERMINAL.has(String(status || "").toUpperCase());
}

function basicAuth(apiKey) {
  return "Basic " + Buffer.from(String(apiKey) + ":", "utf8").toString("base64");
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function readLaunch(payload) {
  const body = asObject(payload);
  const agent = asObject(body.agent && body.agent.id ? body.agent : body);
  const run = asObject(body.run && body.run.id ? body.run : body.run || {});
  return {
    agentId: agent.id || body.id || null,
    runId: (body.run && body.run.id) || body.runId || run.id || null,
    status: (body.run && body.run.status) || body.status || agent.status || "CREATING",
  };
}

export function readRun(payload) {
  const body = asObject(payload);
  const run = asObject(body.run && (body.run.id || body.run.status) ? body.run : body);
  const branches = run.git && Array.isArray(run.git.branches) ? run.git.branches : [];
  return {
    runId: run.id || body.id || null,
    status: run.status || body.status || null,
    result: typeof run.result === "string" ? run.result : (typeof body.result === "string" ? body.result : ""),
    branches,
    prUrl: branches.map((item) => item && item.prUrl).find(Boolean) || run.prUrl || body.prUrl || null,
  };
}

export function createCursorClient({ apiKey, fetchImpl = fetch, log, signalTimeoutMs = 60000 }) {
  if (!apiKey) throw new Error("CURSOR_API_KEY is not set.");

  async function request(method, path, requestBody) {
    const headers = {
      Authorization: basicAuth(apiKey),
      Accept: "application/json",
    };
    if (requestBody !== undefined) headers["Content-Type"] = "application/json";
    const url = BASE + path;
    let response;
    let text = "";
    let parsed = null;
    let error = null;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
        signal: AbortSignal.timeout(signalTimeoutMs),
      });
      text = await response.text();
      parsed = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const message = parsed && parsed.message ? parsed.message : text.slice(0, 300);
        error = "HTTP " + response.status + (message ? ": " + message : "");
      }
    } catch (err) {
      error = err.message || String(err);
    }
    if (log) {
      log.add({
        method,
        url,
        request: requestBody ?? null,
        status: response ? response.status : 0,
        response: parsed !== null ? parsed : text,
        error,
      });
    }
    if (error) {
      const failure = new Error(error);
      failure.status = response ? response.status : 0;
      throw failure;
    }
    return parsed;
  }

  return {
    async launch({ name, prompt, repoUrl, startingRef, workOnCurrentBranch }) {
      const body = {
        name,
        prompt: { text: prompt },
        repos: [{ url: repoUrl, startingRef }],
        workOnCurrentBranch: Boolean(workOnCurrentBranch),
        autoCreatePR: false,
      };
      const created = await request("POST", "/v1/agents", body);
      const launch = readLaunch(created);
      if (launch.agentId && !launch.runId) {
        const runs = await request("GET", "/v1/agents/" + encodeURIComponent(launch.agentId) + "/runs");
        const list = Array.isArray(runs) ? runs : (runs && (runs.runs || runs.items)) || [];
        const first = list[0];
        if (first && first.id) {
          launch.runId = first.id;
          launch.status = first.status || launch.status;
        }
      }
      return launch;
    },

    async followUp(agentId, prompt) {
      const created = await request("POST", "/v1/agents/" + encodeURIComponent(agentId) + "/runs", {
        prompt: { text: prompt },
      });
      return readRun(created);
    },

    async getRun(agentId, runId) {
      const payload = await request(
        "GET",
        "/v1/agents/" + encodeURIComponent(agentId) + "/runs/" + encodeURIComponent(runId)
      );
      return readRun(payload);
    },

    async getAgent(agentId) {
      return request("GET", "/v1/agents/" + encodeURIComponent(agentId));
    },
  };
}
