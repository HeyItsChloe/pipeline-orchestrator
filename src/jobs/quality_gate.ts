// Qodo (or a self-hoster's own equivalent) runs as a step inside the
// github-actions execution strategy's workflow, not something the engine
// invokes directly. This module just records the gate's outcome when GitHub
// notifies via the check_run webhook, keyed by correlation ID so a failed
// gate is traceable back to the job that triggered it.
import { logger } from "../logging.js";

interface CheckRunPayload {
  action: string;
  check_run: { name: string; conclusion: string | null; html_url: string };
  repository: { full_name: string };
}

export function recordQualityGateResult(payload: CheckRunPayload, correlationId?: string): void {
  if (payload.action !== "completed") return;
  logger.withContext({ correlationId, repo: payload.repository.full_name }).info("quality gate check completed", {
    check: payload.check_run.name,
    conclusion: payload.check_run.conclusion,
    url: payload.check_run.html_url,
  });
}
