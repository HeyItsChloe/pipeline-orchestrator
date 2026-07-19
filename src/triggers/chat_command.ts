// Backing handler for POST /webhook/mcp — where the MCP server
// (integrations/mcp_server.ts) forwards tool calls so chat-originated
// requests go through the same auth/logging/dispatch path as every other
// trigger. Generic across pipelines: "run_pipeline" is the one dispatch
// tool, resolved against the registry — no per-pipeline-shape branching
// here. A few fixed utility tools (create_ticket/check_status/
// request_approval/scaffold_pipeline) operate on GitHub directly, since
// they're generic GitHub operations, not pipeline execution.
import type { Request, Response } from "express";
import { z } from "zod";
import { createTicket, getInstallationToken, getIssue, labelIssue, type GitHubAppConfig } from "../integrations/github.js";
import { matchChatTool } from "../registry/load.js";
import { scaffoldPipeline, type ScaffoldDeps } from "../handlers/scaffold.js";
import { logger, newCorrelationId } from "../logging.js";
import type { ExecutionStrategy, PipelineDefinition, PipelineHandler } from "../types.js";

const ExecutionStrategySchema = z.union([
  z.object({ kind: z.literal("github-actions"), workflow: z.string(), owner: z.string(), repo: z.string(), ref: z.string().optional() }),
  z.object({ kind: z.literal("in-process") }),
]);
const PipelineDefinitionSchema = z.object({
  name: z.string(),
  handler: z.string(),
  skill_path: z.string(),
  execution: ExecutionStrategySchema,
  triggers: z.object({
    labels: z.record(z.string()).optional(),
    mentions: z.record(z.string()).optional(),
    chat_tool: z.string().optional(),
    http_kind: z.string().optional(),
  }),
  params: z.record(z.unknown()),
});

const ToolCallBody = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("create_ticket"), repo: z.string(), title: z.string(), body: z.string(), requestedBy: z.string() }),
  z.object({ tool: z.literal("check_status"), repo: z.string(), issueNumber: z.number().int().positive() }),
  z.object({ tool: z.literal("request_approval"), repo: z.string(), issueNumber: z.number().int().positive(), requestedBy: z.string() }),
  z.object({
    tool: z.literal("run_pipeline"),
    pipeline: z.string(),
    action: z.string(),
    repo: z.string().optional(),
    issueNumber: z.number().int().positive().optional(),
    requestedBy: z.string(),
    input: z.record(z.unknown()).optional(),
  }),
  z.object({
    tool: z.literal("scaffold_pipeline"),
    pipeline: PipelineDefinitionSchema,
    skillBody: z.string(),
  }),
]);

export interface ChatCommandDeps {
  githubApp: GitHubAppConfig;
  installationId: string;
  pipelines: PipelineDefinition[];
  handlers: Record<string, PipelineHandler>;
  scaffold?: Pick<ScaffoldDeps, "controlRepoOwner" | "controlRepoName" | "branch" | "registryPath">;
}

export function handleChatCommand(deps: ChatCommandDeps) {
  return async (req: Request, res: Response) => {
    const parsed = ToolCallBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid tool call", details: parsed.error.flatten() });
      return;
    }
    const call = parsed.data;
    const correlationId = newCorrelationId();
    const log = logger.withContext({ correlationId, tool: call.tool });

    try {
      switch (call.tool) {
        case "create_ticket": {
          const [owner, repo] = call.repo.split("/");
          const token = await getInstallationToken(deps.githubApp, deps.installationId);
          const issue = await createTicket(token, owner, repo, call.title, call.body);
          res.status(201).json({ correlationId, issue });
          return;
        }
        case "check_status": {
          const [owner, repo] = call.repo.split("/");
          const token = await getInstallationToken(deps.githubApp, deps.installationId);
          const issue = await getIssue(token, owner, repo, call.issueNumber);
          res.status(200).json({ correlationId, issue });
          return;
        }
        case "request_approval": {
          const [owner, repo] = call.repo.split("/");
          const token = await getInstallationToken(deps.githubApp, deps.installationId);
          await labelIssue(token, owner, repo, call.issueNumber, "approved");
          res.status(202).json({ correlationId, status: "approved" });
          return;
        }
        case "run_pipeline": {
          const pipeline = matchChatTool(deps.pipelines, call.pipeline) ?? deps.pipelines.find((p) => p.name === call.pipeline);
          if (!pipeline) {
            res.status(404).json({ error: "no matching pipeline registered", correlationId });
            return;
          }
          const handler = deps.handlers[pipeline.handler];
          if (!handler) {
            res.status(500).json({ error: `no handler registered for "${pipeline.handler}"`, correlationId });
            return;
          }
          const result = await handler.run({
            pipeline,
            action: call.action,
            job: {
              pipeline: pipeline.name,
              action: call.action,
              repo: call.repo,
              issueNumber: call.issueNumber,
              requestedBy: call.requestedBy,
              source: "chat",
              correlationId,
              input: call.input,
            },
          });
          res.status(result.status === "error" ? 502 : 200).json({ correlationId, ...result });
          return;
        }
        case "scaffold_pipeline": {
          if (!deps.scaffold) {
            res.status(501).json({ error: "scaffolding not configured on this deployment", correlationId });
            return;
          }
          await scaffoldPipeline(
            { githubApp: deps.githubApp, installationId: deps.installationId, ...deps.scaffold },
            { pipeline: call.pipeline as PipelineDefinition & { execution: ExecutionStrategy }, skillBody: call.skillBody },
          );
          res.status(201).json({ correlationId, status: "scaffolded" });
          return;
        }
      }
    } catch (err) {
      log.error("chat command failed", { error: String(err) });
      res.status(502).json({ error: "command failed", correlationId });
    }
  };
}
