# Cloud agent run visualizer

A self-contained briefing page for the recorded cloud agent runs that addressed upstream [nopSolutions/nopCommerce#8424](https://github.com/nopSolutions/nopCommerce/issues/8424) and opened [pull request #1](https://github.com/bluuudemon/nopCommerce/pull/1).

It lives in `demo/agent-visualizer/` and is not part of `NopCommerce.sln` or the .NET build. The recorded briefing is still one HTML file with no build step. A live reset and rerun uses the small Node server in `server/`. That server is the only place that reads `CURSOR_API_KEY` and `GITHUB_TOKEN`. It never writes them to disk and never sends them to the browser.

## Open the recorded briefing

From this directory, either:

- Open `index.html` directly (`file://`). The page embeds a copy of the Nov 3 run, so Recorded mode works offline. Live reset and incident creation need the server.
- Or start the demo server (this is what a live rehearsal uses):

  ```bash
  node server/index.mjs
  ```

  Then open `http://127.0.0.1:8787/`. `PORT` overrides 8787.

The header switches **Recorded**, **Live**, and **Simulated**, and **Exec view** / **Developer view**. Recorded mode is the Nov 3 run. **Replay** there draws the four agents across the recorded window in about 15 seconds. The moving clock and the “In progress · inferred” state are illustrations. Start times, finish times, statuses, branches, change stats, and outputs come from the record.

The layout is tuned for a 1280×800 display and a projector. Card lines in the exec view are large on purpose.

## Live demo server

`node server/index.mjs` serves this folder and a JSON API. It uses Node 20+ (`node:http` and global `fetch`) and does not install packages.

On a cloned machine, export the keys in the shell that starts the server. That is what the process reads. If a gitignored `.env` file is already present in `demo/agent-visualizer/`, the server loads it first and does not override variables that are already exported. Do not commit that file. `.gitignore` already excludes `.env`.

```bash
export CURSOR_API_KEY="crsr_..."    # Cursor Dashboard → Integrations
export GITHUB_TOKEN="github_pat_..." # this repository only
node server/index.mjs
```

`CURSOR_API_KEY` is sent only to `https://api.cursor.com` as HTTP Basic (the key is the username and the password is empty), which is the documented `curl -u KEY:` form. `GITHUB_TOKEN` is sent only to `https://api.github.com`. The call log stored in memory records method, URL, and JSON bodies. It refuses to record headers, and it redacts token-shaped strings if one appears in a body.

### GitHub token

Use a fine-grained token whose repository access is **only** `bluuudemon/nopCommerce`:

- Contents: Read and write (create the incident branch, and put the asymmetric `Round()` back if develop already has the fix)
- Pull requests: Read and write (list, close demo pull requests)
- Issues: Read and write (create and apply the `demo-run` label)

Metadata is included automatically. No other repository, and no administration or delete-repo permission.

### What the buttons do

Each destructive step asks for confirmation in the browser, and the server rejects the POST unless the body is `{ "confirm": true }`.

1. **Reset demo.** Closes open pull requests that have the `demo-run` label and a head branch under `demo-run/`, then deletes branches under that prefix. It never closes pull request #1 or #2, never deletes `develop`, and never deletes a branch that does not start with `demo-run/`. Heads of pull requests it refused to close are kept. The in-memory live log is cleared when reset starts.
2. **Introduce incident.** Creates `demo-run/<timestamp>-incident` from `develop`. If `PriceCalculationService.Round` on that branch already contains `if (value < 0) return -Round(-value, roundingType);`, that guard and a preceding `#8424` comment are removed in a commit on the incident branch only. The page shows an **EXAMPLE** alert, "Customer reports discount displayed as a charge", with a link to the file on that branch.
3. **Remediate.** Launches the four agents from `config/demo.json` with `startingRef` set to the incident branch and branch names under `demo-run/<timestamp>/`. `workOnCurrentBranch` is true and `autoCreatePR` is false, both documented fields. After agents 2 and 3 finish successfully, Agent 1 receives the consolidation follow-up and is told to open the pull request into the incident branch, not `develop`. The server then adds the `demo-run` label only if the head is the demo fix branch and the base is the incident branch. The elapsed timer runs from the example alert to that pull request.

If `CURSOR_API_KEY` is missing, **Remediate** does not call Cursor. The page switches to **Simulated** and replays the recorded Nov 3 run in about 15 seconds. That replay is labeled simulated and does not create a branch or a pull request.

### Cloud Agents API

The adapter is `server/cursor-api.mjs`. It calls only the v1 routes described at [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints):

| Call | Route |
|---|---|
| Launch | `POST /v1/agents` |
| Follow-up | `POST /v1/agents/{id}/runs` |
| Status and result text | `GET /v1/agents/{id}/runs/{runId}` |
| Run id, if create omits one | `GET /v1/agents/{id}/runs` |

Run statuses used are `CREATING`, `RUNNING`, `FINISHED`, `ERROR`, `CANCELLED`, and `EXPIRED`. A v1 conversation-history route was not in that endpoint list, so the legacy `GET /v0/agents/{id}/conversation` path is not called. The follow-up result is the run's `result` text. That limit is marked `TODO(unconfirmed)` in the adapter.

A live run spends Cursor cloud agent usage and opens a real pull request on this fork. Reset it before the next rehearsal. Cursor may also create its own `cursor/...` branch for a run; reset does not delete those, because they are outside `demo-run/`.

### Pre-demo checklist

- [ ] `node --version` is 20 or newer
- [ ] `CURSOR_API_KEY` and `GITHUB_TOKEN` are exported in the server shell, not written into the repo
- [ ] The token's repository list is only `bluuudemon/nopCommerce`
- [ ] `node server/index.mjs` prints that both keys are set
- [ ] The browser is on `http://127.0.0.1:8787/` (not `file://`)
- [ ] **Reset demo** before introducing a new incident
- [ ] After **Introduce incident**, the EXAMPLE card names a `demo-run/...-incident` branch
- [ ] **Remediate** was confirmed with the quota warning
- [ ] After the rehearsal, **Reset demo** again

### Tests

From `demo/agent-visualizer`:

```bash
node --test server/*.test.mjs
```

The reset tests assert that pull requests #1 and #2, `develop`, `demo/agent-visualizer`, unlabeled pull requests, and any branch outside `demo-run/` are not selected.

## Regenerate the JSON for a new demo run

1. Export the new run as JSON using the schema below. Keep recorded times, ids, statuses, and outputs as they were captured. Do not fill in clocks or results that were not recorded.
2. Replace `data/agent-runs.json` with that file.
3. Refresh the embedded copy inside `index.html` so `file://` opening stays in sync. From the repo root:

   ```bash
   python3 - <<'PY'
   import json
   import pathlib
   root = pathlib.Path("demo/agent-visualizer")
   raw = (root / "data/agent-runs.json").read_text(encoding="utf-8")
   json.loads(raw)
   safe = raw.replace("&", "\\u0026").replace("<", "\\u003c")
   html_path = root / "index.html"
   html = html_path.read_text(encoding="utf-8")
   start = html.index('<script id="fallback-data" type="application/json">')
   end = html.index("</script>", start)
   html = (
       html[:start]
       + '<script id="fallback-data" type="application/json">\n'
       + safe.rstrip()
       + "\n"
       + html[end:]
   )
   html_path.write_text(html, encoding="utf-8")
   PY
   ```

4. Reload the page. The developer view reports whether the data came from `fetch` or the embedded fallback.

Exec-view one-line results for the original four agents are the `SUMMARIES` map in `index.html`, keyed by agent id. They are condensations of each agent’s `output`, not a second source of record. For an agent id that is not in that map, the card uses the first sentence of `output`. Update `SUMMARIES` when a new demo should show a shorter line than that sentence. The developer view always shows the full output.

## What is illustrated

Labeled as illustration, and not present as its own field in the JSON:

- The 15-second replay and its moving clock. Bar lengths are the recorded start and finish, scaled across that window.
- The status text “In progress · inferred”, shown only while a bar is moving between the recorded launch and finish.
- The one-line card text in `SUMMARIES`.

Everything else on the page is a field from the JSON, or a label for one of those fields.

## Schema

Clock strings look like `10:58 AM ET`. The page reads `h:mm` plus `AM` or `PM` and ignores a trailing zone abbreviation. It does not invent a date or a time zone conversion. `otherCalls` entries have no clock and are listed first in the developer log with the text “No timestamp in the record.”

```json
{
  "note": "string. Provenance line. Shown under the exec headline and at the top of the developer view.",
  "repo": "string. Repository URL.",
  "agents": [
    {
      "id": "string. Cloud agent id. Used in the developer trace and as the SUMMARIES key.",
      "title": "string. Role is the text after the first middle dot. An 'Agent N' prefix becomes the badge.",
      "branch": "string or null. Null is shown as 'No branch'.",
      "launched": "string clock label.",
      "finished": "string clock label.",
      "status": "string. Recorded status, shown on the card when the run is complete.",
      "changes": "string. Displayed verbatim, for example '+4/-0, 1 file' or 'read-only'.",
      "pr": "string URL or null. The outcome strip uses outcome.pr.",
      "output": "string. Full text in the developer view. Source of the exec one-line result.",
      "sdkCall": {
        "action": "string. For these runs, 'launch'.",
        "repo": "string URL.",
        "starting_ref": "string.",
        "title": "string.",
        "prompt": "string. Rendered collapsed inside the highlighted JSON."
      }
    }
  ],
  "followUps": [
    {
      "agent": "string agent id.",
      "at": "string clock label.",
      "finished": "string clock label.",
      "sdkCall": {
        "action": "string. For these runs, 'reply'.",
        "agent_id": "string.",
        "mode": "string.",
        "files": ["string"],
        "prompt": "string. Collapsed the same way as a launch prompt."
      },
      "output": "string."
    }
  ],
  "otherCalls": [
    {
      "action": "string. For these runs, 'repositories'.",
      "search": "string.",
      "output": "string."
    }
  ],
  "outcome": {
    "pr": "string URL. The outcome link.",
    "alertToPrMinutes": "string, as recorded. This page does not parse it into a number."
  }
}
```

`followUps`, `otherCalls`, and `outcome` may be omitted. A missing `sdkCall` is shown as “No request object in the record.” The copy button writes the request object as pretty-printed JSON and does not include `output`.
