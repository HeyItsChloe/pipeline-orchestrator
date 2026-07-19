// Structured logging with a correlation ID per job run, so a stuck pipeline
// is debuggable without re-reading code.
import { randomUUID } from "node:crypto";

export function newCorrelationId(): string {
  return randomUUID();
}

type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields: LogFields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
  /** Bind a correlationId (and any other fixed fields) to every call. */
  withContext(context: LogFields) {
    return {
      info: (message: string, fields?: LogFields) => emit("info", message, { ...context, ...fields }),
      warn: (message: string, fields?: LogFields) => emit("warn", message, { ...context, ...fields }),
      error: (message: string, fields?: LogFields) => emit("error", message, { ...context, ...fields }),
    };
  },
};
