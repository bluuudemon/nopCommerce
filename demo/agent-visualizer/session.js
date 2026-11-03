(function () {
  "use strict";

  var COLORS = ["#9fbbe0", "#e4c27a", "#9fc9a2", "#c0a8dd"];
  var SIM_MS = 15000;
  var mode = "recorded";
  var health = { cursor: false, github: false };
  var pollTimer = 0;
  var simTimer = 0;
  var simStart = 0;
  var elapsedTimer = 0;
  var elapsedStart = 0;
  var elapsedStop = 0;

  var recordedExec = document.getElementById("recorded-exec");
  var sessionExec = document.getElementById("session-exec");
  var recordedDev = document.getElementById("recorded-dev");
  var sessionDev = document.getElementById("session-dev");
  var liveBar = document.getElementById("live-bar");
  var replayWrap = document.getElementById("replay-wrap");
  var banner = document.getElementById("session-banner");
  var note = document.getElementById("mode-note");
  var elapsed = document.getElementById("elapsed");

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function parseClock(label) {
    var match = String(label || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    if (match[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (match[3].toUpperCase() === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  function recordedData() {
    return JSON.parse(document.getElementById("fallback-data").textContent);
  }

  function formatElapsed(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function setMode(next) {
    mode = next;
    document.documentElement.dataset.demoMode = next;
    document.body.classList.toggle("mode-session", next !== "recorded");
    ["recorded", "live", "simulated"].forEach(function (name) {
      document.getElementById("mode-" + name).setAttribute("aria-pressed", String(name === next));
    });
    var session = next !== "recorded";
    recordedExec.hidden = session;
    recordedDev.hidden = session;
    sessionExec.hidden = !session;
    sessionDev.hidden = !session;
    liveBar.hidden = !session;
    replayWrap.hidden = session;
    if (next === "recorded") {
      stopSim();
      stopElapsed();
      return;
    }
    if (next === "simulated") {
      banner.textContent = "Simulated. This replays the recorded Nov 3 run. No cloud agent is launched and no branch is created.";
      note.textContent = "Simulated replay. Reset, incident, and remediate stay on this machine.";
      renderSim(0);
      return;
    }
    banner.textContent = health.cursor
      ? "Live. Remediate launches real cloud agents and uses Cursor quota."
      : "Live controls need the demo server. CURSOR_API_KEY is not set here, so Remediate will simulate.";
    note.textContent = health.github
      ? "Reset and incident call GitHub for this repository only."
      : "GITHUB_TOKEN is not set. Reset and incident cannot change the repository.";
    refreshLive();
  }

  function confirmAction(message) {
    return window.confirm(message);
  }

  async function post(path) {
    var response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    var body = await response.json();
    if (!response.ok && response.status !== 202) {
      throw new Error(body.error || "Request failed.");
    }
    return body;
  }

  function paintAgents(agents, progress) {
    var lanes = document.getElementById("session-lanes");
    lanes.replaceChildren();
    var start = null;
    var end = null;
    agents.forEach(function (agent) {
      if (agent.launchedAt) {
        var launched = Date.parse(agent.launchedAt);
        if (start == null || launched < start) start = launched;
        var finished = agent.finishedAt ? Date.parse(agent.finishedAt) : Date.now();
        if (end == null || finished > end) end = finished;
      }
    });
    agents.forEach(function (agent, index) {
      var card = el("article", "lane");
      card.style.setProperty("--lane", COLORS[index % COLORS.length]);
      var top = el("div", "lane-top");
      top.appendChild(el("span", "badge", agent.number));
      var heading = el("h3");
      heading.appendChild(el("span", "visually-hidden", "Agent " + agent.number + ". "));
      heading.appendChild(document.createTextNode(agent.role));
      top.appendChild(heading);
      var terminal = agent.status === "FINISHED" || agent.status === "ERROR" || agent.status === "CANCELLED" || agent.status === "EXPIRED";
      var pillText = terminal ? agent.status : (mode === "simulated" ? "RUNNING · simulated" : ((agent.status || "Waiting") + " · live"));
      top.appendChild(el("span", "pill" + (terminal ? "" : " is-inferred"), pillText));
      card.appendChild(top);
      var track = el("div", "track");
      var bar = el("span", "bar");
      var width = 0;
      if (progress != null) {
        width = Math.max(0, Math.min(100, progress * 100));
        if (agent.doneAt != null) width = Math.min(width, agent.doneAt * 100);
      } else if (start != null && end != null && end > start && agent.launchedAt) {
        var launchedAt = Date.parse(agent.launchedAt);
        var finishedAt = agent.finishedAt ? Date.parse(agent.finishedAt) : Date.now();
        width = ((finishedAt - launchedAt) / (end - start)) * 100;
      }
      bar.style.width = width + "%";
      track.appendChild(bar);
      card.appendChild(track);
      var branch = agent.branch || (agent.readOnly ? "No branch" : "Branch pending");
      var changes = agent.changes || (terminal && !agent.readOnly ? "See the call log" : "In progress");
      card.appendChild(el("p", "meta", branch + " · " + changes));
      card.appendChild(el("p", "result", agent.output ? firstLine(agent.output) : "No result yet."));
      lanes.appendChild(card);
    });
  }

  function firstLine(text) {
    var trimmed = String(text || "").trim();
    var match = trimmed.match(/^[\s\S]+?\.(?=\s|$)/);
    return match ? match[0] : trimmed;
  }

  function paintLog(entries, simulated) {
    var host = document.getElementById("session-calls");
    host.replaceChildren();
    document.getElementById("session-dev-note").textContent = simulated
      ? "Simulated entries describe the recorded run. They were not sent to Cursor or GitHub."
      : "Each row is a real API call from this server. The Authorization header is not recorded.";
    (entries || []).forEach(function (entry, index) {
      var card = el("article", "call");
      var head = el("div", "call-head");
      head.appendChild(el("span", "call-index", String(index + 1).padStart(2, "0")));
      head.appendChild(el("span", "call-time", entry.at || ""));
      head.appendChild(el("span", "action-pill", entry.simulated ? "simulated" : entry.method));
      head.appendChild(el("span", "call-title", entry.url || ""));
      card.appendChild(head);
      var trace = el("p", "trace");
      trace.appendChild(hop("request", entry.method + " " + (entry.url || "")));
      trace.appendChild(el("span", "arrow", "→"));
      trace.appendChild(hop("agent id", agentIdFrom(entry) || "none"));
      trace.appendChild(el("span", "arrow", "→"));
      trace.appendChild(hop("result", entry.error || ("HTTP " + entry.status)));
      card.appendChild(trace);
      card.appendChild(el("h2", "block-label", "Request"));
      card.appendChild(el("pre", "output", JSON.stringify(entry.request, null, 2)));
      card.appendChild(el("h2", "block-label", "Response"));
      card.appendChild(el("pre", "output", JSON.stringify(entry.response, null, 2)));
      host.appendChild(card);
    });
  }

  function hop(label, value) {
    var node = el("span", "hop");
    node.appendChild(el("span", "hop-k", label));
    node.appendChild(el("span", "hop-v", value));
    return node;
  }

  function agentIdFrom(entry) {
    var request = entry.request || {};
    var response = entry.response || {};
    return (response.agent && response.agent.id) || response.id || request.agentId || null;
  }

  function showAlert(alert, simulatedNote) {
    var card = document.getElementById("alert-card");
    if (!alert) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    document.getElementById("alert-title").textContent = alert.title;
    document.getElementById("alert-detail").textContent = alert.detail + (simulatedNote ? " " + simulatedNote : "");
    var link = document.getElementById("alert-file");
    link.href = alert.fileUrl;
    link.textContent = alert.filePath;
    var branch = document.getElementById("alert-branch");
    if (alert.branch) {
      branch.textContent = alert.bugReintroduced
        ? "Incident branch " + alert.branch + ". The sign-symmetric guard was removed on this branch only."
        : "Incident branch " + alert.branch + ". develop does not have the sign-symmetric guard, so the bug is already on this branch.";
    } else {
      branch.textContent = "No branch was created.";
    }
  }

  function showOutcome(outcome, elapsedMs) {
    var stat = document.getElementById("session-stat");
    var quote = document.getElementById("session-quote");
    var link = document.getElementById("session-pr");
    if (!outcome) {
      link.hidden = true;
      stat.textContent = elapsedMs ? formatElapsed(elapsedMs) + " since the example alert" : "Not opened yet";
      quote.textContent = "";
      return;
    }
    link.hidden = false;
    link.href = outcome.pr;
    link.textContent = outcome.simulated ? "Recorded pull request" : "Pull request #" + (outcome.number || "");
    stat.textContent = outcome.alertToPr;
    quote.textContent = outcome.simulated
      ? "Simulated replay. This is the Nov 3 pull request, not a new one."
      : "Opened from this live run.";
  }

  function applyServer(snapshot) {
    if (mode !== "live") return;
    showAlert(snapshot.alert, "");
    paintAgents(snapshot.agents || [], null);
    paintLog(snapshot.log || [], false);
    showOutcome(snapshot.outcome, snapshot.elapsedMs);
    document.getElementById("session-status-heading").textContent = snapshot.phase || "Live";
    document.getElementById("session-status").textContent = snapshot.error || phaseText(snapshot.phase);
    if (snapshot.alertAt || snapshot.elapsedMs) {
      elapsed.textContent = formatElapsed(snapshot.elapsedMs || 0);
    }
    var busy = Boolean(snapshot.busy);
    document.getElementById("btn-reset").disabled = busy;
    document.getElementById("btn-incident").disabled = busy;
    document.getElementById("btn-remediate").disabled = busy;
  }

  function phaseText(phase) {
    if (phase === "incident") return "Incident branch is ready. Remediate launches the four agents.";
    if (phase === "remediating") return "Agents are running. Status text is the cloud agent API status.";
    if (phase === "done") return "The follow-up finished and the demo pull request is labeled demo-run.";
    if (phase === "idle") return "Reset leaves pull requests #1 and #2 and branch develop untouched.";
    return "";
  }

  async function refreshLive() {
    try {
      var response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Server returned " + response.status);
      var snapshot = await response.json();
      health = snapshot.health || health;
      if (mode === "live") applyServer(snapshot);
    } catch (err) {
      if (mode === "live") {
        banner.textContent = "The demo server is not reachable. Start it with node server/index.mjs from demo/agent-visualizer.";
      }
    }
  }

  function stopSim() {
    cancelAnimationFrame(simTimer);
    simTimer = 0;
  }

  function stopElapsed() {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }

  function startElapsed() {
    stopElapsed();
    elapsedStart = Date.now();
    elapsedStop = 0;
    elapsed.textContent = "00:00";
    elapsedTimer = setInterval(function () {
      var end = elapsedStop || Date.now();
      elapsed.textContent = formatElapsed(end - elapsedStart);
    }, 250);
  }

  function simulationPlan() {
    var data = recordedData();
    var agents = data.agents || [];
    var times = [];
    agents.forEach(function (agent) {
      var launched = parseClock(agent.launched);
      var finished = parseClock(agent.finished);
      if (launched != null) times.push(launched);
      if (finished != null) times.push(finished);
    });
    (data.followUps || []).forEach(function (item) {
      var at = parseClock(item.at);
      var finished = parseClock(item.finished);
      if (at != null) times.push(at);
      if (finished != null) times.push(finished);
    });
    var start = Math.min.apply(null, times);
    var end = Math.max.apply(null, times);
    return {
      data: data,
      start: start,
      span: Math.max(1, end - start),
      agents: agents,
    };
  }

  function renderSim(progress) {
    var plan = simulationPlan();
    var agents = plan.agents.map(function (agent, index) {
      var launched = parseClock(agent.launched);
      var finished = parseClock(agent.finished);
      var doneAt = (finished - plan.start) / plan.span;
      var terminal = progress >= doneAt;
      return {
        number: String(index + 1),
        role: agent.title.split("·").slice(1).join("·").trim(),
        branch: agent.branch,
        readOnly: agent.branch == null,
        status: terminal ? agent.status : "RUNNING",
        output: terminal ? agent.output : "",
        changes: terminal ? agent.changes : null,
        doneAt: doneAt,
      };
    });
    paintAgents(agents, progress);
    var follow = (plan.data.followUps || [])[0];
    var followAt = follow ? (parseClock(follow.at) - plan.start) / plan.span : 1;
    var prAt = follow ? (parseClock(follow.finished) - plan.start) / plan.span : 1;
    var log = [{
      simulated: true,
      at: "Simulated",
      method: "SIMULATED",
      url: "recorded Nov 3 run",
      request: { note: "No request is sent in simulated mode." },
      status: null,
      response: { agents: plan.agents.length },
      error: null,
    }];
    if (progress >= followAt && follow) {
      log.push({
        simulated: true,
        at: follow.at,
        method: "SIMULATED",
        url: "recorded follow-up",
        request: follow.sdkCall,
        status: null,
        response: { output: follow.output },
        error: null,
      });
    }
    paintLog(log, true);
    var alert = plan.data ? {
      example: true,
      title: "Customer reports discount displayed as a charge",
      detail: "Example alert for the demo, not a recorded customer ticket. A negative discount can round toward zero and display as a charge.",
      filePath: "src/Libraries/Nop.Services/Catalog/PriceCalculationService.cs",
      fileUrl: "https://github.com/bluuudemon/nopCommerce/blob/develop/src/Libraries/Nop.Services/Catalog/PriceCalculationService.cs",
      branch: null,
    } : null;
    showAlert(alert, "Simulated incident. No branch was created.");
    if (progress >= prAt) {
      showOutcome({
        pr: plan.data.outcome.pr,
        number: 1,
        alertToPr: plan.data.outcome.alertToPrMinutes,
        simulated: true,
      }, SIM_MS);
      document.getElementById("session-status-heading").textContent = "Simulated run finished";
      document.getElementById("session-status").textContent = "The bars and the pull request are the recorded Nov 3 result, played back in about 15 seconds.";
    } else {
      showOutcome(null, progress * SIM_MS);
      document.getElementById("session-status-heading").textContent = "Simulated agents";
      document.getElementById("session-status").textContent = "Status moves from RUNNING to the recorded FINISHED state. Nothing is calling Cursor.";
    }
  }

  function playSim() {
    stopSim();
    startElapsed();
    var started = performance.now();
    var tick = function (now) {
      var progress = Math.min(1, (now - started) / SIM_MS);
      renderSim(progress);
      if (progress < 1) simTimer = requestAnimationFrame(tick);
      else elapsedStop = Date.now();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderSim(1);
      elapsedStop = Date.now();
      return;
    }
    simTimer = requestAnimationFrame(tick);
  }

  async function onReset() {
    if (mode === "simulated") {
      if (!confirmAction("Clear the simulated log on this page? No pull request or branch will be changed.")) return;
      stopSim();
      renderSim(0);
      elapsed.textContent = "00:00";
      return;
    }
    if (!confirmAction("Close open pull requests labeled demo-run whose head branch starts with demo-run/, and delete those branches? Pull requests #1 and #2, develop, and every other branch stay as they are.")) return;
    try {
      applyServer(await post("/api/reset"));
    } catch (err) {
      banner.textContent = err.message;
    }
  }

  async function onIncident() {
    if (mode === "simulated") {
      if (!confirmAction("Show the example alert without creating a branch?")) return;
      renderSim(0);
      startElapsed();
      return;
    }
    if (!confirmAction("Create a demo-run incident branch from develop. If Round() already has the sign-symmetric guard, that guard is removed on the new branch only. develop is not changed.")) return;
    try {
      var snapshot = await post("/api/incident");
      applyServer(snapshot);
      startElapsed();
    } catch (err) {
      banner.textContent = err.message;
    }
  }

  async function onRemediate() {
    if (mode === "simulated" || !health.cursor) {
      var simulatedCopy = "CURSOR_API_KEY is not set, so this will play the recorded Nov 3 run on screen. No cloud agent will be launched.";
      var already = mode === "simulated"
        ? "Play the 15-second simulated replay of the recorded run? No agent will be launched."
        : simulatedCopy;
      if (!confirmAction(already)) return;
      setMode("simulated");
      playSim();
      return;
    }
    if (!confirmAction("Launch the four cloud agents on the incident branch, then send Agent 1 the consolidation follow-up? This uses Cursor cloud agent quota.")) return;
    try {
      await post("/api/remediate");
      startElapsed();
    } catch (err) {
      banner.textContent = err.message;
    }
  }

  document.getElementById("mode-recorded").addEventListener("click", function () { setMode("recorded"); });
  document.getElementById("mode-live").addEventListener("click", function () { setMode("live"); });
  document.getElementById("mode-simulated").addEventListener("click", function () { setMode("simulated"); });
  document.getElementById("btn-reset").addEventListener("click", onReset);
  document.getElementById("btn-incident").addEventListener("click", onIncident);
  document.getElementById("btn-remediate").addEventListener("click", onRemediate);

  pollTimer = setInterval(function () {
    if (mode === "live") refreshLive();
  }, 2000);

  fetch("/api/health", { cache: "no-store" }).then(function (response) {
    if (!response.ok) throw new Error("offline");
    return response.json();
  }).then(function (body) {
    health = body;
    if (mode === "live") setMode("live");
  }).catch(function () {
    health = { cursor: false, github: false };
  });
})();
