/**
 * Structured logger — single JSON line per event so logs are machine-parseable
 * by any aggregator (Datadog, CloudWatch, Loki…). Levels gate noise; secrets are
 * redacted by key name so tokens never land in logs. Pure enough to unit-test the
 * redaction; the sink is console (captured by the platform).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Threshold from env; defaults to info in prod, debug in dev. */
function threshold(): number {
  const env = (process.env.LOG_LEVEL as LogLevel | undefined);
  if (env && env in ORDER) return ORDER[env];
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug;
}

const SECRET_HINT = /(token|secret|password|api[_-]?key|authorization|refresh|client[_-]?secret|passphrase)/i;

/** Redact any field whose KEY looks sensitive; recurse into nested objects. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_HINT.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  // Route errors/warnings to stderr, the rest to stdout.
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
