#!/usr/bin/env node
// End-to-end test: spawn MCP server, send init + 5 tool calls, print results.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "dist", "index.js");

const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const responses = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {
        const cb = responses.get(msg.id);
        if (cb) {
          responses.delete(msg.id);
          cb(msg);
        }
      }
    } catch {}
  }
});

child.stderr.on("data", (c) => process.stderr.write(`[stderr] ${c}`));

let nextId = 1;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    responses.set(id, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    child.stdin.write(payload);
    setTimeout(() => {
      if (responses.has(id)) {
        responses.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 10000);
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function call(name, args = {}) {
  return rpc("tools/call", { name, arguments: args });
}

function ok(label, result) {
  const text = result?.content?.[0]?.text ?? "";
  const isErr = result?.isError;
  const head = text.length > 400 ? text.slice(0, 400) + "..." : text;
  console.log(`\n=== ${label} ${isErr ? "[ERR]" : "[OK]"} ===\n${head}`);
  return !isErr;
}

let pass = 0, fail = 0;
function tally(b) { b ? pass++ : fail++; }

try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0" },
  });
  notify("notifications/initialized", {});

  const toolsList = await rpc("tools/list", {});
  console.log(`\n=== tools/list ===\n${toolsList.tools.map((t) => "- " + t.name).join("\n")}`);
  tally(toolsList.tools.length === 5);

  tally(ok("list_dev_servers", await call("list_dev_servers")));

  // grab first server's port for port_info / port_conflict
  const listResult = await call("list_dev_servers");
  const servers = JSON.parse(listResult.content[0].text).servers;
  const samplePort = servers[0]?.port ?? 3000;

  tally(ok(`port_info (port=${samplePort})`, await call("port_info", { port: samplePort })));
  tally(ok("port_info (port=1, expect free)", await call("port_info", { port: 1 })));

  tally(ok("find_zombies", await call("find_zombies")));

  tally(ok(`port_conflict (port=${samplePort})`, await call("port_conflict", { port: samplePort })));

  tally(ok("kill_server (no args, expect error msg)", await call("kill_server", {})));
  tally(ok("kill_server (pid=1, expect refuse)", await call("kill_server", { pid: 1, confirm: true })));
  tally(ok("kill_server (port=1, dry-run, expect 'No dev server')", await call("kill_server", { port: 1, confirm: false })));

  // Invalid port — expect graceful tool-error (isError=true) from zod validation
  const invalidRes = await call("kill_server", { port: 99999, confirm: false });
  const isGraceful = invalidRes?.isError === true && /65535|too_big/.test(invalidRes?.content?.[0]?.text ?? "");
  console.log(`\n=== kill_server (port=99999, expect graceful zod reject) ${isGraceful ? "[OK]" : "[FAIL]"} ===\n${(invalidRes?.content?.[0]?.text ?? "").slice(0, 200)}`);
  tally(isGraceful);

  console.log(`\n--- ${pass} passed, ${fail} failed ---`);
  child.kill("SIGTERM");
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("FATAL:", e);
  child.kill("SIGTERM");
  process.exit(1);
}
