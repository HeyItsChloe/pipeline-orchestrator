// Claude Code opens the PR itself as part of a github-actions-execution
// pipeline's implementation step — the engine doesn't open PRs. This module
// records the pull_request webhook event for tracking/observability only.
import { logger } from "../logging.js";

interface PullRequestPayload {
  action: string;
  pull_request: { number: number; html_url: string; requested_reviewers?: Array<{ login: string }> };
  repository: { full_name: string };
}

export function recordPullRequestOpened(payload: PullRequestPayload, correlationId?: string): void {
  if (payload.action !== "opened") return;
  logger.withContext({ correlationId, repo: payload.repository.full_name }).info("pull request opened", {
    number: payload.pull_request.number,
    url: payload.pull_request.html_url,
    reviewers: payload.pull_request.requested_reviewers?.map((r) => r.login) ?? [],
  });
}
