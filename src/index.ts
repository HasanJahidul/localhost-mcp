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
  { name: "localhost-mcp", version: "0.1.1" },
  { capabilities: { tools: {} } }
);

// Inspection tools are read-only: they shell out to `lsof` / `ps` and never
// touch any process. `kill_server` is the one exception — see its annotations.
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true, // observes live OS state, which changes outside this server
} as const;

const DEV_SERVER_SHAPE = {
  type: "object",
  properties: {
    port: { type: "number" },
    pid: { type: "number" },
    process: { type: "string", description: "Process name, e.g. `node`, `python`." },
    cmdline: { type: "string", description: "Full command line, e.g. `next dev`." },
    cwd: { type: "string", description: "Working directory of the process (best-effort; may be empty on Windows)." },
    project_name: { type: "string", description: "Basename of `cwd`, or the npm package name when detected." },
    framework: { type: "string", description: "Detected framework, e.g. `next.js`, `vite`, `rails`; `unknown` if not recognised." },
    uptime_seconds: { type: "number" },
    memory_mb: { type: "number", description: "Resident set size in MB." },
    cpu_pct: { type: "number", description: "Instantaneous CPU percent from `ps`." },
    user: { type: "string" },
  },
} as const;

const TOOLS = [
  {
    name: "list_dev_servers",
    description:
      "Read-only. Lists every local development server (next, vite, nuxt, remix, astro, rails, django, flask, express, deno, bun, etc.) currently LISTENING on a TCP port. " +
      "For each: port, pid, process name, command line, working directory, project name, detected framework, uptime, memory (MB), CPU %, and owning user. " +
      "Uses `lsof` on macOS/Linux and `netstat` on Windows; on Windows the cwd/framework fields are limited. Takes no arguments. Returns `{ count, servers[] }`.",
    annotations: { title: "List dev servers", ...READ_ONLY },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "number" },
        servers: { type: "array", items: DEV_SERVER_SHAPE },
      },
    },
  },
  {
    name: "port_info",
    description:
      "Read-only. Inspects a single TCP port and reports the dev server holding it (same fields as `list_dev_servers`). " +
      "If nothing is listening, or the listener is not a recognised dev process, returns `{ port, status: \"free\" }`. " +
      "Useful for answering \"what's on :3000?\" before starting or killing something.",
    annotations: { title: "Port info", ...READ_ONLY },
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", description: "TCP port number, 1–65535, e.g. 3000." } },
      required: ["port"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      description: "Either a dev-server record (see list_dev_servers) or `{ port, status: \"free\" }`.",
      properties: { port: { type: "number" }, status: { type: "string" } },
    },
  },
  {
    name: "kill_server",
    description:
      "Terminates a local dev server by `pid` or `port`. DESTRUCTIVE. Safe by default: with no `confirm`, this is a DRY RUN — it reports what it would kill and changes nothing. " +
      "Pass `confirm: true` to actually terminate: sends SIGTERM, waits up to 5s, then escalates to SIGKILL (or SIGKILL immediately if `force: true`). " +
      "Refuses PIDs below 1000 and processes that don't look like dev servers. Provide exactly one of `pid` or `port`. Returns what was (or would be) killed and the signal used.",
    annotations: { title: "Kill dev server", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID to kill. Mutually exclusive with `port`." },
        port: { type: "number", description: "TCP port whose listening process should be killed. Mutually exclusive with `pid`." },
        confirm: { type: "boolean", description: "Must be true to actually terminate the process. When false/omitted the call is a dry run.", default: false },
        force: { type: "boolean", description: "Skip SIGTERM and send SIGKILL immediately. Default false.", default: false },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        dry_run: { type: "boolean" },
        killed: { type: "boolean" },
        pid: { type: "number" },
        port: { type: "number" },
        process: { type: "string" },
        signal: { type: "string", description: "`SIGTERM`, `SIGKILL`, or null on a dry run." },
        message: { type: "string" },
      },
    },
  },
  {
    name: "find_zombies",
    description:
      "Read-only. Flags dev servers that look abandoned — all three of: uptime > 6h AND CPU < 1% AND memory > 100MB. " +
      "By default it excludes known always-on noise (VS Code server, language servers, other MCP servers, postgres/redis, sidekiq, etc.); " +
      "set `include_excluded: true` to also list those. Each candidate comes with the reasons it matched. This tool never kills anything — pass results to `kill_server`. Returns `{ count, candidates[] }`.",
    annotations: { title: "Find zombie servers", ...READ_ONLY },
    inputSchema: {
      type: "object",
      properties: {
        include_excluded: {
          type: "boolean",
          description: "Also include IDE/LSP/agent/DB processes that match the heuristic but are normally filtered out. Default false.",
          default: false,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "number" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ...DEV_SERVER_SHAPE.properties,
              reasons: { type: "array", items: { type: "string" }, description: "Why this process was flagged, e.g. `uptime 14h`, `cpu 0.1%`, `mem 412MB`." },
              excluded: { type: "boolean", description: "True if it only appears because `include_excluded` was set." },
            },
          },
        },
      },
    },
  },
  {
    name: "port_conflict",
    description:
      "Read-only. Diagnoses an `EADDRINUSE` situation: given a port, returns the dev server currently blocking it plus 5 free alternative ports nearby. " +
      "Use it when a `listen EADDRINUSE` error fires and you want both the culprit and a port to switch to.",
    annotations: { title: "Diagnose port conflict", ...READ_ONLY },
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", description: "The contended TCP port, e.g. 3000." } },
      required: ["port"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        port: { type: "number" },
        blocked_by: { type: ["object", "null"], description: "The dev-server record holding the port (see list_dev_servers), or null if actually free." },
        alternatives: { type: "array", items: { type: "number" }, description: "Up to 5 nearby free ports." },
      },
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
        const include_excluded = Boolean((args as any)?.include_excluded);
        const data = await findZombies({ include_excluded });
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
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const transport = new StdioServerTransport();
await server.connect(transport);
