// The generic engine. Exposes createServer(config, handlers) as a factory —
// not just a runnable script — so a self-hoster can import it, register
// their own PipelineHandler(s) alongside (or instead of) the shipped
// dev-ticket-pipeline handler, and boot the resulting app themselves. See
// index.ts for the standalone (clone-and-run) entrypoint that uses this
// with only the default handler.
import express, { type Express, type Request } from "express";
import { extensionAuth, githubWebhookAuth, sharedSecretAuth } from "./auth.js";
import { logger } from "./logging.js";
import { loadPipelines } from "./registry/load.js";
import { parseLabelEvent } from "./triggers/github_label.js";
import { parseMentionEvent } from "./triggers/github_mention.js";
import { handleHttpTrigger } from "./triggers/http_api.js";
import { handleChatCommand } from "./triggers/chat_command.js";
import { recordPullRequestOpened } from "./jobs/open_pr.js";
import { recordQualityGateResult } from "./jobs/quality_gate.js";
import { mountMcpHttp } from "./integrations/mcp_server.js";
import type { PipelineHandler } from "./types.js";
import type { GitHubAppConfig } from "./integrations/github.js";

export interface EngineConfig {
  port: number;
  sharedSecret: string;
  githubWebhookSecret: string;
  githubApp: GitHubAppConfig;
  installationId: string;
  allowedMentionAuthors: string[];
  /** Path to this deployment's pipelines.yaml — private data, never bundled into this package. */
  registryPath: string;
  /** Optional — omit to disable the scaffold_pipeline tool on this deployment. */
  scaffold?: { controlRepoOwner: string; controlRepoName: string; branch: string };
}

/**
 * Builds the Express app. Does not call .listen() — the caller decides
 * when/how to start it (index.ts does this for standalone use; a
 * self-hoster's own bootstrap file does the same after registering
 * additional handlers).
 */
export function createServer(config: EngineConfig, handlerList: PipelineHandler[]): Express {
  const handlers: Record<string, PipelineHandler> = {};
  for (const h of handlerList) handlers[h.name] = h;

  const pipelines = loadPipelines(config.registryPath);

  // Fail fast on a misconfigured registry rather than at first request:
  // every entry's handler must actually be registered, and its params must
  // pass that handler's own schema.
  for (const pipeline of pipelines) {
    const handler = handlers[pipeline.handler];
    if (!handler) {
      throw new Error(`registry entry "${pipeline.name}" references unregistered handler "${pipeline.handler}"`);
    }
    const result = handler.paramsSchema.safeParse(pipeline.params);
    if (!result.success) {
      throw new Error(`registry entry "${pipeline.name}" has invalid params for handler "${pipeline.handler}": ${JSON.stringify(result.error.flatten())}`);
    }
  }

  const app = express();

  // Capture the raw body so /webhook/github can verify GitHub's HMAC signature.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.post(
    "/trigger",
    sharedSecretAuth(config.sharedSecret),
    handleHttpTrigger({ pipelines, handlers }),
  );

  app.post(
    "/webhook/mcp",
    sharedSecretAuth(config.sharedSecret),
    handleChatCommand({
      githubApp: config.githubApp,
      installationId: config.installationId,
      pipelines,
      handlers,
      scaffold: config.scaffold ? { ...config.scaffold, registryPath: config.registryPath } : undefined,
    }),
  );

  // Label/mention triggers fire the pipeline natively via each managed
  // repo's own caller workflow (`on: issues`/`on: issue_comment`) — this
  // endpoint only logs the same events for observability, it does not
  // re-dispatch.
  app.post("/webhook/github", githubWebhookAuth(config.githubWebhookSecret), (req, res) => {
    const eventName = req.header("x-github-event");
    if (eventName === "issues") {
      const job = parseLabelEvent(pipelines, req.body);
      if (job) logger.info("observed label-triggered job", { ...job });
    } else if (eventName === "issue_comment") {
      const job = parseMentionEvent(pipelines, req.body, config.allowedMentionAuthors);
      if (job) logger.info("observed mention-triggered job", { ...job });
    } else if (eventName === "pull_request") {
      recordPullRequestOpened(req.body);
    } else if (eventName === "check_run") {
      recordQualityGateResult(req.body);
    }
    res.status(204).end();
  });

  app.use("/mcp", sharedSecretAuth(config.sharedSecret));
  mountMcpHttp(app, "/mcp", {
    orchestratorUrl: `http://localhost:${config.port}`,
    sharedSecret: config.sharedSecret,
  });

  return app;
}

// Kept for handlers/deployments that want it, but not required — this file
// intentionally never calls extensionAuth itself; a handler-specific HTTP
// surface (like a browser-extension lookup endpoint) is out of scope for
// the generic engine and is each deployment's own concern to mount, e.g. by
// taking the Express app createServer() returns and adding routes to it
// before calling .listen().
export { extensionAuth };
