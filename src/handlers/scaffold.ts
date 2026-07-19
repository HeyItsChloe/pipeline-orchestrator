// Onboarding a new pipeline is itself a capability, not a static template a
// human copies by hand: this writes the new pipeline's skill file, appends
// its registry entry, and — for a github-actions pipeline — generates the
// thin per-repo caller workflow, all in one action.
//
// Generic over any handler: the caller supplies the full PipelineDefinition
// shape. This module doesn't know or care whether "dev-ticket-pipeline" or
// some self-hoster's own custom handler is being registered.
//
// Assumes the GitHub App installation covers both the control repo and any
// target repo. If a target repo hasn't had the App installed yet, the
// caller-workflow write to that repo will fail — install it first.
import YAML from "yaml";
import { createOrUpdateFile, getInstallationToken, type GitHubAppConfig } from "../integrations/github.js";
import { loadPipelines } from "../registry/load.js";
import { logger } from "../logging.js";
import type { PipelineDefinition } from "../types.js";

export interface ScaffoldRequest {
  pipeline: PipelineDefinition;
  /** Markdown body for the new skill file (frontmatter is added automatically). */
  skillBody: string;
}

export interface ScaffoldDeps {
  githubApp: GitHubAppConfig;
  installationId: string;
  controlRepoOwner: string;
  controlRepoName: string;
  branch: string;
  registryPath: string; // path to pipelines.yaml within the control repo
}

export async function scaffoldPipeline(deps: ScaffoldDeps, req: ScaffoldRequest): Promise<void> {
  const { pipeline } = req;
  const log = logger.withContext({ pipeline: pipeline.name, handler: pipeline.handler });

  const token = await getInstallationToken(deps.githubApp, deps.installationId);

  log.info("writing new pipeline skill");
  await createOrUpdateFile(
    token,
    deps.controlRepoOwner,
    deps.controlRepoName,
    `${pipeline.skill_path}/SKILL.md`,
    skillTemplate(pipeline.name, req.skillBody),
    `Scaffold ${pipeline.name} skill`,
    deps.branch,
  );

  log.info("appending registry entry");
  const existing = await readRegistry(token, deps.controlRepoOwner, deps.controlRepoName, deps.branch, deps.registryPath);
  if (existing.some((p) => p.name === pipeline.name)) {
    throw new Error(`a pipeline named "${pipeline.name}" is already registered`);
  }
  existing.push(pipeline);
  await createOrUpdateFile(
    token,
    deps.controlRepoOwner,
    deps.controlRepoName,
    deps.registryPath,
    YAML.stringify(existing),
    `Register ${pipeline.name} pipeline`,
    deps.branch,
  );

  if (pipeline.execution.kind === "github-actions") {
    const { owner, repo } = pipeline.execution;
    log.info("writing caller workflow", { repo: `${owner}/${repo}` });
    await createOrUpdateFile(
      token,
      owner,
      repo,
      ".github/workflows/dev-pipeline.yml",
      callerWorkflowTemplate(deps.controlRepoOwner, deps.controlRepoName, pipeline),
      `Add dev-pipeline caller workflow for ${pipeline.name}`,
      deps.branch,
    );
  }
}

async function readRegistry(token: string, owner: string, repo: string, branch: string, path: string): Promise<PipelineDefinition[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`failed to read registry: ${res.status} ${await res.text()}`);
  const raw = await res.text();
  return raw.trim() ? ((YAML.parse(raw) as PipelineDefinition[]) ?? []) : [];
}

function skillTemplate(name: string, body: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: Skill for the "${name}" pipeline — fill in before relying on it.`,
    "---",
    "",
    `# ${name}`,
    "",
    body,
    "",
  ].join("\n");
}

// Builds the "which label/mention maps to which action" expression
// generically from the pipeline's own triggers.labels/mentions, instead of
// hardcoding "approach-ready"/"approved" the way the old dev-only scaffold
// did. Each entry becomes one ternary clause, evaluated in order.
function actionExpression(pipeline: PipelineDefinition): string {
  const clauses: string[] = [];
  for (const [label, action] of Object.entries(pipeline.triggers.labels ?? {})) {
    clauses.push(`(github.event.label.name == '${label}' && '${action}')`);
  }
  for (const [phrase, action] of Object.entries(pipeline.triggers.mentions ?? {})) {
    clauses.push(`(contains(github.event.comment.body, '${phrase}') && '${action}')`);
  }
  clauses.push("github.event.client_payload.action");
  return clauses.join(" ||\n          ");
}

function callerWorkflowTemplate(controlRepoOwner: string, controlRepoName: string, pipeline: PipelineDefinition): string {
  if (pipeline.execution.kind !== "github-actions") throw new Error("caller workflow only applies to github-actions pipelines");
  const params = pipeline.params as {
    project_language?: string[];
    test_command?: string;
    coverage_type?: string;
    desired_coverage?: number;
    reviewer?: string;
  };
  return `name: dev-pipeline

on:
  issues:
    types: [labeled]
  issue_comment:
    types: [created]
  repository_dispatch:
    types: [agent-trigger]

jobs:
  dispatch:
    # id-token: write must be granted here too — reusable workflow permissions
    # are the intersection of caller + callee, and dev-pipeline-reusable.yml's
    # jobs request id-token: write for anthropics/claude-code-action@v1's OIDC.
    permissions:
      contents: read
      packages: read
      id-token: write
    uses: ${controlRepoOwner}/${controlRepoName}/.github/workflows/dev-pipeline-reusable.yml@main
    with:
      skills_repo_owner: ${controlRepoOwner}
      skills_repo_name: ${controlRepoName}
      skills_repo_branch: main
      project_language: ${(params.project_language ?? ["CHANGE_ME"]).join(",")}
      test_command: ${params.test_command ?? "CHANGE_ME"}
      coverage_type: ${params.coverage_type ?? "CHANGE_ME"}
      desired_coverage: ${params.desired_coverage ?? 85}
      reviewer: ${params.reviewer ?? "CHANGE_ME"}
      action: >-
        \${{
          ${actionExpression(pipeline)}
        }}
    secrets: inherit
`;
}
