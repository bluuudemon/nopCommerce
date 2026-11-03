import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createLog } from "./log.mjs";
import { createGitHubClient } from "./github-api.mjs";
import { createCursorClient } from "./cursor-api.mjs";
import { createOrchestrator } from "./orchestrator.mjs";
import { resetDemo, introduceIncident } from "./actions.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 8787);
const config = JSON.parse(readFileSync(join(ROOT, "config", "demo.json"), "utf8"));
const log = createLog();

let github;
let cursor;

function githubClient() {
  if (!process.env.GITHUB_TOKEN) {
    const error = new Error("GITHUB_TOKEN is not set. Export it in the shell that starts this server. Do not put it in a file.");
    error.status = 400;
    throw error;
  }
  if (!github) {
    github = createGitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: config.owner,
      repo: config.name,
      log,
    });
  }
  return github;
}

function cursorClient() {
  if (!process.env.CURSOR_API_KEY) return null;
  if (!cursor) {
    cursor = createCursorClient({ apiKey: process.env.CURSOR_API_KEY, log });
  }
  return cursor;
}

const orchestrator = createOrchestrator({
  config,
  getCursor: cursorClient,
  getGitHub: githubClient,
  log,
  pollMs: Number(process.env.DEMO_POLL_MS || 8000),
});

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function send(res, status, body, type) {
  const payload = Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function health() {
  return {
    cursor: Boolean(process.env.CURSOR_API_KEY),
    github: Boolean(process.env.GITHUB_TOKEN),
    repo: config.repo,
    baseBranch: config.baseBranch,
    mode: process.env.CURSOR_API_KEY ? "live" : "simulated",
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function confirmed(body) {
  if (!body || body.confirm !== true) {
    const error = new Error("Confirmation required.");
    error.status = 400;
    throw error;
  }
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(ROOT, decodeURIComponent(requested)));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + "/")) {
    send(res, 403, { error: "Forbidden." });
    return;
  }
  try {
    const data = await readFile(filePath);
    send(res, 200, data, TYPES[extname(filePath)] || "application/octet-stream");
  } catch {
    send(res, 404, { error: "Not found." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, health());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      send(res, 200, { ...orchestrator.snapshot(), health: health() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      confirmed(await readBody(req));
      const result = await orchestrator.reset(() => resetDemo({ github: githubClient(), config }));
      send(res, 200, { ...orchestrator.snapshot(), result });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/incident") {
      confirmed(await readBody(req));
      const incident = await orchestrator.beginIncident(() => introduceIncident({
        github: githubClient(),
        config,
      }));
      send(res, 200, { ...orchestrator.snapshot(), incident });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/remediate") {
      confirmed(await readBody(req));
      if (!process.env.CURSOR_API_KEY) {
        send(res, 409, {
          ...orchestrator.snapshot(),
          simulated: true,
          error: "CURSOR_API_KEY is not set. The page should run the simulated replay instead.",
        });
        return;
      }
      if (!orchestrator.snapshot().alert) {
        send(res, 400, { error: "Introduce the incident before remediating." });
        return;
      }
      orchestrator.remediate();
      send(res, 202, orchestrator.snapshot());
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      send(res, 404, { error: "No such API route." });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { error: "Method not allowed." });
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    send(res, err.status || 500, {
      ...orchestrator.snapshot(),
      error: err.message || "Request failed.",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Demo visualizer at http://127.0.0.1:" + PORT + "/");
  console.log("Cursor API key: " + (process.env.CURSOR_API_KEY ? "set" : "missing (remediate stays simulated)"));
  console.log("GitHub token: " + (process.env.GITHUB_TOKEN ? "set" : "missing (reset and incident stay unavailable)"));
});
