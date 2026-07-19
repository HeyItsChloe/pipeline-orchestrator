// Native GitHub Actions triggers (`on: issues: types: [labeled]`) on each
// managed repo's own caller workflow fire the actual pipeline run directly
// — this adapter does NOT re-dispatch anything. It only normalizes the
// webhook payload for logging/observability on the engine's own
// /webhook/github endpoint, matched against the registry so every trigger
// source is traceable the same way regardless of which pipeline it belongs
// to, without risking a double-fire.
import { matchLabel } from "../registry/load.js";
import { newCorrelationId } from "../logging.js";
import type { JobPayload, PipelineDefinition } from "../types.js";

interface GitHubIssuesLabeledPayload {
  action: string;
  label?: { name: string };
  issue: { number: number };
  repository: { full_name: string };
  sender: { login: string };
}

export function parseLabelEvent(pipelines: PipelineDefinition[], payload: GitHubIssuesLabeledPayload): JobPayload | null {
  if (payload.action !== "labeled" || !payload.label) return null;
  const match = matchLabel(pipelines, payload.repository.full_name, payload.label.name);
  if (!match) return null;

  return {
    pipeline: match.pipeline.name,
    action: match.action,
    repo: payload.repository.full_name,
    issueNumber: payload.issue.number,
    requestedBy: payload.sender.login,
    source: "label",
    correlationId: newCorrelationId(),
  };
}
