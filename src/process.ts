import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const exec = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  cmdline: string;
  cwd: string | null;
  uptime_seconds: number;
  memory_mb: number;
  cpu_pct: number;
}

export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
  try {
    // etime: [[DD-]HH:]MM:SS (portable across macOS + linux)
    const { stdout } = await exec(
      "ps",
      ["-o", "etime=,rss=,%cpu=,command=", "-p", String(pid)],
      { maxBuffer: 256 * 1024 }
    );
    const line = stdout.trim();
    if (!line) return null;
    const m = line.match(/^\s*([\d:-]+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
    if (!m) return null;
    const uptime_seconds = parseEtime(m[1]);
    const memory_mb = Math.round(parseInt(m[2], 10) / 1024);
    const cpu_pct = parseFloat(m[3]);
    const cmdline = m[4];
    const cwd = await getCwd(pid);
    return { pid, cmdline, cwd, uptime_seconds, memory_mb, cpu_pct };
  } catch {
    return null;
  }
}

export function parseEtime(s: string): number {
  // Formats: SS | MM:SS | HH:MM:SS | DD-HH:MM:SS
  let days = 0;
  let rest = s;
  if (rest.includes("-")) {
    const [d, r] = rest.split("-");
    days = parseInt(d, 10);
    rest = r;
  }
  const parts = rest.split(":").map((p) => parseInt(p, 10));
  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = parts;
  else if (parts.length === 2) [m, sec] = parts;
  else if (parts.length === 1) [sec] = parts;
  return days * 86400 + h * 3600 + m * 60 + sec;
}

async function getCwd(pid: number): Promise<string | null> {
  const plat = platform();
  if (plat === "linux") {
    try {
      const { stdout } = await exec("readlink", [`/proc/${pid}/cwd`], { maxBuffer: 64 * 1024 });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  if (plat === "darwin") {
    try {
      // lsof -p PID -d cwd -Fn → "p<pid>\nfcwd\nn<path>"
      const { stdout } = await exec("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
        maxBuffer: 64 * 1024,
      });
      for (const line of stdout.split("\n")) {
        if (line.startsWith("n")) return line.slice(1);
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export interface FrameworkDetection {
  framework: string | null;
  project_name: string | null;
}

const FRAMEWORK_CMDLINE: Array<[RegExp, string]> = [
  [/\bnext\b/, "next.js"],
  [/\bvite\b/, "vite"],
  [/\bnuxt\b/, "nuxt"],
  [/\bremix\b/, "remix"],
  [/\bastro\b/, "astro"],
  [/\bwebpack-dev-server\b/, "webpack-dev-server"],
  [/\besbuild\b/, "esbuild"],
  [/\brails\b/, "rails"],
  [/\bdjango\b|manage\.py runserver/, "django"],
  [/\bflask\b/, "flask"],
  [/\buvicorn\b/, "uvicorn"],
  [/\bgunicorn\b/, "gunicorn"],
  [/\bfastapi\b/, "fastapi"],
  [/\bdeno\b/, "deno"],
  [/\bbun\b/, "bun"],
  [/\bphp\b.*-S/, "php-builtin"],
  [/\bjekyll\b/, "jekyll"],
  [/\bhugo\b/, "hugo"],
];

export async function detectFramework(cmdline: string, cwd: string | null): Promise<FrameworkDetection> {
  let framework: string | null = null;
  for (const [re, name] of FRAMEWORK_CMDLINE) {
    if (re.test(cmdline)) {
      framework = name;
      break;
    }
  }

  let project_name: string | null = null;
  if (cwd) {
    project_name = basename(cwd);
    if (!framework) {
      framework = await sniffPackageJson(cwd);
    }
  }
  return { framework, project_name };
}

async function sniffPackageJson(cwd: string): Promise<string | null> {
  try {
    const raw = await readFile(`${cwd}/package.json`, "utf8");
    const pkg = JSON.parse(raw);
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if (deps.next) return "next.js";
    if (deps.vite) return "vite";
    if (deps.nuxt) return "nuxt";
    if (deps["@remix-run/dev"]) return "remix";
    if (deps.astro) return "astro";
    if (deps["react-scripts"]) return "create-react-app";
    if (deps.express) return "express";
    if (deps.fastify) return "fastify";
    if (deps.koa) return "koa";
    if (deps.hono) return "hono";
    return "node";
  } catch {
    return null;
  }
}
