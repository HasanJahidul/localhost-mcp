# localhost-mcp — Project Context

MCP server that inspects local dev servers via `lsof` + `ps`. macOS/Linux first, Windows partial.
Sibling project to terminal-history-mcp (same author, same TS+npm pattern).

## Status

- **Version**: 0.1.0 scaffold (this commit)
- **Working dir**: `/Users/jahidulhasan/Documents/research/mcp-servers/localhost-mcp`
- **Wire**: `claude mcp add --scope user localhost -- localhost-mcp` (after `npm link`)

## Architecture

```
src/
├── cli.ts          Bin entry. Subcommands: (none → server) | server | list | zombies | --version | --help.
├── index.ts        MCP stdio server. Registers 5 tools.
├── scanner.ts      Port scan via lsof (unix) / netstat (win). Returns {port, pid, process, user}.
├── process.ts      ps -o lookup for cmdline/uptime/cpu/rss. cwd via /proc (linux) or lsof (mac). Framework detect from cmdline + package.json sniff.
├── dev-servers.ts  High-level: listDevServers, portInfo, findZombies, portConflict. Whitelist filter.
├── killer.ts       SIGTERM → 5s wait → SIGKILL escalation. Refuses pid<1000. Dry-run unless confirm=true.
└── types.ts        DevServer, ZombieCandidate, Platform.
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `list_dev_servers` | All dev servers w/ port/pid/framework/cwd/uptime/mem/cpu |
| `port_info` | Single port lookup |
| `kill_server` | Kill by pid OR port. Dry-run unless `confirm:true`. SIGKILL via `force:true` |
| `find_zombies` | Heuristic: uptime>24h + cpu<1% + mem>200MB → 2/3 = zombie |
| `port_conflict` | Blocking server + 5 free alternatives nearby |

## Safety

- `kill_server` defaults to dry-run.
- Refuses PIDs < 1000 (system).
- Whitelist of dev process names in [src/dev-servers.ts](src/dev-servers.ts) `DEV_PROCESS_WHITELIST`.
- Cmdline regex fallback for runners not in whitelist.

## Tech Decisions

- **TS + Node 18+** — match terminal-history-mcp; ESM (`"type": "module"`).
- **No SDK for lsof** — shell out to `lsof` directly via `execFile`. No deps.
- **No DB** — stateless, query live each call. Fast enough; port scan ~50ms.
- **Stdio MCP transport** — local tool, no HTTP needed.
- **Zod for kill_server args only** — other tools have trivial schemas.

## Build / Run

```bash
npm install
npm run build       # tsc → dist/
npm run start       # MCP stdio server (usually invoked by Claude)
node dist/cli.js list      # JSON dump for sanity check
node dist/cli.js zombies   # Zombie scan
```

## Test Commands (manual, post-build)

```bash
# stdio sanity
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js | head -c 800

# list works
node dist/cli.js list | head -c 1000

# kill dry-run
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kill_server","arguments":{"port":3000}}}' | node dist/index.js
```

## v0.1 Known Limits

- Windows: cwd + framework detection limited (no `/proc`, no `lsof`).
- `find_zombies` heuristic is rough; may flag legit always-on processes (sidekiq, celery). Whitelist refinement = v0.2.
- No license-gate (free).
- No watch mode (long-running tool).
- Framework detect via cmdline regex + `package.json`. No Python/Ruby project sniff yet (Pipfile, Gemfile).

## Roadmap

1. Add Python/Ruby project sniff (Pipfile, requirements.txt, Gemfile).
2. Windows cwd via `wmic` or PowerShell.
3. `restart_server` tool (kill + respawn from stored cmdline + cwd).
4. `last_request` tail of access log per framework.
5. npm publish + smithery/glama listing.
6. Bundle landing page w/ terminal-history-mcp + git-context-mcp = "Dev Context Suite".

## Repo Conventions

- TS strict mode on. ESM.
- No emoji in code/commits.
- Follow terminal-history-mcp file layout for muscle memory.
- No comments unless WHY is non-obvious.
