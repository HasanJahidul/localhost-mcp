export interface DevServer {
  port: number;
  pid: number;
  process: string;
  cmdline: string;
  cwd: string | null;
  project_name: string | null;
  framework: string | null;
  uptime_seconds: number;
  memory_mb: number;
  cpu_pct: number;
  user: string;
}

export interface ZombieCandidate extends DevServer {
  reason: string;
}

export type Platform = "darwin" | "linux" | "win32";
