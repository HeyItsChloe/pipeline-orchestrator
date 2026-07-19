// Like github_label.ts, this normalizes for logging only — the native
// `on: issue_comment` trigger in each managed repo's caller workflow
// handles the actual firing. The one thing this adapter does that the
// workflow's own `if:` condition also must do is check the commenter
// against an allowlist before honoring a mention — defense-in-depth.
import { isAllowedMentionAuthor } from "../auth.js";
import { matchMention } from "../registry/load.js";
import { logger, newCorrelationId } from "../logging.js";
import type { JobPayload, PipelineDefinition } from "../types.js";

interface GitHubIssueCommentPayload {
  action: string;
  comment: { body: string; user: { login: string } };
  issue: { number: number };
  repository: { full_name: string };
}

export function parseMentionEvent(
  pipelines: PipelineDefinition[],
  payload: GitHubIssueCommentPayload,
  allowlist: readonly string[],
): JobPayload | null {
  if (payload.action !== "created") return null;

  const match = matchMention(pipelines, payload.repository.full_name, payload.comment.body);
  if (!match) return null;

  const author = payload.comment.user.login;
  if (!isAllowedMentionAuthor(author, allowlist)) {
    logger.warn("ignored mention from unlisted author", { author });
    return null;
  }

  return {
    pipeline: match.pipeline.name,
    action: match.action,
    repo: payload.repository.full_name,
    issueNumber: payload.issue.number,
    requestedBy: author,
    source: "mention",
    correlationId: newCorrelationId(),
  };
}
