# localhost-mcp — Scope

**One-liner:** MCP server that inspects, manages, and kills local dev servers. Stop guessing what's on :3000.

**Status:** Pre-v0.1 scope draft
**Date:** 2026-05-09

---

## Problem

Every dev hits these daily:
- `Error: listen EADDRINUSE :::3000` — what's holding the port?
- 5 forgotten `node` / `vite` / `next` PIDs from last week eating RAM
- Switching projects → no idea which dev servers still running
- Multiple `npm run dev` across repos → which port maps to which project?
- `lsof -i :3000`, `kill -9 <pid>`, repeat

No MCP solves this. CLI tools (`lsof`, `htop`) require manual correlation.

## Differentiator

| Tool | Port→PID | Project path | Framework detect | Zombie detect | MCP |
|------|----------|--------------|------------------|---------------|-----|
| `lsof` | yes | no | no | no | no |
| `htop` | no | no | no | no | no |
| Activity Monitor | partial | no | no | no | no |
| **localhost-mcp** | yes | yes | yes | yes | yes |

## MVP Tools (v0.1)

### `list_dev_servers`
Scan localhost ports (1024-65535, common dev range first: 3000-9999).
Return per server:
```json
{
  "port": 3000,
  "pid": 48211,
  "process": "node",
  "cmdline": "next dev",
  "cwd": "/Users/x/code/myapp",
  "project_name": "myapp",
  "framework": "next.js",
  "uptime_seconds": 14523,
  "memory_mb": 412,
  "cpu_pct": 0.3
}
```

### `port_info`
Input: port number. Output: same shape as above, single entry, or "free".

### `kill_server`
Input: `pid` or `port`. Confirm before SIGTERM. SIGKILL after 5s timeout.
Refuse system PIDs (<1000) and non-dev processes (whitelist: node, python, ruby, go, deno, bun, php, java, vite, next, nuxt, rails, django, flask, fastapi, uvicorn, gunicorn, webpack, esbuild, cargo).

### `find_zombies`
Heuristic: dev server processes w/
- uptime > 24h AND
- CPU < 1% last 60s AND
- no incoming connections last 60s
Return list. Suggest kill (no auto-kill).

### `port_conflict`
Input: desired port. Output: what's blocking + suggest free port nearby.

## Stretch (v0.2+)

- `last_request` — tail access log if framework supports (next, vite HMR log)
- `restart_server` — kill + re-spawn from cwd via stored cmdline
- `watch_mode` — long-running tool, push notifications when new server starts
- Cross-platform: macOS first, Linux next, Windows last
- Web dashboard (read-only) at `localhost-mcp:port`

## Tech Stack

- **Language:** TypeScript (Node) — match terminal-history-mcp pattern, easy npm publish
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Port scan:** `lsof -iTCP -sTCP:LISTEN -P -n` (parse output) on macOS/Linux. `netstat -ano` on Windows.
- **Process info:** `ps -o pid,ppid,etime,%cpu,rss,command -p <pid>`
- **CWD:** `lsof -p <pid> | grep cwd` on macOS, `/proc/<pid>/cwd` on Linux
- **Framework detect:** parse cmdline + check `package.json` in cwd

## Non-Goals

- Remote server management (only localhost)
- Production process management (use pm2/systemd)
- Container management (docker-mcp exists)
- Network packet inspection
- Auto-killing without user confirm

## Risks

- **macOS perms:** `lsof` works without sudo for own processes. Other-user PIDs hidden — fine for dev use.
- **Windows parity:** `netstat` output format differs. Defer Windows to v0.2.
- **False positive zombies:** background workers (sidekiq, celery) look idle. Mitigate via whitelist of "always-on" cmdlines.

## Success Metrics

- Time-to-kill-zombie: < 5s vs 30s manual
- npm weekly downloads: 500 in month 1 (ride terminal-history-mcp announcement)
- GH stars: 50 in month 1

## Timeline

- Day 1-2: lsof parser, list_dev_servers, port_info
- Day 3: kill_server + framework detect
- Day 4: find_zombies, port_conflict
- Day 5: tests, README, npm publish v0.1
- Day 6-7: launch post (LinkedIn + dev.to + HN Show)

## Bundle Play

Pair w/ terminal-history-mcp:
- terminal-history = "what I ran"
- localhost = "what's still running"
Combined pitch: "Know your dev environment."
