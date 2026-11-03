/** In-memory call log. Authorization headers are never accepted here. */

const SECRET = /(Bearer\s+)[A-Za-z0-9._\-]+|(ghp_|github_pat_|gho_|crsr_)[A-Za-z0-9_]+/g;

export function redact(value) {
  if (value == null) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const cleaned = text.replace(SECRET, (match, bearer) => (bearer ? bearer + "[redacted]" : "[redacted]"));
  if (typeof value === "string") return cleaned;
  try {
    return JSON.parse(cleaned);
  } catch {
    return cleaned;
  }
}

export function createLog() {
  const entries = [];
  return {
    entries,
    add(entry) {
      if (entry && entry.headers) {
        throw new Error("Refusing to record request headers.");
      }
      const safe = {
        id: entries.length + 1,
        at: new Date().toISOString(),
        simulated: Boolean(entry.simulated),
        method: entry.method,
        url: entry.url,
        request: redact(entry.request ?? null),
        status: entry.status ?? null,
        response: redact(entry.response ?? null),
        error: entry.error ? redact(String(entry.error)) : null,
      };
      entries.push(safe);
      return safe;
    },
    clear() {
      entries.length = 0;
    },
  };
}
