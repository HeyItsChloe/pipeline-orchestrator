# pipeline-orchestrator

A generic, skill-driven GitHub App pipeline engine. It doesn't know what any
specific pipeline does — it knows how to receive a trigger (a GitHub label,
an `@mention`, a chat/MCP command, or a curl request), look up a
**registered pipeline** (a skill + a trigger pattern + an execution
strategy, all config, not code), and run it.

Self-hosted: clone it and run it standalone, or install it as a dependency
and register your own pipeline handler alongside the shipped default. There
is no shared hosted instance — every deployment is your own, with your own
GitHub App registration, your own secrets, your own registry.

## What ships by default

One handler, `dev-ticket-pipeline`: issue → plan → human approval →
implement → PR → coverage/quality gate, dispatched against a target repo's
own GitHub Actions run (see `.github/workflows/dev-pipeline-reusable.yml`).
That's the only pipeline shape this repo bundles real logic for. Anything
else is a handler you write yourself and register at boot, using the same
`PipelineHandler` interface.

## Quick start (standalone, clone-and-run)

```sh
git clone https://github.com/HeyItsChloe/pipeline-orchestrator.git
cd pipeline-orchestrator
npm install
cp .env.example .env   # fill in your own GitHub App, secrets, registry path
npm run dev
```

This boots the engine with only `dev-ticket-pipeline` registered. Point
`REGISTRY_PATH` at your own `pipelines.yaml` (see below) to actually run
something.

## Quick start (as a library, with your own custom pipeline)

Published on npm as `@heyitschloe/pipeline-orchestrator`:

```sh
npm install @heyitschloe/pipeline-orchestrator
```

```ts
import { createServer } from "@heyitschloe/pipeline-orchestrator";
import { createDevTicketPipelineHandler } from "@heyitschloe/pipeline-orchestrator/dist/handlers/dev_ticket_pipeline.js";
import { myCustomHandler } from "./my-custom-handler.js";

const app = createServer(
  { /* ...config, see src/index.ts for the full shape... */ },
  [createDevTicketPipelineHandler({ githubApp, installationId }), myCustomHandler],
);
app.listen(3000);
```

## Registry format

One `pipelines.yaml`, one entry per registered pipeline:

```yaml
- name: my-app-dev
  handler: dev-ticket-pipeline
  skill_path: skills/shared/dev/my-app
  execution:
    kind: github-actions
    workflow: dev-pipeline-reusable.yml
    owner: my-org
    repo: my-app
  triggers:
    labels: { approach-ready: plan, approved: implement }
    mentions: { "@dev-agent plan": plan, "@dev-agent implement": implement }
  params:
    model_profile: implementation
    test_command: "npm test -- --coverage"
    coverage_type: cobertura
    desired_coverage: 85
    project_language: [typescript]
    reviewer: your-github-username
```

The registry file itself is **not** part of this package — it's your own
private data, supplied via `REGISTRY_PATH`.

## Writing a custom pipeline handler

Implement the `PipelineHandler` interface (`src/types.ts`):

```ts
interface PipelineHandler {
  name: string;
  paramsSchema: ZodTypeAny;   // validates a registry entry's `params`
  run(ctx: PipelineHandlerContext): Promise<PipelineResult>;
}
```

Register it in your own bootstrap file alongside (or instead of) the shipped
`dev-ticket-pipeline` handler. Give any registry entry using it
`execution: { kind: in-process }` if it has no repo to dispatch to, or
`kind: github-actions` if it does.

## Setup

1. Register your own GitHub App at github.com/settings/apps (Issues/PRs/Contents permissions, subscribe to `issues`, `issue_comment`, `pull_request`, `check_run` webhook events).
2. Install it on whichever account/org owns the repos you want to manage.
3. Fill in `.env` from `.env.example`.
4. Write your `pipelines.yaml` and point `REGISTRY_PATH` at it.
5. For each `github-actions`-execution pipeline, add a thin caller workflow to that target repo (see `templates/dev-pipeline-caller.yml`, or use the `scaffold_pipeline` tool to generate it).
6. Deploy this repo's `Dockerfile` wherever you like (Cloud Run, Fly, a VPS — anything that can run a container and reach the internet).

## License

MIT — see `LICENSE`.
