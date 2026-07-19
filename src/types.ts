// Generic engine types. Nothing here knows what a "ticket" or a "resume" is
// — a pipeline is just a registered {handler, skill, execution strategy,
// triggers, params}. Handler-specific shapes (e.g. the dev-ticket-pipeline
// handler's params, or a self-hoster's own custom handler's params) are
// validated by that handler's own paramsSchema, not by anything in here.

import type { ZodTypeAny } from "zod";

export type TriggerSource = "label" | "mention" | "chat" | "curl" | "dispatch";

// How a registered pipeline actually runs once triggered. Exactly two
// shapes — not one per pipeline. A new pipeline picks whichever fits via
// registry config; it never adds a third execution shape to the engine.
export type ExecutionStrategy =
  | { kind: "github-actions"; workflow: string; owner: string; repo: string; ref?: string }
  | { kind: "in-process" };

export interface PipelineTriggers {
  /** label name -> action name */
  labels?: Record<string, string>;
  /** exact substring to match in a comment body -> action name */
  mentions?: Record<string, string>;
  /** MCP tool name this pipeline responds to, if it wants a dedicated one */
  chat_tool?: string;
  /** POST /trigger "pipeline" value this responds to over the generic HTTP path */
  http_kind?: string;
}

// One registry entry. `params` is intentionally untyped here — the engine
// never reads it, only the named handler does (via its own paramsSchema).
export interface PipelineDefinition {
  name: string;
  handler: string;
  skill_path: string;
  execution: ExecutionStrategy;
  triggers: PipelineTriggers;
  params: Record<string, unknown>;
}

export interface JobPayload {
  pipeline: string;
  action: string;
  repo?: string; // "owner/name" — present when execution.kind === "github-actions"
  issueNumber?: number;
  requestedBy: string;
  source: TriggerSource;
  correlationId: string;
  input?: Record<string, unknown>; // free-form request payload for in-process pipelines
}

export interface PipelineResult {
  status: "dispatched" | "complete" | "error";
  message?: string;
  data?: unknown;
}

export interface PipelineHandlerContext {
  pipeline: PipelineDefinition;
  action: string;
  job: JobPayload;
}

// The one interface every pipeline's actual logic conforms to. Real,
// pipeline-specific code lives inside `run` — that's expected and correct,
// it just never leaks into the trigger/dispatch layer.
export interface PipelineHandler {
  name: string;
  paramsSchema: ZodTypeAny;
  run(ctx: PipelineHandlerContext): Promise<PipelineResult>;
}
