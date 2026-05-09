import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const exec = promisify(execFile);

export interface PortListener {
  port: number;
  pid: number;
  process: string;
  user: string;
}

export async function scanListeningPorts(): Promise<PortListener[]> {
  const plat = platform();
  if (plat === "darwin" || plat === "linux") {
    return scanUnix();
  }
  if (plat === "win32") {
    return scanWindows();
  }
  throw new Error(`Unsupported platform: ${plat}`);
}

async function scanUnix(): Promise<PortListener[]> {
  // -iTCP -sTCP:LISTEN  → listening TCP only
  // -P  → numeric ports (no name lookup)
  // -n  → numeric hosts
  // -F pcLn → field output: pid, command, login, name (port)
  let stdout = "";
  try {
    const r = await exec("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcLn"], {
      maxBuffer: 4 * 1024 * 1024,
    });
    stdout = r.stdout;
  } catch (e: any) {
    // lsof exits non-zero when no matches; tolerate
    stdout = e?.stdout ?? "";
    if (!stdout) return [];
  }

  const out: PortListener[] = [];
  let cur: Partial<PortListener> = {};
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const tag = line[0];
    const val = line.slice(1);
    if (tag === "p") {
      if (cur.pid !== undefined && cur.port !== undefined) {
        out.push(cur as PortListener);
      }
      cur = { pid: parseInt(val, 10) };
    } else if (tag === "c") {
      cur.process = val;
    } else if (tag === "L") {
      cur.user = val;
    } else if (tag === "n") {
      // val like "*:3000" or "127.0.0.1:5432" or "[::1]:8080"
      const m = val.match(/:(\d+)$/);
      if (m) cur.port = parseInt(m[1], 10);
    }
  }
  if (cur.pid !== undefined && cur.port !== undefined) {
    out.push(cur as PortListener);
  }

  // dedupe (same pid/port may appear twice for v4+v6)
  const seen = new Set<string>();
  return out.filter((l) => {
    const k = `${l.pid}:${l.port}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function scanWindows(): Promise<PortListener[]> {
  // netstat -ano: Proto, Local, Foreign, State, PID
  const { stdout } = await exec("netstat", ["-ano"], { maxBuffer: 4 * 1024 * 1024 });
  const out: PortListener[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("TCP")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 5) continue;
    if (parts[3] !== "LISTENING") continue;
    const local = parts[1];
    const pid = parseInt(parts[4], 10);
    const m = local.match(/:(\d+)$/);
    if (!m || isNaN(pid)) continue;
    out.push({ port: parseInt(m[1], 10), pid, process: "", user: "" });
  }
  return out;
}
