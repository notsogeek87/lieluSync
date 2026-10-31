/**
 * Structured JSON logger with aggressive redaction. Never log tokens, cookies,
 * config identifiers or authorization headers.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /(token|secret|authorization|cookie|session|password|apikey|api_key|key|state)/i;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const CONFIG_PATH = /\/u\/[A-Za-z0-9_-]{16,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const LONG_HEX_OR_B64 = /\b[A-Za-z0-9_-]{40,}\b/g;

export function redactString(input: string): string {
  return input
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT_LIKE, "[redacted-jwt]")
    .replace(CONFIG_PATH, "/u/[redacted]")
    .replace(LONG_HEX_OR_B64, "[redacted]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return order[lvl] ?? order.info;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  if (order[level] < threshold()) return;
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact(fields ?? {}) as object) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};

/** Short, sanitized error description suitable for persistence in sync_logs. */
export function safeErrorMessage(err: unknown, max = 300): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return redactString(raw).slice(0, max);
}
