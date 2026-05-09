#!/usr/bin/env node
import { listDevServers, findZombies } from "./dev-servers.js";

const args = process.argv.slice(2);
const cmd = args[0];

async function main() {
  switch (cmd) {
    case undefined:
    case "server":
      // start MCP stdio server
      await import("./index.js");
      return;
    case "list": {
      const data = await listDevServers();
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case "zombies": {
      const data = await findZombies();
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case "--version":
    case "-v": {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const { dirname, join } = await import("node:path");
      const here = dirname(fileURLToPath(import.meta.url));
      const pkg = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8"));
      console.log(pkg.version);
      return;
    }
    case "--help":
    case "-h":
      help();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}

function help() {
  console.log(`localhost-mcp — inspect and manage local dev servers

USAGE
  localhost-mcp [command]

COMMANDS
  (none)        Start MCP stdio server (for Claude/Cursor/etc)
  server        Same as above
  list          Print all dev servers as JSON
  zombies       Print zombie candidates as JSON
  --version     Print version
  --help        This help

INSTALL AS MCP
  claude mcp add --scope user localhost -- localhost-mcp
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
