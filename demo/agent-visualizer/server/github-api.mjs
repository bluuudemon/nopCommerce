/**
 * GitHub REST calls used by reset and the incident branch.
 * Token is read by the caller from the environment and passed in.
 * It is sent only on the Authorization header, which the call log does not record.
 */

const API = "https://api.github.com";

export function createGitHubClient({ token, fetchImpl = fetch, log, owner, repo }) {
  if (!token) throw new Error("GITHUB_TOKEN is not set.");
  const root = API + "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);

  async function request(method, url, requestBody) {
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "demo-agent-visualizer",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (requestBody !== undefined) headers["Content-Type"] = "application/json";
    let response;
    let text = "";
    let parsed = null;
    let error = null;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000),
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
    return { status: response.status, body: parsed, headers: response.headers };
  }

  return {
    async getBranchSha(branch) {
      const result = await request("GET", root + "/git/ref/heads/" + encodeRef(branch));
      return result.body.object.sha;
    },

    async createBranch(name, sha) {
      return request("POST", root + "/git/refs", {
        ref: "refs/heads/" + name,
        sha,
      });
    },

    async getFile(path, ref) {
      const url = root + "/contents/" + encodePath(path) + "?ref=" + encodeURIComponent(ref);
      const result = await request("GET", url);
      const encoding = result.body.encoding;
      if (encoding !== "base64") throw new Error("Unexpected file encoding from GitHub.");
      const text = Buffer.from(result.body.content.replace(/\n/g, ""), "base64").toString("utf8");
      return { text, sha: result.body.sha };
    },

    async putFile({ path, branch, sha, message, content }) {
      return request("PUT", root + "/contents/" + encodePath(path), {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        sha,
        branch,
      });
    },

    async listOpenPulls() {
      const pulls = [];
      for (let page = 1; page <= 10; page += 1) {
        const result = await request(
          "GET",
          root + "/pulls?state=open&per_page=100&page=" + page
        );
        const batch = Array.isArray(result.body) ? result.body : [];
        pulls.push(...batch);
        if (batch.length < 100) break;
      }
      return pulls;
    },

    async closePull(number) {
      return request("PATCH", root + "/pulls/" + encodeURIComponent(number), { state: "closed" });
    },

    async listDemoRefs() {
      const result = await request("GET", root + "/git/matching-refs/heads/demo-run");
      return Array.isArray(result.body) ? result.body : [];
    },

    async deleteBranch(name) {
      return request("DELETE", root + "/git/refs/heads/" + encodeRef(name));
    },

    async ensureLabel(name, description) {
      try {
        await request("POST", root + "/labels", {
          name,
          color: "d4a017",
          description,
        });
      } catch (err) {
        if (!/already exists|422/.test(String(err.message))) throw err;
      }
    },

    async addLabel(number, name) {
      return request("POST", root + "/issues/" + encodeURIComponent(number) + "/labels", {
        labels: [name],
      });
    },
  };
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function encodeRef(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}
