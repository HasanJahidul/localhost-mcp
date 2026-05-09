import { scanListeningPorts } from "./scanner.js";
import { getProcessInfo, detectFramework } from "./process.js";
import type { DevServer, ZombieCandidate } from "./types.js";

const DEV_PROCESS_WHITELIST = new Set([
  "node", "deno", "bun", "python", "python3", "ruby", "php", "go", "java",
  "rails", "puma", "unicorn", "rackup",
  "next-server", "next-router-worker",
  "vite", "esbuild", "webpack", "rollup",
  "uvicorn", "gunicorn", "hypercorn",
  "flask", "django",
  "jekyll", "hugo",
  "dotnet", "mvn", "gradle",
  "rustc", "cargo",
  "tsc", "tsx", "ts-node",
  "nodemon", "pm2", "concurrently",
]);

export async function listDevServers(): Promise<DevServer[]> {
  const listeners = await scanListeningPorts();
  const out: DevServer[] = [];
  for (const l of listeners) {
    const info = await getProcessInfo(l.pid);
    if (!info) continue;
    if (!isDevProcess(l.process, info.cmdline)) continue;
    const fw = await detectFramework(info.cmdline, info.cwd);
    out.push({
      port: l.port,
      pid: l.pid,
      process: l.process,
      cmdline: info.cmdline,
      cwd: info.cwd,
      project_name: fw.project_name,
      framework: fw.framework,
      uptime_seconds: info.uptime_seconds,
      memory_mb: info.memory_mb,
      cpu_pct: info.cpu_pct,
      user: l.user,
    });
  }
  return out.sort((a, b) => a.port - b.port);
}

export async function portInfo(port: number): Promise<DevServer | null> {
  const all = await listDevServers();
  return all.find((s) => s.port === port) ?? null;
}

// Cmdline patterns that look dev-server-shaped but are noise (IDEs, LSPs, agents,
// daemons, in-process MCPs). Never zombie-flag these.
const ZOMBIE_EXCLUDE_PATTERNS: RegExp[] = [
  /vscode-server|\.vscode-server/,
  /vscode\.js-debug/,
  /[-_]language[-_]server\b/,
  /\b(pyright|pylsp|gopls|rust-analyzer|clangd|metals|jdtls|solargraph|sorbet|tailwindcss-language-server)\b/,
  /\bmcp-server[-_]/,
  /\b(copilot|continue-dev|cursor-agent|claude-code)\b/i,
  /\b(sidekiq|celery|resque|delayed_job|hangfire)\b/,
  /\b(redis-server|postgres|mysqld|mongod|memcached|elasticsearch)\b/,
  /\bnvim\b|\bvim\b|\bemacs\b/,
  /\bjupyter\b|\bipykernel_launcher\b/,
];

function isExcludedFromZombie(cmdline: string): boolean {
  return ZOMBIE_EXCLUDE_PATTERNS.some((re) => re.test(cmdline));
}

export async function findZombies(): Promise<ZombieCandidate[]> {
  const all = await listDevServers();
  const out: ZombieCandidate[] = [];
  for (const s of all) {
    if (isExcludedFromZombie(s.cmdline)) continue;
    const oldEnough = s.uptime_seconds > 6 * 3600;
    const idle = s.cpu_pct < 1;
    const heavy = s.memory_mb > 100;
    if (oldEnough && idle && heavy) {
      out.push({
        ...s,
        reason: `uptime ${(s.uptime_seconds / 3600).toFixed(1)}h, cpu ${s.cpu_pct}%, mem ${s.memory_mb}MB`,
      });
    }
  }
  return out;
}

export { isExcludedFromZombie };

export async function portConflict(port: number): Promise<{
  blocking: DevServer | null;
  free_alternatives: number[];
}> {
  const blocking = await portInfo(port);
  const all = await listDevServers();
  const taken = new Set(all.map((s) => s.port));
  const free_alternatives: number[] = [];
  for (let p = port + 1; p < port + 50 && free_alternatives.length < 5; p++) {
    if (!taken.has(p)) free_alternatives.push(p);
  }
  return { blocking, free_alternatives };
}

function isDevProcess(processName: string, cmdline: string): boolean {
  const base = processName.split("/").pop() ?? processName;
  if (DEV_PROCESS_WHITELIST.has(base)) return true;
  // fallback: cmdline contains a dev runner
  return /\b(next|vite|nuxt|remix|astro|webpack|rails|django|flask|uvicorn|gunicorn|deno|bun)\b/.test(cmdline);
}

export { DEV_PROCESS_WHITELIST };
