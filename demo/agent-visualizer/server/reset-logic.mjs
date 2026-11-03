/**
 * Pure selection for the demo reset. Callers must pass the full candidate
 * lists; this module never talks to the network.
 *
 * A pull request is eligible only when it is open, carries the demo label,
 * and its head branch is inside the tool prefix. Protected numbers (the
 * recorded PR and this visualizer's PR) are never eligible.
 *
 * A branch is eligible only when the whole name sits inside the tool prefix.
 * `develop` and any name that could escape the prefix are never eligible.
 */

const ALWAYS_PROTECTED_NAMES = new Set(["develop", "main", "master", "HEAD"]);

export function isToolBranch(name, prefix) {
  if (typeof name !== "string" || typeof prefix !== "string" || prefix === "") return false;
  if (!name.startsWith(prefix)) return false;
  if (ALWAYS_PROTECTED_NAMES.has(name)) return false;
  if (name.includes("\\") || name.includes("//") || name.startsWith("/") || name.endsWith("/")) return false;
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  if (parts[0] === "develop" || parts[0] === "main" || parts[0] === "master") return false;
  return true;
}

function labelNames(pull) {
  const labels = Array.isArray(pull && pull.labels) ? pull.labels : [];
  return labels.map((label) => (typeof label === "string" ? label : label && label.name)).filter(Boolean);
}

export function selectDemoPullRequests(pulls, options) {
  const prefix = options.branchPrefix;
  const label = options.label;
  const protectedNumbers = new Set(options.protectedNumbers || []);
  const list = Array.isArray(pulls) ? pulls : [];
  return list.filter((pull) => {
    const number = Number(pull && pull.number);
    if (!Number.isInteger(number) || protectedNumbers.has(number)) return false;
    if (String(pull.state || "").toLowerCase() !== "open") return false;
    if (!labelNames(pull).includes(label)) return false;
    const head = pull.head && pull.head.ref;
    if (!isToolBranch(head, prefix)) return false;
    if (ALWAYS_PROTECTED_NAMES.has(head)) return false;
    return true;
  });
}

export function selectDemoBranches(names, options) {
  const prefix = options.branchPrefix;
  const extra = new Set(options.protectedNames || []);
  const list = Array.isArray(names) ? names : [];
  const selected = [];
  const seen = new Set();
  for (const name of list) {
    if (extra.has(name)) continue;
    if (!isToolBranch(name, prefix)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    selected.push(name);
  }
  return selected;
}

/** Heads of pull requests we are not closing must not be deleted. */
export function protectedHeadsFromUntouchedPulls(pulls, selected) {
  const closing = new Set((selected || []).map((pull) => pull.number));
  const heads = [];
  for (const pull of pulls || []) {
    if (closing.has(pull.number)) continue;
    const head = pull.head && pull.head.ref;
    if (typeof head === "string" && head) heads.push(head);
  }
  return heads;
}
