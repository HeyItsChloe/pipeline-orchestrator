// Standalone entrypoint for clone-and-run self-hosting: boots the engine
// with only the shipped default handler (dev-ticket-pipeline), config
// sourced entirely from env vars. A deployment that wants to add its own
// custom handler(s) doesn't use this file at all — it imports createServer
// from this package instead and writes its own equivalent bootstrap. See
// README.md.
import { createServer } from "./server.js";
import { createDevTicketPipelineHandler } from "./handlers/dev_ticket_pipeline.js";
import { logger } from "./logging.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const githubApp = {
  appId: requireEnv("GH_APP_ID"),
  privateKey: requireEnv("GH_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
};

const app = createServer(
  {
    port: Number(process.env.PORT ?? 3000),
    sharedSecret: requireEnv("ORCHESTRATOR_SHARED_SECRET"),
    githubWebhookSecret: requireEnv("GH_WEBHOOK_SECRET"),
    githubApp,
    installationId: requireEnv("GH_APP_INSTALLATION_ID"),
    allowedMentionAuthors: (process.env.ALLOWED_MENTION_AUTHORS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    registryPath: requireEnv("REGISTRY_PATH"),
    scaffold:
      process.env.CONTROL_REPO_OWNER && process.env.CONTROL_REPO_NAME
        ? {
            controlRepoOwner: process.env.CONTROL_REPO_OWNER,
            controlRepoName: process.env.CONTROL_REPO_NAME,
            branch: process.env.CONTROL_REPO_BRANCH ?? "main",
          }
        : undefined,
  },
  [createDevTicketPipelineHandler({ githubApp, installationId: requireEnv("GH_APP_INSTALLATION_ID") })],
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  logger.info("pipeline-orchestrator listening", { port });
});
