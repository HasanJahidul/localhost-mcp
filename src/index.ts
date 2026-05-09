import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { listDevServers, portInfo, findZombies, portConflict } from "./dev-servers.js";
import { killServer } from "./killer.js";

const server = new Server(
  { name: "localhost-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "list_dev_servers",
    description: "List all local dev servers (next, vite, rails, django, etc) listening on TCP ports. Returns port, pid, framework, project name, cwd, uptime, memory, cpu.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "port_info",
    description: "Get info on a specific port. Returns the dev server holding it, or null if free / not a dev process.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", description: "TCP port number" } },
      required: ["port"],
      additionalProperties: false,
    },
  },
  {
    name: "kill_server",
    description: "Kill a dev server by pid or port. Defaults to dry-run; pass confirm=true to actually kill. SIGTERM first, escalates to SIGKILL after 5s. Refuses system PIDs (<1000).",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID" },
        port: { type: "number", description: "TCP port (alternative to pid)" },
        confirm: { type: "boolean", description: "Must be true to actually kill", default: false },
        force: { type: "boolean", description: "Use SIGKILL immediately, skip SIGTERM", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "find_zombies",
    description: "Find dev servers that look abandoned: high uptime, low CPU, lingering memory. Returns candidates with reasons. Does not auto-kill.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "port_conflict",
    description: "Diagnose why a port is busy. Returns the blocking server and 5 free alternative ports nearby.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number" } },
      required: ["port"],
      additionalProperties: false,
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

const KillArgs = z.object({
  pid: z.number().int().positive().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  confirm: z.boolean().default(false),
  force: z.boolean().default(false),
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    switch (name) {
      case "list_dev_servers": {
        const data = await listDevServers();
        return ok({ count: data.length, servers: data });
      }
      case "port_info": {
        const port = z.number().int().parse((args as any)?.port);
        const data = await portInfo(port);
        return ok(data ?? { port, status: "free" });
      }
      case "kill_server": {
        const parsed = KillArgs.parse(args ?? {});
        const result = await killServer(parsed);
        return ok(result);
      }
      case "find_zombies": {
        const data = await findZombies();
        return ok({ count: data.length, candidates: data });
      }
      case "port_conflict": {
        const port = z.number().int().parse((args as any)?.port);
        const data = await portConflict(port);
        return ok(data);
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e: any) {
    return err(e?.message ?? String(e));
  }
});

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const transport = new StdioServerTransport();
await server.connect(transport);
