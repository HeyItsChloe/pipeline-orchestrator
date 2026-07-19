// The shipped default handler: ticket -> plan -> approve -> implement -> PR.
// Only fires a repository_dispatch against the pipeline's target repo (the
// real work happens inside that repo's own GitHub Actions run, calling
// dev-pipeline-reusable.yml — see .github/workflows/dev-pipeline-reusable.yml
// in this repo). Label/mention-triggered runs never go through this handler
// at all; they fire natively via the target repo's own caller workflow. This
// handler only exists for the chat/curl-originated path, where something
// has to mint a token and call repository_dispatch on the pipeline's behalf.
import { z } from "zod";
import { dispatchRepositoryEvent, getInstallationToken, type GitHubAppConfig } from "../integrations/github.js";
import { logger } from "../logging.js";
import type { PipelineHandler, PipelineHandlerContext, PipelineResult } from "../types.js";

export const DevTicketParamsSchema = z.object({
  model_profile: z.string(),
  project_language: z.array(z.string()),
  test_command: z.string(),
  coverage_type: z.string(),
  desired_coverage: z.number(),
  reviewer: z.string(),
});

export interface DevTicketPipelineDeps {
  githubApp: GitHubAppConfig;
  installationId: string;
}

export function createDevTicketPipelineHandler(deps: DevTicketPipelineDeps): PipelineHandler {
  return {
    name: "dev-ticket-pipeline",
    paramsSchema: DevTicketParamsSchema,
    async run(ctx: PipelineHandlerContext): Promise<PipelineResult> {
      const { pipeline, action, job } = ctx;
      if (pipeline.execution.kind !== "github-actions") {
        throw new Error(`dev-ticket-pipeline "${pipeline.name}" must use execution.kind "github-actions"`);
      }
      if (action !== "plan" && action !== "implement") {
        return { status: "error", message: `dev-ticket-pipeline only supports "plan"/"implement", got "${action}"` };
      }
      if (job.issueNumber === undefined) {
        return { status: "error", message: "issueNumber is required" };
      }

      const log = logger.withContext({
        correlationId: job.correlationId,
        pipeline: pipeline.name,
        repo: `${pipeline.execution.owner}/${pipeline.execution.repo}`,
        issueNumber: job.issueNumber,
      });
      log.info(`dispatching ${action} job`, { source: job.source, requestedBy: job.requestedBy });

      const token = await getInstallationToken(deps.githubApp, deps.installationId);
      await dispatchRepositoryEvent(token, pipeline.execution.owner, pipeline.execution.repo, action, job.issueNumber);

      return { status: "dispatched" };
    },
  };
}
