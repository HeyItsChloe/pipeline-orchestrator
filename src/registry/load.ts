// Reads one registry file — a flat array of PipelineDefinition entries — and
// provides the lookup helpers the generic trigger layer needs. Unlike the
// old two-registry-files-with-two-schemas design this replaces, every
// pipeline (regardless of what handler runs it) lives in this one file and
// shares this one shape; only `params` varies per handler.
//
// The registry file itself is NOT bundled into this package — it's private,
// per-deployment data. A self-hoster supplies its path via config (env var
// or explicit path), same as skills.
import { readFileSync } from "node:fs";
import YAML from "yaml";
import type { PipelineDefinition } from "../types.js";

export function loadPipelines(path: string): PipelineDefinition[] {
  const raw = readFileSync(path, "utf-8");
  return raw.trim() ? ((YAML.parse(raw) as PipelineDefinition[]) ?? []) : [];
}

export function loadPipeline(path: string, name: string): PipelineDefinition | undefined {
  return loadPipelines(path).find((p) => p.name === name);
}

export interface TriggerMatch {
  pipeline: PipelineDefinition;
  action: string;
}

/** Finds whichever registered pipeline's `triggers.labels` matches this label name. */
export function matchLabel(pipelines: PipelineDefinition[], repo: string, labelName: string): TriggerMatch | undefined {
  for (const pipeline of pipelines) {
    if (pipeline.execution.kind === "github-actions" && `${pipeline.execution.owner}/${pipeline.execution.repo}` !== repo) continue;
    const action = pipeline.triggers.labels?.[labelName];
    if (action) return { pipeline, action };
  }
  return undefined;
}

/** Finds whichever registered pipeline's `triggers.mentions` phrase appears in this comment body. */
export function matchMention(pipelines: PipelineDefinition[], repo: string, commentBody: string): TriggerMatch | undefined {
  for (const pipeline of pipelines) {
    if (pipeline.execution.kind === "github-actions" && `${pipeline.execution.owner}/${pipeline.execution.repo}` !== repo) continue;
    for (const [phrase, action] of Object.entries(pipeline.triggers.mentions ?? {})) {
      if (commentBody.includes(phrase)) return { pipeline, action };
    }
  }
  return undefined;
}

/** Finds whichever registered pipeline declares this as its dedicated chat_tool name. */
export function matchChatTool(pipelines: PipelineDefinition[], toolName: string): PipelineDefinition | undefined {
  return pipelines.find((p) => p.triggers.chat_tool === toolName);
}

/** Finds whichever registered pipeline declares this as its dedicated http_kind name. */
export function matchHttpKind(pipelines: PipelineDefinition[], httpKind: string): PipelineDefinition | undefined {
  return pipelines.find((p) => p.triggers.http_kind === httpKind);
}
