import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEtime, detectFramework } from "../process.js";

test("parseEtime: SS only", () => {
  assert.equal(parseEtime("42"), 42);
});

test("parseEtime: MM:SS", () => {
  assert.equal(parseEtime("03:20"), 3 * 60 + 20);
});

test("parseEtime: HH:MM:SS", () => {
  assert.equal(parseEtime("01:02:03"), 3600 + 120 + 3);
});

test("parseEtime: DD-HH:MM:SS", () => {
  assert.equal(parseEtime("2-03:04:05"), 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
});

test("parseEtime: zero-padded fields", () => {
  assert.equal(parseEtime("00:00:09"), 9);
});

test("detectFramework: next.js from cmdline", async () => {
  const r = await detectFramework("node next dev", null);
  assert.equal(r.framework, "next.js");
  assert.equal(r.project_name, null);
});

test("detectFramework: vite from cmdline", async () => {
  const r = await detectFramework("node /usr/bin/vite serve", null);
  assert.equal(r.framework, "vite");
});

test("detectFramework: django from manage.py runserver", async () => {
  const r = await detectFramework("python manage.py runserver 0.0.0.0:8000", null);
  assert.equal(r.framework, "django");
});

test("detectFramework: uvicorn", async () => {
  const r = await detectFramework("uvicorn app:app --reload", null);
  assert.equal(r.framework, "uvicorn");
});

test("detectFramework: project_name from cwd", async () => {
  const r = await detectFramework("node server.js", "/Users/me/code/myapp");
  assert.equal(r.project_name, "myapp");
});

test("detectFramework: unknown cmdline + no cwd", async () => {
  const r = await detectFramework("node randombinary", null);
  assert.equal(r.framework, null);
  assert.equal(r.project_name, null);
});
