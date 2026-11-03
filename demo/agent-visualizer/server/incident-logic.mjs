/**
 * Decide whether the incident branch still has the #8424 bug.
 * If the sign-symmetric guard is already in Round(), drop that guard
 * (and a single preceding #8424 comment) so the original asymmetric
 * method is what the branch contains. Otherwise leave the file alone.
 */

export function incidentNames(date) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  if (!/^\d{8}T\d{6}Z$/.test(stamp)) {
    throw new Error("Could not format an incident timestamp.");
  }
  return {
    stamp,
    incidentBranch: `demo-run/${stamp}-incident`,
    runPrefix: `demo-run/${stamp}/`,
  };
}

export function restoreAsymmetricRound(source, detectLine) {
  if (typeof source !== "string" || typeof detectLine !== "string" || detectLine.trim() === "") {
    throw new Error("restoreAsymmetricRound needs the file text and the guard line.");
  }
  const needle = detectLine.trim();
  if (!source.includes(needle)) {
    return { changed: false, source };
  }
  const lines = source.split("\n");
  const kept = [];
  for (const line of lines) {
    if (line.includes(needle)) {
      const previous = kept[kept.length - 1];
      if (previous && /#8424|sign-symmetric/i.test(previous)) kept.pop();
      continue;
    }
    kept.push(line);
  }
  return { changed: true, source: kept.join("\n") };
}
