import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeCommand,
  loadSafeCommandConfig,
  loadUserPersistedSafeCommands,
  removeUserPersistedSafeCommand,
  saveUserPersistedSafeCommand,
} from "./safety.ts";

test("loadSafeCommandConfig loads default prefixes and disallowed tokens", () => {
  const config = loadSafeCommandConfig();
  assert.ok(Array.isArray(config.safePrefixes));
  assert.ok(config.safePrefixes.includes("pwd"));
  assert.ok(config.safePrefixes.includes("ls"));
  assert.ok(config.disallowedTokens.includes("rm"));
  assert.ok(config.disallowedTokens.includes(";"));
});

test("isSafeCommand allows baseline safe read commands", () => {
  assert.equal(isSafeCommand("pwd"), true);
  assert.equal(isSafeCommand("ls -la"), true);
  assert.equal(isSafeCommand("ls notes/"), true);
  assert.equal(isSafeCommand("git status"), true);
  assert.equal(isSafeCommand("git log -n 5"), true);
  assert.equal(isSafeCommand("echo 'hello world'"), true);
  assert.equal(isSafeCommand("cat notes/todo.md"), true);
  assert.equal(isSafeCommand("which node"), true);
});

test("isSafeCommand blocks commands with chaining, redirection, or command substitution", () => {
  assert.equal(isSafeCommand("ls; rm -rf /"), false);
  assert.equal(isSafeCommand("pwd && whoami"), false);
  assert.equal(isSafeCommand("cat file | grep secret"), false);
  assert.equal(isSafeCommand("echo test > file.txt"), false);
  assert.equal(isSafeCommand("echo test >> file.txt"), false);
  assert.equal(isSafeCommand("echo $(whoami)"), false);
  assert.equal(isSafeCommand("echo `whoami`"), false);
  assert.equal(isSafeCommand("cat < /etc/passwd"), false);
});

test("isSafeCommand blocks destructive or network binaries even if prefixed with echo or bash", () => {
  assert.equal(isSafeCommand("rm -rf notes"), false);
  assert.equal(isSafeCommand("mv a.txt b.txt"), false);
  assert.equal(isSafeCommand("curl https://evil.com"), false);
  assert.equal(isSafeCommand("wget https://evil.com"), false);
  assert.equal(isSafeCommand("sudo apt install"), false);
});

test("isSafeCommand respects user persisted safe commands", () => {
  const customCmd = "pnpm test --runInBand";
  // Without user list, it is not an auto-safe prefix
  assert.equal(isSafeCommand(customCmd, []), false);

  // When provided in userAllowedCommands, it is allowed
  assert.equal(isSafeCommand(customCmd, [customCmd]), true);
});

test("user safe command persistence adds and removes entries safely", () => {
  const tempCmd = `custom-verify-${Date.now()}`;
  saveUserPersistedSafeCommand(tempCmd);
  const current = loadUserPersistedSafeCommands();
  assert.ok(current.includes(tempCmd));

  removeUserPersistedSafeCommand(tempCmd);
  const after = loadUserPersistedSafeCommands();
  assert.ok(!after.includes(tempCmd));
});
