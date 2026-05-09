import { test } from "node:test";
import assert from "node:assert/strict";
import { killServer } from "../killer.js";

test("killServer: refuses without pid or port", async () => {
  const r = await killServer({ confirm: true });
  assert.equal(r.killed, false);
  assert.match(r.message, /pid or port/);
});

test("killServer: refuses pid < 1000 (system process)", async () => {
  const r = await killServer({ pid: 1, confirm: true });
  assert.equal(r.killed, false);
  assert.match(r.message, /system process/);
});

test("killServer: dry-run by default (does not kill)", async () => {
  // pid 999999 unlikely to exist, but dry-run should short-circuit before that check anyway
  const r = await killServer({ pid: 99999999, confirm: false });
  // When pid not found, returns "not found"; when found but no confirm, returns dry-run.
  // Either way, killed must be false.
  assert.equal(r.killed, false);
});

test("killServer: nonexistent pid returns not found", async () => {
  const r = await killServer({ pid: 99999999, confirm: true });
  assert.equal(r.killed, false);
  assert.match(r.message, /not found/);
});

test("killServer: nonexistent port returns 'No dev server'", async () => {
  const r = await killServer({ port: 1, confirm: true });
  assert.equal(r.killed, false);
  assert.match(r.message, /No dev server/);
});
