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

export async function findZombies(): Promise<ZombieCandidate[]> {
  const all = await listDevServers();
  const out: ZombieCandidate[] = [];
  for (const s of all) {
    const reasons: string[] = [];
    if (s.uptime_seconds > 24 * 3600) reasons.push(`uptime ${(s.uptime_seconds / 3600).toFixed(1)}h`);
    if (s.cpu_pct < 1) reasons.push(`cpu ${s.cpu_pct}%`);
    if (s.memory_mb > 200) reasons.push(`mem ${s.memory_mb}MB`);
    if (reasons.length >= 2) {
      out.push({ ...s, reason: reasons.join(", ") });
    }
  }
  return out;
}

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
