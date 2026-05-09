import { portInfo } from "./dev-servers.js";
import { getProcessInfo } from "./process.js";
import type { DevServer } from "./types.js";

export interface KillResult {
  killed: boolean;
  pid: number;
  signal: "SIGTERM" | "SIGKILL" | null;
  message: string;
  target?: DevServer;
}

export async function killServer(opts: {
  pid?: number;
  port?: number;
  confirm: boolean;
  force?: boolean;
}): Promise<KillResult> {
  let target: DevServer | null = null;

  if (opts.port !== undefined) {
    target = await portInfo(opts.port);
    if (!target) {
      return { killed: false, pid: 0, signal: null, message: `No dev server on port ${opts.port}` };
    }
  } else if (opts.pid !== undefined) {
    if (opts.pid < 1000) {
      return { killed: false, pid: opts.pid, signal: null, message: `Refused: PID ${opts.pid} is system process` };
    }
    const info = await getProcessInfo(opts.pid);
    if (!info) {
      return { killed: false, pid: opts.pid, signal: null, message: `PID ${opts.pid} not found` };
    }
  } else {
    return { killed: false, pid: 0, signal: null, message: "Must provide pid or port" };
  }

  const pid = target?.pid ?? opts.pid!;
  if (pid < 1000) {
    return { killed: false, pid, signal: null, message: `Refused: PID ${pid} is system process`, target: target ?? undefined };
  }

  if (!opts.confirm) {
    return {
      killed: false,
      pid,
      signal: null,
      message: `Dry run. Would SIGTERM pid ${pid}${target ? ` (${target.process} :${target.port})` : ""}. Re-call with confirm=true.`,
      target: target ?? undefined,
    };
  }

  const signal: "SIGTERM" | "SIGKILL" = opts.force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(pid, signal);
  } catch (e: any) {
    return { killed: false, pid, signal, message: `kill failed: ${e.message}`, target: target ?? undefined };
  }

  if (signal === "SIGTERM") {
    // wait up to 5s for graceful exit
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (!alive(pid)) {
        return { killed: true, pid, signal, message: `SIGTERM succeeded`, target: target ?? undefined };
      }
    }
    // escalate
    try {
      process.kill(pid, "SIGKILL");
      return { killed: true, pid, signal: "SIGKILL", message: `SIGTERM timeout, escalated to SIGKILL`, target: target ?? undefined };
    } catch (e: any) {
      return { killed: false, pid, signal: "SIGKILL", message: `SIGKILL failed: ${e.message}`, target: target ?? undefined };
    }
  }

  return { killed: true, pid, signal, message: `SIGKILL sent`, target: target ?? undefined };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
