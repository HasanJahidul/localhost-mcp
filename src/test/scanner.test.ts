import { test } from "node:test";
import assert from "node:assert/strict";
import { scanListeningPorts } from "../scanner.js";

test("scanListeningPorts: returns array (may be empty)", async () => {
  const r = await scanListeningPorts();
  assert.ok(Array.isArray(r));
});

test("scanListeningPorts: entries have required shape when present", async () => {
  const r = await scanListeningPorts();
  for (const l of r) {
    assert.equal(typeof l.pid, "number");
    assert.equal(typeof l.port, "number");
    assert.ok(l.port > 0 && l.port <= 65535);
    assert.equal(typeof l.process, "string");
  }
});

test("scanListeningPorts: no duplicate pid+port pairs (v4+v6 dedupe)", async () => {
  const r = await scanListeningPorts();
  const seen = new Set<string>();
  for (const l of r) {
    const k = `${l.pid}:${l.port}`;
    assert.ok(!seen.has(k), `duplicate ${k}`);
    seen.add(k);
  }
});
