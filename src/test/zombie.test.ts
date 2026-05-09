import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcludedFromZombie } from "../dev-servers.js";

test("excludes vscode-server", () => {
  assert.equal(
    isExcludedFromZombie("/Users/me/.vscode-server/cli/servers/Stable-x/server/node bootstrap-fork --type=extensionHost"),
    true,
  );
});

test("excludes typescript-language-server", () => {
  assert.equal(isExcludedFromZombie("node typescript-language-server --stdio"), true);
});

test("excludes pyright LSP", () => {
  assert.equal(isExcludedFromZombie("node pyright-langserver --stdio"), true);
});

test("excludes mcp-server-* (in-process MCPs)", () => {
  assert.equal(
    isExcludedFromZombie("node /Users/me/.npm/_npx/x/node_modules/.bin/mcp-server-browsermcp"),
    true,
  );
});

test("excludes sidekiq background worker", () => {
  assert.equal(isExcludedFromZombie("ruby /usr/bin/sidekiq -C config/sidekiq.yml"), true);
});

test("excludes postgres", () => {
  assert.equal(isExcludedFromZombie("/usr/local/bin/postgres -D /var/lib/postgres"), true);
});

test("excludes nvim/copilot agent", () => {
  assert.equal(isExcludedFromZombie("node /usr/bin/copilot-language-server"), true);
});

test("does NOT exclude legit forgotten next dev", () => {
  assert.equal(isExcludedFromZombie("node /Users/me/code/myapp/node_modules/.bin/next dev"), false);
});

test("does NOT exclude legit forgotten vite", () => {
  assert.equal(isExcludedFromZombie("node /Users/me/code/myapp/node_modules/.bin/vite"), false);
});

test("does NOT exclude legit django runserver", () => {
  assert.equal(isExcludedFromZombie("python manage.py runserver 0.0.0.0:8000"), false);
});

test("findZombies signature accepts include_excluded option", async () => {
  const { findZombies } = await import("../dev-servers.js");
  const a = await findZombies();
  const b = await findZombies({ include_excluded: true });
  assert.ok(Array.isArray(a));
  assert.ok(Array.isArray(b));
  assert.ok(b.length >= a.length, "include_excluded should be superset");
});
