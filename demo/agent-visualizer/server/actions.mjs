import {
  selectDemoPullRequests,
  selectDemoBranches,
  protectedHeadsFromUntouchedPulls,
} from "./reset-logic.mjs";
import { incidentNames, restoreAsymmetricRound } from "./incident-logic.mjs";

export async function resetDemo({ github, config }) {
  const pulls = await github.listOpenPulls();
  const selected = selectDemoPullRequests(pulls, {
    branchPrefix: config.branchPrefix,
    label: config.demoLabel,
    protectedNumbers: config.protectedPullRequests,
  });
  const closed = [];
  for (const pull of selected) {
    await github.closePull(pull.number);
    closed.push(pull.number);
  }
  const protectedNames = protectedHeadsFromUntouchedPulls(pulls, selected);
  protectedNames.push(config.baseBranch);
  const refs = await github.listDemoRefs();
  const names = refs
    .map((ref) => (ref && ref.ref ? String(ref.ref) : ""))
    .map((ref) => ref.replace(/^refs\/heads\//, ""))
    .filter(Boolean);
  const deleted = [];
  for (const name of selectDemoBranches(names, {
    branchPrefix: config.branchPrefix,
    protectedNames,
  })) {
    await github.deleteBranch(name);
    deleted.push(name);
  }
  return { closed, deleted };
}

export async function introduceIncident({ github, config, now = new Date() }) {
  const names = incidentNames(now);
  const sha = await github.getBranchSha(config.baseBranch);
  await github.createBranch(names.incidentBranch, sha);
  const file = await github.getFile(config.roundFile, names.incidentBranch);
  const restored = restoreAsymmetricRound(file.text, config.guardLine);
  let bugReintroduced = false;
  if (restored.changed) {
    await github.putFile({
      path: config.roundFile,
      branch: names.incidentBranch,
      sha: file.sha,
      message: "Reintroduce asymmetric cash rounding on the demo incident branch (#8424)",
      content: restored.source,
    });
    bugReintroduced = true;
  }
  const fileUrl = config.repo.replace(/\/$/, "")
    + "/blob/"
    + names.incidentBranch
    + "/"
    + config.alert.filePath;
  return {
    ...names,
    bugReintroduced,
    bugAlreadyPresent: !restored.changed,
    alert: {
      example: true,
      title: config.alert.title,
      detail: config.alert.detail,
      filePath: config.alert.filePath,
      fileUrl,
      branch: names.incidentBranch,
      bugReintroduced,
    },
  };
}

export function pullFromText(text, repo) {
  if (!text) return null;
  const ownerRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const match = String(text).match(new RegExp("https://github.com/" + ownerRepo.replace("/", "\\/") + "/pull/(\\d+)"));
  return match ? { url: match[0], number: Number(match[1]) } : null;
}
