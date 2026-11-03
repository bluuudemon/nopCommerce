# Cloud agent run visualizer

A self-contained briefing page for the recorded cloud agent runs that addressed upstream [nopSolutions/nopCommerce#8424](https://github.com/nopSolutions/nopCommerce/issues/8424) and opened [pull request #1](https://github.com/bluuudemon/nopCommerce/pull/1).

It lives in `demo/agent-visualizer/` and is not part of `NopCommerce.sln` or the .NET build. There is no build step and no network dependency. Fonts, scripts, and styles are all in `index.html`.

## Open it

From this directory, either:

- Open `index.html` directly (`file://`). The page embeds a copy of the run record, so this works offline, including on a demo laptop with no network.
- Serve the directory and let the page load the file with `fetch`:

  ```bash
  python3 -m http.server 8080
  ```

  Then open `http://127.0.0.1:8080/`. If that request fails, the page uses the embedded copy.

The header toggle switches **Exec view** and **Developer view**. Exec view is the default. **Replay** draws the four agents across the recorded window in about 15 seconds. The moving clock and the “In progress · inferred” state are illustrations. Start times, finish times, statuses, branches, change stats, and outputs come from the record.

The layout is tuned for a 1280×800 display and a projector. Card lines in the exec view are large on purpose.

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
