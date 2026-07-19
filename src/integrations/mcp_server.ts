// The MCP server: wraps the engine's tools for any MCP-capable chat client.
// Tool calls are forwarded to POST /webhook/mcp so chat-originated requests
// go through the same auth/logging/dispatch path as every other trigger.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express, Request, Response } from "express";
import { z } from "zod";

export interface McpBridgeConfig {
  orchestratorUrl: string; // e.g. "http://localhost:3000"
  sharedSecret: string;
}

async function callOrchestrator(config: McpBridgeConfig, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.orchestratorUrl}/webhook/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-orchestrator-secret": config.sharedSecret },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`orchestrator call failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function buildMcpServer(config: McpBridgeConfig): McpServer {
  const server = new McpServer({ name: "pipeline-orchestrator", version: "0.1.0" });

  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description: "File a new ticket on a registered app repo",
      inputSchema: { repo: z.string().describe("owner/repo"), title: z.string(), body: z.string(), requestedBy: z.string() },
    },
    async (args) => textResult(await callOrchestrator(config, { tool: "create_ticket", ...args })),
  );

  server.registerTool(
    "check_status",
    {
      title: "Check status",
      description: "Status of any registered job/ticket",
      inputSchema: { repo: z.string(), issueNumber: z.number().int().positive() },
    },
    async (args) => textResult(await callOrchestrator(config, { tool: "check_status", ...args })),
  );

  server.registerTool(
    "request_approval",
    {
      title: "Request approval",
      description: "Apply the 'approved' label (or equivalent) to move a ticket to implementation",
      inputSchema: { repo: z.string(), issueNumber: z.number().int().positive(), requestedBy: z.string() },
    },
    async (args) => textResult(await callOrchestrator(config, { tool: "request_approval", ...args })),
  );

  server.registerTool(
    "run_pipeline",
    {
      title: "Run pipeline",
      description:
        "Runs a registered pipeline by name. `action` and `input` are interpreted entirely by that pipeline's own handler — " +
        "this tool never needs to change when a new pipeline is registered.",
      inputSchema: {
        pipeline: z.string().describe("registry pipeline name, or a pipeline's own triggers.chat_tool alias"),
        action: z.string(),
        repo: z.string().optional().describe("owner/repo — required for github-actions-execution pipelines"),
        issueNumber: z.number().int().positive().optional(),
        requestedBy: z.string(),
        input: z.record(z.unknown()).optional().describe("handler-specific free-form payload"),
      },
    },
    async (args) => textResult(await callOrchestrator(config, { tool: "run_pipeline", ...args })),
  );

  server.registerTool(
    "scaffold_pipeline",
    {
      title: "Scaffold pipeline",
      description: "Onboard a new pipeline: writes its skill file, registry entry, and (for github-actions pipelines) caller workflow.",
      inputSchema: {
        pipeline: z
          .object({
            name: z.string(),
            handler: z.string(),
            skill_path: z.string(),
            execution: z.union([
              z.object({ kind: z.literal("github-actions"), workflow: z.string(), owner: z.string(), repo: z.string(), ref: z.string().optional() }),
              z.object({ kind: z.literal("in-process") }),
            ]),
            triggers: z.object({
              labels: z.record(z.string()).optional(),
              mentions: z.record(z.string()).optional(),
              chat_tool: z.string().optional(),
              http_kind: z.string().optional(),
            }),
            params: z.record(z.unknown()),
          })
          .describe("the full registry entry for the new pipeline"),
        skillBody: z.string().describe("markdown body for the new skill file"),
      },
    },
    async (args) => textResult(await callOrchestrator(config, { tool: "scaffold_pipeline", ...args })),
  );

  return server;
}

/** Mounts the MCP server on the engine's Express app at the given path. */
export function mountMcpHttp(app: Express, path: string, config: McpBridgeConfig): void {
  app.all(path, async (req: Request, res: Response) => {
    const server = buildMcpServer(config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
}
