// Backing handler for POST /trigger — the curl/Postman entry point. Auth
// (sharedSecretAuth) runs as Express middleware before this ever executes.
// Generic across every registered pipeline: the body names which pipeline
// and action to run plus a free-form `input` bag, and the named handler's
// own paramsSchema/logic interprets `input` — this endpoint never branches
// on pipeline shape.
import type { Request, Response } from "express";
import { z } from "zod";
import { matchHttpKind } from "../registry/load.js";
import { logger, newCorrelationId } from "../logging.js";
import type { PipelineDefinition, PipelineHandler } from "../types.js";

const TriggerBody = z.object({
  pipeline: z.string().min(1).optional().describe("registry pipeline name — required unless httpKind matches a pipeline's triggers.http_kind"),
  httpKind: z.string().min(1).optional().describe("alternative to naming a pipeline directly, matched against triggers.http_kind"),
  action: z.string().min(1),
  requestedBy: z.string().min(1),
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "expected \"owner/repo\"").optional(),
  issueNumber: z.number().int().positive().optional(),
  input: z.record(z.unknown()).optional(),
});

export interface HttpTriggerDeps {
  pipelines: PipelineDefinition[];
  handlers: Record<string, PipelineHandler>;
}

export function handleHttpTrigger(deps: HttpTriggerDeps) {
  return async (req: Request, res: Response) => {
    const parsed = TriggerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request body", details: parsed.error.flatten() });
      return;
    }
    const correlationId = newCorrelationId();
    const call = parsed.data;

    const pipeline = call.pipeline
      ? deps.pipelines.find((p) => p.name === call.pipeline)
      : call.httpKind
        ? matchHttpKind(deps.pipelines, call.httpKind)
        : undefined;
    if (!pipeline) {
      res.status(404).json({ error: "no matching pipeline registered", correlationId });
      return;
    }
    const handler = deps.handlers[pipeline.handler];
    if (!handler) {
      res.status(500).json({ error: `no handler registered for "${pipeline.handler}"`, correlationId });
      return;
    }

    try {
      const result = await handler.run({
        pipeline,
        action: call.action,
        job: {
          pipeline: pipeline.name,
          action: call.action,
          repo: call.repo,
          issueNumber: call.issueNumber,
          requestedBy: call.requestedBy,
          source: "curl",
          correlationId,
          input: call.input,
        },
      });
      res.status(result.status === "error" ? 502 : result.status === "dispatched" ? 202 : 200).json({ correlationId, ...result });
    } catch (err) {
      logger.error("trigger dispatch failed", { correlationId, pipeline: pipeline.name, error: String(err) });
      res.status(502).json({ error: "dispatch failed", correlationId });
    }
  };
}
